// 扩展契约：只增加数据/处理器即可复用引擎，不使用现有角色或怪物 ID 分支。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readEngineSource } = require("../tools/runtime-source.cjs");
const root = path.join(__dirname, "..");
function setup() {
  const math = Object.create(Math); math.random = () => 0;
  const w = vm.createContext({ Math: math, __FAST__: true, __askAuto: () => false,
    setTimeout() {}, UI: { log() {}, renderAll() {} } });
  w.window = w;
  vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), w);
  const D = w.GAME_DATA;
  D.player = D.characters.char_rococo; D.map = D.maps.maid_cafe;
  vm.runInContext(readEngineSource(), w);
  const E = w.Engine;
  E.newGame(); E.state.monsters = []; E.state.aiBusy = true;
  return { E, D, X: E._test };
}

// 数据中的全部技能有已注册实现；时机表就是分发器使用的表。
{
  const { E, D } = setup();
  const registered = new Set(E.effectDefinitions().map(x => x.effect));
  for (const def of Object.values(D.characters)) {
    assert.ok(registered.has(def.activeSkill.effect));
    assert.ok(registered.has(def.passiveSkill.effect));
  }
  for (const def of Object.values(D.monsters)) {
    for (const skill of [def.skill, ...(def.passives || [])].filter(Boolean)) assert.ok(registered.has(skill.effect));
  }
  for (const item of E.effectDefinitions()) for (const timing of item.timings) assert.ok(E.effectTimings[timing]);
  assert.throws(() => E.registerEffect("pixelate", {}), /重复/);
  assert.throws(() => E.registerEffect("badTiming", { invented() {} }), /无效/);
  assert.throws(() => E.registerEffect("asyncSkill", { playerActive: async () => {} }), /非同步/);
}

// 新角色自己的成长表；省略成长不会套用别的角色。
{
  const { E, D, X } = setup();
  D.player = { ...D.player, id: "test_new_character", starGrowth: { 1: { atk: 7, hp: 4, speed: 2 } } };
  E.newGame();
  const P = E.state.player, before = { atk: P.atk, def: P.def, hp: P.hpMax };
  X.applyStarGrowth(1);
  assert.equal(P.atk, before.atk + 7); assert.equal(P.def, before.def);
  assert.equal(P.hpMax, before.hp + 4); assert.equal(P.speedBonus, 2);
  D.player = { ...D.player, starGrowth: undefined };
  E.newGame(); X.applyStarGrowth(1);
  assert.equal(E.state.player.atk, D.player.attack);
  assert.equal(E.state.player.hpMax, D.player.hpMax);
}

// 新效果挂到多个时机；查询无副作用，重开不重复绑定。
{
  const { E, D, X } = setup();
  const calls = [];
  E.registerEffect("testLifecycle", {
    playerInit() { calls.push("init"); },
    playerTurnStart(p) { calls.push("start"); E.state.player.coins += p.value; },
    playerTurnEnd() { calls.push("end"); },
    playerAttackValue(p, c) { c.bonus += p.value; c.parts.push(`测试+${p.value}`); if (!c.preview) calls.push("attack"); },
    playerKill() { calls.push("kill"); },
    playerDamaged(p, c) { calls.push("damaged"); assert.equal(c.damage, 1); },
    playerEnterTile(p, c) { calls.push("enter"); assert.equal(c.pos, E.state.player.pos); },
    playerLethal() { calls.push("lethal"); E.state.player.hp = 5; },
  });
  E.registerEffect("testActive", { playerActive(p) { E.state.player.coins += p.value; } });
  D.player = { ...D.player, id: "test_lifecycle", passiveSkill: { effect: "testLifecycle", value: 6 },
    activeSkill: { effect: "testActive", value: 9, cooldown: 4 } };
  E.newGame(); E.state.aiBusy = true;
  assert.deepEqual(calls, ["init", "start"]);
  const P = E.state.player, coins = P.coins;
  E.useSkill(); assert.equal(P.coins, coins + 9); assert.equal(P.skillCd, 4);
  const m = X.spawnMonster("dummy", 0), before = JSON.stringify(E.state);
  assert.equal(E.attackPreview(m).total, P.atk + 6);
  assert.equal(E.attackPreview(m).parts.includes("测试+6"), true);
  assert.equal(JSON.stringify(E.state), before, "预览不修改任何对局状态");
  assert.deepEqual(calls, ["init", "start"]);
  X.computeAttack(m, null); assert.equal(calls.at(-1), "attack");
  X.defeatMonsterByAlly(m); assert.equal(calls.includes("kill"), false);
  X.defeatMonster(X.spawnMonster("dummy", 0)); assert.equal(calls.at(-1), "kill");
  P.hp = 1; X.playerTakesDamage(1, "测试"); assert.equal(calls.at(-1), "damaged");
  X.checkPlayerKo(); assert.equal(P.hp, 5); assert.equal(P.ko, false);
  X.finishPlayerTurn(); assert.equal(calls.at(-1), "end");
  const count = calls.length; E.newGame();
  assert.deepEqual(calls.slice(count), ["init", "start"]);
  E.state.player.nextFixed = 1; E.finishPlayPhase(); E.rollAndMove();
  assert.equal(calls.at(-1), "enter");
}

