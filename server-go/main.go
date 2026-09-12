// ============================================================
// 书境奇游 API 服务（Go 版，替换 server/index.mjs + app.mjs）
//
// 零第三方 HTTP 依赖：net/http + modernc.org/sqlite（无 CGO）。
// 只监听回环，局域网访问一律经 nginx /api/ 反代；认证走本机
// SSO 应用层接入（转发 Cookie 到 /whoami 换用户名）。
// 行为与 Node 版 server/app.mjs 逐条对齐（含错误文案与状态码），
// SQLite 数据库文件直接复用，schema 不变。
//
// 用法: tarpg-api -addr 127.0.0.1:8322 -db /path/tarpg.sqlite
// 环境变量: TEXT_RPG_DB 指定数据库（-db 优先）; TEXT_RPG_SSO_URL 覆盖 whoami 地址（测试用）
// ============================================================
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	bodyLimit  = 2 * 1024 * 1024 // 与 Node 版 BODY_LIMIT 一致
	ssTimeout  = 3 * time.Second
	touchEvery = time.Hour // last_login 写库节流，防每请求写放大
)

var (
	gidRe   = regexp.MustCompile(`^[a-z0-9_-]{1,64}$`)
	slotRe  = regexp.MustCompile(`^(auto|[0-2])$`)
	achIdRe = regexp.MustCompile(`^[\w\x{4e00}-\x{9fa5}-]{1,64}$`)

	// 越小越好的榜单（时间类）；其余越大越好
	minBoards = map[string]bool{"clear_time": true}
	boards    = map[string]bool{"clear_time": true, "realm": true, "achv": true, "endings": true}
)

