// 卡牌实验室机制测试：游荡魔物吸收进化、奇美拉万魔之王、变彩卡牌融合与卡牌守护
// （node test/card-lab-mechanics-test.js）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");

const fs = require("fs"), path = require("path");
require("../js/engine.js");

const D = window.GAME_DATA, E = window.Engine, X = window.Engine._test;
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const M = (id) => D.monsters[id];
const of = (id) => E.state.monsters.filter(m => m.def.id === id);

(async () => {
  // ---- [1] 数据契约：数值分档与标签 ----
  console.log("[1] 怪物数值与标签");
  check("五个新定义齐全",
    ["lab_wander", "lab_thunderbird", "lab_cerberus", "lab_chimera", "lab_variant"].every(id => !!M(id)));
  check("游荡魔物 5/3/0，4 金币", M("lab_wander").hpMax === 5 && M("lab_wander").attack === 3 && M("lab_wander").defense === 0 && M("lab_wander").coinDrop === 4);
  check("游荡魔物：主动攻击且不反击", M("lab_wander").tags.includes("aggressive") && !M("lab_wander").tags.includes("counter"));
  check("雷鸟 8/3/2，8 金币，移速 3（基础 1 + 被动 2）",
    M("lab_thunderbird").hpMax === 8 && M("lab_thunderbird").attack === 3 && M("lab_thunderbird").defense === 2 &&
    M("lab_thunderbird").coinDrop === 8 && M("lab_thunderbird").move.steps === 3);
  check("雷鸟：不主动攻击但会反击，且带掠过伤害被动",
    !M("lab_thunderbird").tags.includes("aggressive") && M("lab_thunderbird").tags.includes("counter") &&
    M("lab_thunderbird").passives.some(p => p.effect === "passDamage"));
  check("三头犬 10/4/3，8 金币，主动 + 反击",
    M("lab_cerberus").hpMax === 10 && M("lab_cerberus").attack === 4 && M("lab_cerberus").defense === 3 &&
    M("lab_cerberus").coinDrop === 8 && M("lab_cerberus").tags.includes("aggressive") && M("lab_cerberus").tags.includes("counter"));
  check("奇美拉 28/2/4，16 金币，增生 CD2 + 万魔之王",
    M("lab_chimera").hpMax === 28 && M("lab_chimera").attack === 2 && M("lab_chimera").defense === 4 &&
    M("lab_chimera").coinDrop === 16 && M("lab_chimera").skill.effect === "spawnAround" && M("lab_chimera").skill.cooldown === 2 &&
    M("lab_chimera").passives.some(p => p.effect === "devourMinions"));
  check("变彩 66/4/3，驻守不动、不攻击、不反击",
    M("lab_variant").hpMax === 66 && M("lab_variant").attack === 4 && M("lab_variant").defense === 3 &&
    M("lab_variant").move.stationary === true && !M("lab_variant").tags.includes("aggressive") && !M("lab_variant").tags.includes("counter"));
  check("变彩：卡牌融合 CD2 + 卡牌守护",
    M("lab_variant").skill.effect === "fuseMinions" && M("lab_variant").skill.cooldown === 2 &&
    M("lab_variant").passives.some(p => p.effect === "bossAura"));
  check("困难档数值：游荡 5/3、雷鸟 9、三头犬 11、奇美拉 30、变彩 72",
    M("lab_wander").diffStats.hard.hpMax === 5 && M("lab_wander").diffStats.hard.attack === 3 &&
    M("lab_thunderbird").diffStats.hard.hpMax === 9 && M("lab_cerberus").diffStats.hard.hpMax === 11 &&
    M("lab_chimera").diffStats.hard.hpMax === 30 && M("lab_variant").diffStats.hard.hpMax === 72);
  check("噩梦档数值：游荡 6/4、雷鸟 10/4、三头犬 12/5、奇美拉 32/3、变彩 77/5",
    M("lab_wander").diffStats.nightmare.hpMax === 6 && M("lab_wander").diffStats.nightmare.attack === 4 &&
    M("lab_thunderbird").diffStats.nightmare.hpMax === 10 && M("lab_thunderbird").diffStats.nightmare.attack === 4 &&
    M("lab_cerberus").diffStats.nightmare.hpMax === 12 && M("lab_cerberus").diffStats.nightmare.attack === 5 &&
    M("lab_chimera").diffStats.nightmare.hpMax === 32 && M("lab_chimera").diffStats.nightmare.attack === 3 &&
    M("lab_variant").diffStats.nightmare.hpMax === 77 && M("lab_variant").diffStats.nightmare.attack === 5);
  check("疯狂档数值：游荡 7/4、雷鸟 12/4、三头犬 14/5、奇美拉 36/4、变彩 88/5",
    M("lab_wander").diffStats.crazy.hpMax === 7 && M("lab_wander").diffStats.crazy.attack === 4 &&
    M("lab_thunderbird").diffStats.crazy.hpMax === 12 && M("lab_thunderbird").diffStats.crazy.attack === 4 &&
    M("lab_cerberus").diffStats.crazy.hpMax === 14 && M("lab_cerberus").diffStats.crazy.attack === 5 &&
    M("lab_chimera").diffStats.crazy.hpMax === 36 && M("lab_chimera").diffStats.crazy.attack === 4 &&
    M("lab_variant").diffStats.crazy.hpMax === 88 && M("lab_variant").diffStats.crazy.attack === 5);
  check("五个新定义的贴图文件都存在",
    ["lab_wander", "lab_thunderbird", "lab_cerberus", "lab_chimera", "lab_variant"]
      .every(id => fs.existsSync(path.join(__dirname, "..", M(id).art.full))));

  // ---- [2] 开局铺怪 ----
  console.log("[2] 开局布阵");
  D.map = D.maps.card_lab;
  D.player = D.characters.char_pixel_meow;
  D.diff = "normal";
  E.newGame();
  const S = E.state;
  check("开局铺 6 只游荡魔物（= 6 个刷怪格）", of("lab_wander").length === 6);
  check("变彩驻守 16 号格（下边中央）", of("lab_variant").length === 1 && of("lab_variant")[0].pos === 16);
  check("开局场上共 7 只敌人", S.monsters.length === 7);

  // ---- [3] 游荡魔物互相吸收 ----
  console.log("[3] 游荡魔物的吸收进化");
  S.monsters = [];
  const a = X.makeMonster(M("lab_wander"), 5), b = X.makeMonster(M("lab_wander"), 5);
  a.lastFrom = 4;
  S.monsters.push(a, b);
  const coins0 = S.player.coins, quest0 = S.quests.map(q => q.progress);
  check("同格两只游荡魔物可吸收", X.devourMinion(a) === true);
  check("两只素材都被替换（场上只剩产物）", S.monsters.length === 1 && !S.monsters.includes(a) && !S.monsters.includes(b));
  const fused = S.monsters[0];
  check("产物是雷鸟或三头犬", ["lab_thunderbird", "lab_cerberus"].includes(fused.def.id));
  check("产物满血", fused.hp === fused.hpMax && fused.hp > 0);
  check("产物本回合不再行动（fusedRound = 当前轮）", fused.fusedRound === S.round);
  check("产物继承移动方来路（下回合不掉头）", fused.lastFrom === 4);
  check("吸收不计击败：金币与任务进度均不变",
    S.player.coins === coins0 && S.quests.every((q, i) => q.progress === quest0[i]));
  S.monsters = [];
  const c1 = X.makeMonster(M("lab_wander"), 5), c2 = X.makeMonster(M("lab_cerberus"), 5);
  S.monsters.push(c1, c2);
  check("跨阶不吸收（小怪与精英同格无反应）", X.devourMinion(c1) === false && S.monsters.length === 2);

  // ---- [4] 奇美拉「万魔之王」 ----
  console.log("[4] 奇美拉万魔之王（普通难度：每 2 只 +1 攻击）");
  S.monsters = [];
  const chim = X.makeMonster(M("lab_chimera"), 8);
  const prey1 = X.makeMonster(M("lab_wander"), 8), prey2 = X.makeMonster(M("lab_wander"), 8);
  S.monsters.push(chim, prey1, prey2);
  const atk0 = chim.atk;
  check("吸收同格游荡魔物成立", X.absorbMinions(chim) === true);
  check("两只游荡魔物被移除", S.monsters.length === 1 && !S.monsters.includes(prey1) && !S.monsters.includes(prey2));
  check("普通难度：吃 2 只只 +1 攻击（累计 2/2）", chim.atk === atk0 + 1 && chim.devourCount === 2);
  check("无游荡魔物同格时不触发", X.absorbMinions(chim) === false);
  const atkBefore = chim.atk;
  S.monsters.push(X.makeMonster(M("lab_wander"), 8));
  X.absorbMinions(chim);
  check("累计第 3 只未跨过新阈值：攻击力不变（累计 3/2）", chim.atk === atkBefore && chim.devourCount === 3);
  S.monsters.push(X.makeMonster(M("lab_wander"), 8));
  X.absorbMinions(chim);
  check("累计第 4 只跨过阈值：再 +1（累计 4/2）", chim.atk === atkBefore + 1 && chim.devourCount === 4);
  // 单向：只有奇美拉自己移动才吸收，小怪路过奇美拉不被吃
  S.monsters = [];
  const chimB = X.makeMonster(M("lab_chimera"), 8);
  const walker = X.makeMonster(M("lab_wander"), 8);
  S.monsters.push(chimB, walker);
  check("单向：小怪作为移动方不会吸收奇美拉",
    X.absorbMinions(walker) === false && S.monsters.includes(walker) && S.monsters.length === 2);
  check("单向：奇美拉作为移动方才会吸收", X.absorbMinions(chimB) === true && !S.monsters.includes(walker));
  // 难度分档：噩梦难度每只 +1
  D.diff = "nightmare";
  S.monsters = [];
  const chimN = X.makeMonster(M("lab_chimera"), 8);
  S.monsters.push(chimN, X.makeMonster(M("lab_wander"), 8), X.makeMonster(M("lab_wander"), 8));
  const atkN = chimN.atk;
  X.absorbMinions(chimN);
  check("噩梦难度：吃 2 只 +2 攻击（每只 +1）", chimN.atk === atkN + 2);
  D.diff = "normal";

  // ---- [5] 变彩「卡牌守护」 ----
  console.log("[5] 卡牌守护（动态光环）");
  S.monsters = [];
  const boss = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss);
  check("场上只有自己时无光环", X.auraBonus(boss).atk === 0 && X.effDef(boss) === boss.def_ && X.effAtk(boss) === boss.atk);
  S.monsters.push(X.makeMonster(M("lab_wander"), 1), X.makeMonster(M("lab_wander"), 2));
  check("场上 2 只其他怪：攻防各 +2", X.auraBonus(boss).atk === 2 && X.auraBonus(boss).def === 2);
  check("effAtk / effDef 计入光环", X.effAtk(boss) === boss.atk + 2 && X.effDef(boss) === boss.def_ + 2);
  check("光环不写回基础值（击倒小怪即刻回落）",
    (S.monsters = [boss], X.auraBonus(boss).atk === 0 && X.effAtk(boss) === boss.atk));

  // ---- [6] 变彩「卡牌融合」 ----
  console.log("[6] 卡牌融合");
  S.monsters = [];
  const boss2 = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss2, X.makeMonster(M("lab_wander"), 17));
  X.runMonsterSkill(boss2);
  check("素材不足（仅 1 只）时不发动、不进 CD", boss2.skillCd === 0 && S.monsters.length === 2);
  S.monsters.push(X.makeMonster(M("lab_wander"), 15));
  X.runMonsterSkill(boss2);
  check("两只游荡魔物被消耗", of("lab_wander").length === 0);
  check("生成一只一级精英（雷鸟或三头犬）",
    S.monsters.filter(m => ["lab_thunderbird", "lab_cerberus"].includes(m.def.id)).length === 1);
  check("产物落在变彩周围 2 步内（按图距离，含中腔室底部 31/37 号格）",
    E.graphDist(S.monsters.find(m => m.def.category === "elite").pos, 16) <= 2);
  check("技能进入 CD 2", boss2.skillCd === 2);
  check("CD 未走完时不再发动", (S.monsters.push(X.makeMonster(M("lab_wander"), 17), X.makeMonster(M("lab_wander"), 15)), X.runMonsterSkill(boss2), of("lab_wander").length === 2));

  // ---- [6b] 卡牌融合的档位优先级：小怪档优先，只有小怪不足时才动用精英档 ----
  console.log("[6b] 卡牌融合·档位优先级（小怪优先）");
  S.monsters = [];
  const boss4 = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss4, X.makeMonster(M("lab_thunderbird"), 15), X.makeMonster(M("lab_cerberus"), 17));
  X.runMonsterSkill(boss4);
  check("两只一级精英被消耗", S.monsters.filter(m => ["lab_thunderbird", "lab_cerberus"].includes(m.def.id)).length === 0);
  check("生成二级精英奇美拉", of("lab_chimera").length === 1);
  check("奇美拉落在变彩周围 2 步内", E.graphDist(of("lab_chimera")[0].pos, 16) <= 2);
  check("该档位同样进入 CD 2", boss4.skillCd === 2);
  S.monsters = [];
  const boss5 = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss5, X.makeMonster(M("lab_thunderbird"), 15), X.makeMonster(M("lab_cerberus"), 17),
    X.makeMonster(M("lab_wander"), 14), X.makeMonster(M("lab_wander"), 18));
  X.runMonsterSkill(boss5);
  check("小怪与精英同时在场时优先走小怪档，不出奇美拉", of("lab_chimera").length === 0);
  check("小怪素材被消耗", of("lab_wander").length === 0);
  check("一级精英未被消耗，反而多出一只产物（2 → 3）",
    S.monsters.filter(m => ["lab_thunderbird", "lab_cerberus"].includes(m.def.id)).length === 3);

  // ---- [6c] 融合素材无距离限制：radius 只约束产物落点 ----
  console.log("[6c] 卡牌融合·素材无距离限制");
  S.monsters = [];
  const boss6 = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss6, X.makeMonster(M("lab_wander"), 0), X.makeMonster(M("lab_wander"), 6));
  X.runMonsterSkill(boss6);
  check("远处小怪同样可作素材（0 / 6 号格，距变彩 (3,7) 很远）", of("lab_wander").length === 0);
  const fused6 = S.monsters.filter(m => ["lab_thunderbird", "lab_cerberus"].includes(m.def.id));
  check("产物仍落在变彩周围 2 格内，而不是素材原格",
    fused6.length === 1 && E.graphDist(fused6[0].pos, 16) <= 2);

  // ---- [7] 奇美拉「魔物增生」 ----
  console.log("[7] 魔物增生");
  S.monsters = [];
  const chim2 = X.makeMonster(M("lab_chimera"), 8);
  S.monsters.push(chim2);
  X.runMonsterSkill(chim2);
  check("周围生成 2 只游荡魔物", of("lab_wander").length === 2);
  check("生成位置在奇美拉周围 2 格内", of("lab_wander").every(m => E.graphDist(m.pos, 8) <= 2));
  check("技能进入 CD 2", chim2.skillCd === 2);

  // ---- [8] 雷鸟掠过伤害 ----
  console.log("[8] 雷鸟掠过");
  S.monsters = [];
  const bird = X.makeMonster(M("lab_thunderbird"), 4); // (4,0)
  S.monsters.push(bird);
  S.player.pos = 5;                 // (5,0)：雷鸟的下一步
  S.player.hp = S.player.hpMax;
  bird.queuedNext = 5;
  bird.lastFrom = 3;
  const hp0 = S.player.hp;
  S.move = { who: bird, steps: 1, attacked: false, done: () => {}, prev: 3 };
  await X.stepMonster();
  check("雷鸟掠过玩家造成自身攻击力（3）的伤害", S.player.hp === hp0 - M("lab_thunderbird").attack);
  check("掠过不进入战斗界面", !S.battle);

  // ---- [9] 驻守怪也会结算技能 ----
  console.log("[9] 驻守怪行动");
  S.monsters = [];
  const boss3 = X.makeMonster(M("lab_variant"), 16);
  S.monsters.push(boss3, X.makeMonster(M("lab_wander"), 15), X.makeMonster(M("lab_wander"), 17));
  S.round = 3;
  boss3.skillCd = 1;
  check("驻守标记生效（move.stationary）", boss3.def.move.stationary === true);
  E.state.monsters.forEach(m => { m.fusedRound = undefined; });
  check("驻守怪不在移动序列里被跳过技能（技能由 aiTurns 直接结算）", typeof X.runMonsterSkill === "function");

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
