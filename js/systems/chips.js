// 独立子系统：通过参数取得对局状态与外部服务，不直接访问 UI 或 DOM。
(function () {
  function create({ getState, data: D, log, render, random, canAct, askYesNo, onChoicesDrained }) {
    const rnd = n => Math.floor(random() * n);
    // ================= 筹码系统（设计文档06 §5）=================
    const RARITY_CN = { blue: "蓝", purple: "紫", gold: "金" };
    const PROB_TABLE = { // 概率档：1级(0-1星) / 2级(2星) / 3级(3星)
      1: { blue: 0.60, purple: 0.37, gold: 0.03, fixed: "blue" },
      2: { blue: 0.40, purple: 0.45, gold: 0.15, fixed: "purple" },
      3: { blue: 0.25, purple: 0.50, gold: 0.25, fixed: "gold" },
    };
    const probTier = (star) => star >= 3 ? 3 : star >= 2 ? 2 : 1;

    function chipList() { const S = getState(); return S.player.chips.map(id => D.chips[id]); }
    function hasChip(pred) { return chipList().some(pred); }
    function chipSum(key) { return chipList().reduce((s, c) => s + (c[key] || 0), 0); }
    function addChip(id) {
      const S = getState();
      const c = D.chips[id]; if (!c) return false;
      S.player.chips.push(id);
      log(`获得筹码【${c.name}】（${c.school}·${RARITY_CN[c.rarity]}）：${c.desc}`, "good");
      // 层数词条：财富层数入手立即入层（下回合开始产币）；
      // 再生不留待入层——它在每回合开始时按已有芯片重新获得层数（见 turnStartEffects）
      if (c.wealthStacks) { S.player.wealth += c.wealthStacks; log(`【财富】层数 +${c.wealthStacks}（现 ${S.player.wealth}）。`, "good"); }
      // 回合开始类词条（学识）不在入手时结算：统一在下回合开始结算前生效，
      // 由 startRound 的筹码等待机制保证（避免回合内获得被提前/重复结算）
      return true;
    }
    // 流派限持：财富/再生/标记三派合计限两派（通用不受限）
    function schoolsHeld() { const s = new Set(); chipList().forEach(c => { if (c.school !== "通用") s.add(c.school); }); return s; }
    function schoolAvailable(school) { const s = schoolsHeld(); return s.has(school) || s.size < 2; }

    function rollRarity(tier) {
      const p = PROB_TABLE[tier], r = random();
      if (r < p.gold) return "gold";
      if (r < p.gold + p.purple) return "purple";
      return "blue";
    }
    // 3 选 1：首格固定稀有度（tier 可被任务奖励覆盖），其余按概率表；
    // 不重复：同一次 3 选 1 内互不相同，且不与上次刷新重叠
    function genChipChoices(tier = probTier(getState().player.star)) {
      const S = getState();
      const last = S.lastChips || [];
      const opts = [], used = new Set();
      for (let slot = 0; slot < 3; slot++) {
        const rar = slot === 0 ? PROB_TABLE[tier].fixed : rollRarity(tier);
        const ok = (id) => {
          const c = D.chips[id];
          return !used.has(id) && !S.player.chips.includes(id) && !last.includes(id)
            && (c.school === "通用" || schoolAvailable(c.school));
        };
        let pool = Object.keys(D.chips).filter(id => D.chips[id].rarity === rar && ok(id));
        if (!pool.length) pool = Object.keys(D.chips).filter(ok); // 该稀有度无可用：放宽稀有度
        if (!pool.length) pool = Object.keys(D.chips).filter(id => !used.has(id) && !S.player.chips.includes(id)); // 极端：放宽流派
        const pick = pool[rnd(pool.length)];
        used.add(pick);
        opts.push(pick);
      }
      S.lastChips = opts.slice();
      return opts;
    }
    // 筹码选择队列：升星/商店/任务奖励统一入队，逐个弹出（任务同轮多完成时依次结算）
    function requestChipChoice(tierOverride) {
      const S = getState();
      return new Promise((resolve) => {
        S.chipQueue = S.chipQueue || [];
        // 选完的续接动作：渲染 → 驱动队列下一位（排空时恢复被挂起的回合开始）→ 解 promise
        S.chipQueue.push({
          tier: tierOverride ?? probTier(S.player.star),
          resolve: () => {
            if (getState() !== S || S.over) return;
            render(); startNextChipChoice(); resolve();
          },
        });
        if (!S.chipChoice) startNextChipChoice();
      });
    }
    function startNextChipChoice() {
      const S = getState();
      const item = S.chipQueue?.shift();
      if (!item) {
        if (S.waitForChips) onChoicesDrained(); // 轮次曾挂起等待选牌：继续回合开始结算
        return;
      }
      S.chipChoice = { options: genChipChoices(item.tier), tier: item.tier, done: item.resolve };
      render();
    }
    // 刷新：初始 2 次，每获得 1 星 +1；刷新后不出现上次出现过的筹码（lastChips 排除）
    function refreshChips() {
      const S = getState();
      if (!canAct("chip")) return;
      if ((S.chipRefreshLeft || 0) <= 0) { log("没有剩余刷新次数了。", "warn"); return; }
      S.chipRefreshLeft--;
      S.chipChoice.options = genChipChoices(S.chipChoice.tier);
      log(`刷新筹码 3 选 1（剩余 ${S.chipRefreshLeft} 次）。`);
      render();
    }
    async function openChipChoice() { await requestChipChoice(); }
    function pickChip(i) {
      const S = getState();
      if (!canAct("chip")) return;
      const id = S.chipChoice.options[i];
      if (!id) return;
      addChip(id);
      const done = S.chipChoice.done;
      S.chipChoice = null;
      render();
      done();
    }
    // 筹码商店：第 N 次购买 = base + (N-1)*step，购买计数全局累计不重置
    function chipShopPrice() { const S = getState(); return D.map.chipShopBase + (S.chipPurchases || 0) * D.map.chipShopStep; }
    async function openChipShop() {
      const S = getState();
      const price = chipShopPrice();
      if (S.player.coins < price) { log(`筹码商店：购买需要 ${price} 金币（金币不足）。`, "warn"); return; }
      if (!(await askYesNo(`筹码商店：花费 ${price} 金币抽取一次筹码 3 选 1？`, `花 ${price} 金币抽取`, "先不抽"))) return;
      if (getState() !== S || S.over) return;
      S.player.coins -= price;
      S.chipPurchases = (S.chipPurchases || 0) + 1;
      log(`筹码商店：支付 ${price} 金币（下次购买 ${chipShopPrice()} 金币）。`);
      await openChipChoice();
    }

    return { chipList, hasChip, chipSum, addChip, schoolsHeld, genChipChoices, requestChipChoice, refreshChips, pickChip, chipShopPrice, openChipShop, openChipChoice };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameChips = api;
})();
