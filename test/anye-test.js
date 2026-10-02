// 安叶技能测试：主动【青鸾雏焰】/ 被动【凤凰再生】（在 game/ 目录下运行：node test/anye-test.js）
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
// 等待后台 AI 回合链（closeShop 后的 finishPlayerTurn → aiTurns）完全空转，避免与测试直接驱动的 aiMove 竞态
async function waitIdle() { const st = () => window.Engine.state; for (let i = 0; i < 200 && (st()?.aiBusy || st()?.move); i++) await sleep(10); await sleep(20); }
let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

(async () => {
  const E = window.Engine, X = window.Engine._test;
  window.GAME_DATA.player = window.GAME_DATA.characters.char_anye; // 指定被测角色
  // 原 test_ring 已下线：改用同为 20 格单环的练习环道（第 3 格为商店、第 4 格刷训练假人，编号语义与前者一致）
  window.GAME_DATA.map = window.GAME_DATA.maps.tutorial_ring;     // 显式指定（默认地图会随选关界面调整）
  E.newGame();
  const S = E.state, P = S.player;

  // ---- 主动：青鸾雏焰（铺设覆盖本次移动起终点）----
  console.log("[1] 主动技能：青鸾雏焰铺设");
  P.skillCd = 0;
  E.useSkill();
  check("技能进入铺设状态", P.flameActive === true);
  check("本回合移速 +2（turnMoveBonus，掷骰与疾行续走都吃）", P.turnMoveBonus === 2 && P.moveBonus === 0);
  check("进入冷却 CD3", P.skillCd === 3);
  P.nextFixed = 3;           // 遥控骰子语义复用：固定走 3 步（0→1→2→3）
  E.finishPlayPhase();       // 出牌阶段 → 移动阶段（页面流程中由「结束出牌」按钮触发）
  E.rollAndMove();
  await sleep(50);
  check("起点格铺设青焰", !!(S.flames && S.flames[0]));
  check("途经与终点格铺设青焰（1/2/3）", [1, 2, 3].every(i => S.flames && S.flames[i]));
  check("青焰伤害为 2", S.flames[1] === 2);
  check("停在商店格（落地结算挂起）", !!S.shop);
  E.closeShop();
  await sleep(80); // FAST 模式：AI 回合与轮次推进在宏时序内完成
  await waitIdle();
  check("回合结束后铺设状态关闭", P.flameActive === false);

  // ---- 青焰伤害：怪物进入青焰格受 1 点 ----
  console.log("[2] 怪物踏入青焰受伤");
  // 前置清场：上一轮 AI 回合可能有怪物撞上玩家开了战。战斗未结束时 stepMonster 会直接返回，
  // 手工驱动的 done 便永不触发，测试进程会静默挂死。
  S.battle = null; S.pendingTile = null; S.move = null;
  P.ko = false; P.hp = P.hpMax; P.pos = 12; P.lastFrom = null; // 玩家远离焰区路径
  await waitIdle();
  S.battle = null; S.move = null; // 清场与 AI 链收尾之间可能再产生一次残留，再清一遍
  S.flames = { 0: 1 };           // 直接布置：第 0 格青焰
  const n = S.tiles.length;
  // 前期 AI 回合存在随机性：假人可能被青焰/战斗打死。不在场则现场补刷一只，保证测试可驱动
  const dummy = S.monsters.find(m => m.def.id === "dummy" && m.hp > 0) || X.spawnMonster("dummy", n - 1);
  dummy.pos = n - 1;         // 19：来路 18，不掉头的唯一方向即第 0 格
  dummy.lastFrom = n - 2;
  dummy.queuedNext = 0;
  dummy.hp = dummy.hpMax = 100; // 满血大血包：避免被青焰击倒而触发任务奖励的筹码选择（会挂起等待点击）
  const hpBefore = dummy.hp;
  // 只走一步：手工驱动 stepMonster，避免 1d10 随机步数走进玩家格触发战斗而挂起
  await new Promise((res) => {
    S.move = { who: dummy, steps: 1, attacked: false, prev: n - 2, done: res };
    X.stepMonster();
  });
  await sleep(20);
  check(`踏入青焰格受伤 1 点（${hpBefore} → ${dummy.hp}）`, dummy.hp === hpBefore - 1);

  // ---- 被动：凤凰再生（致死拦截）----
  console.log("[3] 被动技能：凤凰再生");
  const atkBefore = P.atk, hpMaxBefore = P.hpMax, leftBefore = P.phoenixLeft;
  E._test.playerTakesDamage(9999, "测试致死伤害");
  X.checkPlayerKo();
  check("未被击倒", !P.ko);
  check("最大生命 -4（20→16）", P.hpMax === hpMaxBefore - 4);
  check("生命回满", P.hp === P.hpMax);
  check("攻击力不变（被动不再加攻）", P.atk === atkBefore);
  check("青焰伤害永久 +1（flameBonus=1）", P.flameBonus === 1);
  check("剩余次数 -1", P.phoenixLeft === leftBefore - 1);

  // ---- 次数耗尽后正常被击倒 ----
  console.log("[4] 三次耗尽后失效");
  P.phoenixLeft = 1;
  E._test.playerTakesDamage(9999, "测试致死伤害"); X.checkPlayerKo();
  check("最后一次仍拦截", !P.ko && P.phoenixLeft === 0);
  const roundBefore = S.round;
  P.hp = 0;
  X.checkPlayerKo();
  check("次数耗尽：正常被击倒", P.ko === true);
  check(`击倒瞬间轮次进度 +1（${roundBefore} → ${S.round}）`, S.round === roundBefore + 1);

  // ---- 青焰持续到下回合开始 ----
  console.log("[5] 青焰持续到下回合开始");
  S.flames = { 5: 4 };
  X.turnStartEffects();
  check("下回合开始青焰熄灭", S.flames === null);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
