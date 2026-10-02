// 独立子系统：通过参数取得对局状态与外部服务，不直接访问 UI 或 DOM。
(function () {
  function create({ getState, render, getAutoAnswer }) {
    // UI 与引擎入口共用操作许可，避免新增等待面板时漏拦某个按钮。
    function canAct(action) {
      const S = getState();
      if (!S || S.over || S.ask) return false;
      if (action === "chip") return !!S.chipChoice;
      if (S.chipChoice || S.waitForChips) return false;
      if (action === "shop") return !!S.shop;
      if (S.shop) return false;
      if (action === "battle") return !!S.battle;
      if (S.battle) return false;
      if (S.player.ko) return false; // 击倒后仅允许完成既有结算，不能继续玩家行动
      if (action === "target") return !!S.targeting;
      if (S.targeting) return false;
      if (action === "moveStep") return S.move?.who === "player" && !!S.move.await;
      if (S.move) return false;
      if (action === "play") return S.phase === "play";
      if (action === "skill") return S.phase === "play" && S.player.skillCd === 0;
      if (action === "move") return S.phase === "move";
      return false;
    }

    // ---------- 玩家询问（替代原生 confirm / prompt）----------
    // 原生弹窗是模态的：它阻塞整个页面，玩家无法在决定前滚动信息栏查看怪物、手牌与筹码。
    // 这里把问题写入 S.ask，交给 UI 渲染成非模态面板，返回 Promise 等待玩家点击。
    // 测试可用 window.__askAuto（同步返回所选 value）注入应答，从而不依赖 DOM。
    function ask(question, options, detail) {
      const S = getState();
      const auto = getAutoAnswer();
      if (typeof auto === "function") return Promise.resolve(auto(question, options, detail));
      return new Promise((resolve) => {
        const pending = { question, options, detail, resolve };
        if (S.ask) S.askQueue.push(pending);
        else S.ask = pending;
        render();
      });
    }

    // UI 点击选项后回调：先清状态再 resolve，避免 Promise 回调重入时读到旧状态
    function answerAsk(value, expectedAsk = getState()?.ask) {
      const S = getState();
      const a = S?.ask;
      if (!a || a !== expectedAsk || !a.options.some(o => o.value === value)) return;
      S.ask = S.askQueue.shift() || null;
      render();
      a.resolve(value);
    }

    // 是/否二选一的便捷封装
    function askYesNo(question, yesLabel, noLabel, detail) {
      return ask(question, [
        { label: yesLabel || "确定", value: true, cls: "primary" },
        { label: noLabel || "取消", value: false },
      ], detail);
    }

    return { canAct, ask, answerAsk, askYesNo };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameInteraction = api;
})();
