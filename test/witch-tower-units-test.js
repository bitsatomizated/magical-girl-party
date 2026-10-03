const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { readEngineSource } = require("../tools/runtime-source.cjs");
const { create } = require("../js/systems/turns.js");
const root = path.join(__dirname, "..");
function setup() {
  const math = Object.create(Math); math.random = () => 0;
  const timers = new Map(), logs = []; let seq = 0;
  const w = vm.createContext({ Math: math, __FAST__: true, __askAuto: () => false,
    setTimeout: cb => { timers.set(++seq, cb); return seq; }, clearTimeout: id => timers.delete(id),
    UI: { log(message) { logs.push(message); }, renderAll() {}, enterBattle() {} } });
  w.window = w;
  vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), w);
  vm.runInContext(readEngineSource(), w);
  const E = w.Engine, D = w.GAME_DATA, X = E._test;
  D.map = { ...D.maps.witch_tower, globalEvents: [], specialEvents: {}, quests: [] }; D.diff = "normal";
  E.newGame(); const S = E.state; S.aiBusy = true;
  return { w, E, D, X, S, timers, logs };
}
async function moveMonsterOne(c, m, to) {
  m.queuedNext = to;
  c.S.move = { who: m, steps: 1, attacked: false, done() {} };
  await c.X.stepMonster();
}
(async () => {
  // 友方受击只打印一次伤害记录，反击与普通攻击都只扣一次生命。
  for (const kind of ["npc", "summon"]) {
    const {X,logs}=setup();
    const a=kind==="npc"?X.spawnNpc("npc_manzhushahua",0):X.spawnAlly(0,"dessert_familiar");
    const m=X.spawnMonster("lab_thunderbird",0);m.hp=m.hpMax=100;m.atk=5;
    const before=a.hp;logs.length=0;X.allyStrike(a,m);
    assert.equal(a.hp,before-2);
    assert.equal(logs.filter(l=>l.includes("伤害")&&l.includes("反击")).length,1);
    assert.ok(!logs.some(l=>l.includes("还手")));
    logs.length=0;X.monsterStrikeAlly(m,a);
    assert.equal(a.hp,before-4);
    assert.equal(logs.filter(l=>l.includes("伤害")).length,1);
  }
  // 掉落归玩家：玩家伤害、NPC映霞（含隐身珞珞）、NPC普攻均走同一奖励流程。
  for (const [id,coins] of Object.entries({tower_luoluo:12,tower_xiaobai:12,tower_chihen:16,tower_variant:16})) {
    for (const source of ["player","npcSkill",...(id==="tower_luoluo"?[]:["npcAttack"])]) {
      const {X,S}=setup(), monster=X.spawnMonster(id,0);
      monster.hp=1; const before=S.player.coins;
      S.quests=[{targets:[id],need:1,progress:0,done:false}];
      if(source==="player") X.dealToMonster(monster,100);
      else {
        const npc=X.spawnNpc("npc_taoyao",0);
        if(source==="npcSkill") X.npcEffects("npcTurnStart",npc);
        else X.allyStrike(npc,monster);
      }
      assert.equal(S.player.coins,before+coins,`${id}/${source} 金币归玩家`);
      assert.equal(S.quests[0].progress,1);
      assert.ok(!S.monsters.includes(monster));
    }
  }
  // 四档数值逐项验证，独立新怪定义不修改原实验室变彩。
  {
    const { D, X } = setup();
    const specs = {
      tower_luoluo: [[12,14,16,20],[4,4,5,5],2], tower_xiaobai: [[18,20,22,26],[4,4,5,6],3],
      tower_chihen: [[44,48,52,60],[4,4,5,6],2], tower_variant: [[32,34,36,40],[3,3,4,5],2],
      tower_yuncai: [[188,204,226,264],[6,6,7,8],3],
    };
    for (const [id,[hp,atk,def]] of Object.entries(specs)) {
      ["normal","hard","nightmare","crazy"].forEach((diff,i) => {
        D.diff=diff; const m=X.makeMonster(D.monsters[id],0);
        assert.equal(m.hpMax,hp[i]); assert.equal(m.atk,atk[i]); assert.equal(m.def_,def);
      });
    }
    assert.equal(D.monsters.lab_variant.passives[0].effect,"crowdGuard");
  }
  // 隐身：卡牌、普通交战、突击、NPC和召唤物普攻均拒绝；范围波及可命中。
  {
    const c=setup(), {E,D,X,S}=c;
    const cloak=X.spawnMonster("tower_luoluo",0), a=X.spawnNpc("npc_manzhushahua",0), summon=X.spawnAlly(0,"dessert_familiar");
    S.player.hand=[D.cards.brick];
    assert.equal(await E.playCard(0),false); assert.equal(S.player.hand.length,1);
    assert.equal(await X.offerTileFight("land"),false);
    X.startBattle("player",cloak); assert.equal(S.battle,null);
    X.allyStrike(a,cloak); X.allyStrike(summon,cloak); assert.equal(cloak.hp,12);
    S.player.pos=11; S.move={who:"player",steps:0}; await X.settleLandTile(); assert.equal(S.targeting,undefined);
    const visible=X.spawnMonster("tower_xiaobai",0); S.phase="play"; S.player.pos=0; S.player.hand=[D.cards.demo];
    await E.playCard(0); assert.ok(!S.targeting.candidates.includes(cloak.uid));
    E.chooseTarget(visible.uid); assert.equal(cloak.hp,8); assert.equal(S.player.hand.length,0);
    S.flames={2:100}; cloak.pos=1; await moveMonsterOne(c,cloak,2); assert.equal(cloak.hp,8,"青焰不能伤害隐身单位");
    const tao=X.spawnNpc("npc_taoyao",0); X.npcEffects("npcTurnStart",tao);
    assert.equal(cloak.hp,3,"映霞优先穿透隐身"); assert.equal(tao.skillCd,2);
  }
  // 缠绕覆盖召唤物；层数累加，按回合开始锁定减速，相遇双方逐一减层。
  {
    const {E,X,S}=setup();
    const tao=X.spawnNpc("npc_taoyao",0), lily=X.spawnNpc("npc_linglan",3), summon=X.spawnAlly(33,"dessert_familiar");
    const red=X.spawnMonster("tower_chihen",33);
    X.runMonsterSkill(red); assert.equal(S.player.entangle,2); assert.equal(tao.entangle,2); assert.equal(summon.entangle,2);
    assert.equal(red.skillCd,3); X.runMonsterSkill(red); assert.equal(tao.entangle,2,"CD期间不得再次施加");
    const hp=S.player.hp; X.startEntangle(S.player); assert.equal(S.player.hp,hp-2); assert.equal(E.derived().speed,0,"铃兰+2与缠绕-2叠加");
    X.releaseEntangleOnPass(S.player); assert.equal(S.player.entangle,1); assert.equal(tao.entangle,1); assert.equal(S.player.entangleSlow,2);
    lily.pos=0; X.releaseEntangleOnPass(lily); assert.equal(lily.entangle,0); assert.equal(tao.entangle,0); assert.equal(S.player.entangle,0);
    X.releaseEntangleOnPass(summon); assert.equal(tao.entangle,0);
    tao.entangle=99; X.npcMove(tao,()=>{}); assert.ok(!S.npcs.includes(tao)); assert.equal(tao.hp,0,"缠绕致死后不施法、不移动");
  }
  // 晕彩不在行动开始施放裁光，终场技能交由胜利任务结算。
  {
    const {E,X,S}=setup();
    const peer=X.spawnNpc("npc_taoyao",2); peer.entangle=3;
    S.player.pos=1; S.player.lastFrom=0; S.player.entangle=3; S.player.nextFixed=1;
    E.finishPlayPhase(); E.rollAndMove();
    for(let i=0;i<20;i++) await Promise.resolve();
    assert.equal(S.player.pos,2); assert.equal(S.player.entangle,2); assert.equal(peer.entangle,2,"玩家实际移动会解缠");
    S.move=null; S.battle=null;
    const mover=X.spawnNpc("npc_baishuixian",1); mover.entangle=3; mover.queuedNext=2;
    S.move={who:mover,isAlly:true,steps:1,done(){}};
    await X.stepAlly();
    assert.equal(S.player.entangle,1); assert.equal(peer.entangle,1); assert.equal(mover.entangle,1,"NPC经过玩家及其他NPC分别解缠");
  }
  // 召唤物的缠绕在其行动开始结算，叠层持续扣血减速，致死后跳过行动并续接调度。
  {
    const {X,S}=setup(),red=X.spawnMonster("tower_chihen",33),summon=X.spawnAlly(0,"dessert_familiar");
    X.runMonsterSkill(red);let done=0;
    X.allyMove(summon,()=>done++);for(let i=0;i<20;i++)await Promise.resolve();
    assert.equal(summon.hp,18);assert.equal(summon.entangleSlow,2);assert.equal(summon.pos,0);assert.equal(done,1);
    red.skillCd=0;X.runMonsterSkill(red);assert.equal(summon.entangle,4);
    summon.hp=4;X.allyMove(summon,()=>done++);
    assert.equal(summon.hp,0);assert.ok(!S.allies.includes(summon));assert.equal(done,2);
    const npc=X.spawnNpc("npc_baishuixian",0);npc.entangle=2;
    X.npcMove(npc,()=>{});assert.equal(npc.hp,20,"NPC每回合只结算一次缠绕");
  }
  // 实际移动解缠：使魔与玩家、NPC、其他使魔双向参与，自身无缠绕也能帮队友解缠。
  for (const [from,to] of [["player","summon"],["summon","player"],["npc","summon"],["summon","npc"],["summon","summon"]]) {
    const {E,X,S}=setup(); S.player.pos=33; S.tiles[2].t="heal";
    const make=(kind,pos)=>{
      if(kind==="player"){S.player.pos=pos;return S.player;}
      return kind==="npc"?X.spawnNpc("npc_baishuixian",pos):X.spawnAlly(pos,"dessert_familiar");
    };
    const mover=make(from,1),peer=make(to,2);
    mover.entangle=3;peer.entangle=3;mover.entangleSlow=3;
    if(from==="player"){
      mover.entangleSlow=0;mover.lastFrom=0;mover.nextFixed=1;E.finishPlayPhase();E.rollAndMove();
      for(let i=0;i<20;i++)await Promise.resolve();
    }else{
      mover.queuedNext=2;S.move={who:mover,isAlly:true,steps:1,done(){}};await X.stepAlly();
      assert.equal(mover.entangleSlow,3,"解缠不返还已锁定的本回合移动速度");
    }
    assert.equal(mover.pos,2);assert.equal(mover.entangle,2,from+"经过"+to);assert.equal(peer.entangle,2);
  }
  {
    const {X,S}=setup();S.player.pos=2;S.player.entangle=3;
    const peer=X.spawnNpc("npc_baishuixian",2);peer.entangle=3;
    const summon=X.spawnAlly(2,"dessert_familiar");
    assert.equal(peer.entangle,3,"同格生成使魔不解缠");
    summon.queuedNext=1;S.move={who:summon,isAlly:true,steps:1,done(){}};await X.stepAlly();
    assert.equal(peer.entangle,3,"同格起步离开不解缠");
    summon.queuedNext=2;S.move={who:summon,isAlly:true,steps:1,done(){}};await X.stepAlly();
    assert.equal(peer.entangle,2);assert.equal(S.player.entangle,2);assert.equal(summon.entangle,0,"无缠绕使魔分别帮助同格队友，不产生负层数");
  }
  // 映霞CD2：第一回合释放，第二回合不释放，第三回合再次释放。
  {
    const {X,S}=setup(), tao=X.spawnNpc("npc_taoyao",33), cloak=X.spawnMonster("tower_luoluo",0);
    for(let turn=0;turn<3;turn++) {
      X.npcMove(tao,()=>{});
      for(let i=0;i<20;i++) await Promise.resolve();
      assert.equal(cloak.hp,[7,7,2][turn]); assert.equal(tao.skillCd,[2,1,2][turn]);
      S.move=null;
    }
  }
  // 晕彩不在行动开始施放裁光，终场技能交由胜利任务结算。
  {
    const {X,S}=setup(), tao=X.spawnNpc("npc_taoyao",0), summon=X.spawnAlly(0,"dessert_familiar"), boss=X.spawnMonster("tower_yuncai",33);
    X.runMonsterSkill(boss); assert.equal(tao.entangle,0); assert.equal(S.player.entangle,undefined); assert.equal(summon.entangle,undefined);
    boss.hp=boss.hpMax/2; X.runMonsterSkill(boss); assert.equal(tao.hp,26); assert.equal(boss.finalLightUsed,undefined);
    const late=X.spawnNpc("npc_linglan",0); X.runMonsterSkill(boss); assert.equal(late.entangle,0);
  }
  // 红外领域按道路距离，对玩家、NPC、召唤物一视同仁；飞行不免疫范围伤害。
  for (const diff of ["normal","hard","nightmare","crazy"]) {
    const {X,S,D}=setup(); D.diff=diff;
    const red=X.spawnMonster("tower_chihen",0); red.skillCd=3;
    const near=X.spawnNpc("npc_baishuixian",2), far=X.spawnNpc("npc_taoyao",33), summon=X.spawnAlly(6,"dessert_familiar");
    const hp=S.player.hp; X.runMonsterSkill(red);
    const damage=["nightmare","crazy"].includes(diff)?3:0;
    assert.equal(S.player.hp,hp-damage); assert.equal(near.hp,22-damage); assert.equal(far.hp,26); assert.equal(summon.hp,20-damage);
  }
  // 技能刷怪是地图事件禁刷之外的例外；重塑只增最大生命，融合累加两个素材的强化。
  {
    const {X,S}=setup(), variant=X.spawnMonster("tower_variant",16);
    X.runMonsterSkill(variant); const minions=S.monsters.filter(m=>m.def.id==="lab_wander");
    assert.equal(minions.length,2); assert.notEqual(minions[0].pos,minions[1].pos); assert.equal(variant.skillCd,3);
    X.runMonsterSkill(variant); assert.equal(S.monsters.length,3);
    const [a,b]=minions; a.pos=b.pos=variant.pos; a.hp=2;
    X.passByEffects(variant); X.passByEffects(variant); assert.equal(a.atk,5); assert.equal(a.hpMax,9); assert.equal(a.hp,2);
    const coins=S.player.coins; X.devourMinion(a);
    const fused=S.monsters.find(m=>m.def.id==="lab_thunderbird");
    assert.ok(fused); assert.equal(fused.atk,7); assert.equal(fused.hpMax,16); assert.equal(fused.hp,16);
    assert.equal(fused.fusedRound,S.round); assert.equal(S.player.coins,coins);
  }
  // 折光覆盖普攻、效果牌/青焰公共伤害入口、NPC技能与普通攻击、召唤物。
  {
    const {E,X,S}=setup(), boss=X.spawnMonster("tower_yuncai",0), npc=X.spawnNpc("npc_manzhushahua",0), summon=X.spawnAlly(0,"dessert_familiar");
    assert.equal(E.monsterDamagePreview(boss,5),3); assert.equal(E.monsterDamagePreview(boss,1),1);
    X.dealToMonster(boss,5); assert.equal(boss.hp,185);
    X.damageMonsterByNpc(npc,boss,5); assert.equal(boss.hp,182);
    summon.atk=8; X.allyStrike(summon,boss); assert.equal(boss.hp,179);
    npc.atk=8; npc.hp=10; X.allyStrike(npc,boss); assert.equal(boss.hp,176); assert.equal(npc.hp,10,"先吸血+3，后反击-3");
    boss.marks=2; assert.equal(E.monsterDamagePreview(boss,5),5);
  }
  // 飞行避开主动攻击和反击；失去铃兰后光环即时消失。
  {
    const {E,X,S}=setup(), flyer=X.spawnNpc("npc_baishuixian",0), lily=X.spawnNpc("npc_linglan",0), m=X.spawnMonster("tower_xiaobai",0);
    X.monsterStrikeAlly(m,flyer); assert.equal(flyer.hp,22);
    X.allyStrike(flyer,m); assert.equal(flyer.hp,22); assert.equal(m.hp,16);
    assert.equal(E.friendlySpeedBonus(),2); X.damageFriendly(lily,99,"测试"); assert.equal(E.friendlySpeedBonus(),0); assert.ok(!S.npcs.includes(lily));
    flyer.entangle=3; X.npcMove(flyer,()=>{}); assert.equal(flyer.pos,0,"移动最低0"); assert.equal(flyer.hp,19);
  }
  // 玩家倒地期间，有存活NPC时敌人仍行动。
  {
    const {X,S}=setup(); X.spawnNpc("npc_taoyao",0); S.player.ko=true; S.player.hp=0;
    const red=X.spawnMonster("tower_chihen",33); X.aiMove(red,()=>{});
    assert.equal(S.npcs[0].entangle,2); assert.equal(S.player.entangle,undefined);
  }
  // 事件可独立投放NPC，重复结算同轮不会重复生成；重开清空实例。
  {
    const {E,D,X,S}=setup();
    D.map.globalEvents=[{round:2,npcSpawns:[{npc:"npc_taoyao",tile:16}]}];
    X.fireRoundStartEffects(2); X.fireRoundStartEffects(2); assert.equal(S.npcs.length,1); assert.equal(S.npcs[0].pos,16);
    E.newGame(); assert.equal(E.state.npcs.length,0);
  }
  // 调度顺序与一次性续接；NPC阶段支持安全重开。
  {
    const order=[], timers=[], done=[];
    let S={round:1,roundsLimit:3,over:false,player:{},_dbg:{fpt:0,startRound:0,aiStart:0,aiEnd:0,endRound:0},
      allies:[{hp:1}],npcs:[{hp:1},{hp:0},{hp:1}],monsters:[{uid:1,hp:1,skillCd:0,def:{move:{}}}]};
    const t=create({getState:()=>S,render(){},schedule:cb=>timers.push(cb),cancel(){},aiDelay:0,rules:{
      startRound(){},startPlayer(){},endPlayer(){order.push("player");},judgeQuests(){},
      moveAlly(a,cb){order.push("summon");done.push(cb);},moveNpc(n,cb){order.push("npc");done.push(cb);},
      moveMonster(m,cb){order.push("enemy");done.push(cb);},endMonster(){},
    }});
    t.startRound();t.finishPlayerTurn();timers.shift()();done[0]();done[0]();done[1]();done[2]();
    assert.deepEqual(order,["player","summon","npc","npc","enemy"]);
    t.reset();S={...S,round:1};done[3]();assert.equal(timers.length,0);
  }
  console.log("PASS 女巫塔前单位：四档数值、隐身、映霞、缠绕、红外、融合继承、减伤、吸血、飞行、光环、事件与阶段调度");
})().catch(error=>{console.error(error);process.exitCode=1;});
