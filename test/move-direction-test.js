// 移动方向继承测试（node test/move-direction-test.js）
// 规则：每一回合起步方向继承上一回合的来路，不能随意转向、不能掉头；
//      只有首次移动（无来路）才用登场随机方向 / 地图初始方向
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => false; // 本测试不需要交战
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, X = window.Engine._test;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

function setup(mapName) {
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps[mapName || "maid_cafe"];
  E.newGame();
  const S = E.state;
  S.aiBusy = true;
  S.monsters = [];
  return S;
}

(async () => {
  console.log("[1] 玩家：起步方向继承上一回合来路");
  const S1 = setup();
  const P1 = S1.player;
  const start = 19;                        // 任意非起点格
  const from = S1.adj[start][0];           // 上一回合是从这一格走进来的
  P1.pos = start;
  P1.lastFrom = from;
  E.finishPlayPhase();
  P1.nextFixed = 1;                        // 只走 1 步，便于断言方向
  E.rollAndMove();
  await sleep(40);
  check(`没有掉头走回上一格（现位置 ${P1.pos}，来路 ${from}）`, P1.pos !== from);
  check("新位置是原格的邻格", S1.adj[start].includes(P1.pos));
  check(`来路已更新为出发格（lastFrom=${P1.lastFrom}）`, P1.lastFrom === start);

  console.log("[2] 玩家：起点无来路时按地图初始方向起步（不会随机乱转）");
  const S2 = setup();
  const P2 = S2.player;
  check("新局玩家无来路记录", P2.lastFrom === null);
  P2.pos = S2.tiles.length ? 0 : 0;
  E.finishPlayPhase();
  P2.nextFixed = 1;
  E.rollAndMove();
  await sleep(40);
  const expect2 = (() => { // 与引擎 initialNext 同规则：地图 initialDir 向量匹配 → 顺时针 → 逆时针
    const dv = window.GAME_DATA.map.initialDir, n = S2.tiles.length;
    if (dv && S2.tiles[0].x != null) {
      const hit = S2.adj[0].find(nb => S2.tiles[nb].x === S2.tiles[0].x + dv[0] && S2.tiles[nb].y === S2.tiles[0].y + dv[1]);
      if (hit != null) return hit;
    }
    const cw = 1 % n, ccw = (n - 1) % n;
    if (S2.adj[0].includes(cw)) return cw;
    if (S2.adj[0].includes(ccw)) return ccw;
    return S2.adj[0][0];
  })();
  check(`第 1 步落在初始方向指定的格（${P2.pos}，期望 ${expect2}）`, P2.pos === expect2);

  console.log("[3] 玩家：被击倒后原地复活，保持位置与来路");
  const S3 = setup();
  const P3 = S3.player;
  P3.pos = 19; P3.lastFrom = S3.adj[19][0]; P3.ko = true;
  X.endRound(); // 下回合开始时原地复活
  check(`原地复活：位置不变（位置 ${P3.pos}，期望 19）`, P3.pos === 19);
  check(`保持原方向：来路不变（lastFrom=${P3.lastFrom}，期望 ${S3.adj[19][0]}）`, P3.lastFrom === S3.adj[19][0]);
  check("复活后状态：ko 解除且可直接行动（无 reviveSkip）", P3.ko === false && !P3.reviveSkip);
  check("复活后生命回满", P3.hp === P3.hpMax);

  console.log("[4] 怪物：首次移动用登场方向，之后继承来路");
  const S4 = setup();
  const m4 = X.spawnMonster("maid_sprite", 19);
  m4.initRandom = false; // 关掉随机，便于断言方向继承本身
  await new Promise((res) => { X.aiMove(m4, res); setTimeout(res, 80); });
  await sleep(20);
  const f1 = m4.lastFrom, p1 = m4.pos;
  check(`首次移动记录来路（lastFrom=${f1}）`, f1 != null && S4.adj[p1].includes(f1));
  check("首次移动无来路（lastAiPrev=null → 用登场/初始方向）", S4._dbg.lastAiPrev === null);
  await new Promise((res) => { X.aiMove(m4, res); setTimeout(res, 80); });
  await sleep(20);
  check(`第二回合起步继承上回合来路（lastAiPrev=${S4._dbg.lastAiPrev}，上回合来路=${f1}）`,
    S4._dbg.lastAiPrev === f1);
  check(`第二回合结束后来路仍是合法邻格（位置 ${m4.pos}，来路 ${m4.lastFrom}）`,
    S4.adj[m4.pos].includes(m4.lastFrom));
  check("第二回合第一步没有掉头（来路是上回合位置）", m4.lastFrom === f1 || S4.adj[m4.pos].includes(m4.lastFrom));

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
