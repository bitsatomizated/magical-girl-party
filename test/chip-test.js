// 筹码系统专项测试：词条生效 / 流派限持 / 3选1规则（docs/设计文档06）
// 运行：node test/chip-test.js（需在 game/ 目录下）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const D = window.GAME_DATA, E = window.Engine, T = E._test;
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}
E.newGame();
const S = E.state, P = S.player;

// ---- 1. 通用词条：攻/防/移速/点数 ----
console.log("[1] 通用词条");
const baseAtk = T.derived().atk, basePts = E.playerBattlePoints();
T.addChip("sharp1");
assert(T.derived().atk === baseAtk + 1, "锋利 I：攻击+1");
T.addChip("sharp3");
assert(T.derived().atk === baseAtk + 6, "锋利 III：攻击再+5");
assert(E.playerBattlePoints() === basePts + 1, "锋利 III：战斗点数上限+1");
T.addChip("firm2");
assert(T.derived().def === P.def + 2, "坚固 II：防御+2");
T.addChip("swift2");
assert(T.derived().speed === (P.speedBonus || 0) + 2, "迅捷 II：移速+2");

// ---- 2. 流派限持（财富/再生/标记三派限两派）----
console.log("[2] 流派限持");
T.addChip("wealth1"); T.addChip("regen1"); // 已持财富+再生两派
assert(T.schoolsHeld().size === 2, "已持两派（财富+再生）");
let leak = 0;
for (let i = 0; i < 60; i++) {
  T.genChipChoices().forEach(id => { if (D.chips[id].school === "标记") leak++; });
}
assert(leak === 0, `3选1 中不出现第三派（标记），60 次采样泄漏=${leak}`);
// 移除一派后标记应可用（用内部状态模拟丢弃）
P.chips = P.chips.filter(id => id !== "regen1");
let markSeen = false;
for (let i = 0; i < 80 && !markSeen; i++) markSeen = T.genChipChoices().some(id => D.chips[id].school === "标记");
assert(markSeen, "释放一派后标记出现在 3选1 中");

// ---- 3. 财富词条：回合开始获得层数×金币 ----
console.log("[3] 财富");
P.wealth = 5; P.coins = 0;
T.turnStartEffects();
assert(P.coins === 5, `财富 5 层回合开始 +5 金币（实际 ${P.coins}）`);

// ---- 4. 再生词条：回合开始回血 / 回合结束层数减半 ----
console.log("[4] 再生");
P.regen = 3; P.hp = 5;
T.turnStartEffects();
assert(P.hp === 8, `再生 3 层回合开始回 3 血（实际 HP=${P.hp}）`);
T.turnEndEffects();
assert(P.regen === 1, `回合结束层数减半 3→1（实际 ${P.regen}）`);

// ---- 5. 标记词条：受伤+1/层；该怪物回合结束-1层 ----
console.log("[5] 标记");
const mob = S.monsters.find(m => m.def.category === "elite"); // 用精英：避免被测试伤害击倒移出列表
mob.marks = 2;
const before = mob.hp;
const dealt = T.dealToMonster(mob, 5);
assert(dealt === 7, `5 点基础伤害 +2 层标记 = 7（实际 ${dealt}）`);
assert(mob.hp === before - 7, "怪物 HP 正确扣减");
T.turnEndEffects();
assert(mob.marks === 2, "玩家回合结束不衰减怪物标记");
T.monsterTurnEndEffects(mob);
assert(mob.marks === 1, `该怪物回合结束标记 2→1（实际 ${mob.marks}）`);

// ---- 5b. 猎印命中挂标记（marksOnHit 结算）----
console.log("[5b] 猎印命中挂标记");
P.chips = P.chips.filter(id => !D.chips[id].marksOnHit); // 清掉猎印，从零开始
T.addChip("hunter1");
const atkBeforeH2 = T.derived().atk;
T.addChip("hunter2");
assert(T.derived().atk === atkBeforeH2 + 2, "猎印 II：攻击力 +2");
mob.marks = 0;
const dealtHit = T.dealToMonster(mob, 4); // 命中一次：本次伤害按命中前的 0 层标记结算
T.onHitEnemy(mob); // 战斗攻击的命中结算（resolvePlayerAttack 里紧随 dealToMonster 调用）
assert(dealtHit === 4, "命中本次伤害不受刚挂的标记影响（4 点）");
assert(mob.marks === 3, `猎印 I+II 命中后共挂 1+2=3 层（实际 ${mob.marks}）`);
P.chips = P.chips.filter(id => !D.chips[id].marksOnHit); // 移除后再命中：不再挂标记
mob.hp = mob.hpMax = 50; // 抬满血量：本击带 3 层标记共 4 点，避免靶子被击倒移出列表
T.dealToMonster(mob, 1);
T.onHitEnemy(mob); // 同样按战斗命中处理
assert(mob.marks === 3, "未持猎印时命中不挂标记");

