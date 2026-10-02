// 击倒的轮次代价测试（node test/ko-round-test.js）
// 规则（设计文档02 §6）：被击倒 → 清 buff、轮次进度 +1（损失一轮行动）、下回合原地复活。
// 关键约定：计数器直接跳进，但被跨过的那一轮事件（刷怪/全局效果）必须在推进瞬间补触发。
function makeWindowStub() {
  global.window = global;
  global.__logs = [];
  global.UI = { log: (m, k) => global.__logs.push((k ? `[${k}]` : "") + m), renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
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

(async () => {
  console.log("[1] 第 7 轮被击倒：倒地瞬间轮次 +1 并立刻刷怪，本回合收尾后进入第 9 轮复活");
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe; // 第 8 轮事件【魔王号令】：刷 4 只女仆精灵 + 全体攻防 +1
  E.newGame();
  const S = E.state, P = S.player;
  S.monsters = [];          // 清空开局刷出的怪，便于按数量断言
  S.round = 7;              // 模拟：第 7 轮玩家回合结束、AI 回合中被打倒
  const spriteDef = window.GAME_DATA.monsters.maid_sprite;
  global.__logs.length = 0;
  E._test.playerTakesDamage(9999, "测试致死伤害");
  X.checkPlayerKo();
  check("击倒成立：玩家被标记为 ko", P.ko === true);
  const logs1 = global.__logs.join("\n");
  check(`倒地瞬间轮次即 +1（第 7 → ${S.round} 轮）`, S.round === 8);
  check("第 8 轮事件在倒地瞬间已触发（日志含【魔王号令】）", logs1.includes("第 8 轮事件") && logs1.includes("魔王号令"));
  check("第 8 轮刷怪已在倒地瞬间发生：4 只女仆精灵在场",
    S.monsters.filter(m => m.def.id === "maid_sprite").length === 4);

  X.endRound(); // 本回合收尾：自然推进到第 9 轮
  await sleep(20);
  const logs2 = global.__logs.join("\n");
  check(`收尾后进入第 9 轮（实际第 ${S.round} 轮）`, S.round === 9);
  check("第 8 轮的全局加成已生效（新刷精灵攻击 = 基础 +1）",
    S.monsters.every(m => m.atk === spriteDef.attack + 1));
  check("玩家在第 9 轮开始原地复活并可行动", P.ko === false && P.hp === P.hpMax && S.phase === "play");
  check("补推进未重复触发第 8 轮事件（魔王号令只出现 1 次）",
    (logs2.match(/魔王号令/g) || []).length === 1);

  console.log("[2] 无人被击倒时：轮次正常 +1，无额外推进");
  const S2 = E.state;
  S2.round = 3;
  global.__logs.length = 0;
  X.endRound();
  await sleep(20);
  check(`轮次 3 → 4（实际第 ${S2.round} 轮）`, S2.round === 4);
  check("未出现【轮次进度 +1】的即时推进日志", !global.__logs.join("\n").includes("（轮次进度 +1）"));

  console.log("[3] 轮次上限保护：即时推进不越过总轮数");
  const S3 = E.state;
  S3.round = S3.roundsLimit;
  global.__logs.length = 0;
  X.advanceRoundProgress(1);
  check(`轮次不超过上限（${S3.round} / ${S3.roundsLimit}）`, S3.round === S3.roundsLimit);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
