const assert = require("node:assert/strict");
global.window = global;
global.__FAST__ = true;
global.UI = { log() {}, renderAll() {}, enterBattle() {} };
require("../js/data.js");
require("../js/engine.js");
const D = GAME_DATA, E = Engine, X = E._test;
const originalRandom = Math.random;
Math.random = () => 0;
function start(char = "char_pixel_meow") {
  D.player = D.characters[char]; D.map = D.maps.ring_chord; D.diff = "normal";
  E.newGame();
  const S = E.state; S.monsters = []; S.aiBusy = true;
  S.player.pos = 0;
  S.adj = S.tiles.map((_, i) => [i-1,i+1].filter(j=>j>=0&&j<S.tiles.length));
  return { S, P: S.player };
}
function monster(pos, hp = 100) {
  const m = X.spawnMonster("dummy", pos); m.hp = m.hpMax = hp; return m;
}
async function play(id, target) {
  E.state.player.hand.push({...D.cards[id]});
  assert.equal(await E.playCard(E.state.player.hand.length-1), true);
  E.chooseTarget(target.uid);
}
(async () => {
  assert.equal(D.chips.amplify.rarity, "blue");
  assert.equal(D.chips.amplify.school, "通用");
  assert.equal(D.chips.guidance.rarity, "purple");
  assert.equal(D.chips.guidance.school, "标记");
  {
    const { P } = start(); P.chips = ["amplify", "guidance", "hunter3", "wp1"];
    const m = monster(1), coins = P.coins;
    assert.equal(E.effectCardDamage(D.cards.laser), 4);
    assert.match(E.cardDescription(D.cards.laser), /受 4 点伤害/);
    assert.match(E.cardDescription(D.cards.laser), /每个目标获得 1 层标记/);
    for (let i=0;i<3;i++) E.cardDescription(D.cards.laser);
    assert.equal(m.marks, 0, "预览不能施加标记");
    await play("laser", m);
    assert.equal(m.hp, 96, "引导的新标记不提高当前这次伤害");
    assert.equal(m.marks, 1, "效果牌不触发猎印 III");
    assert.equal(P.coins, coins, "效果牌不触发财力 I 的命中金币");
    await play("laser", m);
    assert.equal(m.hp, 91, "后续伤害包含上一张施加的标记");
    assert.equal(m.marks, 2);
    X.monsterTurnEndEffects(m); assert.equal(m.marks, 1, "引导标记正常衰减");
  }
  {
    const { P } = start(); P.chips = ["amplify", "guidance"];
    const main = monster(2), sameTile = monster(2), near = monster(4), outside = monster(5);
    main.marks = 2;
    await play("demo", main);
    assert.deepEqual([main.hp,sameTile.hp,near.hp,outside.hp], [93,95,95,100]);
    assert.deepEqual([main.marks,sameTile.marks,near.marks,outside.marks], [3,1,1,0], "主目标与所有波及目标各挂一次标记，范围外不挂");
  }
  {
    const { P } = start(); P.chips = ["amplify", "amplify", "guidance", "guidance"];
    const m = monster(1);
    await play("brick", m);
    assert.equal(m.hp, 93); assert.equal(m.marks, 2, "词条按持有数量叠加");
  }
  {
    const { S, P } = start(); P.chips = ["amplify", "guidance", "wp2", "recycle"];
    const dead = monster(2,1), alive = monster(3), coins = P.coins, wealth = P.wealth;
    const q = { target:"dummy", progress:0, need:2, done:false }; S.quests = [q];
    await play("demo", dead);
    assert.ok(!S.monsters.includes(dead));
    assert.equal(dead.marks, 1); assert.equal(alive.marks, 1, "主目标死亡不影响波及挂标记");
    assert.equal(P.coins, coins + D.monsters.dummy.coinDrop + 1);
    assert.equal(P.wealth, wealth + 1); assert.equal(q.progress, 1);
  }
  {
    const { P } = start("char_xingmeng"); P.chips = ["amplify", "guidance"];
    const m = monster(1);
    for (const [damage,next] of [[4,4],[5,5],[7,5]]) {
      const hp=m.hp; await play("arcaneLaser",m);
      assert.equal(hp-m.hp,damage); assert.equal(E.effectCardDamage(D.cards.arcaneLaser),next);
    }
    assert.equal(P.cardDamageBonuses.arcaneLaser, 1, "增幅不计入永久成长");
    assert.equal(P.cardPlayCounts.arcaneLaser, 3, "引导不额外增加出牌次数");
  }
  {
    const { P } = start(); P.chips = ["amplify", "guidance"];
    const m = monster(1);
    P.hand = [{...D.cards.laser}]; await E.playCard(0); E.cancelTargeting();
    assert.equal(P.hand.length,1); assert.equal(m.marks,0); assert.equal(m.hp,100);
    P.hp = 10; P.hand = [{...D.cards.cake}]; await E.playCard(0);
    assert.equal(P.hp,12); assert.equal(m.marks,0, "治疗牌不触发引导");
    X.dealToMonster(m,2);
    assert.equal(m.hp,98); assert.equal(m.marks,0, "青焰等通用伤害路径不触发效果牌筹码");
    X.startBattle("player",m); E.resolvePlayerAttack();
    assert.equal(m.hp,95); assert.equal(m.marks,0, "战斗伤害不享受增幅或引导");
  }
  {
    const { S, P } = start();
    const chips = D.chips;
    D.chips = { amplify:chips.amplify, guidance:chips.guidance, ...chips };
    assert.ok(X.genChipChoices(1).includes("amplify"), "增幅进入蓝色奖励/商店公共池");
    S.lastChips = []; assert.ok(X.genChipChoices(2).includes("guidance"), "引导进入紫色奖励/商店公共池");
    P.chips = ["wealth1","regen1"]; S.lastChips = [];
    assert.ok(!X.genChipChoices(2).includes("guidance"), "引导遵守两流派限持");
    D.chips = chips;
  }
  E.leaveGame(); Math.random = originalRandom;
  console.log("PASS 增幅与引导：伤害、范围逐目标标记、时序、星梦成长、触发隔离与卡池");
})().catch(err => { Math.random = originalRandom; console.error(err); process.exitCode=1; });
