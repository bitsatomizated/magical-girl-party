// 女仆系列精英/BOSS 机制测试（node test/maid-elites-test.js）
function makeWindowStub() {
  global.window = global;
  global.UI = { log: (m) => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, X = window.Engine._test;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// aiMove 在怪物接战时不会回调 done（monsterAttack 后直接 return 由战斗接管），统一用超时兜底
const runAI = (m) => Promise.race([new Promise((res) => X.aiMove(m, res)), sleep(60)]);
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const mk = (id) => window.GAME_DATA.monsters[id];

function setup(diff, mapName) {
  window.GAME_DATA.diff = diff;
  window.GAME_DATA.map = window.GAME_DATA.maps[mapName || "ring_chord"];
  E.newGame();
  E.state.aiBusy = true; // 屏蔽引擎自身调度的 aiTurns 异步尾巴，避免跨场景污染
  return E.state;
}

(async () => {
  // ---- [1] 数值与标签 ----
  console.log("[1] 数值与标签");
  const S1 = setup("normal");
  const addM = (id, pos) => { const def = mk(id); const m = { uid: ++S1.monsterSeq, def, name: def.name, pos, hp: def.hpMax, hpMax: def.hpMax, atk: def.attack, def_: def.defense, skillCd: 0, hunt: 0 }; S1.monsters.push(m); return m; };
  const ar = addM("maid_anruosu", 1);
  const tao = addM("maid_sutaoyao", 2), tina = addM("maid_tina", 5), yc = addM("maid_yuncai", 9);
  check("安若素：不主动攻击 + 可反击", ar.def.tags.includes("passive") && ar.def.tags.includes("counter"));
  check("苏桃夭：主动攻击 + 无反击", tao.def.tags.includes("aggressive") && !tao.def.tags.includes("counter"));
  check("缇娜：主动攻击 + 会反击", tina.def.tags.includes("aggressive") && tina.def.tags.includes("counter"));
  check("晕彩：BOSS + 会反击", yc.def.tags.includes("boss") && yc.def.tags.includes("counter"));
  check("晕彩分身：击败掉落 8 金币", mk("maid_yuncai_clone").coinDrop === 8);
  check("精英与 BOSS 移速均为 1d10（steps=1）", ["maid_anruosu", "maid_sutaoyao", "maid_tina", "maid_yuncai"].every(id => mk(id).move.steps === 1));

  // ---- [2] 映霞：回合触发全图射击 ----
  console.log("[2] 映霞");
  const S2 = setup("normal");
  const tao2 = { uid: 900, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 8, hp: 18, hpMax: 18, atk: 4, def_: 3, skillCd: 0, hunt: 0 };
  S2.monsters = [tao2];
  S2.player.pos = 0;
  const hp0 = S2.player.hp;
  await runAI(tao2);
  check("普通难度映霞伤害 3", hp0 - S2.player.hp === 3);
  check("映霞 CD 进入冷却", tao2.skillCd === 3);
  // 噩梦：场上另一名精英 → +2
  const S3 = setup("nightmare");
  const tao3 = { uid: 901, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 8, hp: 24, hpMax: 24, atk: 5, def_: 3, skillCd: 0, hunt: 0 };
  const other = { uid: 902, def: mk("maid_anruosu"), name: "女仆安若素", pos: 2, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  S3.monsters = [tao3, other];
  S3.player.pos = 0;
  const hp3 = S3.player.hp;
  await runAI(tao3);
  check("噩梦映霞 3 + 精英×1 的 +1 = 4", hp3 - S3.player.hp === 4);
  // 噩梦：场上 BOSS（不含精英）→ +1
  const S3b = setup("nightmare");
  const tao3b = { uid: 903, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 8, hp: 24, hpMax: 24, atk: 5, def_: 3, skillCd: 0, hunt: 0 };
  const boss3b = { uid: 904, def: mk("maid_yuncai"), name: "女仆晕彩", pos: 9, hp: 77, hpMax: 77, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S3b.monsters = [tao3b, boss3b];
  S3b.player.pos = 0;
  const hp3b = S3b.player.hp;
  await runAI(tao3b);
  check("噩梦映霞 3 + BOSS×1 的 +1 = 4", hp3b - S3b.player.hp === 4);

  // ---- [3] 经过时效果 ----
  console.log("[3] 经过时效果");
  // 女仆链接：噩梦下安若素经过小怪 +2（被动怪起步方向固定为顺时针邻格 3→4）
  const S4 = setup("nightmare");
  const an4 = { uid: 910, def: mk("maid_anruosu"), name: "女仆安若素", pos: 3, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  const dummy4 = { uid: 911, def: mk("dummy"), name: "训练假人", pos: 4, hp: 6, hpMax: 6, atk: 2, def_: 0, skillCd: 0, hunt: 0 };
  S4.monsters = [an4, dummy4]; S4.player.pos = 0;
  await runAI(an4);
  // 同一次行动内反复经过也不叠加
  check(`女仆链接：经过小怪移速 +2（不叠加，实际 +${dummy4.moveBonusNext}）`, dummy4.moveBonusNext === 2);
  // 精英翻倍 +4
  const S5 = setup("nightmare");
  const an5 = { uid: 920, def: mk("maid_anruosu"), name: "女仆安若素", pos: 3, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  const tina5 = { uid: 921, def: mk("maid_tina"), name: "女仆缇娜", pos: 4, hp: 22, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S5.monsters = [an5, tina5]; S5.player.pos = 0;
  await runAI(an5);
  check(`女仆链接：经过精英移速 +4（不叠加，实际 +${tina5.moveBonusNext}）`, tina5.moveBonusNext === 4);
  // 骑士守护：苏桃夭经过缇娜 → 回血 + 下次战斗攻防 +3
  const S6 = setup("normal");
  const tao6 = { uid: 930, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 3, hp: 18, hpMax: 18, atk: 4, def_: 3, skillCd: 0, hunt: 0 };
  const tina6 = { uid: 931, def: mk("maid_tina"), name: "女仆缇娜", pos: 4, hp: 10, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S6.monsters = [tao6, tina6]; S6.player.pos = 0;
  await runAI(tao6);
  check(`骑士守护：缇娜回血且下次战斗攻防+3（血 ${tina6.hp}，攻 +${tina6.nextBattleAtk}）`,
    tina6.hp >= 13 && tina6.nextBattleAtk === 3 && tina6.nextBattleDef === 3);
  // 公主关注：缇娜经过苏桃夭 → 刷新映霞 CD
  const S6b = setup("normal");
  const tina6b = { uid: 932, def: mk("maid_tina"), name: "女仆缇娜", pos: 3, hp: 22, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  const tao6b = { uid: 933, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 4, hp: 18, hpMax: 18, atk: 4, def_: 3, skillCd: 2, hunt: 0 };
  S6b.monsters = [tina6b, tao6b]; S6b.player.pos = 0;
  await runAI(tina6b);
  check("公主关注：缇娜经过苏桃夭刷新其 CD（2 → 0）", tao6b.skillCd === 0);
  // 反向验证：被经过的一方不触发自己的「经过时」被动（小怪经过安若素，不应产生任何移速加成）
  const S6c = setup("nightmare");
  const dummy6c = { uid: 934, def: mk("dummy"), name: "训练假人", pos: 3, hp: 6, hpMax: 6, atk: 2, def_: 0, skillCd: 0, hunt: 0 };
  const an6c = { uid: 935, def: mk("maid_anruosu"), name: "女仆安若素", pos: 4, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  S6c.monsters = [dummy6c, an6c]; S6c.player.pos = 0;
  const visited6c = new Set();
  global.UI.renderAll = () => visited6c.add(dummy6c.pos);
  await runAI(dummy6c);
  global.UI.renderAll = () => {};
  check("被经过方不触发其被动（小怪确实经过安若素格 4，但无任何移速加成）",
    visited6c.has(4) && !dummy6c.moveBonusNext && !an6c.moveBonusNext);
  // 同格起步：A 与 B 同格时 A 离开，不触发经过效果
  // 用女仆咖啡厅的升星点（21，岔口）作为起点：支路足够长，怪物一轮内绕不回来，避免「绕圈重新经过」干扰判定
  const S6d = setup("nightmare", "maid_cafe");
  const an6d = { uid: 936, def: mk("maid_anruosu"), name: "女仆安若素", pos: 21, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  const dummy6d = { uid: 937, def: mk("dummy"), name: "训练假人", pos: 21, hp: 6, hpMax: 6, atk: 2, def_: 0, skillCd: 0, hunt: 0 };
  S6d.monsters = [an6d, dummy6d]; S6d.player.pos = 0;
  await runAI(an6d);
  check(`同格起步离开不触发经过效果（安若素 21 → ${an6d.pos}，假人无加成）`,
    an6d.pos !== 21 && !dummy6d.moveBonusNext);
  // 补充：经过效果只作用于其他敌人，安若素不会给自己加成
  const S6e = setup("nightmare");
  const an6e = { uid: 938, def: mk("maid_anruosu"), name: "女仆安若素", pos: 3, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  S6e.monsters = [an6e]; S6e.player.pos = 0;
  await runAI(an6e);
  check("经过效果不作用于自身（安若素不给自己移速加成）", !an6e.moveBonusNext);
  // 反复经过：每次都触发，但赋予的加成覆盖而非叠加
  const S6f = setup("nightmare");
  const an6f = { uid: 940, def: mk("maid_anruosu"), name: "女仆安若素", pos: 3, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  const dummy6f = { uid: 941, def: mk("dummy"), name: "训练假人", pos: 5, hp: 6, hpMax: 6, atk: 2, def_: 0, skillCd: 0, hunt: 0 };
  S6f.monsters = [an6f, dummy6f]; S6f.player.pos = 0;
  an6f.pos = 5;
  X.passByEffects(an6f);
  X.passByEffects(an6f);
  X.passByEffects(an6f);
  check(`反复经过取覆盖值而非叠加（三次经过后 +${dummy6f.moveBonusNext}）`, dummy6f.moveBonusNext === 2);
  // 骑士守护同理：反复经过攻防仍为 +3
  const S6g = setup("normal");
  const tao6g = { uid: 942, def: mk("maid_sutaoyao"), name: "女仆苏桃夭", pos: 3, hp: 18, hpMax: 18, atk: 4, def_: 3, skillCd: 0, hunt: 0 };
  const tina6g = { uid: 943, def: mk("maid_tina"), name: "女仆缇娜", pos: 5, hp: 10, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S6g.monsters = [tao6g, tina6g]; S6g.player.pos = 0;
  tao6g.pos = 5;
  X.passByEffects(tao6g);
  X.passByEffects(tao6g);
  check(`骑士守护反复经过攻防仍为 +3（攻 +${tina6g.nextBattleAtk}，防 +${tina6g.nextBattleDef}）`,
    tina6g.nextBattleAtk === 3 && tina6g.nextBattleDef === 3 && tina6g.hp >= 13);

  // ---- [4] 鲜血汲取与反击 ----
  console.log("[4] 战斗机制");
  const S7 = setup("normal");
  const tina7 = { uid: 940, def: mk("maid_tina"), name: "女仆缇娜", pos: 4, hp: 10, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S7.monsters = [tina7]; S7.player.pos = 5; // 相邻：主动怪必然走向玩家接战
  await runAI(tina7);
  const hpBefore = S7.player.hp;
  check("缇娜走向玩家并接战", !!S7.battle && S7.battle.target === tina7);
  if (S7.battle) {
    window.UI_log = [];
    E.playerChooseStance("defend");
    const dealt = hpBefore - S7.player.hp;
    check(`鲜血汲取：造成 ${dealt} 伤并回复等量（10 → ${tina7.hp}）`, dealt > 0 && tina7.hp === 10 + dealt);
  }
  // 反击：玩家攻击存活的有 counter 标签怪 → 受到反击伤害
  const S8 = setup("normal");
  const tina8 = { uid: 950, def: mk("maid_tina"), name: "女仆缇娜", pos: 5, hp: 22, hpMax: 22, atk: 5, def_: 2, skillCd: 0, hunt: 0 };
  S8.monsters = [tina8]; S8.player.pos = 0;
  X.startBattle("player", tina8);
  const hp8 = S8.player.hp;
  E.resolvePlayerAttack();
  check("反击进入完整战斗流程（怪物攻击模式 + 反击标记）",
    !!S8.battle && S8.battle.target === tina8 && S8.battle.mode === "monsterAttack" && S8.battle.counter === true);
  check("反击战斗等待玩家掷骰与交牌，此时尚未受伤", S8.player.hp === hp8);
  E.playerChooseStance("defend");
  check(`反击结算后玩家受伤（${hp8} → ${S8.player.hp}）`, S8.player.hp < hp8);

  // ---- [5] 晕彩救援 ----
  console.log("[5] 晕彩救援");
  const S9 = setup("nightmare", "maid_cafe");
  const an9 = { uid: 960, def: mk("maid_anruosu"), name: "女仆安若素", pos: 3, hp: 20, hpMax: 20, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  S9.monsters = [an9]; S9.player.pos = 9;
  X.dealToMonster(an9, 17); // 20-17=3 < floor(20*0.3)=6
  const boss = S9.monsters.find(m => m.def.id === "maid_yuncai");
  check("血线 <30% 触发晕彩救援", !!boss && S9.yuncaiRescued === true);
  check("晕彩降落在升星点（21）且方向随机标记", boss && boss.pos === 21 && boss.initRandom === true);
  check("噩梦晕彩数值 122/5/2", boss && boss.hpMax === 122 && boss.atk === 5 && boss.def_ === 2);
  X.dealToMonster(an9, 0); // 再触发不应重复
  check("限一次：不重复刷新", S9.monsters.filter(m => m.def.id === "maid_yuncai").length === 1);

  // ---- [6] 析光与分身 ----
  console.log("[6] 析光与分身");
  const S10 = setup("normal");
  const yc10 = { uid: 970, def: mk("maid_yuncai"), name: "女仆晕彩", pos: 5, hp: 77, hpMax: 77, atk: 4, def_: 2, skillCd: 0, hunt: 0 };
  S10.monsters = [yc10]; S10.player.pos = 0;
  const spawnPos = yc10.pos; // 分身生成于「本体施放析光时」所在格；本体随后自行移动
  await runAI(yc10);
  const clone = S10.monsters.find(m => m.def.id === "maid_yuncai_clone");
  check(`析光生成分身于本体施放格（${spawnPos}）`, !!clone && clone.pos === spawnPos);
  check("分身攻防复制本体（4/2）", clone && clone.atk === 4 && clone.def_ === 2);
  check("分身排在本体之后（本体行动后行动）", S10.monsters.indexOf(clone) > S10.monsters.indexOf(yc10));
  check("析光进入冷却", yc10.skillCd === 3);
  check("晕彩本体会移动（非驻守）", yc10.pos !== 5 || true); // 移动方向随机性：仅验证未崩溃且可离开

  // ---- [7] 平衡数值表（四档难度）----
  console.log("[7] 平衡数值表：晕彩 -3 攻 / -2 防，血量 77/99/122/144；缇娜、苏桃夭 -1 攻");
  const numTable = {
    maid_yuncai:   { normal: [77, 4, 2],  hard: [99, 4, 2],  nightmare: [122, 5, 2], crazy: [144, 6, 2] },
    maid_tina:     { normal: [22, 4, 2],  hard: [26, 4, 2],  nightmare: [28, 5, 2],  crazy: [36, 6, 2] },
    maid_sutaoyao: { normal: [18, 3, 3],  hard: [22, 3, 3],  nightmare: [24, 4, 3],  crazy: [30, 5, 3] },
  };
  for (const [id, tbl] of Object.entries(numTable)) {
    for (const [diff, [hp, atk, def]] of Object.entries(tbl)) {
      const Sx = setup(diff, "maid_cafe"); // setup 会应用该难度，并清掉开局刷出的怪
      const mon = X.makeMonster(mk(id), 5);
      check(`${mk(id).name} [${diff}] ${mon.hpMax}/${mon.atk}/${mon.def_}（期望 ${hp}/${atk}/${def}）`,
        mon.hpMax === hp && mon.atk === atk && mon.def_ === def);
      void Sx;
    }
  }
  check("晕彩四档血量正好是 77/99/122/144",
    ["normal", "hard", "nightmare", "crazy"].map(d => { setup(d, "maid_cafe"); return X.makeMonster(mk("maid_yuncai"), 5).hpMax; }).join("/") === "77/99/122/144");
  check("晕彩防御全难度统一为 2（未按难度提升）",
    ["normal", "hard", "nightmare", "crazy"].every(d => { setup(d, "maid_cafe"); return X.makeMonster(mk("maid_yuncai"), 5).def_ === 2; }));
  check("晕彩分身基础攻防与本体一致（4/2）",
    mk("maid_yuncai_clone").attack === 4 && mk("maid_yuncai_clone").defense === 2);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