// 路径正则。方法不对时的"落空到 404"行为与 Node 版一致（在各 handler 内保证）。
var (
	saveSlotRe  = regexp.MustCompile(`^/api/saves/([a-z0-9_-]{1,64})/(auto|[0-2])$`)
	saveListRe  = regexp.MustCompile(`^/api/saves/([a-z0-9_-]{1,64})$`)
	achPathRe   = regexp.MustCompile(`^/api/achievements/([a-z0-9_-]{1,64})$`)
	boardPathRe = regexp.MustCompile(`^/api/(score|leaderboard)/([a-z0-9_-]{1,64})/([a-z_]{1,32})$`)
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sso_username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, slot)
);
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, achievement_id)
);
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  achieved_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_lb_board ON leaderboard_entries (game_id, board_id, score);
`

// errBodyTooLarge 与 Node 版一样映射为 413
var errBodyTooLarge = errors.New("body too large")

type apiServer struct {
	db        *sql.DB
	whoamiURL string
	client    *http.Client

	touchMu   sync.Mutex
	lastTouch map[int64]time.Time // user_id → 上次写 last_login 时间
}

// ---- 响应工具：与 Node 的 json() 一致（JSON + no-store） ----

func writeJSON(w http.ResponseWriter, status int, obj any) {
	body, err := json.Marshal(obj)
	if err != nil {
		log.Printf("[api] marshal %T: %v", obj, err)
		body, status = []byte(`{"error":"internal"}`), 500
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	w.Write(body)
}

func errJSON(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// decodeJSON 用 UseNumber 解析，保留数字字面量（等价 Node 里 typeof number 的判断空间）
func decodeJSON(raw []byte, out any) error {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	return dec.Decode(out)
}

// readBody 限 2MB，超限返回 errBodyTooLarge（→413）。
// Node 版判断是 size > BODY_LIMIT（恰好等于上限合法），用 LimitReader 精确对齐
func readBody(r *http.Request) ([]byte, error) {
	buf, err := io.ReadAll(io.LimitReader(r.Body, bodyLimit+1))
	if err != nil {
		return nil, err
	}
	if len(buf) > bodyLimit {
		return nil, errBodyTooLarge
	}
	return buf, nil
}

// jsTruthy 复现 JS 真值：false/0/""/null 均为假（Node 版 body.snapshot 的判断）
func jsTruthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case json.Number:
		f, err := t.Float64()
		return err == nil && f != 0
	default:
		return true
	}
}

// numberOf: JSON 值必须是有限数字（Number.isFinite 等价）
func numberOf(v any) (float64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := n.Float64()
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return 0, false
	}
	return f, true
}

// authUser 转发 Cookie 到 SSO /whoami 换用户名，首次见到的用户自动入库
func (s *apiServer) authUser(r *http.Request) (*userRow, error) {
	username := s.verify(r.Header.Get("Cookie"))
	if username == "" {
		return nil, nil
	}
	var u userRow
	err := s.db.QueryRow(
		`SELECT id, sso_username, display_name FROM users WHERE sso_username = ?`,
		username).Scan(&u.ID, &u.Username, &u.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		now := time.Now().UnixMilli()
		res, err := s.db.Exec(
			`INSERT INTO users (sso_username, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)`,
			username, username, now, now)
		if err != nil {
			return nil, err
		}
		u.ID, _ = res.LastInsertId()
		u.Username, u.DisplayName = username, sql.NullString{String: username, Valid: true}
		return &u, nil
	}
	if err != nil {
		return nil, err
	}
	// 节流写 last_login_at（内存态，与 Node 版 lastTouch 一致，重启即失效）
	s.touchMu.Lock()
	last, ok := s.lastTouch[u.ID]
	s.touchMu.Unlock()
	now := time.Now()
	if !ok || now.Sub(last) > touchEvery {
		if _, err := s.db.Exec(`UPDATE users SET last_login_at = ? WHERE id = ?`, now.UnixMilli(), u.ID); err != nil {
			return nil, err
		}
		s.touchMu.Lock()
		s.lastTouch[u.ID] = now
		s.touchMu.Unlock()
	}
	return &u, nil
}

type userRow struct {
	ID          int64
	Username    string
	DisplayName sql.NullString
}

// verify 调本机 SSO /whoami；与 Node 版一致：3s 超时、响应超 4KB 截断、
// 仅 200 且 JSON 里带 u 才算登录；任何失败按未登录处理
func (s *apiServer) verify(cookie string) string {
	if cookie == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), ssTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.whoamiURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Cookie", cookie)
	resp, err := s.client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return ""
	}
	var out struct {
		U string `json:"u"`
	}
	if json.Unmarshal(body, &out) != nil {
		return ""
	}
	return out.U
}

func (s *apiServer) handle(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if p := recover(); p != nil {
			log.Printf("[api] panic %s %s: %v", r.Method, r.URL.Path, p)
			errJSON(w, 500, "internal")
		}
	}()
	path := r.URL.Path

	if path == "/api/healthz" {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}

	user, err := s.authUser(r)
	if err != nil {
		log.Printf("[api] auth %s %s: %v", r.Method, path, err)
		errJSON(w, 500, "internal")
		return
	}
	if user == nil {
		errJSON(w, 401, "未登录")
		return
	}

	// GET /api/me
	if path == "/api/me" && r.Method == http.MethodGet {
		writeJSON(w, 200, meResp{Username: user.Username, DisplayName: user.DisplayName.String})
		return
	}

	if m := saveSlotRe.FindStringSubmatch(path); m != nil {
		s.handleSaveSlot(w, r, user, m[1], m[2])
		return
	}
	if m := saveListRe.FindStringSubmatch(path); m != nil && r.Method == http.MethodGet {
		s.handleSaveList(w, user, m[1])
		return
	}
	if m := achPathRe.FindStringSubmatch(path); m != nil {
		s.handleAchievements(w, r, user, m[1])
		return
	}
	if m := boardPathRe.FindStringSubmatch(path); m != nil {
		switch {
		case m[1] == "score" && r.Method == http.MethodPut:
			s.handleScore(w, r, user, m[2], m[3])
		case m[1] == "leaderboard" && r.Method == http.MethodGet:
			s.handleLeaderboard(w, user, m[2], m[3])
		default:
			errJSON(w, 404, "未知接口")
		}
		return
	}

	errJSON(w, 404, "未知接口")
}

func (s *apiServer) internal(w http.ResponseWriter, where string, err error) {
	log.Printf("[api] %s: %v", where, err)
	errJSON(w, 500, "internal")
}

type meResp struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

// handleSaveSlot：GET 读存档 / PUT 写存档；方法不对落到 404（与 Node 一致）
func (s *apiServer) handleSaveSlot(w http.ResponseWriter, r *http.Request, u *userRow, gid, slot string) {
	if !gidRe.MatchString(gid) || !slotRe.MatchString(slot) {
		errJSON(w, 404, "未知接口")
		return
	}
	switch r.Method {
	case http.MethodGet:
		var snapshot string
		var updatedAt int64
		err := s.db.QueryRow(
			`SELECT snapshot, updated_at FROM saves WHERE user_id = ? AND game_id = ? AND slot = ?`,
			u.ID, gid, slot).Scan(&snapshot, &updatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			errJSON(w, 404, "无云端存档")
			return
		}
		if err != nil {
			s.internal(w, "save get", err)
			return
		}
		var snap any
		if decodeJSON([]byte(snapshot), &snap) != nil {
			snap = map[string]any{}
		}
		writeJSON(w, 200, saveGetResp{Snapshot: snap, UpdatedAt: updatedAt})

	case http.MethodPut:
		raw, err := readBody(r)
		if err != nil {
			errJSON(w, 413, "body too large")
			return
		}
		var body any
		// Node: JSON.parse(raw || '{}') —— 仅长度为 0 的 body 视作 {}（空格等仍按解析失败处理）
		if len(raw) == 0 {
			body = map[string]any{}
		} else if decodeJSON(raw, &body) != nil {
			errJSON(w, 400, "JSON 解析失败")
			return
		}
		// Node: const snap = body && typeof body === 'object' && body.snapshot ? body.snapshot : body
		snap := body
		if obj, ok := body.(map[string]any); ok && jsTruthy(obj["snapshot"]) {
			snap = obj["snapshot"]
		}
		snapMap, ok := snap.(map[string]any)
		if !ok {
			errJSON(w, 400, "快照格式不符（需含 state 与 ts）")
			return
		}
		// Node: !snap.state —— state 必须为真值（0/""/false/null 都算不符）
		if !jsTruthy(snapMap["state"]) {
			errJSON(w, 400, "快照格式不符（需含 state 与 ts）")
			return
		}
		if _, isNum := numberOf(snapMap["ts"]); !isNum {
			errJSON(w, 400, "快照格式不符（需含 state 与 ts）")
			return
		}
		// 与 Node 一致：把解析后的快照重新序列化入库
		stored, _ := json.Marshal(snap)
		now := time.Now().UnixMilli()
		if _, err := s.db.Exec(
			`INSERT INTO saves (user_id, game_id, slot, snapshot, updated_at) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, game_id, slot) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
			u.ID, gid, slot, string(stored), now); err != nil {
			s.internal(w, "save put", err)
			return
		}
		writeJSON(w, 200, map[string]int64{"updatedAt": now})

	default:
		errJSON(w, 404, "未知接口")
	}
}

