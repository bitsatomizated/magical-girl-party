// 数据层：与 docs/设计文档-05 样板实体、docs/设计文档-06 卡池与筹码对应
// 注：data/samples/*.json 为同源数据（JSON 为准），此处内嵌以支持 file:// 直接打开
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
  demo:     { id: "demo",     name: "定向爆破", type: "effect", kind: "damage", range: 6, dmg: 4, aoe: 2, desc: "6 格内一个怪物及其周围 2 格内怪物各受 4 点伤害" },
  hurry:    { id: "hurry",    name: "加急加快", type: "effect", kind: "moveMod", doubleDice: true,        desc: "下次移动掷两个骰子" },
  dirChoose:{ id: "dirChoose",name: "方向抉择", type: "effect", kind: "moveMod", chooseDir: true,         desc: "下次移动自选方向" },
  diceCtrl: { id: "diceCtrl", name: "遥控骰子", type: "effect", kind: "moveMod", fixedDice: true,         desc: "选择 1~6 的数字，下次移动固定走该点数" },
  king:     { id: "king",     name: "王之力",   type: "effect", kind: "buff", hpCost: 4, atk: 5, turns: 3, desc: "失去 4 生命，3 回合攻击 +5" },
  berserk:  { id: "berserk",  name: "狂暴",     type: "effect", kind: "buff", atk: 3, dmgTaken: 1, turns: 2, desc: "2 回合攻击 +3，受到伤害 +1" },
  poison:   { id: "poison",   name: "以毒攻毒", type: "effect", kind: "buff", hpCost: 2, heal: 3, turns: 2, desc: "失去 2 生命，2 回合内回合开始时回复 3 生命" },
  cake:     { id: "cake",     name: "蛋糕",     type: "effect", kind: "heal", heal: 2, desc: "回复 2 点生命" },
  burger:   { id: "burger",   name: "汉堡",     type: "effect", kind: "heal", heal: 4, desc: "回复 4 点生命" },
};
// 起始卡组/商店/拿牌格可用战斗牌池：蓄力不进普通池，全力攻击为蓄力限定
GAME_DATA.battlePool = ["atk_s", "atk_s", "atk_m", "atk_m", "atk_l", "atk_l", "def_s", "def_s", "def_m", "def_m", "def_l", "shadow", "shadow", "katana"];
GAME_DATA.effectPool = ["brick", "cannon", "laser", "demo", "hurry", "hurry", "dirChoose", "diceCtrl", "king", "berserk", "poison", "cake", "cake", "burger"];

// ---- 筹码（docs/设计文档-06 §5.4，共 29 枚）----
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
  // 标记（被标目标受伤 +1/层，回合结束 -1 层，跨回合持续）
  hunter1: { name: "猎印 I",   school: "标记", rarity: "blue",   marksOnHit: 1, desc: "攻击命中敌人后，目标获得 1 层标记" },
  hunter2: { name: "猎印 II",  school: "标记", rarity: "purple", atk: 2, marksOnHit: 2, desc: "攻击力 +2；攻击命中敌人后，目标获得 2 层标记" },
  hunter3: { name: "猎印 III", school: "标记", rarity: "gold",   marksOnHit: 3, atkPerMark: true, desc: "攻击目标时，攻击力 +目标标记层数；攻击命中后，目标获得 3 层标记" },
  // 辐射：回合开始时按范围给怪物挂标记（auraRange 为 null 表示全图）
  rad1:    { name: "辐射 I",   school: "标记", rarity: "purple", auraMarks: 1, auraRange: 6,
             desc: "每回合开始时，给予 6 格内所有怪物 1 层标记" },
  rad2:    { name: "辐射 II",  school: "标记", rarity: "gold",   auraMarks: 1, auraRange: null,
             desc: "每回合开始时，给予所有怪物 1 层标记" },
};

