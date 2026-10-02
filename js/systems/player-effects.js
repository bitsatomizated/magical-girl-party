// 角色技能处理器：参数来自技能数据，状态通过服务读取，渲染与回合调度由引擎负责。
(function () {
  function install(effects, { getState, log, graphDist, drawCard, drawBattleCard }) {
    effects.register("pixelate", {
      playerActive(p) {
        getState().player.buffs.push({ name: p.name, atk: p.value, turns: 99, pixel: true });
        log(`【${p.name}】发动：本回合攻击力+${p.value}，怪物无法主动攻击（持续到下回合开始）。`, "good");
      },
    }, { value: "nonnegative" });
    effects.register("azureFlame", {
      playerActive(p) {
        const P = getState().player;
        P.flameActive = true;
        P.flameDamage = p.value;
        P.turnMoveBonus += p.moveBonus;
        log(`【${p.name}】发动：本回合移动速度 +${p.moveBonus}，本次移动经过的节点将被青焰环绕（敌人经过受 ${p.value + P.flameBonus} 点伤害，持续到下回合开始）。`, "good");
      },
    }, { value: "nonnegative", moveBonus: "nonnegativeInt" });
    effects.register("sweetDeploy", {
      playerActive(p, context) {
        const S = getState();
        const candidates = S.tiles.map((t, i) => i).filter(i => graphDist(S.player.pos, i) <= p.range);
        S.targeting = { deploy: true, candidates, cardName: p.name, skill: p };
        context.deferred = true;
        log(`【${p.name}】进入瞄准：请在棋盘上选择 ${p.range} 格内的地块放置召唤物（${candidates.length} 个候选）。`);
      },
    }, { summon: "allies", range: "nonnegativeInt", "growth?": { "atk?": "nonnegative", "hp?": "nonnegative" } });
    effects.register("nextBattleAttack", {
      playerActive(p) {
        getState().player.atkBuffNextBattle = p.value;
        log(`【${p.name}】发动：下一场战斗攻击力+${p.value}。`, "good");
      },
    }, { value: "nonnegative" });
    effects.register("drawIfHpBelowHalf", {
      playerTurnStart(p) {
        const P = getState().player;
        if (P.hp < P.hpMax / 2 && drawCard()) log(`【${p.name}】发动：抽 1 张牌。`, "good");
      },
    }, {});
    effects.register("phoenixReborn", {
      playerInit(p) { getState().player.phoenixLeft = p.maxCharges; },
      playerLethal(p) {
        const P = getState().player;
        if (P.hp > 0 || P.ko || P.phoenixLeft <= 0) return;
        P.phoenixLeft--;
        P.hpMax = Math.max(1, P.hpMax - p.value);
        P.hp = P.hpMax;
        P.flameBonus += p.flameGrowth;
        log(`【${p.name}】发动：免疫致命伤害！最大生命 -${p.value}（现 ${P.hpMax}）并回满，青焰伤害永久 +${p.flameGrowth}（剩余 ${P.phoenixLeft} 次）。`, "good");
      },
    }, { value: "nonnegative", maxCharges: "nonnegativeInt", flameGrowth: "nonnegative" });
    effects.register("huntOnPass", {
      monsterPassPlayer(p, { monster }) {
        monster.hunt = (monster.hunt || 0) + p.stacks;
        log(`【${p.name}】发动：【${monster.name}】路过玩家，获得 ${p.stacks} 层【追猎】（现 ${monster.hunt}）。`, "good");
      },
      playerAttackValue(p, context) {
        const { target, preview } = context;
        if (!target || (target.hunt || 0) <= 0) return;
        context.bonus += p.value;
        context.parts.push(`追猎+${p.value}`);
        if (!preview) {
          if (p.consumeOnAttack) target.hunt--;
          log(`【${p.name}】目标带【追猎】：攻击 +${p.value}。`, "good");
        }
      },
      playerKill(p, { target }) {
        if ((target.hunt || 0) <= 0 || !p.drawOnKill) return;
        if (getState().player.hand.length >= 8) {
          log(`【${p.name}】击倒带【追猎】的敌人，但手牌已满（8），无法抽取。`, "warn");
        } else {
          const card = drawBattleCard();
          log(`【${p.name}】击倒带【追猎】的敌人：抽取 1 张战斗牌【${card.name}】。`, "good");
        }
      },
    }, { value: "nonnegative", stacks: "nonnegativeInt", drawOnKill: "boolean", consumeOnAttack: "boolean" });
    effects.register("healingPass", {
      playerPassAlly(p, { pos }) {
        for (const a of getState().allies) {
          if (a.hp <= 0 || a.pos !== pos || (p.targets && !p.targets.includes(a.definition.id))) continue;
          const heal = Math.min(p.value, a.hpMax - a.hp);
          a.hp += heal;
          if (heal > 0) log(`【${p.name}】：【${a.name}】回复 ${heal} 生命（现 ${a.hp}/${a.hpMax}）。`, "good");
          a.nextMoveBonus = p.moveBonus;
          log(`【${p.name}】：【${a.name}】下次移动速度 +${p.moveBonus}。`);
        }
      },
    }, { "targets?": ["allies"], value: "nonnegative", moveBonus: "nonnegativeInt" });
  }
  const api = { install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GamePlayerEffects = api;
})();