type saveGetResp struct {
	Snapshot  any   `json:"snapshot"`
	UpdatedAt int64 `json:"updatedAt"`
}

type slotInfo struct {
	Slot string `json:"slot"`
	// Node 版 qList 没加 AS 别名，线上字段名就是原始列名 updated_at，必须保持一致
	UpdatedAt int64 `json:"updated_at"`
}

func (s *apiServer) handleSaveList(w http.ResponseWriter, u *userRow, gid string) {
	rows, err := s.db.Query(
		`SELECT slot, updated_at FROM saves WHERE user_id = ? AND game_id = ?`, u.ID, gid)
	if err != nil {
		s.internal(w, "save list", err)
		return
	}
	defer rows.Close()
	slots := []slotInfo{}
	for rows.Next() {
		var si slotInfo
		if err := rows.Scan(&si.Slot, &si.UpdatedAt); err != nil {
			s.internal(w, "save list scan", err)
			return
		}
		slots = append(slots, si)
	}
	writeJSON(w, 200, map[string]any{"slots": slots})
}

// handleAchievements：GET 读 / PUT 合并（按最早解锁时间）；方法不对落 404
func (s *apiServer) handleAchievements(w http.ResponseWriter, r *http.Request, u *userRow, gid string) {
	if !gidRe.MatchString(gid) {
		errJSON(w, 404, "未知接口")
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.writeAchievements(w, u, gid)

	case http.MethodPut:
		raw, err := readBody(r)
		if err != nil {
			errJSON(w, 413, "body too large")
			return
		}
		var body any
		// Node: JSON.parse(raw || '{}') —— 仅长度为 0 的 body 视作 {}
		if len(raw) == 0 {
			body = map[string]any{}
		} else if decodeJSON(raw, &body) != nil {
			errJSON(w, 400, "JSON 解析失败")
			return
		}
		// Node: const inc = body && body.achievements —— body 非对象时 inc 为 undefined → 同样报"需 achievements 映射"
		bodyMap, _ := body.(map[string]any)
		inc, ok := bodyMap["achievements"].(map[string]any)
		if !ok {
			errJSON(w, 400, "需 achievements 映射")
			return
		}
		// 与 Node 一致：逐条"校验+入库"，中途非法时前面的条目已写入（部分写入语义）
		for id, v := range inc {
			if !achIdRe.MatchString(id) {
				errJSON(w, 400, "成就格式不符")
				return
			}
			ts, isNum := numberOf(v)
			if !isNum {
				errJSON(w, 400, "成就格式不符")
				return
			}
			if _, err := s.db.Exec(
				`INSERT INTO user_achievements (user_id, game_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)
				 ON CONFLICT(user_id, game_id, achievement_id) DO UPDATE SET unlocked_at = min(user_achievements.unlocked_at, excluded.unlocked_at)`,
				u.ID, gid, id, int64(ts)); err != nil {
				s.internal(w, "ach put", err)
				return
			}
		}
		s.writeAchievements(w, u, gid)

	default:
		errJSON(w, 404, "未知接口")
	}
}

