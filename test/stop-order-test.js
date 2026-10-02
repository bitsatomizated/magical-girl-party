// 停留询问顺序测试（node test/stop-order-test.js）：
// 路过升级点这类可停留地块时，顺序应为「先问是否与该格怪物交战 → 再问是否停留」
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

function setup() {
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
  E.newGame();
  const S = E.state;
  S.aiBusy = true;
  S.monsters = []; // 清空事件刷出的怪，使用自建场景
  return S;
}
const put = (S, id, pos, hp) => {
  const def = window.GAME_DATA.monsters[id];
  const m = { uid: ++S.monsterSeq, def, name: def.name, pos, hp: hp ?? def.hpMax, hpMax: def.hpMax, atk: def.attack, def_: def.defense, skillCd: 0, hunt: 0 };
  S.monsters.push(m);
  return m;
};
// 询问归类，便于打印顺序
const kind = (m) => /是否与.*交战/.test(m) ? "交战" : (/是否停留/.test(m) ? "停留" : null);

(async () => {
  console.log("[1] 路过升级点且有怪：先问交战，再问停留");
  const S1 = setup();
  put(S1, "dummy", 21); // 21 = 升级点；nextFixed=5 时 21 是「路过」而非落点
  const msgs = [];
  global.__askAuto = (msg) => { msgs.push(String(msg)); return false; }; // 交战选避开、停留选继续前进
  E.finishPlayPhase();
  S1.player.nextFixed = 5; // 0→18→19→20→21（剩余 1 步，路过）→…
  E.rollAndMove();
  await sleep(80);

  const iFight = msgs.findIndex((m) => /是否与.*交战/.test(m));
  const iStop = msgs.findIndex((m) => /是否停留/.test(m));
  console.log("      实际顺序: " + msgs.map(kind).filter(Boolean).join(" → "));
  check("升级点上出现了交战询问", iFight >= 0);
  check("升级点上出现了停留询问", iStop >= 0);
  check(`交战询问排在停留询问之前（${iFight} < ${iStop}）`, iFight >= 0 && iStop >= 0 && iFight < iStop);

  console.log("[2] 选择交战后：打完仍会追问是否停留");
  const S2 = setup();
  S2.player.coins = 50; // 停留后能真的升星
  const foe = put(S2, "dummy", 21);
  foe.hp = 1; foe.hpMax = 1; foe.def_ = 0; // 一击必倒
  const msgs2 = [];
  let fought = false, stopAsked = false;
  global.__askAuto = (msg) => {
    msgs2.push(String(msg));
    if (/是否与.*交战/.test(msg) && !fought) { fought = true; return true; } // 只接受第一次交战
    if (/是否停留/.test(msg)) { stopAsked = true; return true; }             // 选择停留
    return false;
  };
  E.finishPlayPhase();
  S2.player.nextFixed = 5;
  E.rollAndMove();
  await sleep(80);
  check("已进入战斗", !!S2.battle);
  // 打完这场：每次攻击之间让出事件循环，等异步询问与续接
  let g = 0;
  while (g++ < 40) {
    if (S2.battle) { E.resolvePlayerAttack(); await sleep(6); continue; }
    await sleep(12);
    if (!S2.battle) break;
  }
  await sleep(60);
  console.log("      实际顺序: " + msgs2.map(kind).filter(Boolean).join(" → "));
  check("战斗结束后才追问是否停留", stopAsked);
  check("停留询问出现在交战之后",
    msgs2.findIndex((m) => /是否停留/.test(m)) > msgs2.findIndex((m) => /是否与.*交战/.test(m)));
  check(`选择停留后剩余步数清零（steps=${S2.move ? S2.move.steps : "已结束"}）`,
    !S2.move || S2.move.steps === 0);
  check(`按升级点结算并升星（星级 ${S2.player.star}）`, S2.player.star >= 1);

  console.log("[3] 升级点无怪：不出现交战询问，照常问停留");
  const S3 = setup();
  const msgs3 = [];
  global.__askAuto = (msg) => { msgs3.push(String(msg)); return false; };
  E.finishPlayPhase();
  S3.player.nextFixed = 5;
  E.rollAndMove();
  await sleep(80);
  console.log("      实际顺序: " + msgs3.map(kind).filter(Boolean).join(" → "));
  check("没有交战询问", !msgs3.some((m) => /是否与.*交战/.test(m)));
  check("照常出现停留询问", msgs3.some((m) => /是否停留/.test(m)));

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})();
