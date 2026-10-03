// 友方 NPC 与女巫塔前技能；不直接操作 DOM，不持有旧对局状态。
(function () {
  function install(effects, services) {
    const { getState, data: D, log, rnd, graphDist, spawnMonster, damageFriendly, damageMonsterByNpc, startEntangle } = services;
    effects.register("opticalCloak", {
      monsterProtection(p, c) { c.attack = false; c.card = false; c.tile = false; },
    }, {});
    effects.register("flatReduction", {
      monsterDamageReduction(p, c) { c.reduction += p.reduction; },
    }, { reduction: "nonnegative" });
    effects.register("finalLight", {
      monsterQuestComplete(p, { monster: m }) {
        if (m.finalLightUsed || m.hp > m.hpMax * p.hpRatio) return;
        m.finalLightUsed = true;
        log(`【${m.name}】发动【${p.name}】！所有在场友方魔法少女获得 ${p.stacks} 层缠绕，然后立刻触发一次缠绕效果。`, "warn");
        const targets = getState().npcs.filter(npc => npc.hp > 0);
        for (const npc of targets) npc.entangle = (npc.entangle || 0) + p.stacks;
        for (const npc of targets) startEntangle(npc);
        log("裁光消散，友方魔法少女全部退场。本关战斗至此结束。", "round");
      },
    }, { hpRatio: "ratio", stacks: "positiveInt" });
    effects.register("entangleFriendlies", {
      monsterTurnStart(p, { monster: m }) {
        if (p.once && m.entangleUsed) return;
        const S = getState();
        const targets = [...S.npcs, ...S.allies].filter(n => n.hp > 0 && !n.ko);
        if (p.includePlayer && S.player.hp > 0 && !S.player.ko) targets.unshift(S.player);
        for (const target of targets) target.entangle = (target.entangle || 0) + p.stacks;
        m.entangleUsed = true; m.skillCd = p.cooldown;
        log(`【${m.name}】发动【${p.name}】：${targets.length} 名友方各获得 ${p.stacks} 层缠绕。`, "warn");
      },
    }, { stacks: "positiveInt", includePlayer: "boolean", once: "boolean" });
    effects.register("infraredField", {
      monsterTurnStart(p, { monster: m }) {
        const S = getState();
        const targets = [S.player, ...S.npcs, ...S.allies].filter(a => a.hp > 0 && !a.ko && graphDist(m.pos, a.pos) <= p.range);
        for (const a of targets) damageFriendly(a, p.damage, p.name, m);
      },
    }, { range: "nonnegativeInt", damage: "nonnegative" });
    effects.register("releaseCards", {
      monsterTurnStart(p, { monster: m }) {
        const spots = getState().tiles.map((_, i) => i);
        for (let i = 0; i < p.count && spots.length; i++) spawnMonster(p.mob, spots.splice(rnd(spots.length), 1)[0]);
        m.skillCd = p.cooldown;
        log(`【${m.name}】发动【${p.name}】：${p.count} 只${D.monsters[p.mob].name}现身。`, "warn");
      },
    }, { mob: "monsters", count: "positiveInt" });
    effects.register("reshapeMinion", {
      monsterPassMonster(p, { target }) {
        if (!p.targets.includes(target.def.id)) return;
        target.reshape = target.reshape || { atk: 0, hp: 0 };
        target.reshape.atk += p.atk; target.reshape.hp += p.hp;
        target.atk += p.atk; target.hpMax += p.hp; // 只加最大生命，不额外治疗。
        log(`【${p.name}】：${target.name}攻击 +${p.atk}，最大生命 +${p.hp}。`, "warn");
      },
    }, { targets: ["monsters"], atk: "nonnegative", hp: "nonnegative" });
    effects.register("npcShot", {
      npcTurnStart(p, { npc }) {
        const enemies = getState().monsters.filter(m => m.hp > 0);
        const priority = enemies.filter(m => p.priority.includes(m.def.id));
        const pool = priority.length ? priority : enemies;
        if (!pool.length) return;
        const target = pool[rnd(pool.length)];
        damageMonsterByNpc(npc, target, p.damage);
        npc.skillCd = p.cooldown;
        log(`【${npc.name}】发动【${p.name}】，命中【${target.name}】。`, "good");
      },
    }, { damage: "nonnegative", priority: ["monsters"] });
    effects.register("npcLifesteal", {
      npcHit(p, { npc, damage }) { npc.hp = Math.min(npc.hpMax, npc.hp + damage * p.ratio); },
    }, { ratio: "nonnegative" });
    effects.register("friendlySpeedAura", {
      npcTraits(p, c) { c.speedAura += p.speed; },
    }, { speed: "nonnegativeInt" });
    effects.register("npcFlight", {
      npcTraits(p, c) { c.noActiveAttack = true; c.noCounter = true; },
    }, {});
  }
  const api = { install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameNpcEffects = api;
})();
