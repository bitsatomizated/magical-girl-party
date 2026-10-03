// 数据层：与 docs/设计文档-05 样板实体、docs/设计文档-06 卡池与筹码对应
// 运行规则以本文件为准；data/samples/*.json 是设计样例，不参与加载。
window.GAME_DATA = {};

// ---- 战斗牌（战斗阶段，消耗战斗点数；随机数值牌打出时掷点）----
GAME_DATA.cards = {
  // 攻击系
  atk_s:   { id: "atk_s",   name: "攻击中",   type: "battle", cost: 1, kind: "atk", min: 1, max: 3,  desc: "攻击 +1~3（随机）" },
  atk_m:   { id: "atk_m",   name: "攻击大",   type: "battle", cost: 2, kind: "atk", min: 1, max: 6,  desc: "攻击 +1~6（随机）" },
  atk_l:   { id: "atk_l",   name: "攻击特大", type: "battle", cost: 3, kind: "atk", min: 1, max: 10, desc: "攻击 +1~10（随机）" },
  shadow:  { id: "shadow",  name: "暗影突袭", type: "battle", cost: 2, kind: "atk", min: 3, max: 3, noCounter: true, desc: "攻击 +3，本次攻击不会被反击" },
  katana:  { id: "katana",  name: "名刀切",   type: "battle", cost: 4, kind: "atk", min: 1, max: 20, desc: "攻击 +1~20（随机）" },
  charge:  { id: "charge",  name: "蓄力",     type: "battle", cost: 5, kind: "atk", min: 5, max: 5, grant: "allout", desc: "攻击 +5，并获得 1 张【全力攻击】" },
  allout:  { id: "allout",  name: "全力攻击", type: "battle", cost: 3, kind: "atk", min: 6, max: 6, finalMult: 1.5, exclusive: true,
             desc: "攻击 +6，最终攻击结算 +50%（仅蓄力产出）" },
  // 防御系（守方姿态生效）
  def_s:   { id: "def_s",   name: "防御中",   type: "battle", cost: 1, kind: "def", min: 1, max: 3,  desc: "防御 +1~3（随机）" },
  def_m:   { id: "def_m",   name: "防御大",   type: "battle", cost: 2, kind: "def", min: 1, max: 6,  desc: "防御 +1~6（随机）" },
  def_l:   { id: "def_l",   name: "防御特大", type: "battle", cost: 3, kind: "def", min: 1, max: 10, desc: "防御 +1~10（随机）" },
  // 效果牌（出牌阶段）
  brick:    { id: "brick",    name: "板砖",     type: "effect", kind: "damage", range: 3, dmg: 5,       desc: "3 格内一个怪物受 5 点伤害" },
  cannon:   { id: "cannon",   name: "轨道炮",   type: "effect", kind: "damage", range: 5, dmg: 6,       desc: "5 格内一个怪物受 6 点伤害" },
  laser:    { id: "laser",    name: "激光",     type: "effect", kind: "damage", range: 6, dmg: 3,       desc: "6 格内一个怪物受 3 点伤害" },
  arcaneLaser: { id: "arcaneLaser", name: "魔导激光", type: "effect", kind: "damage", range: 8, dmg: 2, exclusive: true,
    desc: "指定8格内一名怪物，造成2点伤害" },
  demo:     { id: "demo",     name: "定向爆破", type: "effect", kind: "damage", range: 6, dmg: 4, aoe: 2, desc: "6 格内一个怪物及其周围 2 格内怪物各受 4 点伤害" },
  hurry:    { id: "hurry",    name: "加急加快", type: "effect", kind: "moveMod", doubleDice: true,        desc: "下次移动掷两个骰子" },
  dirChoose:{ id: "dirChoose",name: "方向抉择", type: "effect", kind: "moveMod", chooseDir: true,         desc: "下次移动首步自选方向（可掉头），后续不能掉头" },
  diceCtrl: { id: "diceCtrl", name: "遥控骰子", type: "effect", kind: "moveMod", fixedDice: true,         desc: "选择 1~6 的数字，下次移动固定走该点数" },
  king:     { id: "king",     name: "王之力",   type: "effect", kind: "buff", hpCost: 4, atk: 5, turns: 3, desc: "失去 4 生命，3 回合攻击 +5" },
  berserk:  { id: "berserk",  name: "狂暴",     type: "effect", kind: "buff", atk: 3, dmgTaken: 1, turns: 2, desc: "2 回合攻击 +3，受到伤害 +1" },
  poison:   { id: "poison",   name: "以毒攻毒", type: "effect", kind: "buff", hpCost: 2, heal: 3, turns: 2, desc: "失去 2 生命，接下来 2 次自己的回合开始时各回复 3 生命" },
  cake:     { id: "cake",     name: "蛋糕",     type: "effect", kind: "heal", heal: 2, desc: "回复 2 点生命" },
  burger:   { id: "burger",   name: "汉堡",     type: "effect", kind: "heal", heal: 4, desc: "回复 4 点生命" },
};
// 起始卡组/商店/拿牌格可用战斗牌池：蓄力不进普通池——星级 ≥2 后由引擎动态入池（见 engine.battlePoolNow），全力攻击为蓄力限定
GAME_DATA.battlePool = ["atk_s", "atk_s", "atk_m", "atk_m", "atk_l", "atk_l", "def_s", "def_s", "def_m", "def_m", "def_l", "shadow", "shadow", "katana"];
GAME_DATA.effectPool = ["brick", "cannon", "laser", "demo", "hurry", "hurry", "dirChoose", "diceCtrl", "king", "berserk", "poison", "cake", "cake", "burger"];

