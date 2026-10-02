// 蓄力卡升星解锁测试：星级 <2 不入池，星级 >=2 以 2 份权重入池
// （在 game/ 目录下运行：node test/charge-unlock-test.js）
function makeWindowStub() {
  global.window = global;
  const logs = [];
  global.UI = { log: (msg) => logs.push(msg), renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  return logs;
}
const logs = makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

(async () => {
  const E = window.Engine, D = window.GAME_DATA, X = E._test;
  window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord;
  D.player = D.characters.char_anye;
  D.diff = "normal";
  E.newGame();
  const S = E.state, P = S.player;

  console.log("[1] 星级 <2：蓄力不入池");
  P.star = 0;
  let pool = X.battlePoolNow();
  check("池不含蓄力", pool.every(id => id !== "charge"));
  check("池大小 = 基础 14 份", pool.length === 14);
  // 统计抽 200 张（星级 0）：不应出现蓄力/全力攻击
  const got0 = new Set();
  for (let i = 0; i < 200; i++) { P.hand.length = 0; X.drawCard(true); got0.add(P.hand[0].id); }
  check("大量抽牌不出现蓄力", !got0.has("charge") && !got0.has("allout"));

  console.log("[2] 星级 >=2：蓄力以 2 份入池");
  P.star = 2;
  pool = X.battlePoolNow();
  check("池含 2 份蓄力", pool.filter(id => id === "charge").length === 2);
  check("池大小 = 16 份", pool.length === 16);
  const got2 = new Set();
  for (let i = 0; i < 400; i++) { P.hand.length = 0; X.drawCard(true); got2.add(P.hand[0].id); }
  check("大量抽牌可出现蓄力", got2.has("charge"));
  check("全力攻击仍只能由蓄力产出", !got2.has("allout"));

  console.log("[3] 打出蓄力产出全力攻击");
  P.hand.length = 0;
  P.hand.push({ ...D.cards.charge });
  S.battle = { mode: "playerAttack", target: S.monsters[0], cardBonus: 0, defBonus: 0, finalMult: 1, spentPoints: 0, noCounter: false };
  S.phase = "battle";
  E.playBattleCard("charge");
  check("获得 1 张全力攻击", P.hand.some(c => c.id === "allout"));
  S.battle = null;

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
