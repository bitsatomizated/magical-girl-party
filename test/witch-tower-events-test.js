const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { readEngineSource } = require("../tools/runtime-source.cjs");
const root = path.join(__dirname, "..");
function setup(diff="normal") {
  const math=Object.create(Math); math.random=()=>0;
  const logs=[], timers=new Map(); let seq=0;
  const w=vm.createContext({Math:math,__FAST__:true,__askAuto:()=>false,
    setTimeout:cb=>{timers.set(++seq,cb);return seq;},clearTimeout:id=>timers.delete(id),
    UI:{log:m=>logs.push(m),renderAll(){},enterBattle(){}}}); w.window=w;
  vm.runInContext(fs.readFileSync(path.join(root,"js/data.js"),"utf8"),w);
  vm.runInContext(readEngineSource(),w);
  const E=w.Engine,D=w.GAME_DATA,X=E._test; D.map=D.maps.witch_tower; D.diff=diff;
  E.newGame(); E.state.aiBusy=true;
  return {E,D,X,S:E.state,logs,timers};
}
(async()=>{
  {
    const {E,X,S}=setup();
    assert.deepEqual(Array.from(S.npcs,n=>n.definition.id),["npc_taoyao","npc_manzhushahua","npc_linglan","npc_baishuixian"]);
    assert.deepEqual(Array.from(S.npcs,n=>n.pos),[2,4,8,10]);
    assert.deepEqual(Array.from(S.npcs,n=>E.peekAllyNext(n)),[5,7,11,13]);
    assert.deepEqual(Array.from(S.monsters,m=>m.def.id),["tower_luoluo","tower_xiaobai","tower_variant","lab_wander","lab_wander","lab_wander"]);
    assert.deepEqual(Array.from(S.monsters,m=>m.pos),[22,24,33,12,25,26]);
    assert.equal(E.peekNext(S.monsters[0]),19); assert.equal(E.peekNext(S.monsters[1]),21);
    assert.ok([31,32].includes(E.peekNext(S.monsters[2])));
    assert.equal(S.monsters.filter(m=>m.def.category==="minion").length,3);
    X.fireRoundStartEffects(1); assert.equal(S.monsters.length,6); assert.equal(S.npcs.length,4);
    X.fireRoundStartEffects(3);
    const red=S.monsters.find(m=>m.def.id==="tower_chihen");
    assert.equal(red.pos,23); assert.equal(E.peekNext(red),20); assert.equal(red.atk,5); assert.equal(red.def_,3);
    assert.equal(S.globalBonus.atk,1); X.fireRoundStartEffects(3); assert.equal(S.globalBonus.atk,1);
    X.fireRoundStartEffects(11); assert.equal(S.globalBonus.atk,2); assert.equal(red.atk,6);
    const late=X.spawnMonster("lab_wander",2); assert.equal(late.atk,5); assert.equal(late.def_,2);
  }
  // 用户确认的时序：击倒 → 任务结算入队 → 下回合开始（即使奖励未选完）登场，不能提前。
  for (const source of ["player","npc","summon"]) {
    const {E,X,S}=setup(); S.round=3; X.fireRoundStartEffects(3);
    const red=S.monsters.find(m=>m.def.id==="tower_chihen");
    if(source==="player") X.dealToMonster(red,1000);
    else if(source==="npc") X.damageMonsterByNpc(S.npcs[0],red,1000);
    else { const ally=X.spawnAlly(0,"dessert_familiar");ally.atk=1000;X.allyStrike(ally,red); }
    const q=S.quests[2]; assert.equal(q.progress,1); assert.equal(q.done,false);
    assert.ok(!S.monsters.some(m=>m.def.id==="tower_yuncai")); assert.equal(S.pendingSpecialEvents.length,0);
    X.judgeQuests(); assert.equal(q.done,true); assert.equal(q.rewardTier,3);
    assert.deepEqual(Array.from(S.pendingSpecialEvents),["yuncaiArrival"]);
    assert.ok(!S.monsters.some(m=>m.def.id==="tower_yuncai")); assert.equal(S.globalBonus.atk,1);
    X.judgeQuests(); assert.equal(S.pendingSpecialEvents.length,1);
    S.round=4; X.startRound();
    const boss=S.monsters.find(m=>m.def.id==="tower_yuncai");
    assert.ok(boss); assert.equal(boss.pos,23); assert.equal(E.peekNext(boss),20);
    assert.equal(boss.atk,8); assert.equal(boss.def_,5); assert.equal(S.globalBonus.atk,2);
    assert.equal(S.pendingSpecialEvents.length,0); assert.equal(S.firedSpecialEvents.yuncaiArrival,true);
    assert.equal(boss.entangleUsed,undefined,"登场不会在轮次开始时抢先行动施法");
    X.startRound(); assert.equal(S.monsters.filter(m=>m.def.id==="tower_yuncai").length,1); assert.equal(S.globalBonus.atk,2);
    E.newGame(); assert.equal(E.state.pendingSpecialEvents.length,0); assert.equal(E.state.firedSpecialEvents.yuncaiArrival,undefined);
  }
  // 同一开始阶段的第11轮事件与特殊事件分别叠加一次。
  {
    const {X,S}=setup(); S.round=10; X.fireRoundStartEffects(3);
    X.dealToMonster(S.monsters.find(m=>m.def.id==="tower_chihen"),1000); X.judgeQuests();
    S.round=11; X.startRound(); assert.equal(S.globalBonus.atk,3); assert.equal(S.globalBonus.def,3);
    assert.equal(S.monsters.find(m=>m.def.id==="tower_yuncai").atk,9);
  }
  // 四档恰好半血的边界：高一滴不赢，抵达阈值后等待轮末任务结算获胜，不要求击杀。
  for(const diff of ["normal","hard","nightmare","crazy"]) {
    const {X,S}=setup(diff), boss=X.spawnMonster("tower_yuncai",23);
    boss.hp=boss.hpMax/2+2; X.dealToMonster(boss,3); assert.equal(S.over,false);
    X.dealToMonster(boss,3); assert.equal(boss.hp,boss.hpMax/2); assert.equal(S.over,false); assert.equal(S.quests[4].done,false);
    X.judgeQuests(); assert.equal(S.win,true);
    assert.equal(S.quests[4].done,true); assert.equal(S.quests[4].progress,1); assert.ok(S.monsters.includes(boss));
  }
  for(const source of ["effect","battle","npc","summon","flame","lethal"]) {
    const {E,D,X,S,logs}=setup(); const boss=X.spawnMonster("tower_yuncai",23); boss.hp=boss.hpMax/2+1;
    S.monsters=[boss]; S.player.pos=23;
    if(source==="effect") { S.player.hand=[D.cards.brick]; await E.playCard(0); E.chooseTarget(boss.uid); }
    if(source==="battle") { S.player.atk=10; X.startBattle("player",boss); E.resolvePlayerAttack(); }
    if(source==="npc") X.damageMonsterByNpc(S.npcs[0],boss,5);
    if(source==="summon") {const a=X.spawnAlly(23,"dessert_familiar");a.atk=10;X.allyStrike(a,boss);}
    if(source==="flame") {boss.pos=20;boss.queuedNext=23;S.player.pos=0;S.flames={23:3};S.move={who:boss,steps:1,attacked:false,done(){}};await X.stepMonster();}
    if(source==="lethal") X.dealToMonster(boss,999);
    assert.equal(S.over,false,source); assert.equal(S.quests[4].done,false);
    if(source==="battle") assert.equal(S.battle?.mode,"monsterAttack","半血后本次反击仍正常进行");
    const friends=S.npcs.slice(), playerHp=S.player.hp;
    friends[0].entangle=3;
    const previousStacks=friends.map(n=>n.entangle||0);
    const protectedSummon=X.spawnAlly(0,"dessert_familiar");
    X.judgeQuests();
    assert.equal(boss.finalLightUsed,true); assert.equal(S.npcs.length,0); assert.ok(friends.every(n=>n.hp===0));
    friends.forEach((n,i)=>{assert.equal(n.entangle,previousStacks[i]+999);assert.equal(n.entangleSlow,n.entangle);});
    assert.equal(logs.filter(s=>s.includes("【缠绕】：")).length,friends.length,"裁光当场为每名NPC结算一次缠绕伤害");
    assert.equal(S.player.hp,playerHp); assert.equal(protectedSummon.hp,protectedSummon.hpMax);
    assert.ok(logs.findIndex(s=>s.includes("发动【裁光】")) < logs.findIndex(s=>s.includes("★ 已达成")));
    X.judgeQuests(); assert.equal(logs.filter(s=>s.includes("发动【裁光】")).length,1);
    assert.equal(S.win,true,source); assert.equal(S.quests[4].done,true); assert.equal(S.battle,null); assert.equal(S.move,null);
    assert.ok(logs.some(s=>s.includes("已达成")&&s.includes("一半")));
  }
  {
    const {X,S}=setup();
    for(let i=0;i<4;i++) X.dealToMonster(X.spawnMonster("lab_wander",0),1000);
    for(const id of ["tower_luoluo","tower_xiaobai","tower_variant"]) X.dealToMonster(S.monsters.find(m=>m.def.id===id),1000);
    X.judgeQuests(); assert.deepEqual(Array.from(S.quests,q=>q.progress),[4,2,0,1,0]);
    assert.deepEqual(Array.from(S.quests,q=>q.done),[true,true,false,true,false]);
    assert.deepEqual(Array.from(S.quests.slice(0,4),q=>q.rewardTier),[1,2,3,3]);
  }
  // 以结算时血量为准：先降至半血，若之后回血超过半血则不胜利。
  {
    const {X,S}=setup();const boss=X.spawnMonster("tower_yuncai",23);
    boss.hp=boss.hpMax/2+1;X.dealToMonster(boss,3);boss.hp+=1;
    X.judgeQuests();assert.equal(S.over,false);assert.equal(S.quests[4].progress,0);
    boss.hp-=1;S.round=S.roundsLimit;X.endRound();assert.equal(S.win,true,"最后一轮先结算胜利任务，再判轮数耗尽");
  }
  console.log("PASS 女巫塔前事件任务：登场方向、轮次强化、任务结算后次回合登场、幂等与重开、全来源半血胜利");
})().catch(e=>{console.error(e);process.exitCode=1;});