// ---- 筹码（docs/设计文档-06 §5.4，共 35 枚）----
// 字段：school 流派；rarity blue/purple/gold；数值键与引擎词条挂钩
GAME_DATA.chips = {
  // 通用
  sharp1:  { name: "锋利 I",   school: "通用", rarity: "blue",   atk: 1, desc: "攻击力 +1" },
  sharp2:  { name: "锋利 II",  school: "通用", rarity: "purple", atk: 3, desc: "攻击力 +3" },
  sharp3:  { name: "锋利 III", school: "通用", rarity: "gold",   atk: 5, point: 1, desc: "攻击力 +5，战斗点数上限 +1" },
  firm1:   { name: "坚固 I",   school: "通用", rarity: "blue",   def: 1, desc: "防御力 +1" },
  firm2:   { name: "坚固 II",  school: "通用", rarity: "purple", def: 2, desc: "防御力 +2" },
  firm3:   { name: "坚固 III", school: "通用", rarity: "gold",   def: 3, desc: "防御力 +3" },
  swift1:  { name: "迅捷 I",   school: "通用", rarity: "blue",   speed: 1, desc: "移动速度 +1" },
  swift2:  { name: "迅捷 II",  school: "通用", rarity: "purple", speed: 2, desc: "移动速度 +2" },
  swift3:  { name: "迅捷 III", school: "通用", rarity: "gold",   speed: 4, desc: "移动速度 +4" },
  lore1:   { name: "学识 I",   school: "通用", rarity: "blue",   draw: 1, desc: "每回合开始时抽 1 张牌" },
  lore2:   { name: "学识 II",  school: "通用", rarity: "purple", draw: 1, drawPass: 1, desc: "每回合开始时抽 1 张；路过商店和拿牌格时加抽 1 张" },
  lore3:   { name: "学识 III", school: "通用", rarity: "gold",   draw: 2, drawPass: 1, shopExtra: 2, desc: "每回合开始时抽 2 张；路过商店和拿牌格时加抽 1 张；商店商品 +2（1 战斗 1 效果）" },
  will1:   { name: "不屈 I",   school: "通用", rarity: "blue",   lowHpDef: 1, desc: "生命值 ≤50% 时，受到伤害 -1" },
  will2:   { name: "不屈 II",  school: "通用", rarity: "purple", lowHpDef: 2, lowHpAtk: 4, desc: "生命值 ≤50% 时，受到伤害 -2，攻击力 +4" },
  recycle: { name: "回收",     school: "通用", rarity: "blue",   coinPerCard: 1, desc: "每使用一张战斗牌或效果牌，获得 1 金币" },
  amplify: { name: "增幅",     school: "通用", rarity: "blue",   effectCardDamage: 1, desc: "效果牌伤害 +1（范围伤害对每个目标生效）" },
  capacity:{ name: "扩容",     school: "通用", rarity: "blue",   handLimit: 2, desc: "手牌上限 +2" },
  cycle:   { name: "循环",     school: "通用", rarity: "purple", skillCooldownReduction: 1, desc: "本局主动技能冷却永久 -1，当前剩余冷却也 -1（最低 0）" },
  // 财富（每回合开始获得层数×1 金币）
  wealth1: { name: "财富 I",   school: "财富", rarity: "blue",   wealthStacks: 1, desc: "财富层数 +1" },
  wealth2: { name: "财富 II",  school: "财富", rarity: "purple", wealthStacks: 3, desc: "财富层数 +3" },
  wealth3: { name: "财富 III", school: "财富", rarity: "gold",   wealthStacks: 5, desc: "财富层数 +5" },
  wp1:     { name: "财力 I",   school: "财富", rarity: "purple", perWealthDiv: 2, hitCoin: 1, desc: "攻击时每 2 层财富攻击 +1（向下取整）；命中敌人后获得 1 金币" },
  wp2:     { name: "财力 II",  school: "财富", rarity: "gold",   perWealthDiv: 1, killWealth: 1, desc: "攻击时每 1 层财富攻击 +1（向下取整）；击倒敌人后获得 1 层财富" },
  sancai:  { name: "散财",     school: "财富", rarity: "gold",   sancai: true, desc: "攻击时若金币 >20，本次攻击 +金币×30%（向下取整），随后失去 8 金币" },
  // 再生（每回合开始时先获得芯片提供的层数，再按层数×1 回复生命，回合结束层数减半）
  regen1:  { name: "再生 I",    school: "再生", rarity: "blue", regenStacks: 2, desc: "每回合开始时获得 2 层再生" },
  regen2:  { name: "再生 II",   school: "再生", rarity: "gold", regenStacks: 5, desc: "每回合开始时获得 5 层再生" },
  lf1:     { name: "生命之力 I",  school: "再生", rarity: "purple", fullHpAtk: 2, desc: "满血时攻击力 +2 + 当前再生层数（每枚生命之力独立结算再生加成）" },
  lf2:     { name: "生命之力 II", school: "再生", rarity: "gold",   fullHpAtk: 4, desc: "满血时攻击力 +4 + 当前再生层数（每枚生命之力独立结算再生加成）" },
  buffer:  { name: "缓冲",      school: "再生", rarity: "blue", onHurtRegen: 2, desc: "受到伤害后获得 2 层再生" },
  // 标记（被标目标受伤 +1/层，该怪物回合结束 -1 层，跨回合持续）
  hunter1: { name: "猎印 I",   school: "标记", rarity: "blue",   marksOnHit: 1, desc: "攻击命中敌人后，目标获得 1 层标记" },
  hunter2: { name: "猎印 II",  school: "标记", rarity: "purple", atk: 2, marksOnHit: 2, desc: "攻击力 +2；攻击命中敌人后，目标获得 2 层标记" },
  hunter3: { name: "猎印 III", school: "标记", rarity: "gold",   marksOnHit: 3, atkPerMark: true, desc: "攻击目标时，攻击力 +目标标记层数；攻击命中后，目标获得 3 层标记" },
  // 辐射：回合开始时按范围给怪物挂标记（auraRange 为 null 表示全图）
  rad1:    { name: "辐射 I",   school: "标记", rarity: "purple", auraMarks: 1, auraRange: 6,
             desc: "每回合开始时，给予 6 格内所有怪物 1 层标记" },
  rad2:    { name: "辐射 II",  school: "标记", rarity: "gold",   auraMarks: 1, auraRange: null,
             desc: "每回合开始时，给予所有怪物 1 层标记" },
  guidance:{ name: "引导",     school: "标记", rarity: "purple", effectCardMarks: 1,
             desc: "效果牌命中后，对每个被击中的目标施加 1 层标记（本次伤害结算后生效）" },
};

// ---- 可选角色 / 可选地图注册表（开场选择界面数据源；对应 docs/设计文档-05）----
GAME_DATA.characters = {
  char_anye: {
    id: "char_anye", name: "安叶",
    starGrowth: { 1: { def: 1, hp: 2, speed: 1 }, 2: { speed: 2 }, 3: { atk: 2, speed: 2 } },
    art: { full: "assets/chars/char_anye_full.jpg" },
    hpMax: 20, attack: 1, defense: 2,
    move: { dice: 1, faces: 10 },
    initialCoins: 12,
    activeSkill: { name: "青鸾雏焰", cooldown: 3,
      desc: "本回合移动速度+2，且移动经过的地块留下持续至下回合开始的青焰，对经过的敌人造成2点伤害。",
      effect: "azureFlame", value: 2, moveBonus: 2 },
    passiveSkill: { name: "凤凰再生",
      desc: "玩家受到致命伤害时，免疫该次伤害，失去4点最大生命并回复全部生命，同时使青焰伤害在本局永久+1。每局限3次。",
      effect: "phoenixReborn", value: 4, maxCharges: 3, flameGrowth: 1 },
  },
  char_pixel_meow: {
    id: "char_pixel_meow", name: "像素喵喵",
    starGrowth: { 1: { atk: 2, speed: 1 }, 2: { atk: 2, speed: 2 }, 3: { atk: 3, speed: 2 } },
    // 立绘：单张全身图，头像处由 CSS 圆形裁剪生成缩略；替换素材时同步此处路径
    art: { full: "assets/chars/char_pixel_meow_full.webp" },
    hpMax: 20, attack: 3, defense: 1,
    move: { dice: 1, faces: 10 },
    initialCoins: 12,
    activeSkill: { name: "像素化", cooldown: 3, desc: "下回合开始前，攻击力+4，且无法被怪物主动攻击。", effect: "pixelate", value: 4 },
    passiveSkill: { name: "喵之追猎", desc: "被怪物路过时，下回合移速+1，并对怪物施加1层【追猎】；攻击带【追猎】的敌人时攻击力+3；击倒带【追猎】的敌人后，随机抽取1张战斗牌。", effect: "huntOnPass", passSpeed: 1, value: 3, stacks: 1, drawOnKill: true, consumeOnAttack: false },
  },
  char_rococo: {
    id: "char_rococo", name: "洛可可",
    starGrowth: { 1: { def: 1, hp: 2, speed: 1 }, 2: { speed: 2 }, 3: { atk: 2, speed: 2 } },
    art: { full: "assets/chars/char_rococo_full.png" },
    hpMax: 20, attack: 2, defense: 2,
    move: { dice: 1, faces: 10 },
    initialCoins: 12,
    activeSkill: { name: "甜品登场", cooldown: 3,
      desc: "指定3格内一个地块，生成一个甜品使魔，然后使所有甜品使魔的最大生命+2、攻击力 +1。",
      effect: "sweetDeploy", summon: "dessert_familiar", range: 3, growth: { atk: 1, hp: 2 } },
    passiveSkill: { name: "治愈魔法",
      desc: "路过甜品使魔时，回复其5点生命，并使该甜品使魔下次移动速度+3。",
      effect: "healingPass", value: 5, moveBonus: 3, targets: ["dessert_familiar"] },
  },
  char_xingmeng: {
    id: "char_xingmeng", name: "星梦",
    starGrowth: { 1: { def: 1, hp: 2, speed: 1 }, 2: { speed: 2 }, 3: { atk: 2, speed: 2 } },
    art: { full: "assets/chars/char_xingmeng_full.jpg" },
    hpMax: 18, attack: 1, defense: 3,
    move: { dice: 1, faces: 10 }, initialCoins: 12,
    activeSkill: { name: "魔力回收", cooldown: 3,
      desc: "丢弃所有战斗牌，每丢弃3点费用，获得1张【魔导激光】（向下取整） 。",
      effect: "manaRecycle", card: "arcaneLaser", costPerCard: 3 },
    passiveSkill: { name: "魔导充能",
      desc: "每回合开始时，若手牌不超过6张，获得1张【魔导激光】；每打出1张【魔导激光】，【魔导激光】的伤害永久+1。",
      effect: "arcaneCharge", card: "arcaneLaser", handLimit: 6, growth: 1, everyCards: 1 },
  },
};

