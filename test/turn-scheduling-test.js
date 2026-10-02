// 可控时钟复现重复入口、暂停续接、重开及已唤醒的旧 Promise；不依赖真实等待。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readEngineSource } = require("../tools/runtime-source.cjs");
const { create } = require("../js/systems/turns.js");
const root = path.join(__dirname, "..");
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function clock() {
  let id = 0;
  const pending = new Map(), history = new Map(), cancelled = [];
  return {
    pending, history, cancelled,
    set(callback) { const key = ++id; pending.set(key, callback); history.set(key, callback); return key; },
    clear(key) { cancelled.push(key); pending.delete(key); },
    run() {
      const entry = pending.entries().next().value;
      if (!entry) return false;
      pending.delete(entry[0]); entry[1](); return true;
    },
  };
}
function setup(fast = true) {
  const time = clock(), logs = [], math = Object.create(Math);
  math.random = () => 0;
  const w = vm.createContext({ Math: math, __FAST__: fast, __askAuto: () => false,
    setTimeout: cb => time.set(cb), clearTimeout: id => time.clear(id),
    UI: { log: message => logs.push(message), renderAll() {} } });
  w.window = w;
  vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), w);
  vm.runInContext(readEngineSource(), w);
  const E = w.Engine, D = w.GAME_DATA;
  D.player = D.characters.char_rococo;
  E.newGame(); E.state.monsters = [];
  return { w, E, X: E._test, D, S: E.state, time, logs };
}
async function pump(time, done) {
  for (let i = 0; i < 200 && !done(); i++) { time.run(); await flush(); }
  assert.ok(done(), "调度必须在有限步骤内完成");
}
function snapshot(E, logs) { return JSON.stringify({ state: E.state, logs }); }

