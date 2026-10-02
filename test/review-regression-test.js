// 代码审查回归：验证终局、击倒、方向牌和使魔临时加成的实际行为。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const runtime = require("../tools/runtime-source.cjs");
const root = path.join(__dirname, "..");

function setup() {
  const timers = [], math = Object.create(Math);
  math.random = () => 0;
  const w = vm.createContext({ Math: math, __FAST__: true, __askAuto: () => false,
    setTimeout: callback => timers.push(callback), UI: { log() {}, renderAll() {} } });
  w.window = w;
  vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), w);
  const D = w.GAME_DATA;
  D.player = D.characters.char_rococo; D.map = D.maps.maid_cafe;
  vm.runInContext(runtime.readEngineSource(), w);
  const E = w.Engine;
  E.newGame();
  const S = E.state;
  S.monsters = [];
  return { E, S, P: S.player, D, timers };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

(async () => {
  {
    const { E, S, P, D, timers } = setup();
    P.hp = 4; P.hand = [D.cards.king, D.cards.cake];
    await E.playCard(0);
    assert.equal(P.ko, true);
    assert.equal(P.hp, 0);
    assert.equal(P.buffs.length, 0);
    assert.equal(E.derived().atk, P.atk);
    assert.equal(S.phase, "turnEnd");
    for (const action of ["play", "skill", "move", "target", "moveStep"]) assert.equal(E.canAct(action), false);
    assert.equal(await E.playCard(0), false, "倒地后不能继续吃蛋糕");
    E.useSkill(); E.rollAndMove();
    assert.equal(P.hand.length, 1);
    assert.equal(S.targeting, undefined);
    assert.equal(S._dbg.fpt, 1, "只收尾一次");
    for (let i = 0; i < 100 && P.ko; i++) {
      if (timers.length) timers.shift()();
      await flush();
    }
    assert.equal(P.ko, false, "完成 AI 阶段后正常复活");
    assert.equal(P.hp, P.hpMax);
    assert.equal(S.round, 3, "击倒代价与自然推进分别结算");
    assert.equal(E.canAct("play"), true);
  }
  {
    const { E, S, P, D } = setup();
    S.aiBusy = true;
    S.tiles.forEach(t => { t.t = "heal"; });
    P.pos = 9; P.lastFrom = 8; P.hand = [D.cards.dirChoose];
    await E.playCard(0);
    assert.deepEqual(Array.from(E.peekPlayerOptions()), [8, 10]);
    P.nextFixed = 2;
    E.finishPlayPhase(); E.rollAndMove();
    assert.deepEqual(Array.from(S.move.await), [8, 10]);
    assert.equal(P.nextChooseDir, false, "效果在本次移动消耗");
    E.pickMoveStep(8);
    await flush();
    assert.equal(P.pos, 7, "首步允许掉头，第二步不能再返回 9");
    assert.equal(P.lastFrom, 8);
    assert.deepEqual(Array.from(E.peekPlayerOptions()), [6], "下一次恢复普通方向规则");
  }
  {
    const { E, S } = setup();
    const m = E._test.spawnMonster("maid_tina", 0);
    const a = E._test.spawnFamiliar(0);
    m.hp = m.hpMax = 100; a.hp = a.hpMax = 100; a.atk = 10;
    m.nextBattleAtk = 3; m.nextBattleDef = 3;
    E._test.allyStrike(a, m);
    assert.equal(m.hp, 95, "本次防御包含 +3，受到 5 点伤害");
    assert.equal(a.hp, 99, "反击已经不含上次战斗的 +3 攻击");
    assert.equal(m.nextBattleAtk, 0); assert.equal(m.nextBattleDef, 0);
    E._test.allyStrike(a, m);
    assert.equal(m.hp, 87, "下一场按基础防御受到 8 点伤害");
    a.hp = 100; m.nextBattleAtk = 3; m.nextBattleDef = 3;
    E._test.monsterStrikeAlly(m, a);
    assert.equal(a.hp, 96, "怪物先手时临时攻击生效一次");
    E._test.monsterStrikeAlly(m, a);
    assert.equal(a.hp, 95);
    assert.equal(m.nextBattleAtk, 0); assert.equal(m.nextBattleDef, 0);
    assert.ok(S.monsters.includes(m));
  }
  // 公共击杀结算不把使魔击杀误算成玩家筹码触发。
  for (const source of ["player", "ally"]) {
    const { E, S, P } = setup();
    P.chips = ["wp2"];
    const m = E._test.spawnMonster("maid_sprite", 0);
    const quest = S.quests.find(q => q.target === m.def.id || q.targets?.includes(m.def.id));
    assert.ok(quest);
    const coins = P.coins, progress = quest.progress;
    E._test[source === "player" ? "defeatMonster" : "defeatMonsterByAlly"](m);
    assert.equal(P.coins, coins + m.def.coinDrop);
    assert.equal(quest.progress, progress + 1);
    assert.equal(P.wealth, source === "player" ? 1 : 0);
    assert.equal(S.monsters.includes(m), false);
  }
  {
    const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { url: "http://localhost/", runScripts: "outside-only" });
    try {
      const w = dom.window, doc = w.document;
      w.__FAST__ = true;
      w.setTimeout = () => 0;
      for (const src of runtime.scriptPaths.filter(src => src !== "js/main.js")) w.eval(fs.readFileSync(path.join(root, src), "utf8"));
      w.UI.renderSetup(); doc.getElementById("btn-start").click(); doc.getElementById("btn-intro-ok").click();
      const E = w.Engine;
      E.state.player.pos = 9; E.state.player.lastFrom = 8;
      E.state.player.hand = [w.GAME_DATA.cards.dirChoose];
      await E.playCard(0);
      E.state.player.nextFixed = 2;
      E.finishPlayPhase(); E.rollAndMove();
      assert.ok(doc.getElementById("actions").textContent.includes("方向抉择：首步可掉头"));
      E.newGame();
      const S = E.state;
      S.round = S.roundsLimit;
      const quest = S.quests.find(q => !q.extra);
      quest.progress = quest.need;
      E._test.endRound();
      assert.equal(S.over, true);
      assert.equal(S.chipChoice, null);
      assert.equal(S.chipQueue.length, 0);
      assert.equal(doc.getElementById("chip-panel").classList.contains("hidden"), true);
      assert.equal(doc.getElementById("turn-panel").classList.contains("hidden"), false);
      const restart = [...doc.querySelectorAll("#actions button")].find(b => b.textContent === "重新开始");
      assert.ok(restart && !restart.disabled);
      restart.click();
      assert.notEqual(E.state, S);
      assert.equal(E.canAct("play"), true);
      assert.equal(E.state.chipQueue.length, 0);
    } finally { dom.window.close(); }
  }
  console.log("PASS 击倒自动收尾、方向抉择、使魔临时加成、公共击杀奖励、终局奖励与重开");
})().catch(error => { console.error(error); process.exitCode = 1; });
