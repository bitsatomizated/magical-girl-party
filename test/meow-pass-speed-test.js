const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readEngineSource}=require('../tools/runtime-source.cjs');
const logs=[],w=vm.createContext({__FAST__:true,setTimeout(){},clearTimeout(){},UI:{log:m=>logs.push(m),renderAll(){},enterBattle(){}}});w.window=w;
vm.runInContext(fs.readFileSync(require.resolve('../js/data.js'),'utf8'),w);vm.runInContext(readEngineSource(),w);
const E=w.Engine,X=E._test,D=w.GAME_DATA;
D.map={...D.maps.witch_tower,globalEvents:[],specialEvents:{},quests:[]};D.diff='normal';E.newGame();
const S=E.state,P=S.player;S.aiBusy=true;
async function pass(m){m.pos=1;m.queuedNext=0;S.move={who:m,steps:1,attacked:true,done(){}};await X.stepMonster();}
(async()=>{
 const m=X.spawnMonster('tower_xiaobai',1);
 await pass(m);await pass(m);
 assert.equal(P.nextTurnSpeedBonus,2,'同一敌人重复路过也叠加，即便已攻击过');
 assert.equal(m.hunt,2,'追猎与移速一样逐次触发，不受已攻击标记限制');
 assert.equal(E.derived().speed,0,'奖励不提前影响本回合');
 const other=X.spawnMonster('tower_luoluo',1);await pass(other);
 assert.equal(P.nextTurnSpeedBonus,3,'隐身敌人路过同样叠加');
 P.ko=true;await pass(other);assert.equal(P.nextTurnSpeedBonus,3,'倒地期间不触发');P.ko=false;
 X.turnStartEffects();assert.equal(P.nextTurnSpeedBonus,0);assert.equal(E.derived().speed,3);
 P.entangleSlow=2;assert.equal(E.derived().speed,1,'与缠绕减速相加');
 P.nextFixed=4;S.phase='move';S.aiBusy=false;S.move=null;E.rollAndMove();
 assert.ok(logs.some(l=>l.includes('遥控骰子：本次移动 5 格')),'固定骰同样享受新增移速');
 S.aiBusy=true;X.turnStartEffects();P.entangleSlow=0;assert.equal(E.derived().speed,0,'下一轮没有新奖励则不保留');
 P.nextTurnSpeedBonus=2;P.hp=0;X.checkPlayerKo();assert.equal(P.nextTurnSpeedBonus,2,'敌人路过后击倒玩家不抹掉下回合奖励');
 E.newGame();assert.equal(E.state.player.nextTurnSpeedBonus,0);assert.equal(E.state.player.turnSpeedBonus,0);
 // 同一次真实移动先经过NPC并攻击，再经过玩家：追猎仍触发，敌人不会再次攻击。
 const s=E.state;s.aiBusy=true;
 const npc=X.spawnNpc('npc_taoyao',1),foe=X.spawnMonster('tower_xiaobai',2);
 const npcHp=npc.hp,playerHp=s.player.hp;foe.queuedNext=1;
 s.move={who:foe,steps:2,attacked:false,done(){}};await X.stepMonster();
 assert.ok(npc.hp<npcHp);assert.equal(foe.pos,0);
 assert.equal(foe.hunt,1);assert.equal(s.player.nextTurnSpeedBonus,1);
 assert.equal(s.player.hp,playerHp,'先攻击NPC后不会重复主动攻击玩家');
 // 未攻击过的敌人经过玩家也只施加一次，不因两个技能时机重复触发。
 s.player.buffs.push({pixel:true});foe.pos=1;foe.queuedNext=0;
 s.move={who:foe,steps:1,attacked:false,done(){}};await X.stepMonster();
 assert.equal(foe.hunt,2);assert.equal(s.player.nextTurnSpeedBonus,2);
 console.log('PASS 喵喵路过移速：逐次叠加、已攻击敌人、隐身、倒地、下回合生效、减速叠加、固定骰、到期清除与重开');
})().catch(e=>{console.error(e);process.exitCode=1;});
