const assert = require("node:assert/strict");
global.window = global;
global.UI = { log() {}, renderAll() {}, enterBattle() {} };
global.__askAuto = () => true;
require("../js/data.js");
require("../js/engine.js");
const D = GAME_DATA, E = Engine, X = E._test;
D.map = { ...D.maps.witch_tower, globalEvents: [] }; D.diff = "normal";
(async () => {
  E.newGame();
  assert.equal(E.state.monsters.length, 0);
  const original = Math.random;
  try {
    for (let i = 0; i < 7; i++) {
      Math.random = () => (i + 0.5) / 7;
      X.randomEvent();
      assert.equal(E.state.monsters.length, 0, `事件 ${i} 不应刷怪`);
    }
    X.eventSpawnMinions(2);
    assert.equal(E.state.monsters.length, 0);
  } finally { Math.random = original; }
  // 轮次事件需要显式允许小怪投放，且不会放开随机地块事件。
  D.map.globalEvents.push({ round: 2, spawns: [{ mob: "lab_wander", tiles: "spawn" }] });
  assert.ok(E.validateConfig().some(issue => issue.path.includes("globalEvents[0].spawns[0].mob")));
  D.map.globalEvents[0].allowMinionSpawns = true;
  assert.deepEqual(E.validateConfig(), []);
  D.map.globalEvents[0].allowMinionSpawns = "true";
  assert.ok(E.validateConfig().some(issue => issue.path.includes("allowMinionSpawns")));
  D.map.globalEvents.pop();
  for (const pos of [2, 4, 29, 30]) {
    E.newGame();
    const S = E.state;
    S.player.pos = pos;
    S.move = { who: "player", steps: 0, spawnDone: false };
    await X.settleLandTile();
    assert.equal(S.monsters.length, 1);
    assert.equal(S.monsters[0].def.id, "lab_wander");
    assert.equal(S.monsters[0].pos, pos);
    assert.ok(S.battle, "落格生成后应进入交战");
  }
  console.log("PASS 女巫塔前：无默认铺怪、随机事件不刷怪、轮次事件显式允许小怪、四处落格生成游荡魔物");
})().catch(error => { console.error(error); process.exitCode = 1; });
