// 无头冒烟测试：驱动 Engine 自动游玩至终局，验证核心循环不卡死、公式按文档执行
// 运行：node test/smoke.js（需在 game/ 目录下）
function makeWindowStub() {
  global.window = global;
  const logs = [];
  global.UI = {
    log: (msg, cls) => { logs.push(`[${cls || "info"}] ${msg}`); },
    renderAll: () => {},
    enterBattle: () => {},
  };
  // 自动应答：是否类询问一律答应；数值类选项（遥控骰子 1~6）固定选 6，与原 prompt 默认值一致
  global.__askAuto = (q, opts) => {
    const o = opts || [];
    if (o.length && typeof o[0].value === "number") return 6;
    return true;
  };
  return logs;
}

const logs = makeWindowStub();
global.__FAST__ = true; // 关闭 AI 演出延迟
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine;
E.newGame();
let ticks = 0, triedCards = new Set(), lastPhase = "", lastSig = "", stallTicks = 0;
const timer = setInterval(() => {
  ticks++;
  const S = E.state;
  if (!S) return clearInterval(timer);
  if (ticks > 5000) {
    console.error("!! 超过 5000 刻度未终局，疑似死循环");
    console.error(`state: round=${S.round} phase=${S.phase} over=${S.over} battle=${S.battle ? JSON.stringify({ mode: S.battle.mode, target: S.battle.target?.name, pending: !!S.battle.pending }) : "null"} playerPos=${S.player.pos} ko=${S.player.ko} reviveSkip=${S.player.reviveSkip} aiBusy=${S.aiBusy} move=${S.move ? JSON.stringify({ who: S.move.who?.name || S.move.who, steps: S.move.steps }) : "null"} shop=${!!S.shop} chipChoice=${!!S.chipChoice} chipQueue=${(S.chipQueue || []).length} waitForChips=${S.waitForChips} dbg=${JSON.stringify(S._dbg)}`);
    console.error("最近日志：\n" + logs.slice(-25).join("\n"));
    clearInterval(timer); process.exit(1);
  }
  // 状态签名看门狗：500 刻度无任何状态变化 = 卡死
  const sig = `${S.round}|${S.phase}|${S.player.pos}|${S.player.hand.length}|${S.player.hp}|${S.monsters.map(m => m.hp).join(",")}|${!!S.battle}|${!!S.shop}|${!!S.chipChoice}|${(S.chipQueue || []).length}|${S.monsters.map(m => m.pos).join(",")}`;
  if (sig === lastSig) { stallTicks++; } else { stallTicks = 0; lastSig = sig; }
  if (stallTicks > 500) {
    console.error(`!! 状态 500 刻度无变化，疑似卡死 @tick ${ticks}`);
    console.error(`state: round=${S.round} phase=${S.phase} over=${S.over} battle=${S.battle ? JSON.stringify({ mode: S.battle.mode, target: S.battle.target?.name, pending: !!S.battle.pending }) : "null"} playerPos=${S.player.pos} ko=${S.player.ko} reviveSkip=${S.player.reviveSkip} aiBusy=${S.aiBusy} move=${S.move ? JSON.stringify({ who: S.move.who?.name || S.move.who, steps: S.move.steps, await: S.move.await || null, asked: S.move.asked || null }) : "null"} pendingTile=${S.pendingTile} shop=${!!S.shop} chipChoice=${!!S.chipChoice} chipQueue=${(S.chipQueue || []).length} waitForChips=${S.waitForChips} targeting=${!!S.targeting} dbg=${JSON.stringify(S._dbg)}`);
    console.error("最近日志：\n" + logs.slice(-25).join("\n"));
    clearInterval(timer); process.exit(1);
  }
  if (ticks % 200 === 0) console.log(`.. tick ${ticks}: round=${S.round} phase=${S.phase} battle=${!!S.battle} shop=${!!S.shop} chip=${!!S.chipChoice} q=${(S.chipQueue || []).length} wfc=${S.waitForChips} ko=${S.player.ko} rvs=${S.player.reviveSkip} busy=${S.aiBusy} hand=${S.player.hand.length} mons=${S.monsters.length}`);
  if (S.over) {
    const boss = S.monsters.some(m => m.def.category === "boss");
    console.log(`== 终局：第 ${S.round} 轮，胜利=${!boss}，玩家 HP=${S.player.hp}/${S.player.hpMax} 金币=${S.player.coins} 星级=${S.player.star}`);
    console.log(`== 筹码=${S.player.chips.length}（财富层=${S.player.wealth} 再生层=${S.player.regen}）流派=${E._test.schoolsHeld().size}`);
    console.log(`== 任务=${(S.quests || []).map(q => `${q.desc.slice(2, 6)}${q.progress}/${q.need}${q.done ? "✓" : ""}`).join(",")}`);
    console.log(`== 日志行数=${logs.length}，刻度数=${ticks}`);
    const koCount = logs.filter(l => l.includes("被击倒")).length;
    const battles = logs.filter(l => l.startsWith("[battle] ⚔") || l.includes("发起战斗")).length;
    console.log(`== 战斗次数≈${battles}，玩家被击倒次数=${koCount}`);
    clearInterval(timer);
    return;
  }
  if (S.chipChoice) { E.pickChip(0); return; } // 筹码 3 选 1：选第一个
  if (S.targeting) { E.chooseTarget(S.targeting.candidates[0]); return; } // 瞄准：打第一个候选
  if (S.shop) { // 商店面板：把买得起的都买了，然后离开
    const sel = S.shop.offers.map((o, i) => i).filter(i => !S.shop.offers[i].sold && S.shop.offers[i].cost <= S.player.coins && S.player.hand.length < 8);
    E.buyShop(sel); E.closeShop(); return;
  }
  if (S.battle) {
    if (S.battle.mode === "playerAttack") {
      const pts = E.playerBattlePoints() - S.battle.spentPoints;
      const card = S.player.hand.find(c => c.type === "battle" && c.kind === "atk" && c.cost <= pts);
      if (card && Math.random() < 0.8) E.playerPlayBattleCard(card.id);
      else E.resolvePlayerAttack();
    } else if (S.battle.mode === "monsterAttack") {
      if (Math.random() < 0.5) { // 半数情况先打防御牌
        const pts = E.playerBattlePoints() - S.battle.spentPoints;
        const def = S.player.hand.find(c => c.type === "battle" && c.kind === "def" && c.cost <= pts);
        if (def) { E.playerPlayBattleCard(def.id); return; }
      }
      E.playerChooseStance(Math.random() < 0.5 ? "defend" : "dodge");
    }
    return;
  }
  if (S.phase === "play") {
    if (S.phase !== lastPhase) { triedCards = new Set(); lastPhase = S.phase; }
    // 出牌阶段：效果牌尽量打掉（带生命代价的残血才用；已知打不出的跳过）
    const usable = (c) => !["king", "poison"].includes(c.id) || S.player.hp >= 8;
    const idx = S.player.hand.findIndex(c => c.type === "effect" && usable(c) && !triedCards.has(c.id));
    if (idx >= 0) { triedCards.add(S.player.hand[idx].id); E.playCard(idx); return; }
    E.finishPlayPhase();
  } else if (S.phase === "move") {
    if (S.move?.await) { E.pickMoveStep(S.move.await[0]); } // 岔路/方向抉择：取第一个候选（含【方向抉择】开局全向）
    else E.rollAndMove();
  }
}, 1);