// ---- 友方召唤物（不属于怪物：玩家无法攻击，敌人可以攻击）----
GAME_DATA.allies = {
  dessert_familiar: { id: "dessert_familiar", name: "甜品使魔", hpMax: 20, attack: 3, defense: 3,
    move: { dice: 1, faces: 10 },
    desc: "主动追击最近的怪物，攻击所有自己路过的怪物；享受目标已有的标记增伤，但不触发玩家筹码效果；击倒奖励与任务进度计入玩家" },
};

// 友方 NPC 独立于召唤物，依次在召唤物之后、敌人之前行动。
GAME_DATA.npcs = {
  npc_taoyao: { id: "npc_taoyao", name: "魔法少女·桃夭", hpMax: 26, attack: 5, defense: 2, move: { dice: 1, faces: 10 },
    skill: { name: "映霞", effect: "npcShot", cooldown: 2, damage: 5, priority: ["tower_luoluo"], desc: "对随机一名敌人造成5点伤害，优先攻击珞珞，可穿透光学隐身" } },
  npc_manzhushahua: { id: "npc_manzhushahua", name: "魔法少女·曼珠沙华", hpMax: 32, attack: 6, defense: 3, move: { dice: 1, faces: 10 },
    passives: [{ name: "吸血恢复", effect: "npcLifesteal", ratio: 1, desc: "攻击造成伤害后，回复等同于造成伤害的生命值" }] },
  npc_linglan: { id: "npc_linglan", name: "魔法少女·铃兰", hpMax: 18, attack: 4, defense: 2, move: { dice: 1, faces: 10 },
    passives: [{ name: "队友链接", effect: "friendlySpeedAura", speed: 2, desc: "自身在场时，所有友方单位的移动速度+2" }] },
  npc_baishuixian: { id: "npc_baishuixian", name: "魔法少女·白水仙", hpMax: 22, attack: 5, defense: 1, move: { dice: 1, faces: 10 },
    passives: [{ name: "飞行", effect: "npcFlight", desc: "无法被怪物主动攻击，攻击怪物后不会被反击" }] },
};

