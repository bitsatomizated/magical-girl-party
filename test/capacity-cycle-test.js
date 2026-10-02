const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root,"index.html"),"utf8"), { url:"http://localhost/",runScripts:"outside-only" });
const w=dom.window; w.__FAST__=true;
for(const src of require("../tools/runtime-source.cjs").scriptPaths.filter(s=>!s.endsWith("main.js"))) w.eval(fs.readFileSync(path.join(root,src),"utf8"));
const E=w.Engine,D=w.GAME_DATA,X=E._test;
const hand=(n,id="cake")=>Array.from({length:n},()=>({...D.cards[id]}));
function start(char="char_xingmeng") {
  D.player=D.characters[char];D.map=D.maps.ring_chord;D.diff="normal";E.newGame();
  const S=E.state;S.monsters=[];S.aiBusy=true;
  return {S,P:S.player};
}
(async()=>{
  assert.equal(D.chips.capacity.school,"通用"); assert.equal(D.chips.capacity.rarity,"blue");
  assert.equal(D.chips.cycle.school,"通用"); assert.equal(D.chips.cycle.rarity,"purple");
  {
    const {S,P}=start(); P.hand=hand(8);
    assert.equal(E.maxHandSize(),8); assert.equal(X.drawCard(true),false);
    X.addChip("capacity"); assert.equal(E.maxHandSize(),10);
    assert.equal(X.drawCard(true),true);assert.equal(X.drawCard(true),true);assert.equal(X.drawCard(true),false);
    X.finishPlayerTurn();assert.equal(P.hand.length,10,"回合结束不再截断至 8 张");
    X.startRound();assert.equal(P.hand.length,10);
    P.hand=hand(6);X.startRound();assert.equal(P.hand.length,6,"扩容不抬高魔导充能的 ≤5 门槛");
    P.hand=hand(5);X.startRound();assert.equal(P.hand.length,6);assert.equal(P.hand[5].id,"arcaneLaser");
    P.hand=hand(9);P.chips.push("lore1");X.startRound();assert.equal(P.hand.length,10,"回合抽牌使用扩容上限");
    P.chips=["capacity"];P.hand=hand(9);P.coins=10;
    S.shop={offers:[{card:D.cards.laser,cost:3},{card:D.cards.cake,cost:3}]};w.UI.renderAll();
    assert.match(w.document.getElementById("shop-coins").textContent,/手牌上限 10/);
    E.buyShop([0,1]);assert.equal(P.hand.length,10);assert.equal(P.coins,7);assert.equal(S.shop.offers[1].sold,undefined);
    S.shop=null;P.hand=[...hand(4,"charge"),...hand(6)];P.skillCd=0;S.phase="play";
    E.useSkill();assert.equal(P.hand.length,10);assert.equal(P.hand.filter(c=>c.id==="arcaneLaser").length,4,"生成牌遵守扩容后的上限");
    assert.match(w.document.getElementById("info").textContent,/手牌 10\/10/);
    assert.match(w.document.getElementById("log").textContent,/手牌上限 10 张，1 张【魔导激光】未能获得/);
    P.hp=0;X.checkPlayerKo();assert.equal(E.maxHandSize(),10);X.startRound();assert.equal(E.maxHandSize(),10);
    E.newGame();assert.equal(E.maxHandSize(),8,"新局恢复基础上限");
  }
  {
    const {P}=start("char_pixel_meow");X.addChip("capacity");P.hand=hand(8);
    for(const expected of [9,10,10]) {
      const m=X.spawnMonster("dummy",P.pos);m.hp=1;m.hunt=1;X.dealToMonster(m,1);
      assert.equal(P.hand.length,expected,"追猎击杀补牌使用扩容上限");
    }
  }
  for(const char of Object.keys(D.characters)) {
    const {P}=start(char);const base=D.player.activeSkill.cooldown;
    P.skillCd=base;X.addChip("cycle");assert.equal(P.skillCd,base-1,"获得循环时缩短当前剩余冷却");
    assert.equal(E.skillCooldown(),base-1);assert.equal(D.player.activeSkill.cooldown,base,"不修改角色原始配置");
    P.skillCd=0;E.useSkill();
    if(char==="char_rococo") {
      assert.equal(P.skillCd,0);E.cancelTargeting();assert.equal(P.skillCd,0,"取消召唤不消耗冷却");
      E.useSkill();E.chooseDeployTile(E.state.targeting.candidates[0]);
      E.chooseDeployTile(E.state.targeting.candidates[0]);
    }
    assert.equal(P.skillCd,base-1,"每次施放都使用永久降低后的冷却");
    assert.match(w.document.getElementById("info").textContent,new RegExp(`CD${base-1}`));
    X.startRound();assert.equal(P.skillCd,Math.max(0,base-2));
    X.startRound();assert.equal(P.skillCd,Math.max(0,base-3));
    assert.equal(E.canAct("skill"),true);
    P.hp=0;X.checkPlayerKo();X.startRound();assert.equal(E.skillCooldown(),base-1,"击倒不清除循环");
    E.newGame();assert.equal(E.skillCooldown(),base);
  }
  {
    const {P}=start();P.skillCd=0;X.addChip("cycle");assert.equal(P.skillCd,0);
    X.addChip("cycle");X.addChip("cycle");X.addChip("cycle");
    assert.equal(E.skillCooldown(),0,"冷却不变为负数");
    P.hand=[];E.useSkill();assert.equal(P.skillCd,0);
  }
  E.leaveGame();dom.window.close();console.log("PASS 扩容与循环：抽牌、购物、生成、追猎、回合裁剪、全部角色冷却、界面与重置");
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
