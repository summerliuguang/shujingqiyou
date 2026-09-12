package main

// ============================================================
// AI KP 代理：POST /api/kp/chat（SSO 登录后可用）
//
// 前端把「模组背景 + 当前场景 + 玩家自由输入 + 行动历史」交给本端点；
// 本端点组装带 JSON Schema 约束的 prompt 调 LiteGate（OpenAI 协议），
// 只透传模型输出，不解析不裁剪——数值与合法性全由前端引擎白名单把关
// （骰子本地掷、stateOps 白名单、goto 只认场景图已有节点）。
//
// 配置（环境变量，均可选；未配置时端点返回 503，前端回退预设选项）：
//   KP_LITEGATE_URL   默认 http://127.0.0.1:8080/v1/chat/completions
//   KP_LITEGATE_KEY   sk-lg-…（受限虚拟 key：白名单模型+日预算）
//   KP_MODEL          默认 deepseek-chat
// ============================================================

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"
)

type kpMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type kpChatReq struct {
	GameId   string      `json:"gameId"`
	Messages []kpMessage `json:"messages"`
}

type kpChatResp struct {
	Text     string `json:"text,omitempty"`
	Finished bool   `json:"finished,omitempty"`
	Error    string `json:"error,omitempty"`
}

type lgChatReq struct {
	Model       string      `json:"model"`
	Messages    []lgMessage `json:"messages"`
	Temperature float64     `json:"temperature"`
	MaxTokens   int         `json:"max_tokens"`
}

type lgMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type lgChatResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

const kpSystemPrompt = `你是克苏鲁的呼唤(CoC)跑团的 KP（守密人），正在主持一个预设模组的单人团。

铁律（违反即失败）：
1. 模组剧情骨架（场景、线索、NPC、结局）已由模组给出，你负责让它活起来——叙事、扮演 NPC、回应玩家的自由行动。不要发明新的主要场景或结局。
2. 你无权决定任何数值：不掷骰、不写伤害、不写属性变化。若玩家行动需要检定，输出 checks 提议（检定名+理由），骰子由系统掷出后会把结果告诉你。
3. 状态变化只能用 stateOps 白名单效果表达，且要克制——一次行动 0~2 个足矣。
4. 叙事风格：克制、有画面感、1930 年代新英格兰基调。中文输出，篇幅 2~5 句。

输出必须是单个 JSON 对象（不要 markdown 代码块包裹）：
{
  "narrative": "叙事文本（含 NPC 台词）",
  "checks": [{"stat": "侦查", "reason": "翻查柜台的动静"}],   // 可省略；一次最多 2 个
  "stateOps": [["flag","发现线索"],["san","-1"]],              // 可省略；白名单见下
  "goto": "节点id"                                             // 仅当剧情推进到模组的另一场景时给出
}

stateOps 白名单（之外的会被系统丢弃）：
["flag", 名] 设置旗标 / ["delflag", 名] / ["clue", 名] 登记线索 / ["san", ±n] 理智增减 / ["hp", ±n] 生命增减 / ["item", id, ±n] 物品增减 / ["cocskill", 技能名, ±n]`

var kpClient = &http.Client{Timeout: 60 * time.Second}

func kpConfig() (url, key, model string, ok bool) {
	url = os.Getenv("KP_LITEGATE_URL")
	if url == "" {
		url = "http://127.0.0.1:8080/v1/chat/completions"
	}
	key = os.Getenv("KP_LITEGATE_KEY")
	model = os.Getenv("KP_MODEL")
	if model == "" {
		model = "deepseek-chat"
	}
	return url, key, model, key != ""
}

// handleKpChat：登录用户可调；LiteGate 未配置返回 503
func (s *apiServer) handleKpChat(w http.ResponseWriter, r *http.Request, u *userRow) {
	if r.Method != http.MethodPost {
		errJSON(w, 404, "未知接口")
		return
	}
	url, key, model, configured := kpConfig()
	if !configured {
		errJSON(w, 503, "AI KP 未配置")
		return
	}
	var req kpChatReq
	raw, err := readBody(r)
	if err != nil {
		errJSON(w, 400, "请求体过大")
		return
	}
	if err := json.Unmarshal(raw, &req); err != nil || len(req.Messages) == 0 {
		errJSON(w, 400, "请求格式错误")
		return
	}

	msgs := make([]lgMessage, 0, len(req.Messages)+1)
	msgs = append(msgs, lgMessage{Role: "system", Content: kpSystemPrompt})
	for _, m := range req.Messages {
		if m.Content == "" {
			continue
		}
		role := m.Role
		if role != "user" && role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, lgMessage{Role: role, Content: m.Content})
	}

	body, _ := json.Marshal(lgChatReq{
		Model:       model,
		Messages:    msgs,
		Temperature: 0.8,
		/* 推理模型（deepseek-flash 等）思维链会吃掉 max_tokens——
		 * 预算给足 2000，正文 2~5 句绰绰有余 */
		MaxTokens: 2000,
	})
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		s.internal(w, "kp newreq", err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+key)
	httpReq.Header.Set("X-LiteGate-App", "tarpg-kp")

	resp, err := kpClient.Do(httpReq)
	if err != nil {
		writeJSON(w, 502, kpChatResp{Error: "网关不可达"})
		return
	}
	defer resp.Body.Close()
	limited, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode != http.StatusOK {
		writeJSON(w, 502, kpChatResp{Error: "网关错误 " + http.StatusText(resp.StatusCode)})
		return
	}
	var lg lgChatResp
	if err := json.Unmarshal(limited, &lg); err != nil || len(lg.Choices) == 0 {
		writeJSON(w, 502, kpChatResp{Error: "网关响应异常"})
		return
	}
	writeJSON(w, 200, kpChatResp{Text: lg.Choices[0].Message.Content})
}
