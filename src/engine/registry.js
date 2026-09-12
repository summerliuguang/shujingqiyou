/* ---------------- 游戏注册表 ---------------- */
const GAMES = {};
function registerGame(def) { GAMES[def.id] = def; }
function game(id) { return GAMES[id]; }
function games() { return Object.values(GAMES); }

export { GAMES, registerGame, game, games };
