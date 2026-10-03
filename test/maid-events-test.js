// 女仆咖啡厅事件与任务测试（node test/maid-events-test.js）
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

const E = window.Engine, X = window.Engine._test;
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const at = (S, id, pos) => S.monsters.filter(m => m.def.id === id && (pos == null || m.pos === pos));
const setup = (diff) => {
  window.GAME_DATA.diff = diff || "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
  E.newGame();
  E.state.aiBusy = true;
  return E.state;
};

console.log("[1] 第 1 轮：咖啡厅开业");
const S1 = setup();
check("四名女仆精灵出现在四个刷怪格（1/17/23/29）",
  [1, 17, 23, 29].every(p => at(S1, "maid_sprite", p).length === 1) && at(S1, "maid_sprite").length === 4);
check("女仆安若素登场于升级点（21）", at(S1, "maid_anruosu", 21).length === 1);
check("开局不刷苏桃夭/缇娜/晕彩", at(S1, "maid_sutaoyao").length === 0 && at(S1, "maid_tina").length === 0 && at(S1, "maid_yuncai").length === 0);
check("事件生成怪物的移动方向随机（initRandom）", S1.monsters.every(m => m.initRandom === true));

console.log("[2] 第 4 轮：呼叫员工");
X.endRound(); X.endRound(); X.endRound(); // 1 → 4 轮
const S4 = E.state;
check(`推进到第 4 轮（当前 ${S4.round} 轮）`, S4.round === 4);
check("四名女仆精灵出现在四个商店格（6/12/25/31）",
  [6, 12, 25, 31].every(p => at(S4, "maid_sprite", p).length === 1));
check("女仆苏桃夭刷新在左侧事件格（22）", at(S4, "maid_sutaoyao", 22).length === 1);
check("女仆缇娜刷新在右侧事件格（28）", at(S4, "maid_tina", 28).length === 1);
const tao4 = at(S4, "maid_sutaoyao")[0], tina4 = at(S4, "maid_tina")[0];

console.log("[3] 第 8 轮：魔王号令");
const beforeAtk = tao4.atk, beforeDef = tao4.def_;
X.endRound(); X.endRound(); X.endRound(); X.endRound(); // 4 → 8 轮
const S8 = E.state;
check(`推进到第 8 轮（当前 ${S8.round} 轮）`, S8.round === 8);
check("四名女仆精灵刷新在四个掉血格（7/11/26/32）",
  [7, 11, 26, 32].every(p => at(S8, "maid_sprite", p).length === 1));
check(`所有敌人攻防 +1（苏桃夭 ${beforeAtk}/${beforeDef} → ${tao4.atk}/${tao4.def_}）`,
  tao4.atk === beforeAtk + 1 && tao4.def_ === beforeDef + 1);
check("精英同样获得加成", tina4.atk === 5 && tina4.def_ === 3);

console.log("[4] 第 11 轮：最终扫除");
const atk11 = tao4.atk, def11 = tao4.def_;
X.endRound(); X.endRound(); X.endRound(); // 8 → 11 轮
const S11 = E.state;
check(`推进到第 11 轮（当前 ${S11.round} 轮）`, S11.round === 11);
check(`所有敌人攻防再 +2（苏桃夭 ${atk11}/${def11} → ${tao4.atk}/${tao4.def_}）`,
  tao4.atk === atk11 + 2 && tao4.def_ === def11 + 2);

console.log("[5] 任务：击败女仆精灵 4 / 9 只");
const S5 = setup();
const sprites5 = at(S5, "maid_sprite");
X.dealToMonster(sprites5[0], 999); X.dealToMonster(sprites5[1], 999); X.dealToMonster(sprites5[2], 999);
X.dealToMonster(sprites5[3], 999);
check("击杀 4 只精灵后计数为 4", S5.quests[0].progress === 4);
X.judgeQuests();
check("任务「击败女仆精灵 4 只」完成并弹出 1 级筹码选择",
  S5.quests[0].done === true && ((S5.chipChoice && S5.chipChoice.tier === 1) || S5.chipQueue.length >= 1));
