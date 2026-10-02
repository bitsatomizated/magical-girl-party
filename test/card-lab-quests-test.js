// 卡牌实验室任务测试：五条任务的计数、多目标共用进度、发奖与轮次进度 -1
// （node test/card-lab-quests-test.js）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");

require("../js/engine.js");

const D = window.GAME_DATA, E = window.Engine, X = E._test;
const M = D.maps.card_lab;
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

D.map = M;
D.player = D.characters.char_pixel_meow;
D.diff = "normal";
E.newGame();
const S = E.state, Q = S.quests;

// 取走已完成任务发出的筹码（模拟玩家选完），返回发过的等级列表
const drain = () => {
  const tiers = [];
  if (S.chipChoice) { tiers.push(S.chipChoice.tier); S.chipChoice = null; }
  (S.chipQueue || []).forEach(i => tiers.push(i.tier));
  S.chipQueue = [];
  return tiers;
};
const kill = (id) => { const m = X.makeMonster(D.monsters[id], 5); S.monsters.push(m); X.defeatMonster(m); };

// ---- [1] 任务表契约 ----
console.log("[1] 任务表契约");
check("共 5 条任务", Q.length === 5);
check("任务 1：游荡魔物 4 只 → 一级筹码", Q[0].targets.join() === "lab_wander" && Q[0].need === 4 && Q[0].rewardTier === 1);
check("任务 2：游荡魔物 9 只 → 二级筹码", Q[1].targets.join() === "lab_wander" && Q[1].need === 9 && Q[1].rewardTier === 2);
check("任务 3：一级精英 2 只 → 二级筹码", Q[2].targets.join() === "lab_thunderbird,lab_cerberus" && Q[2].need === 2 && Q[2].rewardTier === 2);
check("任务 4：奇美拉 1 只 → 三级筹码 + 轮次进度 -1",
  Q[3].targets.join() === "lab_chimera" && Q[3].need === 1 && Q[3].rewardTier === 3 && Q[3].extra === "roundProgressMinus1");
check("任务 5：一级精英 4 只 → 三级筹码", Q[4].targets.join() === "lab_thunderbird,lab_cerberus" && Q[4].need === 4 && Q[4].rewardTier === 3);
check("开局五条任务进度均为 0 且未完成", Q.every(q => q.progress === 0 && !q.done));

// ---- [2] 小怪的两条任务按同一次击倒各自累计 ----
console.log("[2] 小怪任务（4 / 9）");
[1, 2, 3, 4].forEach(() => kill("lab_wander"));
check("击倒 4 只：任务 1 与任务 2 进度同为 4", Q[0].progress === 4 && Q[1].progress === 4);
X.judgeQuests();
check("任务 1 完成并入队一级筹码", Q[0].done && drain().includes(1));
check("任务 2 未完成（4/9）", !Q[1].done);
[5, 6, 7, 8, 9].forEach(() => kill("lab_wander"));
check("击倒满 9 只：任务 2 进度 9", Q[1].progress === 9);
X.judgeQuests();
check("任务 2 完成并入队二级筹码", Q[1].done && drain().includes(2));

// ---- [3] 一级精英的两条任务共用同一进度 ----
console.log("[3] 一级精英任务（2 / 4，多目标共用进度）");
kill("lab_thunderbird");
kill("lab_cerberus");
check("击倒雷鸟与三头犬各 1 只：任务 3 与任务 5 均为 2", Q[2].progress === 2 && Q[4].progress === 2);
X.judgeQuests();
check("任务 3 完成（2/2）→ 二级筹码", Q[2].done && drain().includes(2));
check("任务 5 未完成（2/4）", !Q[4].done);
kill("lab_thunderbird");
kill("lab_cerberus");
X.judgeQuests();
check("任务 5 完成（4/4）→ 三级筹码", Q[4].done && drain().includes(3));

// ---- [4] 奇美拉任务与轮次进度 -1 ----
console.log("[4] 奇美拉任务（含地图进度 -1）");
kill("lab_chimera");
check("击倒奇美拉：任务 4 进度 1", Q[3].progress === 1);
S.round = 5;
X.judgeQuests();
check("任务 4 完成 → 三级筹码", Q[3].done && drain().includes(3));
check("同时触发轮次进度 -1（第 5 轮 → 第 4 轮）", S.round === 4);
Q[3].done = false; Q[3].progress = 1;
S.round = 1;
const limitBefore = S.roundsLimit;
X.judgeQuests();
check("已在第 1 轮时：轮次进度 -1 转为总轮数 +1（不会退到第 0 轮）",
  S.round === 1 && S.roundsLimit === limitBefore + 1);

// ---- [5] 吸收与融合不推进任务 ----
console.log("[5] 吸收/融合不计入任务");
S.quests.forEach(q => { q.progress = 0; q.done = false; });
S.monsters = [];
const a = X.makeMonster(D.monsters.lab_wander, 5), b = X.makeMonster(D.monsters.lab_wander, 5);
S.monsters.push(a, b);
check("两只小怪互相吸收成立", X.devourMinion(a) === true);
check("吸收后五条任务进度仍全为 0", S.quests.every(q => q.progress === 0));
check("场上出现了一只一级精英（产物，同样不计任务）", S.monsters.some(m => ["lab_thunderbird", "lab_cerberus"].includes(m.def.id)));
const before = S.quests.map(q => q.progress);
S.monsters = [X.makeMonster(D.monsters.lab_chimera, 8), X.makeMonster(D.monsters.lab_wander, 8)];
check("奇美拉吸收同格小怪成立", X.absorbMinions(S.monsters[0]) === true);
check("奇美拉吸收后五条任务进度仍全为 0",
  S.quests.every(q => q.progress === 0) && before.every(p => p === 0));
check("奇美拉因此得到攻击力成长，但未触发任何击倒", Q[3].progress === 0);

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
