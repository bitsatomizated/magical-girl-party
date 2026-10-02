// 洛可可与甜品使魔测试：主动【甜品登场】/ 被动【治愈魔法】/ 友方召唤物规则
// （在 game/ 目录下运行：node test/rococo-test.js）
function makeWindowStub() {
  global.window = global;
  const logs = [];
  global.UI = { log: (msg) => logs.push(msg), renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  return logs;
}
const logs = makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

let pass = 0, fail = 0;
function check(name, cond) { cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name)); }

(async () => {
  const E = window.Engine, D = window.GAME_DATA;
  window.GAME_DATA.map = window.GAME_DATA.maps.ring_chord;
  D.player = D.characters.char_rococo;
  D.diff = "normal";

  // ---- 角色数据 ----
  console.log("[1] 角色数据");
  const rc = D.characters.char_rococo;
  check("洛可可已注册", !!rc);
  check("属性 20/2/2、12 金币、1d10", rc.hpMax === 20 && rc.attack === 2 && rc.defense === 2 && rc.initialCoins === 12 && rc.move.faces === 10);
  check("主动技 甜品登场 CD3", rc.activeSkill.name === "甜品登场" && rc.activeSkill.cooldown === 3);
  check("被动技 治愈魔法", rc.passiveSkill.effect === "healingPass");
  const df = D.allies.dessert_familiar;
  check("甜品使魔 20/3/3", df && df.hpMax === 20 && df.attack === 3 && df.defense === 3);

  E.newGame();
  const S = E.state, P = S.player;
  P.hp = P.hpMax; // 保证不受开局地块影响

  // ---- 主动：甜品登场（瞄准 + 全局攻击力 +1、生命上限 +2）----
  console.log("[2] 主动技能：甜品登场");
  P.skillCd = 0;
  E.useSkill();
  check("进入地块瞄准模式", S.targeting && S.targeting.deploy);
  check("候选为 3 格内地块", S.targeting.candidates.every(i => E.graphDist(P.pos, i) <= 3));
  const at = S.targeting.candidates[0];
  E.chooseDeployTile(at);
  check("选点后进入初始方向选择", S.targeting && S.targeting.deployDir);
  check("方向候选为登场格的邻格", S.targeting.candidates.every(i => S.adj[at].includes(i)));
  const dirPick = S.targeting.candidates[0];
  E.chooseDeployTile(dirPick);
  check("选向后瞄准结束", !S.targeting);
  check("使魔记录了首步方向", S.allies[0].firstStep === dirPick);
  check("生成 1 只甜品使魔", S.allies.length === 1);
  check("使魔攻击力含全局 +1（3+1=4）", S.allies[0].atk === 4);
  check("使魔生命上限含全局 +2（20+2=22）", S.allies[0].hpMax === 22 && S.allies[0].hp === 22);
  check("进入冷却 CD3", P.skillCd === 3);
  P.skillCd = 0;
  E.useSkill();
  const at2 = S.targeting.candidates.find(i => i !== at);
  E.chooseDeployTile(at2);
  check("再次发动：旧使魔攻 +1/血上限 +2", S.allies[0].atk === 5 && S.allies[0].hpMax === 24);
  check("新使魔按最新加成生成（3+2=5，20+4=24）", S.allies[1].atk === 5 && S.allies[1].hpMax === 24);
  E.chooseDeployTile(S.targeting.candidates[0]); // 完成第二段方向选择
  check("第二只使魔同样完成选向", !S.targeting && S.allies[1].firstStep != null);
  S.player.skillCd = 99; // 后续测试不再触发

  // ---- 被动：治愈魔法 ----
  console.log("[3] 被动技能：治愈魔法");
  const ally = S.allies[0];
  const adj = S.adj[P.pos][0];
  // 其余使魔挪到远处：保证测试格上只有一只（避免多次治疗干扰断言）
  S.allies.forEach((a, i) => { if (a !== ally) a.pos = (adj + 3) % S.tiles.length; });
  ally.pos = adj;
  ally.hp = 10;
  P.hp = 10;
  const logsBefore = logs.length;
  // 直接调用路过结算（与 stepPlayer 中的触发点一致）
  E._test.healPassAllies(adj);
  check("自身不再回复生命", P.hp === 10);
  check("使魔回复 5 生命", ally.hp === 15);
  check("使魔下次移动速度 +3", ally.nextMoveBonus === 3);
  check("有日志输出", logs.length > logsBefore);

  // ---- 使魔攻击：击倒视为玩家击倒，不触发筹码效果 ----
  console.log("[4] 使魔击倒怪物");
  const m = S.monsters.find(x => x.hp > 0);
  m.def_ = 0; m.hp = 1; // 保证一击必杀
  const coinBefore = P.coins;
  const quest = { target: m.def.id, progress: 0, need: 2, done: false };
  S.quests.push(quest);
  E._test.allyStrike(ally, m);
  check("怪物被击倒并移除", !S.monsters.includes(m));
  check("金币照常掉落（视为玩家击倒）", P.coins > coinBefore);
  check("击倒记入对应任务进度", quest.progress === 1 && !quest.done);

  // ---- 使魔伤害的有效防御与晕彩救援 ----
  console.log("[4b] 使魔攻击计入有效防御（effDef）");
  {
    const a2 = S.allies[0];
    const m3 = E._test.spawnMonster("dummy", S.adj[a2.pos][0]);
    check("被动怪（无 counter 标签）不会还手使魔", (() => {
      const hpBefore = a2.hp;
      E._test.allyStrike(a2, m3);
      return a2.hp === hpBefore;
    })());
    m3.def_ = 0; m3.hp = m3.hpMax = 100;
    m3.nextBattleDef = 100; // 临时防御拉满：修复后伤害必为保底 1
    const before3 = m3.hp;
    E._test.allyStrike(a2, m3);
    check("骑士守护式临时防御被计入（伤害为保底 1）", m3.hp === before3 - 1);
    S.monsters = S.monsters.filter(x => x !== m3);
  }
  console.log("[4c] 使魔击杀安若素触发晕彩救援");
  {
    // 清场：晕彩救援要求场上无 BOSS 且每局仅一次
    S.monsters = S.monsters.filter(m => m.def.category !== "boss");
    S.yuncaiRescued = false;
    const an = E._test.spawnMonster("maid_anruosu", S.adj[S.allies[0].pos][0]);
    an.hp = 2; // 低于血线阈值：受击即触发
    E._test.allyStrike(S.allies[0], an);
    check("低血受击触发晕彩登场", S.monsters.some(m => m.def.id === "maid_yuncai"));
    check("救援全局标记已置位（每局仅一次）", S.yuncaiRescued === true);
  }

  // ---- 敌人路过使魔：只攻击使魔 ----
  console.log("[5] 敌人每回合只发动一次攻击");
  const aggro = S.monsters.find(x => x.def.tags.includes("aggressive") && x.hp > 0) ||
    (() => { const nm = E._test.spawnMonster("dummy", 0); return nm; })();
  aggro.def = { ...aggro.def, tags: ["aggressive"], passives: [] };
  const hpBefore = P.hp;
  const a0 = S.allies[0];
  // 构造：怪物 2 步内先经过使魔格再到达玩家格
  const p0 = P.pos, n1 = S.adj[p0][0], n2 = S.adj[n1].find(x => x !== p0);
  aggro.pos = n2; aggro.lastFrom = null; aggro.queuedNext = n1;
  a0.pos = n1; a0.hp = a0.hpMax = 1000;
  S.allies = [a0]; S.monsters = [aggro];
  let monsterMoved = false;
  S.move = { who: aggro, steps: 2, attacked: false, prev: null, done: () => { monsterMoved = true; } };
  await E._test.stepMonster();
  check("敌人实际经过使魔再抵达玩家", monsterMoved && aggro.pos === p0);
  check("敌人攻击了使魔", a0.hp < a0.hpMax);
  check("同回合未再向玩家开战", S.battle === null && P.hp === hpBefore);

  // ---- 使魔追击：靠近最近怪物 ----
  console.log("[6] 使魔移动追击最近的怪物");
  S.allies = []; S.monsters = [];
  const prey = E._test.spawnMonster("dummy", n2);
  const hunter = E._test.spawnFamiliar(p0);
  const distanceBefore = E.graphDist(hunter.pos, prey.pos);
  let allyMoved = false;
  S.move = { who: hunter, isAlly: true, steps: 1, done: () => { allyMoved = true; } };
  await E._test.stepAlly();
  check("使魔实际移动后更靠近怪物", allyMoved && E.graphDist(hunter.pos, prey.pos) === distanceBefore - 1);
  check("使魔不在怪物列表中（玩家无法攻击）", !S.monsters.includes(hunter));

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
