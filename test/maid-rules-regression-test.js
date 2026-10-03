// 回归：验证实际战斗、移动与整轮调度，避免只检查标签或加成字段。
// 运行：node test/maid-rules-regression-test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const dataSrc = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const engine = require("../tools/runtime-source.cjs").readEngineSource();

function setup() {
  const logs = [], timers = [], rolls = [], math = Object.create(Math);
  math.random = () => rolls.length ? rolls.shift() : 0.5;
  const w = vm.createContext({ Math: math, __FAST__: true,
    UI: { log: message => logs.push(message), renderAll() {}, enterBattle() {} },
    setTimeout: callback => timers.push(callback), __askAuto: () => false });
  w.window = w;
  vm.runInContext(dataSrc, w);
  w.GAME_DATA.map = w.GAME_DATA.maps.maid_cafe;
  w.GAME_DATA.diff = "normal";
  vm.runInContext(engine, w);
  const E = w.Engine;
  E.newGame();
  const S = E.state;
  S.monsters = []; S.aiBusy = true; logs.length = 0;
  const spawn = (id, pos = 5) => E._test.spawnMonster(id, pos);
  const battle = (mode, monster) => {
    // 保留一个已结束移动，避免战斗测试启动无关的下一轮 AI。
    S.move = { who: monster, steps: 0, done() {} };
    E._test.startBattle(mode, monster);
  };
  return { w, E, S, P: S.player, logs, timers, rolls, spawn, battle };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function pump(timers, done) {
  for (let i = 0; i < 500; i++) {
    await flush();
    if (done()) return;
    if (timers.length) timers.shift()();
  }
  assert.fail("整轮 AI 未正常收尾");
}
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log("  ✓ " + name); }
  catch (error) { failed++; console.error("  ✗ " + name + "\n" + error.stack); }
}

