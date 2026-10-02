// 卡牌实验室事件测试：四波投放的轮次、数量、落点与全局强化累积
// （node test/card-lab-events-test.js）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");

require("../js/engine.js");

const D = window.GAME_DATA, E = window.Engine, X = E._test;
const M = D.maps.card_lab;
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const of = (id) => E.state.monsters.filter(m => m.def.id === id);

D.map = M;
D.player = D.characters.char_pixel_meow;
D.diff = "normal";
E.newGame();
const S = E.state;

// ---- [1] 第 1 轮：魔物骚动 ----
console.log("[1] 第 1 轮：魔物骚动");
const w1 = of("lab_wander");
check("六只游荡魔物登场且全部落在刷怪格", w1.length === 6 && w1.every(m => S.tiles[m.pos].t === "spawn"));
check("六只小怪的登场方向统一朝上（下一步落在 y-1）",
  w1.every(m => m.queuedNext != null && S.tiles[m.queuedNext].y === S.tiles[m.pos].y - 1 && S.adj[m.pos].includes(m.queuedNext)));
check("变彩登场并落在 16 号格（最下方事件格）", of("lab_variant").length === 1 && of("lab_variant")[0].pos === 16);
check("16 号格确为事件格", S.tiles[16].t === "event");
check("开局不再自动铺怪（第 1 轮事件是唯一来源）", S.monsters.length === 7);

// ---- [2] 第 4 轮：群魔乱舞 ----
console.log("[2] 第 4 轮：群魔乱舞");
S.monsters = [];
S.round = 4;
const probe = X.makeMonster(D.monsters.lab_wander, 6); // 6 号格 (6,0)：事件格，不在任何投放池内
S.monsters.push(probe);
X.fireRoundStartEffects(4);
const w3 = of("lab_wander").filter(m => m !== probe);
check("刷出六只游荡魔物", w3.length === 6);
check("六只恰好铺满六个拿牌格（每格一只，与池容量一致）",
  w3.every(m => S.tiles[m.pos].t === "draw") && new Set(w3.map(m => m.pos)).size === 6);
check("落点避开玩家格与既有怪格", !w3.some(m => m.pos === S.player.pos || m.pos === 6));
check("所有怪物攻击力 +1（含此前已在场的怪）", probe.atk === 4 && w3.every(m => m.atk === 4));
check("事件之后新刷出的怪同样带攻击加成", X.spawnMonster("lab_wander", 9).atk === 4);
check("此时防御力尚未提升", probe.def_ === 0);

// ---- [3] 第 9 轮：万魔之王 ----
console.log("[3] 第 9 轮：万魔之王");
S.monsters = [probe, X.makeMonster(D.monsters.lab_variant, 16)]; // 变彩在场
S.round = 9;
X.fireRoundStartEffects(9);
check("刷出一只奇美拉", of("lab_chimera").length === 1);
check("奇美拉落在 16 号格（变彩处）", of("lab_chimera")[0].pos === 16);
check("该格上同时有变彩与奇美拉", S.monsters.filter(m => m.pos === 16).length === 2);
check("所有怪物防御力 +1（小怪 0→1，奇美拉 4→5）", probe.def_ === 1 && of("lab_chimera")[0].def_ === 5);
check("第 4 轮的攻击加成未被重置", probe.atk === 4);

// ---- [4] 第 12 轮：最终爆发 ----
console.log("[4] 第 12 轮：最终爆发");
S.round = 12;
X.fireRoundStartEffects(12);
const w12 = S.monsters.filter(m => m.def.id === "lab_wander" && S.tiles[m.pos].t === "dash");
check("刷出四只游荡魔物且全部落在疾行格", w12.length === 4);
check("疾行格共 6 个（含内部竖列两格），本轮只投放 4 只、不重复占同一格",
  S.tiles.filter(t => t.t === "dash").length === 6 && new Set(w12.map(m => m.pos)).size === 4);
check("所有怪物攻防再 +1（累计 攻击 +2 / 防御 +2）", probe.atk === 5 && probe.def_ === 2);
check("本轮新刷的怪自带累计加成", w12.every(m => m.atk === 5 && m.def_ === 2));
check("此后新刷出的怪同样自带累计加成", X.spawnMonster("lab_wander", 7).atk === 5);

// ---- [5] 事件表与去重 ----
console.log("[5] 事件表与去重");
check("事件表共四条，轮次为 1/4/9/12", M.globalEvents.length === 4 && M.globalEvents.map(e => e.round).join(",") === "1,4,9,12");
check("四条事件都有名称与描述", M.globalEvents.every(e => e.name && e.desc));
check("强化事件使用含 BOSS 的 allMonstersStats",
  M.globalEvents.slice(1).every(e => e.effect === "allMonstersStats"));
X.fireRoundStartEffects(12);
check("同一轮不会重复触发（firedRounds 去重）",
  S.monsters.filter(m => m.def.id === "lab_wander" && S.tiles[m.pos].t === "dash").length === 4) ;
check("地图总轮数 16，四波事件落在前 12 轮", M.rounds === 16 && M.globalEvents.every(e => e.round <= 16));

// ---- [6] 刷怪来源限本图：不刷别的地图的小怪 ----
console.log("[6] 刷怪只出本图小怪");
const poolLab = X.mapMinionPool().map(d => d.id);
check(`卡牌实验室小怪池只有本图的游荡魔物（${poolLab.join("/")}）`,
  poolLab.length === 1 && poolLab[0] === "lab_wander");

const keepMap6 = D.map;
D.map = D.maps.maid_cafe;
const poolCafe = X.mapMinionPool().map(d => d.id);
D.map = keepMap6;
check(`女仆咖啡厅小怪池不含其他地图的小怪（${poolCafe.join("/")}）`,
  poolCafe.length > 0 && !poolCafe.includes("lab_wander") && !poolCafe.includes("sentinel"));

S.monsters = [];
X.eventSpawnMinions(4);
const evSpawned = S.monsters.map(m => m.def.id);
check(`随机事件刷 4 只，全部是游荡魔物（${evSpawned.join("/")}）`,
  evSpawned.length === 4 && evSpawned.every(id => id === "lab_wander"));

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