check("二级任务（9 只）未完成", S5.quests[2].done === false);
S5.chipQueue.length = 0; S5.chipChoice = null;
for (let i = 0; i < 5; i++) { const m = X.spawnMonster("maid_sprite", 5); X.dealToMonster(m, 999); }
check("累计击杀 9 只后二级任务进度达标", S5.quests[2].progress === 9);
X.judgeQuests();
check("任务「击败女仆精灵 9 只」完成（奖励 2 级）", S5.quests[2].done === true && S5.quests[2].rewardTier === 2);

console.log("[6] 任务：安若素 / 苏桃夭与缇娜 / 晕彩分身");
const S6 = setup();
const an6 = at(S6, "maid_anruosu")[0];
X.dealToMonster(an6, 999);
check("击败安若素计数 1/1", S6.quests[1].progress === 1);
const S6b = setup();
const round0 = 5;
S6b.round = round0;                // 模拟任务在第 5 轮完成（第 1 轮无处可退，另有兜底断言在下方）
const tao6 = X.spawnMonster("maid_sutaoyao", 5), tina6 = X.spawnMonster("maid_tina", 6);
X.dealToMonster(tao6, 999);
check("击败苏桃夭后（与缇娜同一任务）进度 1/2", S6b.quests[3].progress === 1 && S6b.quests[3].done === false);
X.dealToMonster(tina6, 999);
X.judgeQuests();
check("苏桃夭 + 缇娜合计 2 只完成任务（三级筹码）", S6b.quests[3].done === true && S6b.quests[3].rewardTier === 3);
check(`奖励「轮次进度 -1」即时回退轮次（第 ${round0} → ${S6b.round} 轮）`, S6b.round === round0 - 1);
// 回退后再次经过该轮：轮次开始效果必须去重，不得重复刷怪
const sprites8 = S6b.monsters.filter(m => m.def.id === "maid_sprite").length;
S6b.round = 8;                     // 第 8 轮事件【魔王号令】会刷 4 只女仆精灵
X.fireRoundStartEffects(8);
const sprites8b = S6b.monsters.filter(m => m.def.id === "maid_sprite").length;
S6b.round = 7; X.fireRoundStartEffects(8); // 回退后再次经过第 8 轮
check(`第 8 轮事件首次触发会刷怪（+${sprites8b - sprites8} 只）`, sprites8b - sprites8 === 4);
check("回退后再次经过第 8 轮：不重复刷怪", S6b.monsters.filter(m => m.def.id === "maid_sprite").length === sprites8b);
// 兜底：已在第 1 轮时无处可退，改为延长总轮数（奖励不落空）
const S6d = setup();
const limit1 = S6d.roundsLimit;
X.rewindRoundProgress(1);
check("第 1 轮无法回退：改为总轮数 +1", S6d.round === 1 && S6d.roundsLimit === limit1 + 1);
const S6c = setup();
const c1 = X.spawnMonster("maid_yuncai_clone", 5), c2 = X.spawnMonster("maid_yuncai_clone", 6);
X.dealToMonster(c1, 999); X.dealToMonster(c2, 999);
X.judgeQuests();
check("击败晕彩分身 2 个完成任务（二级筹码）", S6c.quests[4].done === true && S6c.quests[4].rewardTier === 2);
check("分身掉落 8 金币", S6c.player.coins >= 16);

console.log("[7] 胜利条件：晕彩救援刷出的 BOSS 被击败即获胜");
const S7 = setup();
const an7 = at(S7, "maid_anruosu")[0];
X.dealToMonster(an7, an7.hpMax - Math.floor(an7.hpMax * 0.3) + 1); // 降至30%阈值以下，触发救援
const yc7 = at(S7, "maid_yuncai")[0];
check("晕彩在升级点（21）登场且方向随机", !!yc7 && yc7.pos === 21 && yc7.initRandom === true);
X.dealToMonster(yc7, 9999);
check("击败晕彩即获胜（S.over 且非败北）", S7.over === true && S7.win === true);

