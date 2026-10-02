// 技能时机与同步分发。处理器只在引擎显式到达时机时运行，不注册全局监听器。
(function () {
  const TIMINGS = Object.freeze(Object.fromEntries(Object.entries({
    playerInit: { scope: "角色被动", at: "新对局状态创建后、起始抽牌和刷怪前", context: "无" },
    playerActive: { scope: "角色主动", at: "出牌阶段通过操作许可检查后", context: "deferred：选目标时延后冷却" },
    playerTurnStart: { scope: "角色被动", at: "回合开始筹码结算后、进入出牌阶段前", context: "无" },
    playerTurnEnd: { scope: "角色被动", at: "玩家行动结束、通用持续效果递减前", context: "无" },
    playerAttackValue: { scope: "角色被动", at: "攻击力取值，早于骰点和伤害", context: "target, bonus, parts, preview", preview: true },
    playerHit: { scope: "角色被动", at: "玩家战斗造成正伤害后、命中筹码前；若目标已死，击杀已先结算", context: "target, damage" },
    playerDamaged: { scope: "角色被动", at: "玩家扣血及受伤筹码后、调用方致死判定前；不含直接生命代价", context: "raw, damage, source, attacker（可为 null）" },
    playerEnterTile: { scope: "角色被动", at: "玩家移动或突击改变位置后、青焰与路过召唤物结算前", context: "pos, movement（walk / assault）" },
    playerKill: { scope: "角色被动", at: "玩家击杀触发筹码后、公共金币与任务结算前；使魔不触发", context: "target" },
    playerLethal: { scope: "角色被动", at: "HP ≤ 0、正式击倒和清除状态之前", context: "处理器可恢复 HP 阻止击倒" },
    playerPassAlly: { scope: "角色被动", at: "玩家进入格子后、怪物询问和地块效果前", context: "pos" },
    monsterPassPlayer: { scope: "角色被动", at: "怪物移动进入玩家格，且本次移动尚未攻击时；先于主动攻击判定", context: "monster" },
    monsterTurnStart: { scope: "怪物主动/被动", at: "怪物冷却递减后、移动前；驻守怪同样执行", context: "monster" },
    monsterStats: { scope: "怪物被动", at: "查询有效攻防，不修改状态", context: "monster, atk, def, preview", preview: true },
    monsterDefend: { scope: "怪物主动", at: "玩家攻击力计算后、双方掷骰前", context: "monster, battle, reduction" },
    monsterAttack: { scope: "怪物主动", at: "玩家选定姿态后、双方掷骰前；预览可查询骰点加成", context: "monster, diceBonus, preview", preview: true },
    monsterDamaged: { scope: "怪物被动", at: "扣血及击杀结算后，包含使魔伤害；保留被击杀单位上下文", context: "monster, source" },
    monsterDealtDamage: { scope: "怪物被动", at: "对玩家的战斗伤害结算后、玩家致死判定前", context: "monster, dealt" },
    monsterPassDamage: { scope: "怪物被动", at: "被动怪进入玩家格且未发起主动战斗时", context: "monster" },
    monsterPassMonster: { scope: "怪物被动", at: "移动方进入同格其他怪物后，逐个目标结算；先于吸收", context: "monster, target" },
    monsterAbsorb: { scope: "怪物被动", at: "经过效果之后、同类融合之前", context: "monster, absorbed" },
    monsterFuse: { scope: "怪物被动", at: "吸收之后；融合成功则终止移动方行动", context: "monster, fused" },
  }).map(([id, info]) => [id, Object.freeze(info)])));

  function create({ getDifficulty, difficulties }) {
    const handlers = new Map();
    const parameters = new Map();
    function register(effect, hooks, schema = null) {
      if (handlers.has(effect)) throw new Error(`重复技能处理器：${effect}`);
      for (const [timing, handler] of Object.entries(hooks)) {
        if (!TIMINGS[timing] || typeof handler !== "function" || handler.constructor.name === "AsyncFunction") {
          throw new Error(`无效技能时机或非同步处理器：${effect}.${timing}`);
        }
      }
      handlers.set(effect, Object.freeze({ ...hooks }));
      parameters.set(effect, schema);
    }
    function emit(timing, definitions, context = {}) {
      if (!TIMINGS[timing]) throw new Error(`未知技能时机：${timing}`);
      if (context.preview && !TIMINGS[timing].preview) throw new Error(`该时机不支持预览：${timing}`);
      for (const skill of [...definitions]) {
        if (!skill || skill.disabled) continue;
        const hooks = handlers.get(skill.effect);
        if (!hooks) throw new Error(`未注册技能：${skill.effect}`);
        if (skill.minDiff && difficulties.indexOf(getDifficulty()) < difficulties.indexOf(skill.minDiff)) continue;
        const handler = hooks[timing];
        if (handler) {
          const result = handler(skill, context);
          if (result?.then) throw new Error(`技能处理器不得返回 Promise：${skill.effect}.${timing}`);
        }
      }
      return context;
    }
    function describe() {
      return [...handlers].map(([effect, hooks]) => ({ effect, timings: Object.keys(hooks), parameters: parameters.get(effect) }));
    }
    return { register, emit, describe, timings: TIMINGS };
  }
  const api = { create, TIMINGS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameEffects = api;
})();