// ---- 可选角色 / 可选地图注册表（开场选择界面数据源；对应 docs/设计文档-05）----
GAME_DATA.characters = {
  char_anye: {
    id: "char_anye", name: "安叶",
    art: { full: "assets/chars/char_anye_full.jpg" },
    hpMax: 20, attack: 1, defense: 2,
    move: { dice: 1, faces: 10 },
    initialCoins: 12,
    activeSkill: { name: "青鸾雏焰", cooldown: 3,
      desc: "本回合移动速度 +3；本次移动经过的节点均被青焰环绕（含起点与终点），持续到下回合开始，敌人经过青焰地块受到 1 点伤害",
      effect: "azureFlame", value: 1 },
    passiveSkill: { name: "凤凰再生", trigger: "onLethalDamage",
      desc: "即将被击倒时免疫该伤害，失去 4 点最大生命并回满，青焰伤害永久 +1；发动三次后失效",
      effect: "phoenixReborn", value: 4, maxCharges: 3 },
  },
  char_pixel_meow: {
    id: "char_pixel_meow", name: "像素喵喵",
    // 立绘：单张全身图，头像处由 CSS 圆形裁剪生成缩略；替换素材时同步此处路径
    art: { full: "assets/chars/char_pixel_meow_full.webp" },
    hpMax: 20, attack: 3, defense: 1,
    move: { dice: 1, faces: 10 },
    initialCoins: 12,
    activeSkill: { name: "像素化", cooldown: 3, desc: "本回合攻击力+4，且不会被怪物主动攻击，持续到下回合开始", effect: "pixelate", value: 4 },
    passiveSkill: { name: "喵之追猎", trigger: "onMonsterPass", desc: "被怪物路过时，对怪物施加 1 层【追猎】；攻击带【追猎】的敌人时攻击力+3，然后移除 1 层", effect: "huntOnPass", value: 3 },
  },
};

