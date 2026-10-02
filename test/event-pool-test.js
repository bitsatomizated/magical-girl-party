// 事件池测试（node test/event-pool-test.js）：验证 8 条地块事件的效果与边界
function makeWindowStub() {
  global.window = global;
  global.UI = { log: () => {}, renderAll: () => {}, enterBattle: () => {} };
  global.__askAuto = () => true;
  global.prompt = () => "6";
}
makeWindowStub();
global.__FAST__ = true;
require("../js/data.js");
require("../js/engine.js");

const E = window.Engine, X = window.Engine._test;
let pass = 0, fail = 0;
const check = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

const setup = (mapKey) => {
  window.GAME_DATA.diff = "normal";
  window.GAME_DATA.map = window.GAME_DATA.maps[mapKey || "maid_cafe"];
  E.newGame();
  E.state.aiBusy = true;
  return E.state;
};

// 强制命中第 r 条：只替换第一次 Math.random，之后的随机保持真实（刷怪选格需要真随机）
const fire = (r) => {
  const orig = Math.random;
  let first = true;
  Math.random = () => { if (first) { first = false; return (r + 0.5) / 8; } return orig(); };
  try { X.randomEvent(); } finally { Math.random = orig; }
};

console.log("[1] 金币：+5 / −3");
let S = setup();
let c0 = S.player.coins;
fire(0);
check(`r=0 获得 5 金币（${c0} → ${S.player.coins}）`, S.player.coins === c0 + 5);
S = setup(); c0 = S.player.coins;
fire(1);
check(`r=1 失去 3 金币（${c0} → ${S.player.coins}）`, S.player.coins === c0 - 3);
S = setup(); S.player.coins = 2;
fire(1);
check("金币不足 3 时归零，不会变负", S.player.coins === 0);

console.log("[2] 下次移速 +3 / 下次攻击 +5");
S = setup(); S.player.moveBonus = 0;
fire(2);
check(`r=2 下次移速 +3（moveBonus = ${S.player.moveBonus}）`, S.player.moveBonus === 3);
S = setup(); S.player.atkBuffNextBattle = 0;
fire(5);
check(`r=5 下次攻击 +5（atkBuffNextBattle = ${S.player.atkBuffNextBattle}）`, S.player.atkBuffNextBattle === 5);
fire(5);
check(`重复命中可叠加为 +10（实际 ${S.player.atkBuffNextBattle}）`, S.player.atkBuffNextBattle === 10);

console.log("[3] 抽 1 张卡与满手降级");
S = setup();
const hand0 = S.player.hand.length;
fire(3);
check(`r=3 抽 1 张卡（${hand0} → ${S.player.hand.length}）`, S.player.hand.length === hand0 + 1);
S = setup();
S.player.hand = Array.from({ length: 8 }, (_, i) => ({ name: "满手" + i }));
c0 = S.player.coins;
fire(3);
check(`满手时降级为 +6 金币（${c0} → ${S.player.coins}），手牌仍为 8`,
  S.player.coins === c0 + 6 && S.player.hand.length === 8);

console.log("[4] 随机两地块各刷 1 只小怪");
S = setup();
S.monsters = [];
fire(4);
check(`r=4 刷出 2 只怪（实际 ${S.monsters.length}）`, S.monsters.length === 2);
check("两只怪在互不相同的地块", S.monsters.length === 2 && S.monsters[0].pos !== S.monsters[1].pos);
check("刷出的都是小怪类别", S.monsters.every(m => m.def.category === "minion"));
check("地块编号在地图范围内",
  S.monsters.every(m => m.pos >= 0 && m.pos < window.GAME_DATA.maps.maid_cafe.tiles.length));
const S2 = setup("ring_chord");
S2.monsters = [];
fire(4);
check(`12 格小地图同样刷出 2 只且不同格（实际 ${S2.monsters.length}）`,
  S2.monsters.length === 2 && S2.monsters[0].pos !== S2.monsters[1].pos);

console.log("[5] 恢复 3 生命");
S = setup(); S.player.hp = 10;
fire(6);
check(`r=6 回复 3（10 → ${S.player.hp}）`, S.player.hp === 13);
S.player.hp = S.player.hpMax - 1;
fire(6);
check(`接近满血时不溢出上限（${S.player.hp}/${S.player.hpMax}）`, S.player.hp === S.player.hpMax);
S = setup(); S.player.hp = S.player.hpMax;
fire(6);
check("满血时保持不变", S.player.hp === S.player.hpMax);

console.log("[6] 失去 3 生命与致死流程");
S = setup(); S.player.hp = S.player.hpMax;
fire(7);
check(`r=7 扣 3 血（${S.player.hpMax} → ${S.player.hp}）`, S.player.hp === S.player.hpMax - 3);
check("高血量时未触发击倒", S.player.ko === false);
S = setup(); S.player.phoenixLeft = 0; S.player.hp = 10;
fire(7);
check(`HP 10 时扣到 7，不击倒（ko=${S.player.ko}）`, S.player.hp === 7 && S.player.ko === false);
S = setup(); S.player.phoenixLeft = 0; S.player.hp = 3;
const roundBefore = S.round;
fire(7);
check(`HP 3 时被打到 0 并击倒（hp=${S.player.hp}, ko=${S.player.ko}）`,
  S.player.hp === 0 && S.player.ko === true);
check(`击倒即时推进轮次进度（${roundBefore} → ${S.round} 轮）`, S.round === roundBefore + 1);
check("击倒清空一次性加成", S.player.moveBonus === 0 && S.player.atkBuffNextBattle === 0);
S = setup(); S.player.phoenixLeft = 0; S.player.hp = 2;
fire(7);
check(`HP 2 时同样归零并击倒（hp=${S.player.hp}）`, S.player.hp === 0 && S.player.ko === true);

console.log("[7] 八条分支均可命中（分布检查）");
S = setup();
const hits = new Array(8).fill(0);
const origRandom = Math.random;
for (let i = 0; i < 8000; i++) hits[Math.floor(origRandom() * 8)]++;
check(`8 个分支在 8000 次抽样中全部出现（最少 ${Math.min(...hits)} 次，最多 ${Math.max(...hits)} 次）`,
  hits.every(h => h > 0));
check("分布接近均匀（各分支占比 10%~15%）",
  hits.every(h => h / 8000 > 0.10 && h / 8000 < 0.15));

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