console.log("[8] 晕彩救援保底：安若素被一次击倒也触发");
const S9 = setup();
const an9 = at(S9, "maid_anruosu")[0];
check("初始未触发救援", S9.yuncaiRescued === false);
X.dealToMonster(an9, 999); // 一次打死：不经过 30% 血线判定
const yc9 = at(S9, "maid_yuncai")[0];
check("击倒即保底触发救援（晕彩登场）", !!yc9 && S9.yuncaiRescued === true);
check("晕彩出现在升星点（21）且方向随机", !!yc9 && yc9.pos === 21 && yc9.initRandom === true);
check("安若素已从场上移除", at(S9, "maid_anruosu").length === 0);
check("同局不重复触发（场上仍只有一只 BOSS）", at(S9, "maid_yuncai").length === 1);

console.log("[9] 进度事件攻防加成改为全局生效（含此后刷出的敌人）");
const S10 = setup();
S10.monsters = []; // 清空第 1 轮事件刷出的怪，控制变量
const old10 = X.spawnMonster("maid_sprite", 5);
check("事件前按基础值登场（2/0）", old10.atk === 2 && old10.def_ === 0);
S10.round = 8; X.startRound(); // 魔王号令 +1/+1
check("在场敌人立即获得 +1/+1（3/1）", old10.atk === 3 && old10.def_ === 1);
const after8 = X.spawnMonster("maid_sprite", 10);
check("事件之后刷出的新敌人同样带 +1/+1（3/1）", after8.atk === 3 && after8.def_ === 1);
const boss10 = X.spawnMonster("maid_yuncai", 21);
check("BOSS 也吃事件加成（常态事件含 BOSS：4/2 → 5/3）", boss10.atk === 5 && boss10.def_ === 3);
S10.round = 11; X.startRound(); // 最终扫除 +2/+2
check("第 11 轮后，第 8 轮之后刷出的敌人累计 +3/+3（5/3）", after8.atk === 5 && after8.def_ === 3);
const after11 = X.spawnMonster("maid_sprite", 11);
check("第 11 轮之后刷出的敌人同样累计 +3/+3（5/3）", after11.atk === 5 && after11.def_ === 3);
check("全局强化记录：普通 +3/+3、BOSS +3/+3",
  S10.globalBonus.atk === 3 && S10.globalBonus.def === 3 &&
  S10.globalBonus.bossAtk === 3 && S10.globalBonus.bossDef === 3);
check("已存在的敌人不会被重复叠加（在场怪仍是 5/3）", old10.atk === 5 && old10.def_ === 3);
// 旧地图效果（allMonstersPlus1）同样全局生效，但明确不含 BOSS
// 原 test_ring 已下线：仅存的 allMonstersPlus1 旧效果在环心捷径（第 5 轮）上
window.GAME_DATA.diff = "normal";
window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord;
E.newGame();
const S12 = E.state; S12.aiBusy = true; S12.monsters = [];
const base12 = X.spawnMonster("dummy", 5);
const b0 = base12.atk, d0 = base12.def_;
S12.round = window.GAME_DATA.maps.ring_chord.globalEvents[0].round; X.startRound();
check("旧地图效果：在场敌人 +1/+1", base12.atk === b0 + 1 && base12.def_ === d0 + 1);
const nb12 = X.spawnMonster("dummy", 9);
check("旧地图效果：此后刷出的敌人同样 +1/+1", nb12.atk === b0 + 1 && nb12.def_ === d0 + 1);
check("旧地图效果不含 BOSS（bossAtk 未累加）",
  S12.globalBonus.bossAtk === 0 && S12.globalBonus.bossDef === 0 && S12.globalBonus.atk === 1);

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
