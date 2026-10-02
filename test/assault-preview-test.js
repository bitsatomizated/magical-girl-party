// 回归测试：突击门选目标期间回合挂起 / 怪物方向预览按轮冻结 / 事件刷怪首步方向随机
// （在 game/ 目录下运行：node test/assault-preview-test.js）
function makeWindowStub() {
  global.window = global;
  const logs = [];
  global.UI = { log: (msg) => logs.push(msg), renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
  return logs;
}
const logs = makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitIdle() { const st = () => window.Engine.state; for (let i = 0; i < 300 && (st()?.aiBusy || st()?.move); i++) await sleep(10); await sleep(20); }

let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

(async () => {
  const E = window.Engine, X = window.Engine._test;
  const D = window.GAME_DATA;

  // ---- [1] 突击门：选目标期间回合挂起，AI 不行动 ----
  console.log("[1] 突击门选目标期间敌人不行动");
  D.player = D.characters.char_pixel_meow;
  D.map = D.maps.tutorial_ring; // 18 = 突击门（1 基编号；练习环道与原 test_ring 同为 20 格单环，突击门同在第 17 格）
  E.newGame();
  let S = E.state, P = S.player;
  P.pos = 16; P.lastFrom = 15; // tutorial_ring 的突击门在第 17 格
  P.nextFixed = 1;
  E.finishPlayPhase();
  E.rollAndMove();           // 走 1 步落到 18（突击门）：进入瞄准
  await sleep(30);
  check("突击门进入瞄准（targeting 挂起）", !!S.targeting && S.targeting.assault);
  const mobPosBefore = S.monsters.map(m => m.pos).join(",");
  E.cancelTargeting();       // 取消瞄准：回合才交给 AI
  check("取消后回合结束进入 AI 阶段", S.phase === "turnEnd" || S.aiBusy);
  await waitIdle();
  check("瞄准期间怪物未移动（取消后才行动）", S.monsters.map(m => m.pos).join(",") !== mobPosBefore);

  // ---- [2] 方向预览：玩家回合内冻结，不随玩家移动变化 ----
  console.log("[2] 方向预览按轮冻结");
  // 预览直接读预掷结果（queuedNext），登场时由 rollNextStep 预掷：
  // 女仆咖啡厅第 1 轮事件刷出的女仆精灵（主动怪）登场即有确定方向，可作为观察对象
  D.map = D.maps.maid_cafe;
  E.newGame(); // 重开一局
  S = E.state;
  const agg = S.monsters.find(m => m.def.tags.includes("aggressive") && m.hp > 0);
  P.pos = agg.pos; // 先与主动怪同格，再换到远处：确认预览与玩家位置无关
  const n = S.tiles.length;
  P.pos = (agg.pos + Math.floor(n / 2)) % n;
  const d1 = E.peekNext(agg);      // 首次询问：读登场时预掷的方向
  P.pos = (P.pos + 3) % n;         // 玩家移动
  const d2 = E.peekNext(agg);
  check("玩家移动后预览方向不变（预掷结果在本回合内冻结）", d1 === d2 && d1 != null);

  // ---- [3] 事件刷怪首步方向随机（maid_cafe 第 1 轮事件刷出的安若素）----
  console.log("[3] 事件刷怪首步方向随机");
  D.map = D.maps.maid_cafe;
  const firstSteps = new Set();
  for (let t = 0; t < 24; t++) {
    E.newGame();
    S = E.state;
    const an = S.monsters.find(m => m.def.id === "maid_anruosu");
    if (!an) break;
    P.pos = 10; // 距安若素登场点 BFS 距离 14 > 单回合最大步数 10：不会相遇触发战斗挂起
    await Promise.race([
      new Promise((res) => X.aiMove(an, res)),
      sleep(500),
    ]);
    await sleep(5);
    firstSteps.add(an.pos);
  }
  check(`24 次开局首步出现多个方向（实际 ${firstSteps.size} 种）`, firstSteps.size >= 2);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
