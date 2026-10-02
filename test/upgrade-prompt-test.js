// 升级点提示测试（node test/upgrade-prompt-test.js）：验证路过升级点时的询问文案
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
let pass = 0, fail = 0;
const check = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

window.GAME_DATA.diff = "normal";
window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
E.newGame();
const S = E.state;
S.aiBusy = true;

// 女仆咖啡厅升星费用：[15, 20, 25][star]，star 从 0 起
console.log("[1] 升级点：金币不足时给出差额");
S.player.star = 0; S.player.coins = 12;
let msg = X.stopPrompt("upgrade", 3);
console.log("      " + msg);
check("含目标星级与花费（升到 1 星需要 15 金币）", /升到 1 星需要 15 金币/.test(msg));
check("含还差多少金币（还差 3 金币）", /还差 3 金币/.test(msg));
check("含现有金币（现有 12）", /现有 12/.test(msg));
check("保留步数提示（剩余 3 步将放弃）", /剩余 3 步将放弃/.test(msg));

console.log("[2] 升级点：金币充足");
S.player.star = 1; S.player.coins = 30;
msg = X.stopPrompt("upgrade", 1);
console.log("      " + msg);
check("提示金币充足且不再出现「还差」", /金币充足/.test(msg) && !/还差/.test(msg));
check("金额按当前星级取（升到 2 星需要 20 金币）", /升到 2 星需要 20 金币/.test(msg));

console.log("[3] 升级点：已达最高星级");
S.player.star = 3; S.player.coins = 100;
msg = X.stopPrompt("upgrade", 2);
console.log("      " + msg);
check("提示已达最高星级", /已达最高星级/.test(msg));

console.log("[4] 起始点同样支持升星（与升级点同一套文案）；其他地块不夹带升星信息");
S.player.star = 0; S.player.coins = 30;
msg = X.stopPrompt("start", 4);
console.log("      " + msg);
check("起始点展示升星花费与金币状态", /升到 1 星需要 15 金币/.test(msg) && /金币充足/.test(msg));
check("起始点保留步数提示（剩余 4 步将放弃）", /剩余 4 步将放弃/.test(msg));
// 升星说明应来自同一套逻辑：只比较说明片段，不绑定地块称呼
const starInfo = (m) => (m.match(/升到 \d+ 星需要 \d+ 金币[^（]*（现有 \d+）。/) || [""])[0];
const upgradeMsg = X.stopPrompt("upgrade", 4);
check("起始点与升级点的升星说明一致", starInfo(msg) !== "" && starInfo(msg) === starInfo(upgradeMsg));
// 引擎里能触发停留询问的格型只有起始点/升级点；其余格型走 stopPrompt 的通用句式，不得夹带升星信息
const otherMsg = X.stopPrompt("chipshop", 4);
console.log("      " + otherMsg);
check("其他地块沿用原句式（经过筹码商店，是否停留）", /经过筹码商店，是否停留/.test(otherMsg));
check("其他地块保留步数提示", /剩余 4 步将放弃/.test(otherMsg));
check("其他地块不含升星信息", !/星需要/.test(otherMsg) && !/金币充足/.test(otherMsg) && !/还差/.test(otherMsg));

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
