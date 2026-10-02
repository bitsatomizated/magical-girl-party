// 岔路拓扑测试：图上游走、岔口选择、捷径 BFS 追击（node test/branch-map-test.js）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, X = window.Engine._test;
// 选用岔路地图（12 格环 + 捷径 3↔9）
window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

(async () => {
  // ---- [1] 捷径几何 ----
  console.log("[1] 拓扑与距离");
  E.newGame();
  const S = E.state;
  check("捷径使 3 与 9 相邻", S.adj[3].includes(9) && S.adj[9].includes(3));
  check("edges 已配置：adj 按图构建（非缺省单环）", S.adj[3].length === 3 && S.adj[0].length === 2);
  check("BFS 距离 8→0 = 4（8→9→3→11→0）", E.graphDist(8, 0) === 4);
  check("3→9 距离 = 1（捷径直达）", E.graphDist(3, 9) === 1);

  // ---- [2] 岔路：起点选向 + 三岔口选择 ----
  console.log("[2] 岔路选择（玩家）");
  E.newGame();
  const S2 = E.state, P2 = S2.player;
  E.finishPlayPhase();
  P2.nextFixed = 5;
  E.rollAndMove();
  await sleep(30);
  if (S2.shop) E.closeShop(); // 路过 3 号商店格：关闭商店面板让移动继续
  await sleep(30);
  check("固定初始方向自动走 0→1→2→3，在三岔口 3 等待（候选 {4,9}，无开局选择）", !!S2.move?.await && S2.move.await.includes(9) && S2.move.await.includes(4) && P2.pos === 3);
  E.pickMoveStep(9); // 走捷径
  await sleep(30);
  check("捷径抵达 9 后又一岔口（候选 {8,10}，不含来路 3）", !!S2.move?.await && S2.move.await.includes(8) && !S2.move.await.includes(3));
  E.pickMoveStep(8);
  await sleep(30);
  check("最终落地 8（spawn 格接战）", P2.pos === 8);

  // ---- [3] 主动怪 BFS 追击走捷径 ----
  console.log("[3] 怪物 BFS 追击");
  E.newGame();
  const S3 = E.state, P3 = S3.player;
  P3.pos = 0;
  const m = S3.monsters.find(x => x.def.tags.includes("aggressive"));
  m.pos = 8; m.skillCd = 99;
  m.initRandom = false; // 本项验证 BFS 追击逻辑本身：关闭「生成时随机方向」（该规则由 maid-events-test 覆盖）
  m.queuedNext = null;  // 同时清掉刷出时预掷的首步方向，使首步回到贪心决策
  const visited = new Set();
  const origRender = global.UI.renderAll;
  global.UI.renderAll = () => { visited.add(m.pos); };
  await Promise.race([new Promise((res) => X.aiMove(m, res)), sleep(120)]); // 怪物抵达玩家格接战后挂起，路径已记录
  global.UI.renderAll = origRender;
  check("追击路径经过捷径口 9（8→9→3→11→0）", visited.has(9));
  check("未绕行远侧环段 7/6/5", !visited.has(7) && !visited.has(6) && !visited.has(5));

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
