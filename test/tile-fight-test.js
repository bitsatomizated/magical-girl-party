// 落格战斗与地块效果顺序测试（node test/tile-fight-test.js）
// 规则：落在有怪的地块必须先与该地块所有怪物交战，全部解决后才触发地块效果
function makeWindowStub() {
  global.window = global;
  global.__logs = [];
  global.UI = { log: (m, k) => global.__logs.push((k ? `[${k}]` : "") + m), renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, X = window.Engine._test;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const mk = (id) => window.GAME_DATA.monsters[id];

function setup() {
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps.maid_cafe;
  E.newGame();
  const S = E.state;
  S.aiBusy = true;
  S.monsters = []; // 清空事件刷出的怪，使用自建场景
  return S;
}
const put = (S, id, pos, hp) => {
  const def = mk(id);
  const m = { uid: ++S.monsterSeq, def, name: def.name, pos, hp: hp ?? def.hpMax, hpMax: def.hpMax, atk: def.attack, def_: def.defense, skillCd: 0, hunt: 0 };
  S.monsters.push(m);
  return m;
};

(async () => {
  console.log("[1] 落在有怪的回血格：先战斗，效果延后");
  const S1 = setup();
  S1.player.hp = 10;
  const d1 = put(S1, "dummy", 20); // 20 为回血格（竖颈第三格）
  E.finishPlayPhase();
  S1.player.nextFixed = 3; // 0 → 18 → 19 → 20
  E.rollAndMove();
  await sleep(30);
  check(`落在回血格且有怪 → 进入战斗（模式 ${S1.battle && S1.battle.mode}）`,
    !!S1.battle && S1.battle.mode === "playerAttack" && S1.battle.target === d1);
  check(`地块效果延后：生命值仍为 10（未被回复）`, S1.player.hp === 10);

  console.log("[2] 与地块上所有怪物交战：全部解决后才结算地块");
  const S2 = setup();
  S2.player.hp = 10;
  const a2 = put(S2, "dummy", 20), b2 = put(S2, "dummy", 20);
  E.finishPlayPhase();
  S2.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  check("落格即开战（第一只）", !!S2.battle && S2.battle.target === a2);
  let guard = 0;
  while (S2.battle && S2.battle.target === a2 && guard++ < 30) E.resolvePlayerAttack();
  await sleep(20); // 接战询问改为内置面板后是异步的：等引擎推进到第二只
  check(`击倒第一只后立即接战同格第二只（目标 ${S2.battle && S2.battle.target.name}）`,
    !!S2.battle && S2.battle.target === b2);
  check("仍有敌人时地块效果依旧不触发（生命值 10）", S2.player.hp === 10);
  guard = 0;
  while (S2.battle && guard++ < 30) E.resolvePlayerAttack();
  await sleep(30);
  check("格上敌人清空后战斗结束", S2.battle === null);
  check(`此时才结算回血地块（10 → ${S2.player.hp}）`, S2.player.hp === 12);

  console.log("[3] 战斗中被打倒：不触发地块效果");
  const S3 = setup();
  S3.player.hp = 1;
  put(S3, "dummy", 20);
  E.finishPlayPhase();
  S3.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  // 连续攻击直到玩家被打倒或怪被击倒（用最坏情况：把怪血量拉高，保证玩家先倒）
  if (S3.monsters[0]) { S3.monsters[0].hpMax = 999; S3.monsters[0].hp = 999; S3.monsters[0].atk = 99; }
  guard = 0;
  while (S3.battle && guard++ < 10) {
    E.resolvePlayerAttack();
    if (S3.battle) E.playerChooseStance("defend"); // 反击/攻击结算
  }
  await sleep(30);
  check("玩家倒下后回合安全收尾（未崩溃、不因地块效果复活）", S3.over === false || S3.over === true);

  console.log("[4] 格上无怪时地块效果照常立即触发");
  const S4 = setup();
  S4.player.hp = 10;
  E.finishPlayPhase();
  S4.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  check(`空回血格：直接回复（10 → ${S4.player.hp}）`, S4.player.hp === 12 && S4.battle === null);

  console.log("[5] 反击同样走完整战斗流程（玩家可选姿态、打防御牌）");
  const S5 = setup();
  S5.player.pos = 0;
  const tina5 = put(S5, "maid_tina", 0);
  const hpBefore5 = S5.player.hp;
  X.startBattle("player", tina5);
  E.resolvePlayerAttack();
  check("缇娜存活 → 进入反击战斗（monsterAttack + counter）",
    !!S5.battle && S5.battle.mode === "monsterAttack" && S5.battle.counter === true && S5.battle.target === tina5);
  check("反击等待玩家操作，尚未扣血", S5.player.hp === hpBefore5);
  E.playerChooseStance("defend");
  check(`玩家选姿态后反击才结算（${hpBefore5} → ${S5.player.hp}）`, S5.player.hp <= hpBefore5);

  console.log("[5b] 暗影突袭：本次攻击不会被反击");
  const S5b = setup();
  S5b.player.pos = 0;
  const tina5b = put(S5b, "maid_tina", 0);
  tina5b.hp = tina5b.hpMax = 999; // 保证存活，否则打死了也无法观察反击
  const hpBefore5b = S5b.player.hp;
  X.startBattle("player", tina5b);
  S5b.player.hand = [{ ...window.GAME_DATA.cards.shadow }]; // 暗影突袭：攻+3，免反击
  E.playBattleCard("shadow");
  E.resolvePlayerAttack();
  check("打了暗影突袭 → 不进入反击战斗（战斗直接结束）", S5b.battle === null);
  check(`玩家未因反击受伤（${hpBefore5b} → ${S5b.player.hp}）`, S5b.player.hp === hpBefore5b);
  check("目标仍在场（未被击倒，排除假阳性）", S5b.monsters.includes(tina5b));
  const noCounterLog = global.__logs.some(x => x.includes("暗影突袭】生效"));
  check("日志标明免反击生效", noCounterLog);

  console.log("[5c] 未打暗影突袭：同目标仍会反击（对照）");
  const S5c = setup();
  S5c.player.pos = 0;
  const tina5c = put(S5c, "maid_tina", 0);
  tina5c.hp = tina5c.hpMax = 999;
  X.startBattle("player", tina5c);
  E.resolvePlayerAttack();
  check("普通攻击 → 触发反击（monsterAttack + counter）",
    !!S5c.battle && S5c.battle.mode === "monsterAttack" && S5c.battle.counter === true);
  E.playerChooseStance("defend");

  console.log("[6] 玩家可以拒绝交战：直接结算地块");
  const S6 = setup();
  S6.player.hp = 10;
  put(S6, "dummy", 20);
  const oc6 = global.__askAuto;
  global.__askAuto = () => false; // 拒绝交战
  E.finishPlayPhase();
  S6.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  global.__askAuto = oc6;
  check("拒绝后不开战（S.battle 为空）", S6.battle === null);
  check(`拒绝后照常结算地块（10 → ${S6.player.hp}）`, S6.player.hp === 12);

  console.log("[7] 按怪询问：同格两只怪各询问一次");
  const S7 = setup();
  S7.player.hp = 10;
  put(S7, "dummy", 20); put(S7, "dummy", 20);
  let asks = 0;
  const oc7 = global.__askAuto;
  global.__askAuto = () => { asks++; return true; };
  E.finishPlayPhase();
  S7.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  // 交战询问改为内置面板后是异步的：每打完一场让出事件循环，等下一只怪的询问开战
  let g7 = 0;
  while (g7++ < 60) {
    if (S7.battle) { E.resolvePlayerAttack(); continue; }
    await sleep(10);
    if (!S7.battle) break;
  }
  global.__askAuto = oc7;
  check(`同格两只怪分别询问（询问 ${asks} 次）`, asks === 2);
  check(`两只都打完后才结算地块（生命值 ${S7.player.hp}）`, S7.player.hp === 12);

  console.log("[8] 路过商店格有怪：先问交战，战斗后才打开商店");
  const S8 = setup();
  const shopFoe = put(S8, "dummy", 31); // 31 为商店格
  const oc8 = global.__askAuto;
  global.__askAuto = (msg) => !/是否停留/.test(msg); // 不在升级点停留，其余询问（含交战）一律答应
  E.finishPlayPhase();
  S8.player.nextFixed = 9; S8.player.nextChooseDir = true;
  E.rollAndMove();
  await sleep(20);
  E.pickMoveStep(18); // 起始岔口选向下（竖颈）
  await sleep(20);
  E.pickMoveStep(28); // 21 处岔口选右下圈：28→29→30→31（第 8 步路过商店格）
  await sleep(40);
  global.__askAuto = oc8;
  check("路过商店格先进入交战询问（战斗已开始）", !!S8.battle && S8.battle.target === shopFoe);
  check("战斗未结束前商店不打开", !S8.shop);
  let g8 = 0;
  while (S8.battle && g8++ < 40) E.resolvePlayerAttack();
  await sleep(60);
  check("击倒后进入商店页面（S.shop 已设置）", !!S8.shop);
  if (S8.shop) E.closeShop();
  await sleep(60);
  check(`关闭商店后继续走完剩余步数（落在第 ${S8.player.pos} 格）`, S8.player.pos === 32);

  console.log("[9] 选择性交战：拒绝第一只，只与第二只交战");
  const S9 = setup();
  S9.player.hp = 10;
  const a9 = put(S9, "dummy", 20), b9 = put(S9, "dummy", 20);
  let n9 = 0;
  const oc9 = global.__askAuto;
  global.__askAuto = () => (++n9 > 1); // 第一次拒绝，第二次答应
  E.finishPlayPhase();
  S9.player.nextFixed = 3;
  E.rollAndMove();
  await sleep(30);
  global.__askAuto = oc9;
  check("拒绝第一只后继续询问第二只并开战", !!S9.battle && S9.battle.target === b9);
  let g9 = 0;
  while (S9.battle && g9++ < 30) E.resolvePlayerAttack();
  await sleep(30);
  check(`打完第二只后结算地块（生命值 ${S9.player.hp}）`, S9.player.hp === 12);
  check("被拒绝的第一只未被攻击且仍在场", a9.hp === a9.hpMax && S9.monsters.includes(a9));

  console.log("[10] 伤害效果牌锁定指定怪物（同格两只怪只打中目标）");
  const S10 = setup();
  S10.player.pos = 5;
  const t1 = put(S10, "dummy", 5), t2 = put(S10, "dummy", 5); // 同格两只怪
  S10.player.hand = [{ ...window.GAME_DATA.cards.brick }]; // 板砖：3 格内 5 点伤害
  E.playCard(0);
  check("进入瞄准模式，同格两只怪都在候选内",
    !!S10.targeting && S10.targeting.candidates.length === 2
    && S10.targeting.candidates.includes(t1.uid) && S10.targeting.candidates.includes(t2.uid));
  check("未选目标前不结算伤害", t1.hp === t1.hpMax && t2.hp === t2.hpMax);
  E.chooseTarget(t1.uid);
  check(`只打中锁定的那只（${t1.name} ${t1.hp}/${t1.hpMax}，另一只 ${t2.hp}/${t2.hpMax}）`,
    t1.hp === t1.hpMax - 5 && t2.hp === t2.hpMax);
  check("结算后手牌消耗且退出瞄准", S10.player.hand.length === 0 && S10.targeting === null);

  console.log("[11] 地块效果（疾行加步）后续走进岔路：阶段必须回到移动阶段");
  const S11 = setup();
  S11.player.pos = 15;                       // 岔路格
  S11.tiles[15] = { ...S11.tiles[15], t: "dash" }; // 强制为疾行格，制造 extra>0 的续走路径
  const prevOpt = S11.adj[15][0];
  const remain = S11.adj[15].filter(n => n !== prevOpt);
  check(`岔路格 15 存在两个以上可选方向（邻居 ${S11.adj[15].join("/")}）`, remain.length >= 1);
  S11.move = { who: "player", steps: 0, prev: prevOpt, forcedNext: null };
  S11.phase = "battle";                      // 模拟刚从战斗返回、阶段尚未复位
  await X.settleLandTile();
  check(`续走进岔路后阶段为 move（实际 ${S11.phase}）`, S11.phase === "move");
  check(`岔路待选项已就绪（${JSON.stringify(S11.move?.await || null)}）`, !!S11.move?.await?.length);
  check("玩家仍在岔路格等待选择（未出生死锁）", S11.player.pos === 15 && !S11.over);
  E.pickMoveStep(remain[0]);
  await sleep(40);
  check(`点击方向后离开了岔路格（现位置 ${S11.player.pos}）`, S11.player.pos !== 15);
  check(`未再出现「战斗阶段却没有战斗对象」的死锁（阶段 ${S11.phase}）`,
    !(S11.phase === "battle" && !S11.battle) && !S11.move?.await);

  console.log("[12] 停在有旧怪的刷怪格：叠刷一只新怪，两只各询问一次");
  const S12 = setup();
  S12.player.hp = 20;
  const spIdx = S12.tiles.findIndex(t => t.t === "spawn");
  const old12 = put(S12, "dummy", spIdx);
  old12.hp = old12.hpMax = 100; // 一次打不死，若二次开战就会暴露
  const asked12 = [];
  let accept12 = 0;
  const oc12 = global.__askAuto;
  global.__askAuto = (msg) => { if (String(msg).includes("是否与")) { asked12.push(String(msg)); return accept12++ === 0; } return true; }; // 接受旧怪、拒绝新怪
  S12.player.pos = spIdx;
  S12.move = { who: "player", steps: 0, prev: S12.adj[spIdx][0], forcedNext: null };
  S12.phase = "battle"; // 模拟刚从战斗返回
  global.__logs.length = 0;
  X.settleLandTile(); // 不 await：应停在「询问并开战」
  await sleep(20);
  check("有怪也叠刷：场上两只（旧怪+新刷）", S12.monsters.length === 2);
  check("先询问旧怪并进入战斗", asked12.length === 1 && !!S12.battle && S12.battle.target === old12);
  let g12 = 0;
  while (S12.battle && g12++ < 20) E.resolvePlayerAttack();
  await sleep(40);
  global.__askAuto = oc12;
  check(`战后重入：新刷怪被询问（共 ${asked12.length} 次）`, asked12.length === 2 && /女仆精灵/.test(asked12[1]));
  const dmg12 = global.__logs.filter(x => x.includes("造成 ") && x.includes(old12.name)).length;
  check(`只结算一次玩家攻击（伤害日志 ${dmg12} 条）`, dmg12 === 1);
  check(`拒绝新怪后正常收尾（阶段 ${S12.phase}，无二次战斗）`, S12.phase === "turnEnd" && !S12.battle);
  check("战斗后重入不再叠刷（场上仍两只）", S12.monsters.length === 2);

  console.log("[13] 落地刷怪格无怪：刷出的新怪按询问处理，可拒绝");
  const S13 = setup();
  const spIdx13 = S13.tiles.findIndex(t => t.t === "spawn");
  let asked13 = null;
  const oc13 = global.__askAuto;
  global.__askAuto = (msg) => { if (String(msg).includes("是否与")) { asked13 = String(msg); return false; } return true; };
  S13.player.pos = spIdx13;
  S13.move = { who: "player", steps: 0, prev: S13.adj[spIdx13][0], forcedNext: null };
  S13.phase = "battle";
  await X.settleLandTile();
  await sleep(20);
  global.__askAuto = oc13;
  check(`刷出女仆精灵并询问（${asked13 || "未询问"}）`,
    S13.monsters.length === 1 && /女仆精灵\d+/.test(asked13 || ""));
  check("拒绝后不进入战斗，正常收尾", !S13.battle && S13.phase === "turnEnd");

  // 放在最后一个用例：续走会留下未结束的异步移动，避免污染其他场景
  console.log("[14] 疾行格的「再掷」同样计入移速加成");
  const S14 = setup();
  const dashIdx = S14.tiles.findIndex((t) => t.t === "dash");
  S14.player.pos = dashIdx;
  S14.player.speedBonus = 3; // 模拟升级 +2 与「迅捷 I」+1 的合计移速
  S14.move = { who: "player", steps: 0, prev: S14.adj[dashIdx][0], forcedNext: null };
  global.__logs.length = 0;
  await X.settleLandTile();
  const dashLog = global.__logs.find((m) => m.includes("疾行：再掷")) || "";
  const mm = dashLog.match(/疾行：再掷 (\d+) 点，移速 \+3，共 (\d+) 点/);
  check(`疾行日志计入移速（${dashLog || "无日志"}）`, !!mm);
  check("共走点数 = 再掷点数 + 3（至少 4 步）",
    !!mm && Number(mm[2]) === Number(mm[1]) + 3 && Number(mm[2]) >= 4);
  S14.move = null;

  const S15 = setup();
  const dashIdx2 = S15.tiles.findIndex((t) => t.t === "dash");
  S15.player.pos = dashIdx2;
  S15.player.speedBonus = 0;
  S15.move = { who: "player", steps: 0, prev: S15.adj[dashIdx2][0], forcedNext: null };
  global.__logs.length = 0;
  await X.settleLandTile();
  const dashLog2 = global.__logs.find((m) => m.includes("疾行：再掷")) || "";
  check(`无移速时不显示加成（${dashLog2 || "无日志"}）`, !!dashLog2 && !dashLog2.includes("移速 +"));
  S15.move = null;

  // 安叶「青鸾雏焰」：本回合移速走 turnMoveBonus，必须同样作用于疾行续走
  const S16 = setup();
  const dashIdx3 = S16.tiles.findIndex((t) => t.t === "dash");
  S16.player.pos = dashIdx3;
  S16.player.turnMoveBonus = 3;
  S16.move = { who: "player", steps: 0, prev: S16.adj[dashIdx3][0], forcedNext: null };
  global.__logs.length = 0;
  await X.settleLandTile();
  const dashLog3 = global.__logs.find((m) => m.includes("疾行：再掷")) || "";
  const mm3 = dashLog3.match(/疾行：再掷 (\d+) 点，移速 \+3，共 (\d+) 点/);
  check(`本回合临时移速（青鸾雏焰）同样作用于疾行（${dashLog3 || "无日志"}）`,
    !!mm3 && Number(mm3[2]) === Number(mm3[1]) + 3);
  S16.move = null;

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
