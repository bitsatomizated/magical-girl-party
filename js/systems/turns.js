// 回合调度：只决定何时运行规则和恢复流程，战斗/地块/成长数值仍由引擎结算。
(function () {
  function create({ getState, render, schedule, cancel, aiDelay, rules }) {
    const timers = new Set();
    let stage = "idle", turn = 0, playerEnded = false;

    // 跨 await 的调用方持有检查点；重开或终局后不得再读取/修改当前局。
    function checkpoint() {
      const state = getState();
      return () => !!state && getState() === state && !state.over;
    }
    function once(callback, active = checkpoint()) {
      let used = false;
      return (...args) => {
        if (used || !active()) return;
        used = true;
        return callback(...args);
      };
    }
    function timer(callback, ms, onCancel = () => {}) {
      const active = checkpoint(), ticket = { id: null, onCancel };
      timers.add(ticket);
      ticket.id = schedule(() => {
        if (!timers.delete(ticket)) return;
        if (active()) callback(); else onCancel();
      }, ms);
    }
    function delay(ms) { return new Promise(resolve => timer(() => resolve(true), ms, () => resolve(false))); }
    function reset() {
      stage = "idle"; turn++; playerEnded = false;
      for (const ticket of timers) { cancel(ticket.id); ticket.onCancel(); }
      timers.clear();
    }
    function stop() {
      reset(); stage = "over";
      if (getState()) getState().aiBusy = false;
    }

    function startRound() {
      const S = getState();
      if (!S || S.over) return;
      turn++; playerEnded = false; stage = "roundStart";
      S._dbg.startRound++;
      rules.startRound(); // 轮次事件 → 原地复活
      if (S.over) return;
      if (S.chipChoice || S.chipQueue?.length) {
        stage = "rewards"; S.waitForChips = true;
        return;
      }
      beginPlayerPhase();
    }
    function beginPlayerPhase() {
      const S = getState();
      if (!S || S.over || !["roundStart", "rewards"].includes(stage)) return;
      if (S.chipChoice || S.chipQueue?.length) return;
      stage = "player"; S.waitForChips = false;
      rules.startPlayer(); // 筹码 → 角色回合开始技能 → 冷却递减 → 出牌
    }
    function finishPlayerTurn() {
      const S = getState();
      if (!S || S.over || playerEnded) return;
      if (S.targeting) { S.targetingResume = true; return; }
      // 先占用本回合结束入口，再结算任何技能/持续效果，避免重复进入。
      playerEnded = true;
      const externallyBusy = S.aiBusy; // 保留测试/模拟暂停自动 AI 的既有入口。
      S.aiBusy = true; stage = "alliesPending";
      S._dbg.fpt++;
      rules.endPlayer();
      if (S.over || externallyBusy) return;
      const currentTurn = turn;
      timer(() => { if (turn === currentTurn && stage === "alliesPending") startAllies(); }, aiDelay);
    }

    function turnCheckpoint() {
      const active = checkpoint(), currentTurn = turn;
      return () => active() && turn === currentTurn;
    }
    function startAllies() {
      const S = getState(), active = turnCheckpoint();
      if (!active()) return;
      stage = "allies"; S.phase = "turnEnd";
      const list = S.allies.slice(); // 友方以阶段开始时的名单为准。
      let index = 0;
      const next = () => {
        if (!active()) return;
        while (index < list.length) {
          const ally = list[index++];
          if (ally.hp <= 0 || !S.allies.includes(ally)) continue;
          rules.moveAlly(ally, once(next, active));
          return;
        }
        startMonsters();
      };
      next();
    }
    function startMonsters() {
      const S = getState(), active = turnCheckpoint();
      if (!active()) return;
      stage = "monsters"; S.phase = "turnEnd"; S._dbg.aiStart++;
      const acted = new Set(); // 动态名单：当轮新生成的分身也行动；融合产物跳过。
      const next = () => {
        if (!active()) return;
        let monster;
        while ((monster = S.monsters.find(m => !acted.has(m.uid)))) {
          acted.add(monster.uid);
          if (monster.hp <= 0 || monster.fusedRound === S.round) continue;
          if (monster.skillCd > 0) monster.skillCd--;
          const done = once(() => {
            rules.endMonster(monster);
            render();
            timer(() => { if (active()) next(); }, aiDelay);
          }, active);
          if (monster.def.move?.stationary) { rules.monsterSkill(monster); done(); }
          else rules.moveMonster(monster, done);
          return;
        }
        S.aiBusy = false; S._dbg.aiEnd++;
        endRound();
      };
      next();
    }
    // 独立驱动阶段的测试/模拟入口；生产流程经 finishPlayerTurn 顺序进入。
    function allyTurns() {
      const S = getState();
      if (!S || S.over || S.aiBusy) return;
      S.aiBusy = true; playerEnded = true;
      startAllies();
    }
    function aiTurns() {
      const S = getState();
      if (!S || S.over || S.aiBusy) return;
      S.aiBusy = true; playerEnded = true;
      startMonsters();
    }
    function endRound() {
      const S = getState();
      if (!S || S.over || stage === "roundEnd") return;
      stage = "roundEnd"; S._dbg.endRound++;
      rules.judgeQuests();
      if (S.over) return;
      if (S.round >= S.roundsLimit) { rules.gameOver(false); return; }
      S.round++;
      startRound();
    }

    // 所有移动完成都先清空移动记录，再调用唯一续接，防止 done 重复推进。
    function completeMove(move) {
      const S = getState();
      if (!S || S.over || S.move !== move) return;
      S.move = null; S.phase = "turnEnd";
      if (!move || move.who === "player") finishPlayerTurn();
      else if (move.done) move.done();
    }
    function continueMove() {
      const S = getState();
      if (!S || S.over || S.battle) return;
      const move = S.move;
      if (move?.steps > 0) {
        S.phase = move.who === "player" ? "move" : "turnEnd";
        if (move.who === "player") rules.stepPlayer();
        else if (move.isAlly) rules.stepAlly();
        else rules.stepMonster();
      } else completeMove(move);
    }
    async function resumePass() {
      const active = checkpoint(), S = getState();
      const result = await rules.passTile(S.tiles[S.player.pos]);
      if (!active() || S.battle) return;
      if (result === "stop") {
        if (S.move) S.move.steps = 0;
        rules.landTile();
      } else continueMove();
    }
    function endBattle() {
      const S = getState();
      if (!S || S.over || !S.battle) return;
      S.battle = null;
      const pending = S.pendingTile;
      S.pendingTile = null;
      if (pending === "land") rules.landTile();
      else if (pending === "pass") resumePass();
      else continueMove();
      render();
    }
    return { reset, stop, checkpoint, delay, startRound, beginPlayerPhase, finishPlayerTurn,
      allyTurns, aiTurns, endRound, completeMove, continueMove, endBattle };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameTurns = api;
})();