GAME_DATA.monsters = {
  // ---- 女仆咖啡厅阵容 ----
  // 精英1：不主动攻击、可反击；噩梦/疯狂获得「女仆链接」；常驻「晕彩救援」
  maid_anruosu: { id: "maid_anruosu", name: "女仆安若素", category: "elite", hpMax: 14, attack: 3, defense: 2,
             art: { full: "assets/chars/elite_maid_anruosu_full.jpg" },
             move: { steps: 1 }, coinDrop: 12, tags: ["passive", "counter"],
             diffStats: {
               hard:      { hpMax: 18 },
               nightmare: { hpMax: 20, attack: 4 },
               crazy:     { hpMax: 24, attack: 5 },
             },
             passives: [
               { name: "女仆链接", desc: "经过其他敌人时，使其下次移动速度 +2（精英/BOSS 为 +4）", effect: "maidLink", minDiff: "nightmare" },
               { name: "晕彩救援", desc: "生命低于30%（向下取整）时，晕彩在升星点登场（限一次）", effect: "yuncaiRescue", threshold: 0.3 },
             ] },
  // 精英2：主动攻击、不反击；主动技「映霞」回合触发全图射击；被动「骑士守护」经过缇娜时生效
  maid_sutaoyao: { id: "maid_sutaoyao", name: "女仆苏桃夭", category: "elite", hpMax: 18, attack: 3, defense: 3,
             art: { full: "assets/chars/elite_maid_sutaoyao_full.jpg" },
             move: { steps: 1 }, coinDrop: 16, tags: ["aggressive"],
             diffStats: {
               hard:      { hpMax: 22 },
               nightmare: { hpMax: 24, attack: 4 },
               crazy:     { hpMax: 30, attack: 5 },
             },
             skill: { name: "映霞", cooldown: 3, effect: "yuxiaShot",
                      desc: "回合开始时对全图的你远程射击，造成 3 点伤害（噩梦/疯狂难度下，场上每有一名精英或 BOSS 再 +1）",
                      value: 3 },
             passives: [
               { name: "骑士守护", desc: "经过女仆缇娜时，恢复其3点生命并使其下次战斗攻防+3", effect: "knightGuard" },
             ] },
  // 精英3：主动攻击、会反击；「鲜血汲取」攻击回复等量生命；「公主关注」经过苏桃夭刷新其技能CD
  maid_tina: { id: "maid_tina", name: "女仆缇娜", category: "elite", hpMax: 22, attack: 4, defense: 2,
             art: { full: "assets/chars/elite_maid_tina_full.jpg" },
             move: { steps: 1 }, coinDrop: 16, tags: ["aggressive", "counter"],
             diffStats: {
               hard:      { hpMax: 26 },
               nightmare: { hpMax: 28, attack: 5 },
               crazy:     { hpMax: 36, attack: 6 },
             },
             passives: [
               { name: "鲜血汲取", desc: "攻击玩家后，恢复等同于造成伤害的生命值", effect: "bloodDrain" },
               { name: "公主关注", desc: "经过女仆苏桃夭时，刷新其主动技能CD", effect: "princessFocus" },
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
             skill: { name: "析光", cooldown: 3, effect: "lightSplit",
                      desc: "回合开始生成一个晕彩分身（分身于本体行动后行动）" } },
  // 晕彩分身：攻防复制生成时本体数值；无技能；击败掉落 8 金币；与小怪一样按编号区分
  maid_yuncai_clone: { id: "maid_yuncai_clone", name: "晕彩分身", category: "elite", numbered: true, hpMax: 10, attack: 4, defense: 2,
             art: { full: "assets/chars/boss_maid_yuncai_full.jpg" },
             move: { steps: 1 }, coinDrop: 8, tags: ["aggressive", "counter"],
             diffStats: {
               hard:      { hpMax: 12 },
               nightmare: { hpMax: 12 },
               crazy:     { hpMax: 14 },
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
             move: { steps: 2 }, coinDrop: 12, tags: ["aggressive"],
             defend: { rule: "always", stance: "defend" },
             skill: { name: "锁定", cooldown: 2, desc: "发起战斗时，本次战斗自身骰点+2", effect: "selfDicePlus", value: 2 },
             diffStats: {
               hard:      { hpMax: 27, attack: 4, defense: 3 },
               nightmare: { hpMax: 40, attack: 5, defense: 4 },
               crazy:     { hpMax: 54, attack: 6, defense: 5 },
             } },
  boss:    { id: "boss",    name: "灾厄核心", category: "boss",   hpMax: 30, attack: 3, defense: 2,
             art: { full: "assets/chars/boss_doom_core_full.png" },
             move: { stationary: true }, coinDrop: 0, tags: ["boss"],
             defend: { rule: "always", stance: "defend" },
             growth: { everyRounds: 2, atk: 1, def: 1, everyRoundsHp: 5, hpGain: 5, heal: 5 },
             phase: { threshold: 0.5, effect: "skillEveryRound" },
             skill: { name: "湮灭波", cooldown: 2, desc: "发起战斗时，无视你战斗牌加成中的2点", effect: "ignoreCardBonus", value: 2 },
             diffStats: {
               hard:      { hpMax: 45, attack: 4, defense: 3 },
               nightmare: { hpMax: 66, attack: 5, defense: 4 },
               crazy:     { hpMax: 90, attack: 6, defense: 5 },
             } },
};

// ---- 可选地图注册表 ----
GAME_DATA.maps = {
  // 测试地图：单环 20 格 + BOSS 驻守（拓扑按地图配置，文档03 §1）；hidden：不在选关界面展示，仅供测试
  test_ring: {
    id: "test_ring",
    name: "测试环道",
    hidden: true,
    rounds: 16,
  bossTile: 10,
  startTile: 0,
  upgradeCost: (star) => [15, 20, 25][star] ?? null, // 升星费用：1星15 / 2星20 / 3星25，满级 null
  shopCost: 3,                            // 卡牌商店单价（占位）
  shopOffers: { effect: 2, battle: 1 },   // 每次刷新：2 效果牌 + 1 战斗牌
  chipShopBase: 10, chipShopStep: 5,      // 筹码商店：第 N 次购买 = base + (N-1)*step，全局累计
  tiles: [
    { t: "start" },   { t: "draw" },   { t: "event" },  { t: "shop" },
    { t: "spawn", mob: "dummy" }, { t: "heal" }, { t: "dash" }, { t: "event" },
    { t: "spawn", mob: "sentinel" }, { t: "chipshop" }, { t: "boss" }, { t: "damage" },
    { t: "draw" }, { t: "spawn", mob: "dummy" }, { t: "event" }, { t: "upgrade" },
    { t: "heal" }, { t: "assault" }, { t: "event" }, { t: "damage" },
  ],
  globalEvents: [ { round: 8, desc: "全地图怪物攻防+1", effect: "allMonstersPlus1" } ],
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
};

// ---- 难度（只影响怪物强度；怪可配 diffStats 分难度数值，机制随怪走）----
GAME_DATA.difficulties = { normal: "普通", hard: "困难", nightmare: "噩梦", crazy: "疯狂" };

// ---- 当前对局引用（开场选择后由 main.js 指向注册表条目；引擎只读这两个字段）----
GAME_DATA.player = GAME_DATA.characters.char_pixel_meow;
GAME_DATA.map = GAME_DATA.maps.maid_cafe; // 默认关卡（选关界面只展示非 hidden 地图）