// 不同召唤物类型分别累计成长，范围、治疗对象和数值来自配置。
{
  const { E, D, X } = setup();
  const order = [];
  E.registerEffect("testHitOrder", {
    playerKill(p, c) { order.push("kill"); assert.ok(c.target.hp <= 0); },
    playerHit(p, c) { order.push("hit"); assert.ok(c.damage > 0); },
  });
  D.player = { ...D.player, passiveSkill: { effect: "testHitOrder" } };
  E.newGame(); E.state.monsters = []; E.state.aiBusy = true;
  const m = X.spawnMonster("dummy", 0); m.hp = 1;
  E.state.move = { who: m, steps: 0, done() {} };
  X.startBattle("player", m); E.resolvePlayerAttack();
  assert.deepEqual(order, ["kill", "hit"], "保留击杀先于命中的既有顺序");
}

// 不同召唤物类型分别累计成长，范围、治疗对象和数值来自配置。
{
  const { E, D, X } = setup();
  D.allies.test_owl = { id: "test_owl", name: "测试猫头鹰", hpMax: 13, attack: 6, defense: 4, move: { dice: 1, faces: 4 } };
  D.player = { ...D.player, id: "test_summoner",
    activeSkill: { ...D.player.activeSkill, summon: "test_owl", range: 1, growth: { atk: 2, hp: 3 } },
    passiveSkill: { ...D.player.passiveSkill, targets: ["test_owl"], value: 2, moveBonus: 1 } };
  E.newGame(); const S = E.state, pos = S.player.pos;
  const dessert = X.spawnAlly(pos, "dessert_familiar");
  E.useSkill();
  assert.ok(S.targeting.candidates.every(i => E.graphDist(pos, i) <= 1));
  assert.equal(S.targeting.candidates.length, S.adj[pos].length + 1);
  E.chooseDeployTile(pos); E.chooseDeployTile(S.targeting.candidates[0]);
  const owl = S.allies[1];
  assert.equal(owl.definition.id, "test_owl"); assert.equal(owl.atk, 8); assert.equal(owl.hpMax, 16);
  S.player.skillCd = 0;
  E.useSkill(); E.chooseDeployTile(pos); E.cancelTargeting();
  assert.equal(owl.atk, 10); assert.equal(owl.hpMax, 19);
  assert.equal(S.allies[2].atk, 10); assert.equal(S.allies[2].hpMax, 19);
  assert.equal(dessert.atk, 3); assert.equal(dessert.hpMax, 20);
  owl.hp = 5; dessert.hp = 5;
  X.healPassAllies(pos);
  assert.equal(owl.hp, 7); assert.equal(owl.nextMoveBonus, 1);
  assert.equal(dessert.hp, 5); assert.equal(dessert.nextMoveBonus, 0);
  E.newGame();
  assert.equal(Object.keys(E.state.allyBonuses).length, 0);
  assert.equal(X.spawnAlly(pos, "test_owl").atk, 6);
}

// 怪物联动与分身不再绑定咖啡厅单位 ID。
{
  const { E, D, X } = setup();
  D.monsters.test_guard = { ...D.monsters.maid_sutaoyao, id: "test_guard", skill: null,
    passives: [{ effect: "knightGuard", name: "新守护", targets: ["dummy"], heal: 4, atk: 7, def: 8 }] };
  const guard = X.spawnMonster("test_guard", 5), dummy = X.spawnMonster("dummy", 5), tina = X.spawnMonster("maid_tina", 5);
  dummy.hp = 1; X.passByEffects(guard);
  assert.equal(dummy.hp, 5); assert.equal(dummy.nextBattleAtk, 7); assert.equal(dummy.nextBattleDef, 8);
  assert.equal(tina.nextBattleAtk, undefined);
  D.monsters.test_clone_caster = { ...D.monsters.maid_yuncai, id: "test_clone_caster",
    skill: { ...D.monsters.maid_yuncai.skill, summon: "dummy", copyStats: ["atk"] } };
  const caster = X.spawnMonster("test_clone_caster", 5); caster.atk = 19;
  X.runMonsterSkill(caster);
  const clone = E.state.monsters.at(-1);
  assert.equal(clone.def.id, "dummy"); assert.equal(clone.atk, 19); assert.equal(clone.def_, D.monsters.dummy.defense);
}

// 救援目标、位置、一次性标记可配置；效果实际在伤害后触发。
{
  const { E, D, X } = setup();
  D.monsters.test_rescue = { ...D.monsters.dummy, id: "test_rescue", passives: [{
    effect: "yuncaiRescue", name: "新救援", threshold: 0.5, summon: "sentinel", tileType: "shop", onceKey: "testRescued",
  }] };
  const m = X.spawnMonster("test_rescue", 0); m.hp = 1;
  X.dealToMonster(m, 99);
  assert.equal(E.state.testRescued, true);
  const helper = E.state.monsters.find(x => x.def.id === "sentinel");
  assert.ok(helper); assert.equal(E.state.tiles[helper.pos].t, "shop");
  const m2 = X.spawnMonster("test_rescue", 0); m2.hp = 1;
  X.dealToMonster(m2, 99);
  assert.equal(E.state.monsters.filter(x => x.def.id === "sentinel").length, 1);
}

// 非默认猎物也能复用吸收机制。
{
  const { D, X } = setup();
  D.monsters.test_absorber = { ...D.monsters.lab_chimera, id: "test_absorber", passives: [{
    effect: "devourMinions", name: "新吸收", targets: ["dummy"], perCount: 1, atkPer: 5,
  }] };
  const m = X.spawnMonster("test_absorber", 0), atk = m.atk;
  X.spawnMonster("dummy", 0); X.spawnMonster("lab_wander", 0);
  assert.equal(X.absorbMinions(m), true); assert.equal(m.atk, atk + 5);
  assert.ok(X.monstersAt(0).some(x => x.def.id === "lab_wander"));
}
console.log("PASS 技能注册与时机、新角色成长、预览纯查询、分类型召唤、怪物参数复用");
