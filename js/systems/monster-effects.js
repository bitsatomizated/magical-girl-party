// 怪物技能处理器。目标 ID、召唤类型与数值都由技能数据提供。
(function () {
  function install(effects, services) {
    const { getState, data: D, log, rnd, makeMonster, spawnMonster, spawnNear, rollNextStep,
      monstersAt, playerTakesDamage, checkPlayerKo, effAtk } = services;
    const targets = (p, target) => !p.targets || p.targets.includes(target.def.id);
    const valueAt = value => typeof value === "object" ? (value[D.diff] ?? value.normal) : value;
    const cooldown = (m, p) => {
      const phase = m.def.phase;
      return phase?.effect === "skillEveryRound" && m.hp <= m.hpMax * phase.threshold ? 1 : p.cooldown;
    };

    effects.register("bossAura", {
      monsterStats(p, c) {
        const n = getState().monsters.filter(m => m !== c.monster && m.hp > 0).length;
        c.atk += n * p.atkPer; c.def += n * p.defPer;
      },
    }, { atkPer: "nonnegative", defPer: "nonnegative" });
    effects.register("crowdGuard", {
      monsterDamageReduction(p, c) {
        const n = getState().monsters.filter(m => m !== c.monster && m.hp > 0).length;
        c.reduction += n * p.reductionPer;
      },
    }, { reductionPer: "nonnegative" });
    effects.register("yuncaiRescue", {
      monsterDamaged(p, { monster: m }) {
        const S = getState();
        if (m.hp > 0 && m.hp >= Math.floor(m.hpMax * p.threshold)) return;
        if (S[p.onceKey] || S.monsters.some(x => x.def.category === "boss")) return;
        const tile = S.tiles.findIndex(t => t.t === p.tileType);
        const b = spawnMonster(p.summon, tile >= 0 ? tile : D.map.startTile);
        S[p.onceKey] = true;
        log(`【${p.name}】发动：${b.name}登场了！！`, "warn");
      },
    }, { threshold: "ratio", summon: "monsters", tileType: "tileType", onceKey: "flagKey" });
    effects.register("knightGuard", {
      monsterPassMonster(p, { target }) {
        if (!targets(p, target)) return;
        const heal = Math.min(target.hpMax - target.hp, p.heal);
        target.hp += heal;
        target.nextBattleAtk = p.atk; target.nextBattleDef = p.def;
        log(`【${p.name}】：【${target.name}】回复 ${heal} 点，下次战斗攻防 +${p.atk}/+${p.def}。`, "warn");
      },
    }, { "targets?": ["monsters"], heal: "nonnegative", atk: "nonnegative", def: "nonnegative" });
    effects.register("princessFocus", {
      monsterPassMonster(p, { target }) {
        if (!targets(p, target) || target.skillCd <= 0) return;
        target.skillCd = 0;
        log(`【${p.name}】：【${target.name}】的【${target.def.skill?.name || "技能"}】CD 已刷新。`, "warn");
      },
    }, { "targets?": ["monsters"] });
    effects.register("maidLink", {
      monsterPassMonster(p, { target }) {
        const add = p.moveByCategory[target.def.category] ?? p.moveByCategory.default;
        target.moveBonusNext = add;
        log(`【${p.name}】：【${target.name}】下次移动速度 +${add}。`, "warn");
      },
    }, { moveByCategory: { default: "nonnegativeInt", "minion?": "nonnegativeInt", "elite?": "nonnegativeInt", "boss?": "nonnegativeInt" } });
    effects.register("bloodDrain", {
      monsterDealtDamage(p, { monster: m, dealt }) {
        if (dealt <= 0 || m.hp <= 0) return;
        const heal = Math.min(m.hpMax - m.hp, Math.floor(dealt * p.ratio));
        m.hp += heal;
        if (heal > 0) log(`【${p.name}】：【${m.name}】恢复 ${heal} 点（现 ${m.hp}）。`, "battle");
      },
    }, { ratio: "nonnegative" });
    effects.register("passDamage", {
      monsterPassDamage(p, { monster: m }) {
        const damage = effAtk(m) * p.multiplier;
        log(`【${m.name}】掠过：对你造成 ${damage} 点伤害！`, "warn");
        playerTakesDamage(damage, `【${m.name}】的掠过`, m);
        checkPlayerKo();
      },
    }, { multiplier: "nonnegative" });
    effects.register("selfDicePlus", {
      monsterAttack(p, c) {
        const m = c.monster;
        if (m.skillCd > 0) return;
        c.diceBonus += p.value;
        if (!c.preview) {
          m.skillCd = cooldown(m, p);
          log(`【${p.name}】发动：怪物骰点+${p.value}。`, "battle");
        }
      },
    }, { value: "nonnegativeInt" });
    effects.register("ignoreCardBonus", {
      monsterDefend(p, c) {
        if (c.monster.skillCd > 0) return;
        const reduction = Math.min(p.value, c.battle.cardBonus);
        c.reduction += reduction;
        c.monster.skillCd = cooldown(c.monster, p);
        log(`【${p.name}】发动：无视战斗牌加成 ${reduction} 点！`, "battle");
      },
    }, { value: "nonnegative" });
    effects.register("yuxiaShot", {
      monsterTurnStart(p, { monster: m }) {
        const S = getState();
        let damage = valueAt(p.value);
        const per = valueAt(p.bonusPerStrong) || 0;
        if (per) {
          const count = S.monsters.filter(x => x.hp > 0 && p.strongCategories.includes(x.def.category)).length;
          damage += count * per;
          if (count) log(`【${p.name}】强化：场上每名精英/BOSS +${per} 伤害（共 +${count * per}）。`, "warn");
        }
        log(`【${m.name}】发动【${p.name}】：远程射击！`, "battle");
        playerTakesDamage(damage, `【${p.name}】的箭矢`, m);
        checkPlayerKo();
        m.skillCd = p.cooldown;
      },
    }, { value: "difficultyNonnegative", "bonusPerStrong?": "difficultyNonnegative", strongCategories: ["category"] });
    effects.register("lightSplit", {
      monsterTurnStart(p, { monster: m }) {
        const clone = makeMonster(D.monsters[p.summon], m.pos);
        for (const key of p.copyStats) clone[key] = m[key];
        getState().monsters.push(clone);
        log(`【${p.name}】发动：一名${clone.def.name}现身（攻防复制本体 ${m.atk}/${m.def_}）！`, "warn");
        m.skillCd = p.cooldown;
      },
    }, { summon: "monsters", copyStats: ["copyStat"] });
    effects.register("spawnAround", {
      monsterTurnStart(p, { monster: m }) {
        let born = 0;
        for (let i = 0; i < p.count; i++) if (spawnNear(p.mob, m.pos, p.radius)) born++;
        log(`【${m.name}】发动【${p.name}】：${born} 只${D.monsters[p.mob].name}在周围现身！`, "warn");
        m.skillCd = p.cooldown;
      },
    }, { mob: "monsters", count: "positiveInt", radius: "nonnegativeInt" });
    effects.register("fuseMinions", {
      monsterTurnStart(p, { monster: m }) {
        const S = getState();
        const tiers = p.tiers || [{ from: [p.mob], count: p.count ?? 2, into: p.into }];
        for (const tier of tiers) {
          const prey = S.monsters.filter(x => x.hp > 0 && tier.from.includes(x.def.id));
          if (prey.length < tier.count) continue;
          const picks = [];
          for (let i = 0; i < tier.count; i++) picks.push(prey.splice(rnd(prey.length), 1)[0]);
          S.monsters = S.monsters.filter(x => !picks.includes(x));
          const into = tier.into[rnd(tier.into.length)];
          const born = spawnNear(into, m.pos, p.radius) || (() => {
            const b = makeMonster(D.monsters[into], picks[0].pos);
            S.monsters.push(b); return b;
          })();
          log(`【${m.name}】发动【${p.name}】：${tier.count} 只素材融合，【${born.name}】现身！`, "warn");
          m.skillCd = p.cooldown;
          return;
        }
      },
    }, p => p.tiers === undefined
      ? { mob: "monsters", "count?": "positiveInt", into: ["monsters"], radius: "nonnegativeInt" }
      : { tiers: [{ from: ["monsters"], count: "positiveInt", into: ["monsters"] }], radius: "nonnegativeInt" });
    effects.register("devourMinions", {
      monsterAbsorb(p, c) {
        const S = getState(), m = c.monster;
        if (m.hp <= 0) return;
        const prey = monstersAt(m.pos).filter(x => x !== m && targets(p, x));
        if (!prey.length) return;
        S.monsters = S.monsters.filter(x => !prey.includes(x));
        const per = valueAt(p.perCount), before = m.devourCount || 0;
        m.devourCount = before + prey.length;
        const gain = (Math.floor(m.devourCount / per) - Math.floor(before / per)) * p.atkPer;
        m.atk += gain;
        log(`【${p.name}】：【${m.name}】吸收 ${prey.length} 只单位（累计 ${m.devourCount}/${per}）` + (gain > 0 ? `，攻击力永久 +${gain}（现 ${m.atk}）。` : "，攻击力未提升。"), "warn");
        c.absorbed = true;
      },
    }, { "targets?": ["monsters"], perCount: "difficultyPositiveInt", atkPer: "nonnegative" });
    effects.register("devourMinion", {
      monsterFuse(p, c) {
        const S = getState(), m = c.monster;
        if (m.hp <= 0) return;
        const other = monstersAt(m.pos).find(x => x !== m && x.def.id === m.def.id);
        if (!other) return;
        const fused = makeMonster(D.monsters[p.into[rnd(p.into.length)]], m.pos);
        // 仅继承魔物重塑的累计强化，避免重复计入地图全局强化与基础属性。
        fused.reshape = { atk: (m.reshape?.atk || 0) + (other.reshape?.atk || 0), hp: (m.reshape?.hp || 0) + (other.reshape?.hp || 0) };
        fused.atk += fused.reshape.atk; fused.hpMax += fused.reshape.hp; fused.hp = fused.hpMax;
        fused.fusedRound = S.round; fused.lastFrom = m.lastFrom;
        S.monsters = S.monsters.filter(x => x !== m && x !== other);
        S.monsters.push(fused); rollNextStep(fused, false);
        log(`【吸收】：两只${m.def.name}合而为一，【${fused.name}】现身（${fused.hp}/${fused.hpMax}）！`, "warn");
        c.fused = true;
      },
    }, { into: ["monsters"] });
  }
  const api = { install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameMonsterEffects = api;
})();