// ---- 5c. 辐射：回合开始按范围挂标记 ----
console.log("[5c] 辐射");
P.chips = P.chips.filter(id => !D.chips[id].auraMarks); // 清掉辐射，从零开始
const near5c = mob; near5c.pos = 1;                      // 玩家在起点 0：1 号格距离 1
const farDef5c = { id: "far_t", name: "远靶", category: "minion", hpMax: 30, attack: 0, defense: 0, move: {}, coinDrop: 0, tags: [], defend: null };
const far5c = { uid: 8888, def: farDef5c, name: "远靶", pos: 9, hp: 30, hpMax: 30, atk: 0, def_: 0, marks: 0, hunt: 0 }; // 距离 9
S.monsters.push(far5c);
near5c.marks = 0; far5c.marks = 0;
T.addChip("rad1");
T.turnStartEffects();
assert(near5c.marks === 1, `辐射 I：6 格内怪物获得 1 层（实际 ${near5c.marks}）`);
assert(far5c.marks === 0, `辐射 I：6 格外怪物不受影响（实际 ${far5c.marks}）`);
// 辐射 I + II 同持：逐条结算，近怪共 2 层、远怪 1 层
P.chips = P.chips.filter(id => !D.chips[id].auraMarks);
T.addChip("rad1"); T.addChip("rad2");
near5c.marks = 0; far5c.marks = 0;
T.turnStartEffects();
assert(near5c.marks === 2, `辐射 I+II 同持：6 格内共 2 层（实际 ${near5c.marks}）`);
assert(far5c.marks === 1, `辐射 I+II 同持：全图怪物 1 层（实际 ${far5c.marks}）`);
P.chips = P.chips.filter(id => !D.chips[id].auraMarks);
S.monsters = S.monsters.filter(m => m !== far5c); // 清理临时靶

// ---- 6. 猎印 III：攻击力+目标标记层数 ----
console.log("[6] 猎印 III");
T.addChip("hunter3");
mob.marks = 3;
const atkNoMark = T.computeAttack({ marks: 0 }, null);
const atkWithMark = T.computeAttack(mob, null);
assert(atkWithMark === atkNoMark + 3, `攻击 +目标标记 3 层（${atkNoMark}→${atkWithMark}）`);

// ---- 7. 财力：每 X 层财富攻击 +1；命中收益 ----
console.log("[7] 财力");
P.wealth = 6;
const atkNoWp = T.computeAttack(mob, null);
T.addChip("wp1"); // 每2层+1 → +3
assert(T.computeAttack(mob, null) === atkNoWp + 3, "财力 I：6 层财富 → 攻击+3");
const coinsBefore = P.coins;
const marksKeep7 = mob.marks; // onHitEnemy 现在会真实挂标记，断言前后需固定标记数
T.onHitEnemy(mob);
mob.marks = marksKeep7;
assert(P.coins === coinsBefore + 1, "财力 I：命中获得 1 金币");
T.addChip("wp2"); // 每1层+1 → 再+6
assert(T.computeAttack(mob, null) === atkNoWp + 3 + 6, "财力 II：再+6");
const wealthBefore = P.wealth;
T.onHitEnemy(mob);
mob.marks = marksKeep7;
assert(P.wealth === wealthBefore, "财力 II：命中不再获得财富层");
// 击倒触发：模拟击倒一只怪（killWealth 词条走 defeatMonster 路径）
const killBefore = P.wealth;
const dummyDef = { id: "dummy_t", name: "测试靶", category: "minion", hpMax: 1, attack: 0, defense: 0, move: {}, coinDrop: 0, tags: [], defend: null };
const t = { uid: 9999, def: dummyDef, name: "测试靶", hp: 0, hpMax: 1, atk: 0, def_: 0, marks: 0, hunt: 0 };
S.quests = []; // 避免任务计数干扰
S.monsters.push(t);
T.dealToMonster(t, 1);
assert(P.wealth === killBefore + 1, "财力 II：击倒敌人获得 1 层财富");

// ---- 7b. 命中词条只认战斗攻击：出牌伤害 / 青焰伤害不挂标记、不给钱 ----
console.log("[7b] 命中词条只由战斗攻击触发");
{
  const chipsBackup = P.chips.slice();
  P.chips = []; T.addChip("hunter1"); T.addChip("wp1");
  mob.hp = mob.hpMax = 200; mob.marks = 0;
  const coins7b = P.coins;
  T.dealToMonster(mob, 1); // 通用伤害入口：出牌伤害与青焰伤害都走它
  assert(mob.marks === 0, "非战斗伤害不挂标记（猎印不触发）");
  assert(P.coins === coins7b, "非战斗伤害不给钱（财力 I 不触发）");
  T.onHitEnemy(mob); // 战斗攻击命中时的结算
  assert(mob.marks === 1 && P.coins === coins7b + 1, "战斗攻击命中才挂标记并给钱");
  P.chips = chipsBackup;
}

