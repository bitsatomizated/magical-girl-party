// 像素喵喵技能测试：主动【像素化】/ 被动【喵之追猎】（在 game/ 目录下运行：node test/pixel-meow-test.js）
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
let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

(async () => {
  const E = window.Engine, X = window.Engine._test;
  window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord; // 显式指定（默认地图会随选关界面调整；原 test_ring 已下线）
  E.newGame();
  const S = E.state, P = S.player;

  // ---- 主动：像素化 ----
  console.log("[1] 主动技能：像素化");
  P.skillCd = 0;
  const atkBefore = E.derived().atk;
  E.useSkill();
  check("施加像素化 buff", P.buffs.some(b => b.pixel));
  check(`攻击力 +4（derived 生效）`, E.derived().atk === atkBefore + 4);
  check("进入冷却 CD3", P.skillCd === 3);

  // ---- 被动：喵之追猎（路过施加）----
  console.log("[2] 被动技能：喵之追猎（路过施加）");
  const n = S.tiles.length;
  P.pos = 0;
  const m = S.monsters.find(x => x.def.tags.includes("aggressive"));
  m.pos = n - 1; m.def.move.steps = 1; // 下一步必然路过玩家所在格
  m.initRandom = false; // 本项验证「路过施加追猎」：关闭生成时的随机方向（该规则由 maid-events-test 覆盖）
  m.queuedNext = P.pos;
  const huntBefore = m.hunt || 0, hpBefore = P.hp;
  const originalRandom = Math.random;
  Math.random = () => 0; // 固定移动骰为1，只经过玩家一次。
  try { await new Promise((res) => X.aiMove(m, res)); }
  finally { Math.random = originalRandom; }
  await sleep(20);
  check("怪物路过获得 1 层追猎", (m.hunt || 0) === huntBefore + 1);
  check("像素化期间未被主动攻击", P.hp === hpBefore);

  // ---- 追猎攻击加成（computeAttack）----
  console.log("[3] 追猎攻击加成（层数持续提供加成，不随攻击消耗）");
  const base = E._test.computeAttack({}, null);
  const t = { marks: 0, hunt: 2 };
  const withHunt = E._test.computeAttack(t, null);
  check("攻击带追猎敌人 +3", withHunt === base + 3);
  check("层数不因结算而消耗（仍为 2 层）", t.hunt === 2);
  check("再次攻击仍为同一加成（持续生效）", E._test.computeAttack(t, null) === base + 3);
  check("无追猎层时不加成", E._test.computeAttack({ marks: 0, hunt: 0 }, null) === base);

  // ---- 像素化持续到下回合开始 ----
  console.log("[4] 像素化到下回合开始时结束");
  check("回合结束时 buff 仍在", P.buffs.some(b => b.pixel));
  X.finishPlayerTurn();
  await sleep(50); // FAST 模式：AI 回合与轮次推进在宏时序内完成
  check("下回合开始像素化已结束", !P.buffs.some(b => b.pixel));

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
