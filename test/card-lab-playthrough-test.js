// 卡牌实验室实战冒烟：自动游玩一整局，验证吸收/进化/融合/增生在真实流程中触发且不崩溃
// 运行：node test/card-lab-playthrough-test.js
function makeWindowStub() {
  global.window = global;
  const logs = [];
  global.UI = {
    log: (msg, cls) => { logs.push(`[${cls || "info"}] ${msg}`); },
    renderAll: () => {},
    enterBattle: () => {},
  };
  global.__askAuto = (q, opts) => {
    const o = opts || [];
    if (o.length && typeof o[0].value === "number") return 6;
    return true;
  };
  return logs;
}

const logs = makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, D = window.GAME_DATA;
D.map = D.maps.card_lab;
E.newGame();

const seen = { lab_wander: false, lab_thunderbird: false, lab_cerberus: false, lab_chimera: false, lab_variant: false };
let ticks = 0, lastSig = "", stallTicks = 0, triedCards = new Set(), lastPhase = "", failed = null;
const count = (kw) => logs.filter(l => l.includes(kw)).length;

const timer = setInterval(() => {
  ticks++;
  const S = E.state;
  if (!S) { clearInterval(timer); return finish(1, "状态丢失"); }
  S.monsters.forEach(m => { if (seen[m.def.id] !== undefined) seen[m.def.id] = true; });

  if (ticks > 6000) { clearInterval(timer); return finish(1, `超过 6000 刻度未终局（round=${S.round} phase=${S.phase}）`); }
  const sig = `${S.round}|${S.phase}|${S.player.pos}|${S.monsters.map(m => m.hp + "@" + m.pos).join(",")}|${!!S.battle}|${!!S.shop}|${!!S.chipChoice}`;
  if (sig === lastSig) stallTicks++; else { stallTicks = 0; lastSig = sig; }
  if (stallTicks > 600) { clearInterval(timer); return finish(1, `状态 600 刻度无变化，疑似卡死 @tick ${ticks}`); }

  if (S.over) { clearInterval(timer); return finish(0, null); }
  if (S.chipChoice) { E.pickChip(0); return; }
  if (S.targeting) { E.chooseTarget(S.targeting.candidates[0]); return; }
  if (S.shop) {
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
      if (Math.random() < 0.5) {
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
    const usable = (c) => !["king", "poison"].includes(c.id) || S.player.hp >= 8;
    const idx = S.player.hand.findIndex(c => c.type === "effect" && usable(c) && !triedCards.has(c.id));
    if (idx >= 0) { triedCards.add(S.player.hand[idx].id); E.playCard(idx); return; }
    E.finishPlayPhase();
  } else if (S.phase === "move") {
    if (S.move?.await) E.pickMoveStep(S.move.await[0]);
    else E.rollAndMove();
  }
}, 1);

function finish(code, err) {
  const S = E.state;
  let pass = 0, fail = 0;
  const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

  if (err) { console.error("!! " + err); console.error("最近日志：\n" + logs.slice(-20).join("\n")); process.exit(1); }

  const absorb = count("【吸收】"), devour = count("【万魔之王】"), fuse = count("【卡牌融合】"), grow = count("【魔物增生】"), pass1 = count("掠过");
  console.log(`[实战统计] 轮数=${S.round} 终局胜负=${S.win ? "胜" : "负"} 刻度=${ticks}`);
  console.log(`[实战统计] 吸收=${absorb} 万魔之王=${devour} 卡牌融合=${fuse} 魔物增生=${grow} 雷鸟掠过=${pass1}`);
  console.log(`[实战统计] 出现过的单位：游荡魔物=${seen.lab_wander} 雷鸟=${seen.lab_thunderbird} 三头犬=${seen.lab_cerberus} 奇美拉=${seen.lab_chimera} 变彩=${seen.lab_variant}`);
  console.log(`[实战统计] 玩家被击倒=${!!S.player.ko} 玩家 HP=${S.player.hp}/${S.player.hpMax} 金币=${S.player.coins} 终局日志行数=${logs.length}`);
  const doneN = S.quests.filter(q => q.done).length;
  console.log(`[实战统计] 任务完成=${doneN}/${S.quests.length} 各任务进度=${S.quests.map(q => q.progress + "/" + q.need).join(" ")}`);

  const bossAlive = S.monsters.some(m => m.def.category === "boss");
  check("对局跑到终局", !!S.over);
  check("胜负与 BOSS 是否存活一致", S.win === !bossAlive);
  check("全程无卡死", ticks < 6000 && stallTicks <= 600);
  check("游荡魔物互相吸收在实战中触发", absorb > 0);
  check("吸收产物（雷鸟或三头犬）在实战中出现", seen.lab_thunderbird || seen.lab_cerberus);
  check("魔法少女·变彩在实战中登场", seen.lab_variant);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
}