(async () => {
  for (const id of ["maid_anruosu", "dummy"]) await test(`${id} 经过玩家不主动攻击，且保留喵之追猎`, async () => {
    const { E, S, P, spawn } = setup();
    const m = spawn(id, 17);
    P.pos = 0; const hp = P.hp;
    m.lastFrom = 16; m.queuedNext = 0;
    let completed = false;
    S.move = { who: m, steps: 1, prev: 16, attacked: false, done: () => { completed = true; } };
    await E._test.stepMonster();
    assert.equal(S.battle, null);
    assert.equal(P.hp, hp);
    assert.equal(m.hunt, 1);
    assert.ok(completed, "被动怪正常完成移动");
  });

  await test("主动怪仍会接触开战，像素化仍阻止主动攻击", async () => {
    for (const pixel of [false, true]) {
      const { E, S, P, spawn } = setup(); const m = spawn("maid_sprite", 17);
      P.pos = 0; if (pixel) P.buffs.push({ pixel: true, turns: 99 });
      m.lastFrom = 16; m.queuedNext = 0;
      S.move = { who: m, steps: 1, prev: 16, attacked: false, done() {} };
      await E._test.stepMonster();
      if (pixel) assert.equal(S.battle, null);
      else { assert.equal(S.battle.mode, "monsterAttack"); assert.equal(S.battle.target, m); }
    }
  });

  await test("不主动攻击的安若素被攻击后仍能反击", () => {
    const { E, S, spawn, battle } = setup(); const m = spawn("maid_anruosu");
    battle("player", m); E.resolvePlayerAttack();
    assert.ok(m.hp > 0);
    assert.equal(S.battle.mode, "monsterAttack"); assert.equal(S.battle.counter, true);
  });

  await test("吸血采用不屈减伤后的伤害", () => {
    const { E, P, spawn, battle } = setup(); const t = spawn("maid_tina");
    P.hp = 8; P.def = 2; P.chips = ["will2"]; t.atk = 7; t.hp = 5;
    battle("monster", t); E.playerChooseStance("defend");
    assert.equal(P.hp, 5); assert.equal(t.hp, 8, "实际扣血 3，回血 3");
  });

  await test("完全减伤后吸血不回血", () => {
    const { E, P, spawn, battle } = setup(); const t = spawn("maid_tina");
    P.hp = 8; P.def = 3; P.chips = ["will2"]; t.hp = 5;
    battle("monster", t); E.playerChooseStance("defend");
    assert.equal(P.hp, 8); assert.equal(t.hp, 5);
  });

  await test("吸血包含狂暴增伤，并受怪物生命上限限制", () => {
    for (const hp of [5, 21]) {
      const { E, P, spawn, battle } = setup(); const t = spawn("maid_tina"); t.hp = hp;
      P.buffs.push({ dmgTaken: 1, turns: 2 });
      battle("monster", t); E.playerChooseStance("defend");
      assert.equal(P.hp, 16); assert.equal(t.hp, Math.min(t.hpMax, hp + 4));
    }
  });

  await test("成功闪避不会触发吸血", () => {
    const { E, P, spawn, battle, rolls } = setup(); const t = spawn("maid_tina"); t.hp = 5;
    battle("monster", t); rolls.push(0, 0.99); E.playerChooseStance("dodge");
    assert.equal(P.hp, 20); assert.equal(t.hp, 5);
  });

  await test("骑士守护防御生效，结算时消耗，反击与后续战斗不重复加成", () => {
    const { E, S, P, spawn, battle } = setup(); const t = spawn("maid_tina"), guard = spawn("maid_sutaoyao");
    E._test.passByEffects(guard); P.atk = 10;
    battle("player", t);
    assert.equal(E.attackPreview(t).enemyDef, 5);
    assert.equal(E.attackPreview(t).enemyAtk, 7);
    assert.equal(t.nextBattleDef, 3, "预览不能消耗加成");
    E.resolvePlayerAttack();
    assert.equal(t.hp, t.hpMax - 5, "10 攻对 5 防，同骰造成 5 伤害");
    assert.equal(t.nextBattleDef, 0); assert.equal(t.nextBattleAtk, 0);
    assert.equal(S.battle.counter, true);
    assert.equal(E.defensePreview(t).enemyAtk, 4, "反击不重复用上场加成");
    E.playerChooseStance("defend");
    const hp = t.hp; battle("player", t); E.resolvePlayerAttack();
    assert.equal(hp - t.hp, 8, "下一场恢复到基础防御 2");
  });

  await test("守护在怪物先攻击时加攻，成功闪避也会消耗", () => {
    for (const stance of ["defend", "dodge"]) {
      const { E, P, spawn, battle, rolls } = setup(); const t = spawn("maid_tina"), guard = spawn("maid_sutaoyao");
      E._test.passByEffects(guard); battle("monster", t);
      if (stance === "dodge") rolls.push(0, 0.99);
      E.playerChooseStance(stance);
      assert.equal(P.hp, stance === "defend" ? 14 : 20);
      assert.equal(t.nextBattleAtk, 0); assert.equal(t.nextBattleDef, 0);
    }
  });

  await test("怪物闪避成功仍消耗本场守护，伤害保持为零", () => {
    const { E, spawn, battle, rolls } = setup(); const t = spawn("maid_tina");
    t.def = { ...t.def, defend: { rule: "always", stance: "dodge" } };
    t.nextBattleAtk = 3; t.nextBattleDef = 3;
    battle("player", t); rolls.push(0.5, 0.5); E.resolvePlayerAttack();
    assert.equal(t.hp, t.hpMax); assert.equal(t.nextBattleDef, 0); assert.equal(t.nextBattleAtk, 0);
  });

  await test("新分身登场当轮行动，原怪按登场顺序且每轮仅行动一次", async () => {
    const { E, S, P, spawn, timers, logs } = setup();
    const boss = spawn("maid_yuncai"), minion = spawn("maid_sprite", 1);
    boss.queuedNext = 6; minion.queuedNext = 2;
    P.pos = 0; P.buffs.push({ pixel: true, turns: 99 }); S.aiBusy = false;
    E._test.aiTurns(); await pump(timers, () => S._dbg.aiEnd === 1);
    const clone = S.monsters.find(m => m.def.id === "maid_yuncai_clone");
    assert.ok(clone); assert.notEqual(clone.lastFrom, null, "分身已实际移动");
    const movements = logs.filter(message => message.includes("】掷骰"));
    assert.equal(movements.length, 3);
    assert.ok(movements[0].includes(boss.name));
    assert.ok(movements[1].includes(minion.name));
    assert.ok(movements[2].includes(clone.name));
    assert.equal(S.aiBusy, false); assert.equal(S.phase, "play");
    logs.length = 0; E._test.aiTurns(); await pump(timers, () => S._dbg.aiEnd === 2);
    assert.equal(S.monsters.filter(m => m.def.id === "maid_yuncai_clone").length, 1, "冷却中不重生分身");
    assert.equal(logs.filter(message => message.includes("】掷骰")).length, 3);
  });

  await test("分身已生成但玩家倒地时停止其行动，整轮仍能收尾复活", async () => {
    const { E, S, P, spawn, timers, rolls } = setup();
    const boss = spawn("maid_yuncai", 17); boss.queuedNext = 0;
    P.pos = 0; P.hp = 1; P.def = 0; S.aiBusy = false; rolls.push(0);
    E._test.aiTurns(); await flush();
    assert.equal(S.battle.mode, "monsterAttack"); E.playerChooseStance("defend");
    await pump(timers, () => S._dbg.aiEnd === 1);
    const clone = S.monsters.find(m => m.def.id === "maid_yuncai_clone");
    assert.ok(clone); assert.equal(clone.lastFrom, null);
    assert.equal(S.round, 3); assert.equal(P.ko, false); assert.equal(S.phase, "play");
  });

  await test("战斗面板显示包含守护的数值与结算公式", () => {
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { runScripts: "outside-only" });
    try {
      const w = dom.window; w.__FAST__ = true;
      w.eval(dataSrc); w.eval(engine); w.eval(fs.readFileSync(path.join(root, "js/ui.js"), "utf8"));
      w.Engine.newGame(); const S = w.Engine.state; S.aiBusy = true; S.monsters = [];
      const t = w.Engine._test.spawnMonster("maid_tina", 5), guard = w.Engine._test.spawnMonster("maid_sutaoyao", 5);
      w.Engine._test.passByEffects(guard); w.Engine._test.startBattle("player", t);
      const html = w.document.getElementById("battle-info").innerHTML;
      assert.ok(html.includes("攻 <b>7</b>｜防 <b>5</b>"));
      assert.ok(html.includes("敌方 5 + 敌方骰"));
      assert.equal(t.nextBattleDef, 3);
    } finally { dom.window.close(); }
  });

  console.log(`\n== 结果：通过 ${passed}，失败 ${failed} ==`);
  process.exitCode = failed ? 1 : 0;
})();
