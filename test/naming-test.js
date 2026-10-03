// 同名怪编号测试（node test/naming-test.js）
// 规则：小怪与晕彩分身按登场顺序编号（女仆精灵1、晕彩分身2…）；精英与 BOSS 不编号
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const names = (S, id) => S.monsters.filter(m => m.def.id === id).map(m => m.name);

function setup(diff) {
  window.GAME_DATA.diff = diff || "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
  E.newGame();
  E.state.aiBusy = true;
  return E.state;
}

(async () => {
  console.log("[1] 小怪按登场顺序编号");
  const S1 = setup();
  check(`第 1 轮刷出的女仆精灵编号为 ${names(S1, "maid_sprite").join("、")}`,
    JSON.stringify(names(S1, "maid_sprite")) === JSON.stringify(["女仆精灵1", "女仆精灵2", "女仆精灵3", "女仆精灵4"]));
  check("女仆精灵名称互不重复", new Set(names(S1, "maid_sprite")).size === 4);
  check("精英不编号（女仆安若素）", S1.monsters.filter(m => m.def.id === "maid_anruosu").every(m => m.name === "女仆安若素"));

  console.log("[2] 后续刷怪续编，不重号");
  X.endRound(); X.endRound(); X.endRound(); // 1 → 4 轮
  const S4 = E.state;
  check(`第 4 轮后共 8 只，编号连续：${names(S4, "maid_sprite").slice(4).join("、")}`,
    JSON.stringify(names(S4, "maid_sprite")) === JSON.stringify(
      ["女仆精灵1", "女仆精灵2", "女仆精灵3", "女仆精灵4", "女仆精灵5", "女仆精灵6", "女仆精灵7", "女仆精灵8"]));
  check("精英仍不编号（苏桃夭 / 缇娜）",
    names(S4, "maid_sutaoyao")[0] === "女仆苏桃夭" && names(S4, "maid_tina")[0] === "女仆缇娜");

  console.log("[3] 击败后重新刷怪不重号");
  const S4b = E.state;
  X.dealToMonster(S4b.monsters.find(m => m.name === "女仆精灵1"), 999);
  X.spawnMonster("maid_sprite", 12);
  check(`新刷的精灵续编为 9（${names(S4b, "maid_sprite").slice(-1)[0]}）`,
    names(S4b, "maid_sprite").slice(-1)[0] === "女仆精灵9");

  console.log("[4] 晕彩分身编号，本体与精英不编号");
  const S5 = setup();
  X.spawnMonster("maid_yuncai_clone", 5);
  X.spawnMonster("maid_yuncai_clone", 6);
  check(`分身编号为 ${names(S5, "maid_yuncai_clone").join("、")}`,
    JSON.stringify(names(S5, "maid_yuncai_clone")) === JSON.stringify(["晕彩分身1", "晕彩分身2"]));
  const an5 = S5.monsters.find(m => m.def.id === "maid_anruosu");
  X.dealToMonster(an5, an5.hpMax - Math.floor(an5.hpMax * 0.3) + 1); // 触发晕彩救援
  const yc5 = S5.monsters.find(m => m.def.id === "maid_yuncai");
  check(`BOSS 晕彩不编号（${yc5 && yc5.name}）`, !!yc5 && yc5.name === "女仆晕彩");

  console.log("[5] 同格同名怪的询问可区分");
  const S6 = setup();
  S6.monsters = [];
  S6.defCount = {};
  const a6 = X.spawnMonster("maid_sprite", 20);
  const b6 = X.spawnMonster("maid_sprite", 20);
  a6.hp = a6.hpMax = 1; b6.hp = b6.hpMax = 1; // 一击必倒，便于验证同格可分别交战
  S6.player.hp = 10;
  const msgs = [];
  const oc = global.__askAuto;
  global.__askAuto = (msg) => { msgs.push(String(msg)); return true; };
  E.finishPlayPhase();
  S6.player.nextFixed = 3; // 0 → 18 → 19 → 20
  E.rollAndMove();
  await sleep(40);
  // 交战询问改为内置面板后是异步的：每打完一场都要让出事件循环，等下一只怪的询问开战
  let g = 0;
  while (g++ < 60) {
    if (S6.battle) { E.resolvePlayerAttack(); continue; }
    await sleep(10);
    if (!S6.battle) break;
  }
  global.__askAuto = oc;
  check(`询问消息分别指明不同编号：${msgs.filter(m => m.includes("女仆精灵")).join(" ｜ ")}`,
    msgs.some(m => m.includes("女仆精灵1")) && msgs.some(m => m.includes("女仆精灵2")));
  check("同格两只可分别交战并都被击倒", S6.monsters.filter(m => m.hp > 0).length === 0);

  console.log("[6] BOSS 成长只对配置了 growth 的 BOSS 生效");
  // 女仆晕彩：无 growth，在场时推进轮次不应报错、也不应被成长逻辑改动数值
  const S7 = setup();
  const an7 = S7.monsters.find(m => m.def.id === "maid_anruosu");
  X.dealToMonster(an7, an7.hpMax - Math.floor(an7.hpMax * 0.3) + 1); // 触发晕彩救援，使 BOSS 登场
  const yc = S7.monsters.find(m => m.def.id === "maid_yuncai");
  const snap = { atk: yc.atk, def_: yc.def_, hpMax: yc.hpMax, name: yc.name };
  let crashed = null;
  try { X.endRound(); X.endRound(); X.endRound(); } catch (e) { crashed = e; }
  check("女仆晕彩在场时推进 3 轮不报错", !crashed);
  check(`无成长配置则数值不变（${yc.atk}/${yc.def_}/${yc.hpMax}）`,
    yc.atk === snap.atk && yc.def_ === snap.def_ && yc.hpMax === snap.hpMax && yc.name === snap.name);
  // 灾厄核心：有 growth，按配置成长（每 2 轮攻防 +1）
  window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord; // 驻守灾厄核心（唯一配置 growth 的 BOSS）的环道图；原 test_ring 已下线
  E.newGame();
  const S8b = E.state; S8b.aiBusy = true;
  const cb = S8b.monsters.find(m => m.def.category === "boss");
  const base = { atk: cb.atk, def_: cb.def_ };
  const before = cb.name;
  X.endRound(); X.endRound(); // 灾厄核心在第 2 轮开始成长一次
  check(`灾厄核心按 growth 成长（攻 ${base.atk}→${cb.atk}，防 ${base.def_}→${cb.def_}）`,
    cb.atk === base.atk + 1 && cb.def_ === base.def_ + 1);
  check(`成长日志使用 BOSS 自身名称（${before}）`, cb.name === before);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