func (s *apiServer) writeAchievements(w http.ResponseWriter, u *userRow, gid string) {
	rows, err := s.db.Query(
		`SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ? AND game_id = ?`, u.ID, gid)
	if err != nil {
		s.internal(w, "ach get", err)
		return
	}
	defer rows.Close()
	ach := map[string]int64{}
	for rows.Next() {
		var id string
		var ts int64
		if err := rows.Scan(&id, &ts); err != nil {
			s.internal(w, "ach scan", err)
			return
		}
		ach[id] = ts
	}
	writeJSON(w, 200, map[string]any{"achievements": ach})
}

// handleScore：PUT 上报分数（好成绩才覆盖）
func (s *apiServer) handleScore(w http.ResponseWriter, r *http.Request, u *userRow, gid, board string) {
	if !boards[board] {
		errJSON(w, 400, "未知榜单")
		return
	}
	raw, err := readBody(r)
	if err != nil {
		errJSON(w, 413, "body too large")
		return
	}
	var body any
	// Node: JSON.parse(raw || '{}') —— 空 body 视作 {}
	if len(raw) == 0 {
		body = map[string]any{}
	} else if decodeJSON(raw, &body) != nil {
		errJSON(w, 400, "JSON 解析失败")
		return
	}
	// Node: const score = body && body.score —— body 非对象（如 5/[]）时 score 为 undefined → 400 分数
	bodyMap, _ := body.(map[string]any)
	score, ok := numberOf(bodyMap["score"])
	if !ok || score < 0 {
		errJSON(w, 400, "分数需为非负数值")
		return
	}
	var prev float64
	qerr := s.db.QueryRow(
		`SELECT score FROM leaderboard_entries WHERE user_id = ? AND game_id = ? AND board_id = ?`,
		u.ID, gid, board).Scan(&prev)
	if qerr != nil && !errors.Is(qerr, sql.ErrNoRows) {
		s.internal(w, "score get", qerr)
		return
	}
	better := errors.Is(qerr, sql.ErrNoRows) ||
		(minBoards[board] && score < prev) || (!minBoards[board] && score > prev)
	if better {
		if _, err := s.db.Exec(
			`INSERT INTO leaderboard_entries (user_id, game_id, board_id, score, achieved_at) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, game_id, board_id) DO UPDATE SET score = excluded.score, achieved_at = excluded.achieved_at`,
			u.ID, gid, board, score, time.Now().UnixMilli()); err != nil {
			s.internal(w, "score up", err)
			return
		}
	}
	ret := score
	if !better {
		ret = prev
	}
	writeJSON(w, 200, map[string]float64{"score": ret})
}

