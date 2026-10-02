// 筹码层数词条测试：财富入手即入层、下回合开始发币；
// 再生每回合开始时获得芯片层数（再生 I +2 / 再生 II +5）再回血，回合结束减半（node test/chip-stacks-test.js）
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

const E = window.Engine, T = E._test;
E.newGame();
const S = E.state, P = S.player;

let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

// 抽到 财富 II（+3 层）与 再生 II（+5 层）
T.addChip("wealth2");
check("财富：入手立即入层（0→3）", P.wealth === 3);
T.addChip("regen2");
check("再生 II 数值为 5 层", window.GAME_DATA.chips.regen2.regenStacks === 5);
check("再生 I 数值为 2 层", window.GAME_DATA.chips.regen1.regenStacks === 2);
check("再生：入手当回合不立即入层", P.regen === 0);
const coinsBefore = P.coins;
P.hp = 10;
T.turnStartEffects();
check("第 1 回合开始：获得 5 层再生", P.regen === 5);
check("第 1 回合开始：按 5 层回血 +5（10→15）", P.hp === 15);
check("回合开始：按财富 3 层发 3 金币", P.coins === coinsBefore + 3);
T.turnEndEffects();
check("回合结束：再生层数减半（5→2）", P.regen === 2);
// 关键：效果是「每回合」而不是一次性
P.hp = 10;
T.turnStartEffects();
check("第 2 回合开始：再次获得 5 层（2→7）", P.regen === 7);
check("第 2 回合开始：按 7 层回血 +7（10→17）", P.hp === 17);
T.turnEndEffects();
check("第 2 回合结束：层数减半（7→3）", P.regen === 3);
// 两张再生叠加
T.addChip("regen1");
P.hp = 1;
T.turnStartEffects();
check("持有再生 I + II 时每回合共获得 7 层（3+7=10）", P.regen === 10);
check("按 10 层回血（1→11）", P.hp === 11);
// 未持再生筹码时不再凭空产生层数
S.player.chips = S.player.chips.filter(id => id !== "regen1" && id !== "regen2");
P.hp = 5;
T.turnEndEffects(); // 10→5
const before = P.regen;
T.turnStartEffects();
check("移出再生筹码后回合开始不再新增层数", P.regen === before && before === 5);

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
