// 星梦：通过真实引擎操作与 DOM 验证费用兑换、出牌成长、射程和界面。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
});
const w = dom.window;
w.__FAST__ = true;
for (const src of require("../tools/runtime-source.cjs").scriptPaths.filter(s => !s.endsWith("main.js"))) {
  w.eval(fs.readFileSync(path.join(root, src), "utf8"));
}
const E = w.Engine, D = w.GAME_DATA, X = E._test;
const laser = () => ({ ...D.cards.arcaneLaser });
const hand = (...ids) => ids.map(id => ({ ...D.cards[id] }));
function start() {
  D.player = D.characters.char_xingmeng; D.map = D.maps.ring_chord; D.diff = "normal";
  E.newGame();
  const S = E.state;
  S.monsters = [];
  return { S, P: S.player };
}
function target(S, pos = S.player.pos, id = "dummy") {
  const m = X.spawnMonster(id, pos);
  m.hp = m.hpMax = 100;
  return m;
}
async function fire(m) {
  const idx = E.state.player.hand.findIndex(c => c.id === "arcaneLaser");
  assert.equal(await E.playCard(idx), true);
  E.chooseTarget(m.uid);
}
(async () => {
  w.UI.renderSetup();
  const card = [...w.document.querySelectorAll("#char-list .setup-card")].find(el => el.textContent.includes("星梦"));
  assert.ok(card);
  assert.ok(fs.existsSync(path.join(root, D.characters.char_xingmeng.art.full)));
  card.click();
  assert.equal(w.__setup.char, "char_xingmeng");
  w.document.getElementById("btn-start").click();
  w.document.getElementById("btn-intro-ok").click();
  assert.equal(E.state.player.id, "char_xingmeng");
  {
    const { P } = start();
    assert.deepEqual([P.hpMax, P.atk, P.def, P.coins], [18, 1, 3, 12]);
    assert.equal(P.hand.length, 5);
    assert.equal(P.hand.filter(c => c.id === "arcaneLaser").length, 1);
    assert.equal(JSON.stringify(D.player.starGrowth), JSON.stringify(D.characters.char_anye.starGrowth));
    for (const star of [1, 2, 3]) X.applyStarGrowth(star);
    assert.deepEqual([P.hpMax, P.atk, P.def, P.speedBonus], [20, 3, 4, 5]);
    assert.ok(!D.effectPool.includes("arcaneLaser") && !X.battlePoolNow().includes("arcaneLaser"));
  }
  for (const [ids, expected] of [[['atk_m', 'def_m'], 1], [['charge', 'katana'], 3], [['atk_l'], 1], [['atk_m'], 0], [['atk_s'], 0], [[], 0]]) {
    const { P } = start();
    P.hand = [...hand(...ids), D.cards.cake]; P.chips = ["recycle"];
    const coins = P.coins;
    E.useSkill();
    assert.equal(P.hand.filter(c => c.type === "battle").length, 0);
    assert.equal(P.hand.filter(c => c.id === "arcaneLaser").length, expected);
    assert.equal(P.hand[0].id, "cake");
    assert.equal(P.coins, coins, "丢弃不触发回收筹码");
    assert.equal(P.skillCd, 3);
    E.useSkill();
    assert.equal(P.hand.length, expected + 1, "冷却期间不能再次发动");
  }
  {
    const { P } = start();
    P.hand = [...hand("charge", "charge", "charge", "charge"), ...Array.from({ length: 4 }, () => D.cards.cake)];
    E.useSkill();
    assert.equal(P.hand.length, 8);
    assert.equal(P.hand.filter(c => c.id === "arcaneLaser").length, 4);
    assert.match(w.document.getElementById("log").textContent, /2 张【魔导激光】未能获得/);
  }
  for (const n of [5, 6, 7, 8]) {
    const { P } = start(); P.hand = Array.from({ length: n }, () => D.cards.cake);
    X.startRound();
    assert.equal(P.hand.length, n <= 6 ? n + 1 : n);
    assert.equal(P.hand.filter(c => c.id === "arcaneLaser").length, n <= 6 ? 1 : 0);
  }
  {
    const { P } = start(); P.hand = Array.from({ length: 6 }, () => D.cards.cake); P.chips = ["lore1"];
    X.startRound();
    assert.equal(P.hand.length, 7);
    assert.ok(!P.hand.some(c => c.id === "arcaneLaser"), "学识抽牌先结算，再检查手牌阈值");
  }
  {
    const { S, P } = start();
    // 单链测试图：最短道路距离 8 可选，9 不可选。
    S.adj = S.tiles.map((_, i) => [i - 1, i + 1].filter(j => j >= 0 && j < S.tiles.length));
    P.pos = 0; P.hand = [laser(), laser()];
    const at8 = target(S, 8), at9 = target(S, 9);
    await E.playCard(0);
    assert.ok(S.targeting.candidates.includes(at8.uid));
    assert.ok(!S.targeting.candidates.includes(at9.uid));
    E.chooseTarget(at9.uid);
    assert.equal(P.hand.length, 2);
    E.cancelTargeting();
    assert.equal(E.effectCardDamage(laser()), 3);
    await E.playCard(0); at8.hp = 0; E.chooseTarget(at8.uid);
    assert.equal(P.hand.length, 2, "失效目标不消耗牌");
    assert.equal(E.effectCardDamage(laser()), 3);
    E.cancelTargeting(); at8.hp = 100;
    await E.playCard(0); at8.pos = 9; E.chooseTarget(at8.uid);
    assert.equal(P.hand.length, 2, "移出射程不消耗牌");
    E.cancelTargeting();
    assert.equal(await E.playCard(0), false, "范围内没有目标不能使用");
    at8.pos = 8;
    await fire(at8); assert.equal(at8.hp, 97);
    assert.equal(E.effectCardDamage(P.hand[0]), 4, "第一张结算后立即成长");
    assert.equal(P.cardPlayCounts.arcaneLaser, 1, "取消和无效目标不计入次数");
    assert.equal(E.cardDescription(P.hand[0]), "指定8格内一名怪物，造成4点伤害");
    assert.match(w.document.getElementById("hand").textContent, /造成4点伤害/);
    assert.match(w.document.getElementById("info").textContent, /本局累计 \+1/);
    for (let i = 0; i < 3; i++) w.UI.renderAll();
    assert.equal(E.effectCardDamage(laser()), 4, "预览不叠加成长");
    X.startRound();
    assert.equal(P.cardPlayCounts.arcaneLaser, 1, "跨回合保留累计次数");
    await fire(at8); assert.equal(at8.hp, 93);
    assert.equal(E.effectCardDamage(P.hand[0]), 5, "第二张结算后，已有副本共享成长");
    assert.equal(E.cardDescription(P.hand[0]), "指定8格内一名怪物，造成5点伤害");
    assert.match(w.document.getElementById("hand").textContent, /造成5点伤害/);
    assert.match(w.document.getElementById("info").textContent, /本局累计 \+2/);
    P.hand = [D.cards.katana]; E.useSkill();
    assert.equal(E.effectCardDamage(P.hand[0]), 5, "新生成副本共享成长");
    await fire(at8); assert.equal(at8.hp, 88);
    P.hand = hand("laser", "atk_s"); at8.pos = 1;
    await E.playCard(0); E.chooseTarget(at8.uid);
    assert.equal(at8.hp, 85, "普通激光保持 3 点");
    X.startBattle("player", at8); E.playBattleCard("atk_s");
    assert.equal(E.effectCardDamage(laser()), 6, "普通效果牌和战斗牌不增加专属成长");
    assert.equal(P.cardPlayCounts.arcaneLaser, 3, "普通牌不计入充能次数");
    S.battle = null; S.phase = "play";
    P.hp = 0; X.checkPlayerKo();
    assert.equal(P.ko, true); assert.equal(E.effectCardDamage(laser()), 6);
    X.startRound(); assert.equal(P.ko, false); assert.equal(E.effectCardDamage(laser()), 6);
    assert.equal(P.cardPlayCounts.arcaneLaser, 3, "复活保留累计次数");
    at8.hp = 100; at8.marks = 0;
    P.hand = [laser(), laser(), laser()];
    for (const expected of [6, 7, 8]) {
      const hp = at8.hp; await fire(at8); assert.equal(hp - at8.hp, expected);
    }
    assert.equal(E.effectCardDamage(laser()), 9, "第六张结算后提升至 9 点");
    E.newGame(); assert.equal(E.effectCardDamage(laser()), 3, "新对局重置成长");
    assert.equal(E.state.player.cardPlayCounts.arcaneLaser, 0, "新对局重置进度");
  }
  {
    const { S, P } = start(); P.hand = [laser()]; P.chips = ["recycle"];
    const m = target(S); m.hp = 5; m.marks = 2;
    const q = { target: m.def.id, progress: 0, need: 2, done: false }; S.quests = [q];
    const coins = P.coins;
    await fire(m);
    assert.ok(!S.monsters.includes(m), "标记增伤与击杀生效");
    assert.equal(q.progress, 1); assert.equal(P.coins, coins + m.def.coinDrop + 1);
    assert.equal(E.effectCardDamage(laser()), 4, "首次击杀立即成长");
    assert.equal(P.cardPlayCounts.arcaneLaser, 1);
  }
  {
    const { S, P } = start(); P.hand = [laser()];
    const first = target(S); await fire(first);
    P.hand = [laser()];
    const m = target(S, P.pos, "boss"); m.hp = 3;
    await fire(m);
    assert.equal(S.over, true); assert.equal(E.effectCardDamage(laser()), 5, "终局击杀完成出牌结算");
  }
  console.log("PASS 星梦角色、界面、回收、充能、动态伤害、射程、击杀与重开");
  dom.window.close();
})().catch(err => { console.error(err); dom.window.close(); process.exitCode = 1; });