(async () => {
  // 规则步骤的调度顺序、actor.done 幂等性，以及旧轮回调不能推动新轮。
  {
    const time = clock(), events = [], completions = [];
    const S = { round: 1, roundsLimit: 3, over: false, player: {}, _dbg: { fpt: 0, startRound: 0, aiStart: 0, aiEnd: 0, endRound: 0 },
      allies: [{ id: "a", hp: 1 }, { id: "b", hp: 1 }], monsters: [{ uid: 1, hp: 1, skillCd: 0, def: { move: {} } }] };
    const turns = create({ getState: () => S, render() {}, schedule: cb => time.set(cb), cancel: id => time.clear(id), aiDelay: 1,
      rules: {
        startRound: () => events.push("round"), startPlayer: () => events.push("player"), endPlayer: () => events.push("endPlayer"),
        judgeQuests: () => events.push("quests"),
        moveAlly: (a, done) => { events.push(a.id); completions.push(done); },
        moveMonster: (m, done) => { events.push(`monster${m.uid}`); completions.push(done); },
      },
    });
    turns.startRound(); turns.finishPlayerTurn(); turns.finishPlayerTurn();
    assert.equal(time.pending.size, 1); assert.equal(S.aiBusy, true);
    time.run(); completions[0](); completions[0]();
    completions[1](); completions[1]();
    completions[2](); completions[2](); time.run();
    assert.deepEqual(events, ["round", "player", "endPlayer", "a", "b", "monster1", "quests", "round", "player"]);
    assert.equal(S.round, 2); assert.equal(S.aiBusy, false);
    completions.forEach(done => done());
    assert.equal(S.round, 2); assert.equal(time.pending.size, 0);
  }

  // 多个收尾入口不会重复扣 buff/再生/标记，也不会重复调用技能或启动 AI。
  {
    const { E, X, D, S, time } = setup();
    let endings = 0;
    E.registerEffect("endCounter", { playerTurnEnd() { endings++; } });
    D.player = { ...D.player, passiveSkill: { effect: "endCounter" } };
    S.player.regen = 8; S.player.buffs = [{ name: "测试", turns: 3, atk: 2 }];
    const m = X.spawnMonster("dummy", 5); m.marks = 3;
    X.finishPlayerTurn(); X.finishPlayerTurn(); X.finishPlayerTurn();
    assert.equal(endings, 1); assert.equal(S.player.regen, 4);
    assert.equal(S.player.buffs[0].turns, 2); assert.equal(m.marks, 2);
    assert.equal(S._dbg.fpt, 1); assert.equal(time.pending.size, 1);
    assert.equal(S.aiBusy, true, "从排队开始即占用 AI 阶段");
    await pump(time, () => S.round === 2);
    assert.equal(S._dbg.aiEnd, 1); assert.equal(S.phase, "play");
  }

  // 瞄准挂起不提前扣减，取消后才进入唯一的回合结束入口。
  {
    const { E, X, S, time } = setup();
    S.targeting = { assault: true, candidates: [1] };
    S.player.buffs = [{ name: "测试", turns: 3 }];
    X.finishPlayerTurn(); X.finishPlayerTurn();
    assert.equal(S.targetingResume, true); assert.equal(S.player.buffs[0].turns, 3);
    assert.equal(time.pending.size, 0);
    E.cancelTargeting(); X.finishPlayerTurn();
    assert.equal(S.player.buffs[0].turns, 2); assert.equal(time.pending.size, 1);
  }

  // 延迟 AI 尚未开始即重开：清除定时器，即使强制调用已取消回调也无效。
  {
    const { E, X, time, logs } = setup();
    X.finishPlayerTurn(); const callbacks = [...time.history.values()];
    E.newGame(); const before = snapshot(E, logs);
    assert.equal(time.pending.size, 0); assert.equal(time.cancelled.length, 1);
    callbacks.forEach(fn => fn()); await flush();
    assert.equal(snapshot(E, logs), before);
  }

  // 配置错误导致重开失败，不应取消仍有效的旧局调度。
  {
    const { E, X, D, S, time } = setup();
    X.finishPlayerTurn(); const hp = D.player.hpMax;
    D.player.hpMax = -1;
    assert.throws(() => E.newGame(), error => error.name === "ConfigValidationError");
    D.player.hpMax = hp;
    assert.equal(E.state, S); assert.equal(time.pending.size, 1);
    await pump(time, () => S.round === 2);
  }

  // 玩家、怪物、召唤物都在动画等待中重开；包括 timer 已 resolve、续接尚未执行。
  for (const actor of ["player", "monster", "ally"]) for (const alreadyFired of [false, true]) {
    const { E, X, S, time, logs } = setup(false);
    let completed = 0;
    if (actor === "player") {
      S.player.nextFixed = 1; E.finishPlayPhase(); E.rollAndMove();
    } else if (actor === "monster") {
      const m = X.spawnMonster("maid_sprite", 17); m.queuedNext = 0;
      X.aiMove(m, () => completed++);
    } else {
      const a = X.spawnFamiliar(0);
      S.move = { who: a, isAlly: true, steps: 1, done: () => completed++ };
      X.stepAlly();
    }
    assert.ok(time.pending.size > 0, `${actor} 应正在等待动画`);
    if (alreadyFired) time.run();
    const oldCallbacks = [...time.history.values()];
    E.newGame(); const before = snapshot(E, logs);
    oldCallbacks.forEach(fn => fn()); await flush();
    assert.equal(snapshot(E, logs), before, `${actor} 的旧动画不得影响新局`);
    assert.equal(completed, 0);
  }

  // 已回答的遥控骰子询问、商店和升级奖励，在 Promise 续接前重开。
  for (const pause of ["dice", "shop", "upgrade", "chipshop", "battle"]) {
    const { w, E, X, D, S, logs } = setup();
    w.__askAuto = undefined;
    if (pause === "dice") {
      S.player.hand = [D.cards.diceCtrl]; E.playCard(0);
      E.answerAsk(2);
    } else if (pause === "shop") {
      S.player.pos = 6; S.player.chips = ["lore2"];
      X.settleLandTile(); await flush();
      assert.ok(S.shop); E.closeShop();
    } else if (pause === "upgrade") {
      S.player.pos = 21; S.player.coins = 50;
      X.settleLandTile(); await flush();
      assert.ok(S.chipChoice); E.pickChip(0);
    } else if (pause === "chipshop") {
      S.player.pos = 9; S.player.coins = 50;
      X.settleLandTile(); await flush();
      assert.ok(S.ask); E.answerAsk(true);
    } else {
      S.player.pos = 5; X.spawnMonster("dummy", 5);
      X.settleLandTile(); await flush();
      assert.ok(S.ask); E.answerAsk(true);
    }
    E.newGame(); const before = snapshot(E, logs);
    await flush();
    assert.equal(snapshot(E, logs), before, `${pause} 的旧等待续接不得影响新局`);
  }

  // 战斗结束后的路过续接已经启动，立刻重开也不能再结算旧格子。
  {
    const { E, X, S, logs } = setup();
    const m = X.spawnMonster("dummy", 5); m.hp = 1;
    S.player.pos = 5;
    S.move = { who: "player", steps: 1, prev: 4, asked: { [m.uid]: true } };
    S.pendingTile = "pass";
    X.startBattle("player", m); E.resolvePlayerAttack();
    E.newGame(); const before = snapshot(E, logs);
    await flush(); assert.equal(snapshot(E, logs), before);
  }

  // 轮末奖励先挂起下一轮，全部选完才结算一次回合开始效果。
  {
    const { E, X, S, time } = setup();
    S.quests = [{ progress: 1, need: 1, done: false, desc: "甲", rewardTier: 1 },
      { progress: 1, need: 1, done: false, desc: "乙", rewardTier: 1 }];
    S.player.wealth = 3; const coins = S.player.coins;
    X.finishPlayerTurn();
    await pump(time, () => S.round === 2);
    assert.equal(S.waitForChips, true); assert.equal(S.player.coins, coins);
    E.pickChip(0); assert.equal(S.waitForChips, true); assert.equal(S.player.coins, coins);
    E.pickChip(0); assert.equal(S.waitForChips, false); assert.equal(S.phase, "play");
    assert.equal(S.player.coins, coins + S.player.wealth);
    const after = S.player.coins; E.pickChip(0); await flush();
    assert.equal(S.player.coins, after); assert.equal(S._dbg.endRound, 1);
  }

  // 终局清理排队的 AI；取消的 timer 及旧奖励 done 在重开后无效。
  {
    const { E, X, S, time, logs } = setup();
    S.quests[0].progress = S.quests[0].need; X.judgeQuests();
    const oldChoiceDone = S.chipChoice.done;
    X.finishPlayerTurn(); const oldTimer = [...time.history.values()][0];
    X.defeatMonster(X.spawnMonster("boss", 5));
    assert.equal(S.over, true); assert.equal(S.aiBusy, false); assert.equal(time.pending.size, 0);
    E.newGame(); const before = snapshot(E, logs);
    oldTimer(); oldChoiceDone(); await flush();
    assert.equal(snapshot(E, logs), before);
  }
  console.log("PASS 回合顺序、幂等收尾、奖励挂起、战斗续接、三类移动及询问期间重开、终局取消");
})().catch(error => { console.error(error); process.exitCode = 1; });
