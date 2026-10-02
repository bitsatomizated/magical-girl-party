// 再次交战测试（node test/refight-test.js）：验证同一格再次经过会重新询问是否交战
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

(async () => {
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
  E.newGame();
  const S = E.state;
  S.aiBusy = true;

  // 构造：玩家站在空格 5，同格放两只不同名的怪，模拟一次进行中的移动
  const POS = 5;
  S.monsters = [];
  S.player.pos = POS;
  X.spawnMonster("dummy", POS);
  X.spawnMonster("maid_sprite", POS);
  S.move = { who: "player", steps: 4, prev: null, forcedNext: null, asked: null };

  let prompts = [], guard = 0;
  global.__askAuto = (msg) => { prompts.push(String(msg)); if (++guard > 12) throw new Error("疑似无限询问循环"); return false; };

  console.log("[1] 一次结算内：同格两只怪各问一次");
  prompts = []; guard = 0;
  const opened = await X.offerTileFight("pass"); // 询问改为异步等玩家点击，这里用自动应答驱动
  check("全部拒绝后不开战", opened === false);
  check(`恰好询问 2 次（实际 ${prompts.length}）`, prompts.length === 2);
  check("两次问的是不同怪物", prompts.length === 2 && prompts[0] !== prompts[1]);

  console.log("[2] asked 保留（战斗结束后重入结算）：不重复询问");
  prompts = []; guard = 0;
  await X.offerTileFight("pass");
  check(`重入后不再询问（实际 ${prompts.length} 次）`, prompts.length === 0);

  console.log("[3] 清空 asked（再次经过同一格）：重新询问");
  S.move.asked = null; // 移动循环进入新格时执行的正是这一步
  prompts = []; guard = 0;
  await X.offerTileFight("pass");
  check(`重新询问 2 次（实际 ${prompts.length}）`, prompts.length === 2);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})();