GAME_DATA.monsters = {
  // 女巫塔前：珞珞、小白掉落12金币，赤痕、变彩掉落16金币；友方击倒同样归玩家。
  tower_luoluo: { id: "tower_luoluo", name: "珞珞", category: "elite", hpMax: 12, attack: 4, defense: 2,
    move: { steps: 1 }, coinDrop: 12, tags: ["aggressive", "counter"], art: { full: "assets/chars/elite_tower_luoluo_full.png" },
    diffStats: { hard: { hpMax: 14 }, nightmare: { hpMax: 16, attack: 5 }, crazy: { hpMax: 20, attack: 5 } },
    passives: [{ name: "光学隐身", effect: "opticalCloak", desc: "无法被主动攻击或效果牌锁定，免疫地块效果伤害（含青焰）；范围波及与映霞仍可命中" }] },
  tower_xiaobai: { id: "tower_xiaobai", name: "小白", category: "elite", hpMax: 18, attack: 4, defense: 3,
    move: { steps: 1 }, coinDrop: 12, tags: ["aggressive", "counter"], art: { full: "assets/chars/elite_tower_xiaobai_full.png" },
    diffStats: { hard: { hpMax: 20 }, nightmare: { hpMax: 22, attack: 5 }, crazy: { hpMax: 26, attack: 6 } } },
  tower_chihen: { id: "tower_chihen", name: "赤痕", category: "elite", hpMax: 44, attack: 4, defense: 2,
    move: { steps: 1 }, coinDrop: 16, tags: ["aggressive", "counter"], art: { full: "assets/chars/魔法少女赤痕.png" },
    diffStats: { hard: { hpMax: 48 }, nightmare: { hpMax: 52, attack: 5 }, crazy: { hpMax: 60, attack: 6 } },
    skill: { name: "裁光（劣化）", effect: "entangleFriendlies", cooldown: 3, stacks: 2, includePlayer: true, once: false, desc: "给予所有友方单位2层缠绕" },
    passives: [{ name: "红外领域", effect: "infraredField", minDiff: "nightmare", range: 3, damage: 3, desc: "仅噩梦、疯狂难度：自身回合开始时，对3格范围内所有友方单位造成3点伤害" }] },
  tower_variant: { id: "tower_variant", name: "变彩", category: "elite", hpMax: 32, attack: 3, defense: 2,
    move: { steps: 1 }, coinDrop: 16, tags: ["aggressive", "counter"], art: { full: "assets/chars/boss_variant_full.jpg" },
    diffStats: { hard: { hpMax: 34 }, nightmare: { hpMax: 36, attack: 4 }, crazy: { hpMax: 40, attack: 5 } },
    skill: { name: "卡牌释放", effect: "releaseCards", cooldown: 3, mob: "lab_wander", count: 2, desc: "在随机两个不同地块各生成一只游荡魔物（独立于地图事件）" },
    passives: [{ name: "魔物重塑", effect: "reshapeMinion", targets: ["lab_wander"], atk: 1, hp: 2, desc: "路过游荡魔物时使其攻击永久+1、最大生命+2；融合后继承双方累计强化" }] },
  tower_yuncai: { id: "tower_yuncai", name: "魔法少女·晕彩", category: "boss", hpMax: 188, attack: 6, defense: 3,
    move: { steps: 1 }, coinDrop: 0, tags: ["aggressive", "counter", "boss"], art: { full: "assets/chars/SSR_常驻___魔法少女_晕彩_.60d2e182.jpg" },
    diffStats: { hard: { hpMax: 204 }, nightmare: { hpMax: 226, attack: 7 }, crazy: { hpMax: 264, attack: 8 } },
    skill: { name: "裁光", effect: "finalLight", cooldown: 0, hpRatio: 0.5, stacks: 999, desc: "轮末任务结算时，生命为一半及以下则发动一次：给予所有在场友方NPC999层缠绕，然后立刻触发一次缠绕效果，击倒友方NPC并结束本关；不影响玩家和召唤物" },
    passives: [{ name: "折光", effect: "flatReduction", reduction: 2, desc: "所有来源伤害-2（沿用伤害最低1规则）" }] },
  // ---- 女仆咖啡厅阵容 ----
  // 精英1：不主动攻击、可反击；噩梦/疯狂获得「女仆链接」；常驻「晕彩救援」
  maid_anruosu: { id: "maid_anruosu", name: "女仆安若素", category: "elite", hpMax: 18, attack: 3, defense: 2,
             art: { full: "assets/chars/elite_maid_anruosu_full.jpg" },
             move: { steps: 1 }, coinDrop: 12, tags: ["passive", "counter"],
             diffStats: {
               hard:      { hpMax: 22 },
               nightmare: { hpMax: 24, attack: 4 },
               crazy:     { hpMax: 28, attack: 5 },
             },
             passives: [
               { name: "女仆链接", desc: "经过其他敌人时，使其下次移动速度 +2（精英/BOSS 为 +4）", effect: "maidLink", minDiff: "nightmare", moveByCategory: { minion: 2, default: 4 } },
               { name: "晕彩救援", desc: "生命低于30%（向下取整）时，晕彩在升星点登场（限一次）", effect: "yuncaiRescue", threshold: 0.3, summon: "maid_yuncai", tileType: "upgrade", onceKey: "yuncaiRescued" },
             ] },
  // 精英2：主动攻击、不反击；主动技「映霞」回合触发全图射击；被动「骑士守护」经过缇娜时生效
  maid_sutaoyao: { id: "maid_sutaoyao", name: "女仆苏桃夭", category: "elite", hpMax: 22, attack: 3, defense: 3,
             art: { full: "assets/chars/elite_maid_sutaoyao_full.jpg" },
             move: { steps: 1 }, coinDrop: 16, tags: ["aggressive"],
             diffStats: {
               hard:      { hpMax: 26 },
               nightmare: { hpMax: 28, attack: 4 },
               crazy:     { hpMax: 34, attack: 5 },
             },
             skill: { name: "映霞", cooldown: 3, effect: "yuxiaShot",
                      desc: "回合开始时对全图的你远程射击，造成 3 点伤害（噩梦/疯狂难度下，场上每有一名精英或 BOSS 再 +1，包含自身）",
                      value: 3, bonusPerStrong: { normal: 0, hard: 0, nightmare: 1, crazy: 1 }, strongCategories: ["elite", "boss"] },
             passives: [
               { name: "骑士守护", desc: "经过女仆缇娜时，恢复其3点生命并使其下次战斗攻防+3", effect: "knightGuard", targets: ["maid_tina"], heal: 3, atk: 3, def: 3 },
             ] },
  // 精英3：主动攻击、会反击；「鲜血汲取」攻击回复等量生命；「公主关注」经过苏桃夭刷新其技能CD
  maid_tina: { id: "maid_tina", name: "女仆缇娜", category: "elite", hpMax: 26, attack: 4, defense: 2,
             art: { full: "assets/chars/elite_maid_tina_full.jpg" },
             move: { steps: 1 }, coinDrop: 16, tags: ["aggressive", "counter"],
             diffStats: {
               hard:      { hpMax: 30 },
               nightmare: { hpMax: 32, attack: 5 },
               crazy:     { hpMax: 40, attack: 6 },
             },
             passives: [
               { name: "鲜血汲取", desc: "攻击玩家后，恢复等同于造成伤害的生命值", effect: "bloodDrain", ratio: 1 },
               { name: "公主关注", desc: "经过女仆苏桃夭时，刷新其主动技能CD", effect: "princessFocus", targets: ["maid_sutaoyao"] },
             ] },
  // BOSS：由安若素「晕彩救援」刷出（本图无固定BOSS格），可移动；主动技「析光」生成可行动的分身
  maid_yuncai: { id: "maid_yuncai", name: "女仆晕彩", category: "boss", hpMax: 77, attack: 4, defense: 2,
             art: { full: "assets/chars/boss_maid_yuncai_full.jpg" },
             move: { steps: 1 }, coinDrop: 0, tags: ["aggressive", "counter", "boss"],
             diffStats: {
               hard:      { hpMax: 99 },
               nightmare: { hpMax: 122, attack: 5 },
               crazy:     { hpMax: 144, attack: 6 },
             },
             skill: { name: "析光", cooldown: 3, effect: "lightSplit", summon: "maid_yuncai_clone", copyStats: ["atk", "def_"],
                      desc: "回合开始生成一个晕彩分身（分身于本体行动后行动）" } },
  // 晕彩分身：攻防复制生成时本体数值；无技能；击败掉落 8 金币；与小怪一样按编号区分
  maid_yuncai_clone: { id: "maid_yuncai_clone", name: "晕彩分身", category: "elite", numbered: true, hpMax: 14, attack: 4, defense: 2,
             art: { full: "assets/chars/boss_maid_yuncai_full.jpg" },
             move: { steps: 1 }, coinDrop: 8, tags: ["aggressive", "counter"],
             diffStats: {
               hard:      { hpMax: 16 },
               nightmare: { hpMax: 16 },
               crazy:     { hpMax: 18 },
             } },
  maid_sprite: { id: "maid_sprite", name: "女仆精灵", category: "minion", hpMax: 8, attack: 2, defense: 0,
             art: { full: "assets/chars/mob_maid_sprite_full.webp" },
             move: { steps: 1 }, coinDrop: 6, tags: ["aggressive"],
             // 分难度数值（未写的项沿用普通值）
             diffStats: {
               hard:      { hpMax: 9,  attack: 2 },
               nightmare: { hpMax: 10, attack: 3 },
               crazy:     { hpMax: 12, attack: 4 },
             } },
  dummy:   { id: "dummy",   name: "训练假人", category: "minion", hpMax: 6,  attack: 2, defense: 0,
             art: { full: "assets/chars/mob_training_dummy_full.png" },
             move: { steps: 1 }, coinDrop: 6,  tags: ["passive"], defend: { rule: "always", stance: "defend" },
             // 分难度数值（未写的项沿用普通值；具体数值待调）
             diffStats: {
               hard:      { hpMax: 9,  attack: 3, defense: 1 },
               nightmare: { hpMax: 13, attack: 3, defense: 1 },
               crazy:     { hpMax: 18, attack: 4, defense: 2 },
             } },
  sentinel:{ id: "sentinel",name: "哨兵机兵", category: "elite",  hpMax: 18, attack: 3, defense: 2,
             art: { full: "assets/chars/mob_sentinel_mech_full.png" },
             move: { steps: 1 }, coinDrop: 12, tags: ["aggressive"],
             defend: { rule: "always", stance: "defend" },
             skill: { name: "锁定", cooldown: 2, desc: "发起战斗时，本次战斗自身骰点+2", effect: "selfDicePlus", value: 2 },
             diffStats: {
               hard:      { hpMax: 27, attack: 4, defense: 3 },
               nightmare: { hpMax: 40, attack: 5, defense: 4 },
               crazy:     { hpMax: 54, attack: 6, defense: 5 },
             } },
  boss:    { id: "boss",    name: "灾厄核心", category: "boss",   hpMax: 30, attack: 3, defense: 2,
             art: { full: "assets/chars/boss_doom_core_full.png" },
             move: { steps: 1 }, coinDrop: 0, tags: ["boss", "aggressive"],
             defend: { rule: "always", stance: "defend" },
             growth: { everyRounds: 2, atk: 1, def: 1, everyRoundsHp: 5, hpGain: 5, heal: 5 },
             diffStats: {
               hard:      { hpMax: 45, attack: 4, defense: 3 },
               nightmare: { hpMax: 66, attack: 5, defense: 4 },
               crazy:     { hpMax: 90, attack: 6, defense: 5 },
             } },

  // ---- 卡牌实验室：融合流水线（设计文档 08）----
  // 游荡魔物：主动攻击、不反击；两只相遇即互相吸收，随机进化成一只一级精英
  lab_wander: { id: "lab_wander", name: "游荡魔物", category: "minion", hpMax: 5, attack: 3, defense: 0,
             art: { full: "assets/chars/mob_lab_wander_full.png" },
             move: { steps: 1 }, coinDrop: 4, tags: ["aggressive"],
             passives: [ { name: "吸收进化", desc: "移动到另一只游荡魔物所在格时互相吸收，随机进化成卡牌·雷鸟或卡牌·三头犬（满血、当回合停下）", effect: "devourMinion", into: ["lab_thunderbird", "lab_cerberus"] } ],
             diffStats: {
               hard:      { hpMax: 5,  attack: 3 },
               nightmare: { hpMax: 6,  attack: 4 },
               crazy:     { hpMax: 7,  attack: 4 },
             } },
  // 卡牌·雷鸟：不主动攻击、但会反击；基础移动 1d10，掠过玩家即造成自身攻击力的伤害
  lab_thunderbird: { id: "lab_thunderbird", name: "卡牌·雷鸟", category: "elite", hpMax: 8, attack: 3, defense: 2,
             art: { full: "assets/chars/elite_lab_thunderbird_full.png" },
             move: { steps: 1 }, coinDrop: 8, tags: ["passive", "counter"], numbered: true,
             passives: [ { name: "掠影", desc: "移动经过你时，造成等同于自身攻击力的伤害", effect: "passDamage", multiplier: 1 } ],
             diffStats: {
               hard:      { hpMax: 9 },
               nightmare: { hpMax: 10, attack: 4 },
               crazy:     { hpMax: 12, attack: 4 },
             } },
  // 卡牌·三头犬：主动攻击 + 反击，无技能
  lab_cerberus: { id: "lab_cerberus", name: "卡牌·三头犬", category: "elite", hpMax: 10, attack: 4, defense: 3,
             art: { full: "assets/chars/elite_lab_cerberus_full.png" },
             move: { steps: 1 }, coinDrop: 8, tags: ["aggressive", "counter"], numbered: true,
             diffStats: {
               hard:      { hpMax: 11 },
               nightmare: { hpMax: 12, attack: 5 },
               crazy:     { hpMax: 14, attack: 5 },
             } },
  // 奇美拉：二级精英；每 2 回合在周围增生 2 只游荡魔物，并吸收同格游荡魔物永久 +1 攻击
  lab_chimera: { id: "lab_chimera", name: "奇美拉", category: "elite", hpMax: 28, attack: 2, defense: 4,
             art: { full: "assets/chars/elite_lab_chimera_full.png" },
             move: { steps: 1 }, coinDrop: 16, tags: ["aggressive", "counter"], numbered: true,
             skill: { name: "魔物增生", cooldown: 2, effect: "spawnAround", mob: "lab_wander", count: 2, radius: 2,
                      desc: "在自身周围 2 格内随机生成 2 只游荡魔物" },
             // 普通/困难：每 2 只 +1 攻击；噩梦/疯狂：每只 +1
             passives: [ { name: "万魔之王", desc: "自己移动到游荡魔物所在格时将其吸收并永久提升攻击力（普通/困难每 2 只 +1，噩梦/疯狂每只 +1）；小怪路过它不会被吃掉", effect: "devourMinions", targets: ["lab_wander"], atkPer: 1, perCount: { normal: 2, hard: 2, nightmare: 1, crazy: 1 } } ],
             diffStats: {
               hard:      { hpMax: 30 },
               nightmare: { hpMax: 32, attack: 3 },
               crazy:     { hpMax: 36, attack: 4 },
             } },
  // 魔法少女·变彩（BOSS）：驻守不动、不主动攻击、不反击；每 2 回合把两只游荡魔物融合成一只一级精英
  lab_variant: { id: "lab_variant", name: "魔法少女·变彩", category: "boss", hpMax: 66, attack: 4, defense: 3,
             art: { full: "assets/chars/boss_variant_full.jpg" },
             move: { steps: 0, stationary: true }, coinDrop: 0, tags: ["boss"],
             skill: { name: "卡牌融合", cooldown: 2, effect: "fuseMinions", radius: 2,
                      // 由低到高取第一个素材足够的档位：优先两只游荡魔物 → 一只一级精英；小怪不足两只时才动用精英档
                      tiers: [
                        { from: ["lab_wander"], count: 2, into: ["lab_thunderbird", "lab_cerberus"] },
                        { from: ["lab_thunderbird", "lab_cerberus"], count: 2, into: ["lab_chimera"] },
                      ],
                      desc: "优先把两只游荡魔物融合成一只一级精英；场上小怪不足两只时，才把两只一级精英合成奇美拉。产物落在自身周围 2 格内" },
             passives: [ { name: "卡牌守护", desc: "场上每存在一只其他存活怪物，自身受到的伤害 -1（所有伤害来源生效，每次伤害最低为 1；清怪会立刻削弱守护）", effect: "crowdGuard", reductionPer: 1 } ],
             diffStats: {
               hard:      { hpMax: 72 },
               nightmare: { hpMax: 77, attack: 5 },
               crazy:     { hpMax: 88, attack: 5 },
             } },
};

