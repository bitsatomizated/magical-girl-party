// 描述与实际规则一致性：固定随机数和可控计时器覆盖完整移动、回合续接。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { readEngineSource } = require("../tools/runtime-source.cjs");
const root = path.join(__dirname, "..");
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function setup({ diff = "normal", fast = true, stop = false } = {}) {
  const timers = [], math = Object.create(Math);
  math.random = () => 0;
  const w = vm.createContext({ Math: math, __FAST__: fast, __askAuto: () => stop,
    setTimeout: cb => timers.push(cb), UI: { log() {}, renderAll() {} } });
  w.window = w;
  vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), w);
  const D = w.GAME_DATA;
  D.player = D.characters.char_rococo; D.map = D.maps.tutorial_ring; D.diff = diff;
  vm.runInContext(readEngineSource(), w);
  const E = w.Engine;
  E.newGame();
  const S = E.state;
  S.monsters = []; S.player.chips = [];
  return { w, D, E, X: E._test, S, P: S.player, timers, math };
}
async function pump(timers, done) {
  for (let i = 0; i < 200 && !done(); i++) {
    if (timers.length) timers.shift()();
    await flush();
  }
  assert.ok(done(), "回合调度应完成");
}
(async () => {
  {
    const { D, E, X, S, P, timers } = setup();
    P.hp = 10; P.hpMax = 30; P.hand = [D.cards.poison];
    await E.playCard(0);
    assert.equal(P.hp, 8);
    for (const [round, hp] of [[2, 11], [3, 14], [4, 14]]) {
      X.finishPlayerTurn();
      await pump(timers, () => S.round === round);
      assert.equal(P.hp, hp, "以毒攻毒只在后续两次回合开始各回 3 血");
    }
    assert.equal(P.buffs.length, 0);
  }
  {
    const { D, E, X, P } = setup();
    P.hp = P.hpMax = 30; P.hand = [D.cards.poison, D.cards.poison];
    await E.playCard(0); await E.playCard(0);
    P.hp = 30;
    X.turnEndEffects(); X.turnStartEffects();
    assert.equal(P.hp, 30);
    assert.ok(P.buffs.every(b => b.turns === 1), "满血也消耗触发次数");
    P.hp = 10;
    X.turnEndEffects(); X.turnStartEffects();
    assert.equal(P.hp, 16, "多份效果各自生效");
    assert.equal(P.buffs.length, 0);
  }
  for (const chip of [null, "lore2", "lore3"]) {
    for (const steps of [2, 1]) {
      const { E, S, P } = setup();
      S.aiBusy = true;
      S.tiles.forEach(t => { t.t = "heal"; }); S.tiles[1].t = "draw";
      P.pos = 0; P.lastFrom = S.tiles.length - 1; P.hand = [];
      P.chips = chip ? [chip] : []; P.nextFixed = steps;
      E.finishPlayPhase(); E.rollAndMove(); await flush();
      const lands = steps === 1;
      assert.equal(P.pos, lands ? 1 : 2);
      assert.equal(P.hand.length, (lands ? 2 : 0) + (chip ? 1 : 0),
        `${chip}: 经过加抽一次；落格在基础抽牌之外只加抽一次`);
    }
  }
  for (const diff of ["normal", "hard", "nightmare", "crazy"]) {
    for (const extras of [false, true]) {
      const { X, P } = setup({ diff });
      const caster = X.spawnMonster("maid_sutaoyao", 5);
      if (extras) {
        X.spawnMonster("maid_tina", 6); X.spawnMonster("maid_yuncai", 7);
        X.spawnMonster("dummy", 8);
        X.spawnMonster("maid_anruosu", 9).hp = 0;
      }
      P.hp = P.hpMax = 100;
      X.runMonsterSkill(caster);
      const strong = ["nightmare", "crazy"].includes(diff);
      assert.equal(100 - P.hp, 3 + (strong ? (extras ? 3 : 1) : 0),
        "映霞统计存活精英/BOSS，包含自身，排除小怪和死亡单位");
    }
  }
  for (const roll of [1, 10]) {
    const { D, X, S, w, math } = setup();
    math.random = () => (roll - 1) / 10;
    for (const def of Object.values(D.monsters)) {
      if (def.id === "lab_variant") {
        assert.equal(def.move.stationary, true); continue;
      }
      assert.equal(def.move.steps, 1); assert.ok(!def.move.stationary);
      S.monsters = [];
      const m = X.spawnMonster(def.id, 10); m.skillCd = 99;
      S.battle = {}; // 暂停步进，读取实际投出的完整移动点数。
      let steps;
      w.UI.renderAll = () => { if (S.move?.who === m) steps = S.move.steps; };
      X.aiMove(m, () => {});
      assert.equal(steps, roll, `${def.id} 基础移动必须为 1d10`);
      m.moveBonusNext = 2;
      X.aiMove(m, () => {});
      assert.equal(steps, roll + 2, "技能临时加速仍然生效");
      assert.equal(m.moveBonusNext, 0);
      await flush();
    }
  }
  {
    const { X, S, P, timers } = setup({ fast: false });
    P.pos = 10;
    const m = X.spawnMonster("dummy", 1), a = X.spawnFamiliar(0);
    m.hp = m.hpMax = 100; m.def_ = 0; m.marks = 1;
    a.atk = 5; a.lastFrom = S.tiles.length - 1;
    X.finishPlayerTurn();
    assert.equal(m.marks, 1);
    await pump(timers, () => m.hp < 100);
    assert.equal(m.hp, 94, "使魔享受玩家回合留下的最后一层标记");
    assert.equal(m.marks, 1, "怪物尚未行动完，标记仍保留");
    await pump(timers, () => S.round === 2);
    assert.equal(m.marks, 0, "该怪物行动结束后衰减");
  }
  {
    const { X, S, timers } = setup();
    const m = X.spawnMonster("lab_variant", 5); m.skillCd = 2; m.marks = 2;
    X.finishPlayerTurn();
    await pump(timers, () => S.round === 2);
    assert.equal(m.pos, 5, "变彩继续驻守原地");
    assert.equal(m.marks, 1, "驻守怪也在自己的回合结束衰减标记");
  }
  console.log("描述与规则一致性回归通过");
})().catch(error => { console.error(error); process.exitCode = 1; });