type lbRow struct {
	Username   string  `json:"username"`
	Score      float64 `json:"score"`
	AchievedAt int64   `json:"achievedAt"`
}

func (s *apiServer) handleLeaderboard(w http.ResponseWriter, u *userRow, gid, board string) {
	if !boards[board] {
		errJSON(w, 400, "未知榜单")
		return
	}
	order := "DESC"
	if minBoards[board] {
		order = "ASC"
	}
	// order 只取自 minBoards 白名单，非用户输入
	q := fmt.Sprintf(`SELECT u.sso_username AS username, le.score, le.achieved_at AS achievedAt
		FROM leaderboard_entries le JOIN users u ON u.id = le.user_id
		WHERE le.game_id = ? AND le.board_id = ?
		ORDER BY le.score %s, le.achieved_at ASC LIMIT 50`, order)
	rows, err := s.db.Query(q, gid, board)
	if err != nil {
		s.internal(w, "lb get", err)
		return
	}
	defer rows.Close()
	out := []lbRow{}
	for rows.Next() {
		var r lbRow
		if err := rows.Scan(&r.Username, &r.Score, &r.AchievedAt); err != nil {
			s.internal(w, "lb scan", err)
			return
		}
		out = append(out, r)
	}
	writeJSON(w, 200, map[string]any{"rows": out})
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8322", "监听地址，如 127.0.0.1:8322")
	dbPath := flag.String("db", "", "SQLite 数据库文件路径（默认取 TEXT_RPG_DB）")
	flag.Parse()

	db := *dbPath
	if db == "" {
		db = os.Getenv("TEXT_RPG_DB")
	}
	if db == "" {
		log.Fatal("未指定数据库：用 -db 或环境变量 TEXT_RPG_DB")
	}
	if db != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(db), 0o755); err != nil {
			log.Fatalf("创建数据库目录失败: %v", err)
		}
	}

	sqlDB, err := sql.Open("sqlite", db+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatalf("打开数据库失败: %v", err)
	}
	// 单连接串行化：家庭负载足够，且避免多写者锁冲突（语义等价 Node 单线程）
	sqlDB.SetMaxOpenConns(1)
	if _, err := sqlDB.Exec(schema); err != nil {
		log.Fatalf("初始化 schema 失败: %v", err)
	}

	whoami := os.Getenv("TEXT_RPG_SSO_URL")
	if whoami == "" {
		whoami = "http://127.0.0.1:5090/whoami"
	}

	srv := &apiServer{
		db:        sqlDB,
		whoamiURL: whoami,
		client:    &http.Client{Timeout: ssTimeout},
		lastTouch: map[int64]time.Time{},
	}

	log.Printf("书境奇游 API(Go): http://%s/api/ （DB: %s，认证: %s）", *addr, db, whoami)
	server := &http.Server{
		Addr:              *addr,
		Handler:           http.HandlerFunc(srv.handle),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("退出: %v", err)
	}
}