// ---- 可选地图注册表 ----
GAME_DATA.maps = {
  // 新手教学地图：单环 20 格 + BOSS 毕业考；节奏平缓，逐轮引入刷怪与全局强化
  tutorial_ring: {
    id: "tutorial_ring",
    hidden: true, // 教学入口统一由新手教程提供；保留数据供教学场景与规则测试复用。
    name: "练习环道",
    intro: "这是一条用于热身的练习环道。沿着环道前进，熟悉移动、战斗、商店与筹码的玩法；灾厄核心将是你出师前的最后一考。",
    rounds: 12,
    fixedDifficulty: "normal", // 教学图锁定普通难度，选关界面灰掉其余难度
  bossTile: 10, // BOSS 刷新位置与格型解耦：10 号格现为疾行格，BOSS 仍刷在此处
  startTile: 0,
  upgradeCost: (star) => [15, 20, 25][star] ?? null, // 升星费用：1星15 / 2星20 / 3星25，满级 null
  shopCost: 3,                            // 卡牌商店单价（占位）
  shopOffers: { effect: 2, battle: 1 },   // 每次刷新：2 效果牌 + 1 战斗牌
  chipShopBase: 10, chipShopStep: 5,      // 筹码商店：第 N 次购买 = base + (N-1)*step，全局累计
  tiles: [
    { t: "start" },   { t: "draw" },   { t: "event" },  { t: "shop" },
    { t: "spawn", mob: "dummy" }, { t: "heal" }, { t: "dash" }, { t: "event" },
    { t: "event" }, { t: "chipshop" }, { t: "dash" }, { t: "damage" },
    { t: "draw" }, { t: "event" }, { t: "event" }, { t: "upgrade" },
    { t: "heal" }, { t: "assault" }, { t: "event" }, { t: "damage" },
  ],
  globalEvents: [
    { round: 3, name: "再热热身", desc: "又一只训练假人出现在环道上",
      spawns: [ { mob: "dummy", tiles: [13] } ] },
    { round: 5, name: "哨兵出动", desc: "哨兵机兵开始巡逻环道",
      spawns: [ { mob: "sentinel", tiles: [8] } ] },
    { round: 8, name: "强度上升", desc: "全体怪物攻防+1（此后出现的敌人同样生效）",
      spawns: [ { mob: "dummy", tiles: [13] } ],
      effect: "allMonstersStats", atk: 1, def: 1 },
  ],
  // 地图任务：每轮结束时判定一次（非实时），奖励 = 对应概率等级的筹码 3 选 1
  quests: [
    { desc: "击倒训练假人", target: "dummy",    need: 2, rewardTier: 1 },
    { desc: "击倒哨兵机兵", target: "sentinel", need: 1, rewardTier: 2 },
  ],
  },
  // 岔路地图：单环 + 一条横穿捷径（3↔9），形成两处三岔口；检验图拓扑移动；hidden：仅供测试
  ring_chord: {
    id: "ring_chord",
    name: "环心捷径",
    hidden: true,
    rounds: 14,
    bossTile: 10,
    startTile: 0,
    upgradeCost: (star) => [14, 18, 22][star] ?? null,
    shopCost: 3,
    shopOffers: { effect: 2, battle: 1 },
    chipShopBase: 10, chipShopStep: 5,
    tiles: [
      { t: "start" },  { t: "draw" },  { t: "event" },  { t: "shop" },
      { t: "heal" },   { t: "chipshop" }, { t: "event" }, { t: "spawn", mob: "dummy" },
      { t: "spawn", mob: "sentinel" }, { t: "damage" }, { t: "boss" }, { t: "upgrade" },
    ],
    edges: [
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],
      [3,9], // 环心捷径：3↔9，两处三岔口
    ],
    globalEvents: [ { round: 5, desc: "全地图怪物攻防+1", effect: "allMonstersPlus1" } ],
    quests: [
      { desc: "击倒训练假人", target: "dummy",    need: 2, rewardTier: 1 },
      { desc: "击倒哨兵机兵", target: "sentinel", need: 1, rewardTier: 2 },
    ],
  },
  // 女仆咖啡厅（首张正式地图·品字拓扑）：上圈 18（7×4 矩形轮廓）+ 竖颈 4 + 左右下圈各 6，共 34 格，四枢纽三岔口
  // 无 BOSS 格（BOSS 由后续事件系统刷出）、开局不铺怪（刷怪格踩上才刷）——事件实装前无法通关
  maid_cafe: {
    id: "maid_cafe",
    name: "女仆咖啡厅",
    bossName: "女仆晕彩", // 本图无固定 BOSS 格：由安若素「晕彩救援」刷出
    intro: "L市的漫展会场突然出现了一间女仆咖啡厅。传说这间咖啡厅的店长神龙见首不见尾，只能看见几位女仆活跃在台前台后。你对此感到好奇，便踏进了这间咖啡厅，想一探究竟……",
    rounds: 16, // 轮数待定
    startTile: 0,
    initialDir: [0, 1], // 初始方向：向下（起始点出发先走竖颈）
    initialSpawn: false, // 开局刷怪格空置
    upgradeCost: (star) => [15, 20, 25][star] ?? null,
    shopCost: 3,
    shopOffers: { effect: 2, battle: 1 },
    chipShopBase: 10, chipShopStep: 5,
    tiles: [
      // ---- 上圈 0~17（7×4 矩形轮廓，顺时针；0=底边居中起始点，9=顶边居中筹码店，关于 x=3 轴左右对称）----
      { t: "start",    x: 3, y: 3 }, { t: "spawn", mob: "maid_sprite", x: 4, y: 3 }, { t: "dash",    x: 5, y: 3 },
      { t: "event",    x: 6, y: 3 }, { t: "assault", x: 6, y: 2 }, { t: "draw",    x: 6, y: 1 },
      { t: "shop",     x: 6, y: 0 }, { t: "damage",  x: 5, y: 0 }, { t: "heal",    x: 4, y: 0 },
      { t: "chipshop", x: 3, y: 0 }, { t: "heal",    x: 2, y: 0 }, { t: "damage",  x: 1, y: 0 },
      { t: "shop",     x: 0, y: 0 }, { t: "draw",    x: 0, y: 1 }, { t: "assault", x: 0, y: 2 },
      { t: "event",    x: 0, y: 3 }, { t: "dash",    x: 1, y: 3 }, { t: "spawn", mob: "maid_sprite", x: 2, y: 3 },
      // ---- 竖颈 18~21（起始点往下：突击→疾行→回血→升星枢纽）----
      { t: "assault", x: 3, y: 4 }, { t: "dash", x: 3, y: 5 }, { t: "heal", x: 3, y: 6 }, { t: "upgrade", x: 3, y: 7 },
      // ---- 左下圈 22~27（21→…→17，与右下镜像）----
      { t: "event", x: 2, y: 7 }, { t: "spawn", mob: "maid_sprite", x: 1, y: 7 }, { t: "draw", x: 0, y: 7 },
      { t: "shop",  x: 0, y: 6 }, { t: "damage", x: 0, y: 5 }, { t: "dash",   x: 0, y: 4 },
      // ---- 右下圈 28~33（21→…→3，与左下镜像）----
      { t: "event", x: 4, y: 7 }, { t: "spawn", mob: "maid_sprite", x: 5, y: 7 }, { t: "draw", x: 6, y: 7 },
      { t: "shop",  x: 6, y: 6 }, { t: "damage", x: 6, y: 5 }, { t: "dash",   x: 6, y: 4 },
    ],
    edges: [
      // 上圈（18 格闭环）
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,0],
      // 竖颈
      [0,18],[18,19],[19,20],[20,21],
      // 左下圈
      [21,22],[22,23],[23,24],[24,25],[25,26],[26,27],[27,15],
      // 右下圈
      [21,28],[28,29],[29,30],[30,31],[31,32],[32,33],[33,3],
    ],
    // 事件日程（每轮开始触发）：
    //   spawns 支持 tiles 传格型字符串（该格型全部格子）或格子编号数组；
    //   effect 支持 allMonstersStats（全体敌人，含精英与BOSS）
    globalEvents: [
      { round: 1, name: "咖啡厅开业", desc: "四名女仆精灵在刷怪格待命，女仆安若素现身于升级点",
        spawns: [
          { mob: "maid_sprite", tiles: "spawn" },
          { mob: "maid_anruosu", tiles: "upgrade" },
        ] },
      { round: 4, name: "呼叫员工", desc: "四名女仆精灵出现在商店格，女仆苏桃夭与女仆缇娜分别守住左右事件格",
        spawns: [
          { mob: "maid_sprite", tiles: "shop" },
          { mob: "maid_sutaoyao", tiles: [22] },
          { mob: "maid_tina", tiles: [28] },
        ] },
      { round: 8, name: "魔王号令", desc: "四名女仆精灵涌出，所有敌人攻防 +1（此后出现的敌人同样生效）",
        spawns: [ { mob: "maid_sprite", tiles: "damage" } ],
        effect: "allMonstersStats", atk: 1, def: 1 },
      { round: 11, name: "最终扫除", desc: "所有敌人攻防 +2（此后出现的敌人同样生效）",
        effect: "allMonstersStats", atk: 2, def: 2 },
    ],
    quests: [
      { desc: "击败女仆精灵 4 只", targets: ["maid_sprite"], need: 4, rewardTier: 1 },
      { desc: "击败女仆安若素", targets: ["maid_anruosu"], need: 1, rewardTier: 1 },
      { desc: "击败女仆精灵 9 只", targets: ["maid_sprite"], need: 9, rewardTier: 2 },
      { desc: "击败女仆苏桃夭与女仆缇娜", targets: ["maid_sutaoyao", "maid_tina"], need: 2, rewardTier: 3, extra: "roundProgressMinus1" },
      { desc: "击败晕彩分身 2 个", targets: ["maid_yuncai_clone"], need: 2, rewardTier: 2 },
    ],
  },
  // 卡牌实验室（第二张正式图·横置的「目」）：外框 7×8 单环 + 两条内部竖列（x=2、x=4），共 38 格
  // 三个腔室各跨 2 格，关于中轴 x=3 左右对称；地块类型按镜像（x ↔ 6-x）成对分布，只有中轴上的起始点与 BOSS 位独自成格
  // 四个三岔口：2 在 (2,0)、4 在 (4,0)、17 在 (2,7)、15 在 (4,7)
  // 卡牌实验室：融合流水线地图。敌人全部由 globalEvents 按轮次投放（开局空场），
  // 怪物阵容、吸收与融合机制见《设计文档 08》
  card_lab: {
    id: "card_lab",
    name: "卡牌实验室",
    intro: "传说邪恶的反派组织【九幽】在L市有一座用于研究卡牌魔物融合的实验室，创造出的卡牌怪物具有超乎想象的战斗力。你在偶然间发现了实验室的位置，于是便打算一探究竟......",
    rounds: 16,
    startTile: 3,       // 上边中央 (3,0)：起始点落在对称轴上，才能保持左右地块类型对称
    initialDir: [1, 0], // 首步向右
    // 不设 bossTile：变彩由第 1 轮事件「魔物骚动」刷在最下方事件格（16 号），开局布阵完全交给事件
    bossName: "魔法少女·变彩",
    bossMob: "lab_variant",
    initialSpawn: false, // 开局不铺怪：所有敌人由 globalEvents 按轮次投放
    upgradeCost: (star) => [15, 20, 25][star] ?? null,
    shopCost: 3,
    shopOffers: { effect: 2, battle: 1 },
    chipShopBase: 10, chipShopStep: 5,
    tiles: [
      // ---- 外框 0~25（自左上角 (0,0) 顺时针）----
      { t: "event",    x: 0, y: 0 }, { t: "dash",     x: 1, y: 0 }, { t: "draw",     x: 2, y: 0 }, { t: "start",    x: 3, y: 0 },
      { t: "draw",     x: 4, y: 0 }, { t: "dash",     x: 5, y: 0 }, { t: "event",    x: 6, y: 0 },
      { t: "assault",  x: 6, y: 1 }, { t: "draw",     x: 6, y: 2 }, { t: "upgrade",  x: 6, y: 3 }, { t: "chipshop", x: 6, y: 4 },
      { t: "event",    x: 6, y: 5 }, { t: "heal",     x: 6, y: 6 }, { t: "shop",     x: 6, y: 7 },
      { t: "dash",     x: 5, y: 7 }, { t: "heal",     x: 4, y: 7 }, { t: "event",    x: 3, y: 7 }, { t: "heal",     x: 2, y: 7 },
      { t: "dash",     x: 1, y: 7 }, { t: "shop",     x: 0, y: 7 },
      { t: "heal",     x: 0, y: 6 }, { t: "event",    x: 0, y: 5 }, { t: "chipshop", x: 0, y: 4 }, { t: "upgrade",  x: 0, y: 3 },
      { t: "draw",     x: 0, y: 2 }, { t: "assault",  x: 0, y: 1 },
      // ---- 内部竖列 x=2（26~31）----
      { t: "spawn", mob: "lab_wander", x: 2, y: 1 }, { t: "damage",   x: 2, y: 2 }, { t: "spawn", mob: "lab_wander", x: 2, y: 3 }, { t: "dash",     x: 2, y: 4 },
      { t: "draw",     x: 2, y: 5 }, { t: "spawn", mob: "lab_wander", x: 2, y: 6 },
      // ---- 内部竖列 x=4（32~37，与 x=2 列镜像成对）----
      { t: "spawn", mob: "lab_wander", x: 4, y: 1 }, { t: "damage",   x: 4, y: 2 }, { t: "spawn", mob: "lab_wander", x: 4, y: 3 }, { t: "dash",     x: 4, y: 4 },
      { t: "draw",     x: 4, y: 5 }, { t: "spawn", mob: "lab_wander", x: 4, y: 6 },
    ],
    edges: [
      // 外框单环（26 条）
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],
      [6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],
      [13,14],[14,15],[15,16],[16,17],[17,18],[18,19],
      [19,20],[20,21],[21,22],[22,23],[23,24],[24,25],[25,0],
      // 内部竖列 x=2：上边 2 → (2,6)=31 → 下边 17
      [2,26],[26,27],[27,28],[28,29],[29,30],[30,31],[31,17],
      // 内部竖列 x=4：上边 4 → (4,6)=37 → 下边 15
      [4,32],[32,33],[33,34],[34,35],[35,36],[36,37],[37,15],
    ],
    // 四波投放：前期清怪 → 中期抗压 → 后期斩首
    globalEvents: [
      { round: 1, name: "魔物骚动", desc: "六只游荡魔物自实验区向上涌出，变彩在最深处登场！",
        spawns: [
          { mob: "lab_wander", tiles: "spawn", dir: [0, -1] }, // 6 只，登场方向统一朝上（y 减小，走向玩家起始端）
          { mob: "lab_variant", tiles: [16] },     // 变彩：最下方事件格 (3,7)
        ] },
      { round: 4, name: "群魔乱舞", desc: "六只游荡魔物涌入战场（铺满拿牌格），所有怪物攻击力 +1。",
        spawns: [ { mob: "lab_wander", tiles: "draw" } ], // 6 只，与拿牌格数量一致（铺满）
        effect: "allMonstersStats", atk: 1, def: 0 },
      { round: 9, name: "万魔之王", desc: "一只奇美拉在变彩身旁现身，所有怪物防御力 +1。",
        spawns: [ { mob: "lab_chimera", tiles: [16] } ],
        effect: "allMonstersStats", atk: 0, def: 1 },
      { round: 12, name: "最终爆发", desc: "四只游荡魔物自疾行格冲出，所有怪物攻防 +1。",
        spawns: [ { mob: "lab_wander", tiles: "dash", count: 4 } ], // 疾行格现有 6 个，只取其中 4 个（外框四角）
        effect: "allMonstersStats", atk: 1, def: 1 },
    ],
    // 任务：奖励"击倒"结果。吸收与融合不产生击倒，因此不会推进任务进度（见《设计文档 08》§3.1）
    quests: [
      { desc: "击败游荡魔物 4 只", targets: ["lab_wander"], need: 4, rewardTier: 1 },
      { desc: "击败游荡魔物 9 只", targets: ["lab_wander"], need: 9, rewardTier: 2 },
      { desc: "击败卡牌·雷鸟或卡牌·三头犬 2 只", targets: ["lab_thunderbird", "lab_cerberus"], need: 2, rewardTier: 2 },
      { desc: "击败奇美拉 1 只", targets: ["lab_chimera"], need: 1, rewardTier: 3, extra: "roundProgressMinus1" },
      { desc: "击败卡牌·雷鸟或卡牌·三头犬 4 只", targets: ["lab_thunderbird", "lab_cerberus"], need: 4, rewardTier: 3 },
    ],
  },
  // 第三张地图：女巫塔前，晕彩降至半血即获胜。
  // 轮数及经济参数暂沿用现有地图，非最终平衡值。
  witch_tower: {
    id: "witch_tower", name: "女巫塔前",
    intro: "L市的魔法少女们来到了【九幽】组织的基地，打算与她们决一死战。而你作为临时来到L市的魔法少女，也打算助她们一臂之力。然而，这场战斗的跌宕程度远远超出了大家的预期......",
    rounds: 16, startTile: 0, initialDir: [0, 1], initialSpawn: false, eventMinionSpawns: false,
    bossName: "魔法少女·晕彩", bossMob: "tower_yuncai",
    victoryDescription: "在轮末任务结算时达成晕彩生命值降至一半及以下的目标",
    enemyRoster: ["lab_wander", "lab_thunderbird", "lab_cerberus", "tower_luoluo", "tower_xiaobai", "tower_chihen", "tower_variant", "tower_yuncai"],
    npcRoster: ["npc_taoyao", "npc_manzhushahua", "npc_linglan", "npc_baishuixian"],
    upgradeCost: (star) => [15, 20, 25][star] ?? null,
    shopCost: 3, shopOffers: { effect: 2, battle: 1 },
    chipShopBase: 10, chipShopStep: 5,
    tiles: [
      { t: "start", x: 0, y: 0 }, // 0 顶部中央
      // 刷怪格落格生成游荡魔物；第一轮事件另在三个回血格投放，随机地块事件不刷怪。
      { t: "draw", x: -1, y: 0 }, { t: "spawn", mob: "lab_wander", x: -2, y: 0 },
      { t: "draw", x: 1, y: 0 }, { t: "spawn", mob: "lab_wander", x: 2, y: 0 },
      { t: "shop", x: -2, y: 1 }, { t: "dash", x: 0, y: 1 }, { t: "shop", x: 2, y: 1 },
      { t: "damage", x: -2, y: 2 }, { t: "event", x: 0, y: 2 }, { t: "damage", x: 2, y: 2 },
      { t: "assault", x: -2, y: 3 }, { t: "heal", x: 0, y: 3 }, { t: "assault", x: 2, y: 3 },
      { t: "draw", x: -1, y: 3.5 }, { t: "draw", x: 1, y: 3.5 },
      { t: "upgrade", x: 0, y: 4 }, // 16 中央四联通枢纽
      { t: "event", x: -2.5, y: 4 }, { t: "event", x: 2.5, y: 4 },
      { t: "dash", x: -3, y: 5 }, { t: "dash", x: 0, y: 5 }, { t: "dash", x: 3, y: 5 },
      { t: "damage", x: -3, y: 6 }, { t: "event", x: 0, y: 6 }, { t: "damage", x: 3, y: 6 },
      { t: "heal", x: -1, y: 6.5 }, { t: "heal", x: 1, y: 6.5 },
      { t: "shop", x: -2, y: 6.8 }, { t: "shop", x: 2, y: 6.8 },
      { t: "spawn", mob: "lab_wander", x: -2, y: 7.8 }, { t: "spawn", mob: "lab_wander", x: 2, y: 7.8 },
      { t: "draw", x: -1, y: 8.3 }, { t: "draw", x: 1, y: 8.3 },
      { t: "chipshop", x: 0, y: 8.7 }, // 33 最下方中央
    ],
    edges: [
      [2,1],[1,0],[0,3],[3,4], // 顶边
      [2,5],[5,8],[8,11], [0,6],[6,9],[9,12],[12,16], [4,7],[7,10],[10,13],
      [11,14],[14,16],[16,15],[15,13], // 两肩通往中央升星点
      [11,17],[17,19],[19,22],[22,27], [13,18],[18,21],[21,24],[24,28],
      [16,20],[20,23], [27,25],[25,23],[23,26],[26,28],
      [27,29],[29,31],[31,33],[33,32],[32,30],[30,28], // 底部闭环，补齐右侧镜像连接
    ],
    globalEvents: [
      { round: 1, name: "双方对峙", desc: "四名友方魔法少女登场，珞珞、小白与变彩迎战，三个回血格各出现一只游荡魔物。", allowMinionSpawns: true,
        npcSpawns: [
          { npc: "npc_taoyao", tile: 2, dir: [0, 1] },
          { npc: "npc_manzhushahua", tile: 4, dir: [0, 1] },
          { npc: "npc_linglan", tile: 8, dir: [0, 1] },
          { npc: "npc_baishuixian", tile: 10, dir: [0, 1] },
        ],
        spawns: [{ mob: "tower_luoluo", tiles: [22], dir: [0, -1] }, { mob: "tower_xiaobai", tiles: [24], dir: [0, -1] }, { mob: "tower_variant", tiles: [33] }, { mob: "lab_wander", tiles: "heal" }] },
      { round: 3, name: "红色风暴", desc: "赤痕登场，所有敌人攻防+1。",
        spawns: [{ mob: "tower_chihen", tiles: [23], dir: [0, -1] }], effect: "allMonstersStats", atk: 1, def: 1 },
      { round: 11, name: "魔力强化", desc: "所有敌人攻防+1。", effect: "allMonstersStats", atk: 1, def: 1 },
    ],
    specialEvents: {
      yuncaiArrival: { name: "晕彩降临！", desc: "晕彩登场，所有敌人攻防+1。",
        spawns: [{ mob: "tower_yuncai", tiles: [23], dir: [0, -1] }], effect: "allMonstersStats", atk: 1, def: 1 },
    },
    quests: [
      { desc: "击倒游荡魔物", targets: ["lab_wander"], need: 4, rewardTier: 1 },
      { desc: "击倒珞珞或小白", targets: ["tower_luoluo", "tower_xiaobai"], need: 2, rewardTier: 2 },
      { desc: "击倒赤痕", targets: ["tower_chihen"], need: 1, rewardTier: 3, triggerEvent: "yuncaiArrival" },
      { desc: "击倒变彩", targets: ["tower_variant"], need: 1, rewardTier: 3 },
      { desc: "晕彩的生命值降低到一半及以下", targets: ["tower_yuncai"], need: 1, condition: "hpAtMost", hpRatio: 0.5, victory: true },
    ],
  },
};

// ---- 难度（只影响怪物强度；怪可配 diffStats 分难度数值，机制随怪走）----
GAME_DATA.difficulties = { normal: "普通", hard: "困难", nightmare: "噩梦", crazy: "疯狂" };

// ---- 当前对局引用（开场选择后由 main.js 指向注册表条目；引擎只读这两个字段）----
GAME_DATA.player = GAME_DATA.characters.char_pixel_meow;
GAME_DATA.map = GAME_DATA.maps.maid_cafe; // 默认关卡（选关界面只展示非 hidden 地图）
