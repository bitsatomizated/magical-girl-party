// 难度系统测试：分难度怪物数值（node test/difficulty-test.js）
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

const E = window.Engine;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

(async () => {
  for (const diff of ["normal", "hard", "nightmare", "crazy"]) {
    window.GAME_DATA.diff = diff;
    // 原 test_ring 已下线：改用驻守 BOSS（灾厄核心）的练习环道测分档数值
    window.GAME_DATA.map = window.GAME_DATA.maps.tutorial_ring; // 显式指定（默认地图会随选关界面调整）
    E.newGame();
    const S = E.state;
    const boss = S.monsters.find(m => m.def.category === "boss");
    const expect = { normal: [30, 3, 2], hard: [45, 4, 3], nightmare: [66, 5, 4], crazy: [90, 6, 5] }[diff];
    check(`[${diff}] BOSS 数值 ${boss.hpMax}/${boss.atk}/${boss.def_}（期望 ${expect.join("/")})`,
      boss.hpMax === expect[0] && boss.atk === expect[1] && boss.def_ === expect[2]);
  }
  // 踩刷怪格刷出的小怪也按难度取值
  window.GAME_DATA.diff = "crazy";
  window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord;
  E.newGame();
  const S2 = E.state;
  E.finishPlayPhase();
  S2.player.nextFixed = 4;
  E.rollAndMove();
  await sleep(30);
  if (S2.move?.await) { E.pickMoveStep(S2.move.await[0]); await sleep(30); }
  const m = S2.monsters[0];
  check(`[crazy] 踩格刷怪数值 ${m ? m.hpMax + "/" + m.atk + "/" + m.def_ : "无"}（期望 18/4/2，假人）`,
    m && m.hpMax === 18 && m.atk === 4 && m.def_ === 2);
  // 女仆精灵四档数值表（女仆咖啡厅的刷怪格配置为女仆精灵）
  const tbl = { normal: [8, 2, 0], hard: [9, 2, 0], nightmare: [10, 3, 0], crazy: [12, 4, 0] };
  for (const diff of Object.keys(tbl)) {
    window.GAME_DATA.diff = diff;
    window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
    E.newGame();
    const S3 = E.state;
    E.finishPlayPhase();
    // 「方向抉择」自选向右，第 1 步落在刷怪格 1（女仆精灵）——竖颈路径会路过升星格中断移动，不适合本测试
    S3.player.nextFixed = 1;
    S3.player.nextChooseDir = true;
    E.rollAndMove();
    await sleep(30);
    let guard = 0;
    while (S3.move?.await && guard++ < 10) { E.pickMoveStep(S3.move.await[0]); await sleep(20); }
    let guard2 = 0;
    while (S3.shop && guard2++ < 10) { E.closeShop(); await sleep(20); }
    const ms = S3.monsters.find(x => x.def.id === "maid_sprite");
    check(`[${diff}] 女仆精灵 ${ms ? ms.hpMax + "/" + ms.atk + "/" + ms.def_ : "无"}（期望 ${tbl[diff].join("/")})`,
      ms && ms.hpMax === tbl[diff][0] && ms.atk === tbl[diff][1] && ms.def_ === tbl[diff][2]);
  }

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
