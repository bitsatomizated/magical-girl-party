const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root,"index.html"),"utf8"), {url:"http://localhost/",runScripts:"outside-only"});
const w=dom.window; w.__FAST__=true; w.Math.random=()=>0;
for(const src of require("../tools/runtime-source.cjs").scriptPaths.filter(s=>!s.endsWith("main.js"))) w.eval(fs.readFileSync(path.join(root,src),"utf8"));
const E=w.Engine,D=w.GAME_DATA,X=E._test;
function start() {
  D.player=D.characters.char_xingmeng;D.map=D.maps.ring_chord;D.diff="normal";E.newGame();
  const S=E.state,P=S.player;S.monsters=[];S.aiBusy=true;P.pos=0;
  const boss=X.spawnMonster("lab_variant",0);boss.hp=boss.hpMax=100;
  const mobs=[X.spawnMonster("dummy",0),X.spawnMonster("dummy",0)];
  for(const m of mobs)m.hp=m.hpMax=100;
  return {S,P,boss,mobs};
}
async function card(id,target) {
  E.state.player.hand=[{...D.cards[id]}];await E.playCard(0);E.chooseTarget(target.uid);
}
(async()=>{
  {
    const {S,boss,mobs}=start();boss.marks=2;
    const before=JSON.stringify(S),log=w.document.getElementById("log").textContent;
    for(let i=0;i<3;i++) {assert.equal(E.monsterDamageReduction(boss),2);assert.equal(E.monsterDamagePreview(boss,5),5);}
    assert.equal(JSON.stringify(S),before,"预览无状态副作用");assert.equal(w.document.getElementById("log").textContent,log);
    assert.equal(X.effAtk(boss),boss.atk);assert.equal(X.effDef(boss),boss.def_);
    assert.equal(X.dealToMonster(boss,5),5,"先标记加伤，再减伤");
    boss.marks=0;assert.equal(X.dealToMonster(boss,1),1,"减伤后仍有保底伤害");
    mobs[0].hp=0;assert.equal(E.monsterDamageReduction(boss),1,"已死未移除单位不计数");
    S.monsters=[boss];assert.equal(E.monsterDamageReduction(boss),0);
    X.spawnAlly(1,"dessert_familiar");assert.equal(E.monsterDamageReduction(boss),0,"使魔不计入怪物数量");
  }
  {
    const {P,boss}=start();P.chips=["guidance","amplify"];
    await card("arcaneLaser",boss);assert.equal(boss.hp,98,"增幅后的 4 伤减至 2");assert.equal(boss.marks,1);
    assert.equal(E.effectCardDamage(D.cards.arcaneLaser),5,"减伤不阻止激光成长");
    await card("arcaneLaser",boss);assert.equal(boss.hp,94,"下一张先用旧标记增伤，再减伤");assert.equal(boss.marks,2);
    w.UI.renderAll();assert.match(w.document.getElementById("info").textContent,/当前减伤 2/);
    X.startBattle("player",boss);assert.match(w.document.getElementById("battle-info").textContent,/减伤 2/);
  }
  {
    const {boss,mobs}=start();const raw=D.cards.demo.dmg;
    await card("demo",mobs[0]);assert.equal(boss.hp,100-Math.max(1,raw-2),"范围伤害对被波及首领同样减伤");
    assert.equal(mobs[1].hp,100-raw,"普通怪不受首领减伤保护");
  }
  {
    const {P,boss}=start();P.atk=10;P.chips=[];
    X.startBattle("player",boss);E.resolvePlayerAttack();
    assert.equal(boss.hp,95,"相同骰点：10 攻 -3 防 -2 减伤 =5");
  }
  {
    const {boss}=start();const ally=X.spawnAlly(1,"dessert_familiar");ally.atk=10;
    X.allyStrike(ally,boss);assert.equal(boss.hp,95,"使魔沿用同一减伤规则");
  }
  {
    const {S,boss,mobs}=start();
    // 将同一被动放在可移动测试怪上，覆盖青焰入口；正式变彩仍驻守。
    const walker=mobs[0];walker.def={...walker.def,passives:[...boss.def.passives]};
    S.monsters=[walker,mobs[1]];S.player.pos=5;
    S.adj=S.tiles.map((_,i)=>[(i+1)%S.tiles.length]);S.flames={1:5};
    S.move={who:walker,steps:1,prev:null,attacked:true};
    await X.stepMonster();assert.equal(walker.hp,96,"青焰 5 伤扣除 1 减伤");
  }
  E.leaveGame();dom.window.close();console.log("PASS 卡牌守护：动态计数、预览、标记、最低伤害、效果牌、范围伤害、战斗、使魔、青焰与界面");
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