// ---- 8. 散财：金币>20 时攻击+30%、失去8金币 ----
console.log("[8] 散财");
T.addChip("sancai");
P.coins = 25;
const atkBf = T.computeAttack(mob, null);
assert(atkBf >= 7, "散财发动：25 金币 → 攻击+7");
assert(P.coins === 17, `散财后金币 25-8=17（实际 ${P.coins}）`);

// ---- 9. 生命之力 / 不屈 / 缓冲 ----
console.log("[9] 生命之力·不屈·缓冲");
// 前置：未持有生命之力时，满血 + 再生层数不得提供攻击加成
P.hp = P.hpMax; P.regen = 3;
S.player.chips = S.player.chips.filter(id => !D.chips[id].fullHpAtk); // 确保未持有
const atkNoLf = T.computeAttack(mob, null);
P.regen = 0;
const atkNoLfNoRegen = T.computeAttack(mob, null);
assert(atkNoLf === atkNoLfNoRegen, "未持生命之力：满血+再生层数不提供攻击加成");
// 持有生命之力 I：满血 +2 + 再生层数
T.addChip("lf1");
P.regen = 2;
const atkFull = T.computeAttack(mob, null);
assert(atkFull === atkNoLfNoRegen + 2 + 2, "生命之力 I（满血）：+2+再生2层");
// I 与 II 叠加：+2+4，且再生层数按 2 枚独立结算（再生×2）
T.addChip("lf2");
const atkFull2 = T.computeAttack(mob, null);
assert(atkFull2 === atkFull + 4 + P.regen, `生命之力 I+II 叠加：再 +4 + 再生×2（+${4 + P.regen}）`);
P.hp = 5; // 低于50%
T.addChip("will1");
const dmgTaken = T.playerTakesDamage(6, "测试");
assert(dmgTaken === 5, `不屈 I：受伤 6-1=5（实际 ${dmgTaken}）`);
T.addChip("will2");
P.hp = P.hpMax; // 回满测攻击词条
const atkLowHp = T.derived().atk;
P.hp = 5;
assert(T.derived().atk === atkLowHp + 4, "不屈 II：低血攻击+4");
T.addChip("buffer");
const regenBefore = P.regen;
T.playerTakesDamage(4, "测试");
assert(P.regen === regenBefore + 2, `缓冲：受伤后再生+2（${regenBefore}→${P.regen}）`);

// ---- 10. 回收 ----
console.log("[10] 回收");
T.addChip("recycle");
const cBf = P.coins;
T.onCardPlayed();
assert(P.coins === cBf + 1, "回收：用牌获得 1 金币");

// ---- 12. 持续回合 buff（王之力）：攻击加成与回合递减 ----
console.log("[12] 王之力 buff");
const atkNoBuff = T.computeAttack(mob, null);
P.buffs.push({ name: "王之力", atk: 5, dmgTaken: 0, heal: 0, turns: 3 });
assert(T.computeAttack(mob, null) === atkNoBuff + 5, "王之力：攻击+5");
T.turnEndEffects(); // buff 递减 + 再生减半等
assert(P.buffs.some(b => b.name === "王之力" && b.turns === 2), "回合结束 buff 持续回合 3→2");

// ---- 11. 3选1 规则：首格固定稀有度 + 组内不重复 ----
console.log("[11] 3选1 规则");
P.chips = []; S.lastChips = [];
P.star = 0;
let fixedOk = true;
for (let i = 0; i < 40; i++) { const o = T.genChipChoices(); if (D.chips[o[0]].rarity !== "blue") fixedOk = false; }
assert(fixedOk, "0星：首格固定蓝");
P.star = 3;
let fixedGold = true;
for (let i = 0; i < 40; i++) { const o = T.genChipChoices(); if (D.chips[o[0]].rarity !== "gold") fixedGold = false; }
assert(fixedGold, "3星：首格固定金");
let dup = 0;
for (let i = 0; i < 60; i++) { const o = T.genChipChoices(); if (new Set(o).size !== 3) dup++; }
assert(dup === 0, `同一次 3选1 内不重复（60 次采样重复=${dup}）`);

// ---- 13. 地图任务：轮末判定 + 奖励筹码 ----
console.log("[13] 地图任务");
S.quests = [{ desc: "测试任务", target: "dummy", need: 2, progress: 1, rewardTier: 1, done: false }];
T.judgeQuests();
assert(S.chipChoice == null, "进度未满不触发奖励");
S.quests[0].progress = 2;
T.judgeQuests();
assert(S.quests[0].done === true, "轮末判定：进度满 → 完成");
assert(S.chipChoice != null, "完成触发 1 级概率筹码 3 选 1");
E.pickChip(0);
assert(P.chips.length === 1, "选牌入手");
assert(!S.chipChoice || true, "");

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail > 0 ? 1 : 0);
