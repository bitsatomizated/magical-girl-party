const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { loadConfiguration } = require("../tools/validate-config.cjs");
const { validate } = require("../js/systems/config-validation.js");

let cases = 0;
function rejects(mutate, ...paths) {
  const w = loadConfiguration();
  mutate(w.GAME_DATA, w.Engine);
  const issues = w.Engine.validateConfig();
  for (const expected of paths) assert.ok(issues.some(i => i.path === expected), `应报告 ${expected}；实际：${JSON.stringify(issues)}`);
  assert.throws(() => w.Engine.assertConfig(), error => error.name === "ConfigValidationError" && error.issues.length === issues.length);
  cases++;
}

// 全量检查（包含隐藏地图），可以重复执行，不改变配置或创建状态。
{
  const w = loadConfiguration(), before = JSON.stringify(w.GAME_DATA);
  w.Engine.assertConfig(); w.Engine.assertConfig();
  assert.equal(w.Engine.validateConfig().length, 0);
  assert.equal(w.Engine.state, null);
  assert.equal(JSON.stringify(w.GAME_DATA), before);
  // 当前每个内置处理器都声明参数契约，避免新增内置技能时忘记校验。
  for (const definition of w.Engine.effectDefinitions()) assert.notEqual(definition.parameters, null, definition.effect);
}
rejects(d => { d.characters.char_anye.id = "wrong"; d.monsters.dummy.hpMax = 0; }, "characters.char_anye.id", "monsters.dummy.hpMax");
rejects(d => { d.characters.char_anye.attack = NaN; d.monsters.dummy.defense = Infinity; }, "characters.char_anye.attack", "monsters.dummy.defense");
rejects(d => { d.characters.char_anye.move.faces = 0; d.allies.dessert_familiar.move.dice = 1.5; }, "characters.char_anye.move.faces", "allies.dessert_familiar.move.dice");
rejects(d => { d.characters.char_anye.starGrowth[2] = { attack: 2 }; }, "characters.char_anye.starGrowth.2.attack");
rejects(d => { d.characters.char_anye.activeSkill.cooldown = -1; }, "characters.char_anye.activeSkill.cooldown");
rejects(d => { delete d.characters.char_anye.activeSkill.value; }, "characters.char_anye.activeSkill.value");
rejects(d => { d.characters.char_anye.activeSkill.moveBouns = 2; }, "characters.char_anye.activeSkill.moveBouns");
rejects(d => { d.characters.char_rococo.activeSkill.summon = "missing"; }, "characters.char_rococo.activeSkill.summon");
rejects(d => { d.characters.char_rococo.passiveSkill.targets = ["missing"]; }, "characters.char_rococo.passiveSkill.targets[0]");
rejects(d => { d.characters.char_pixel_meow.passiveSkill.drawOnKill = "false"; }, "characters.char_pixel_meow.passiveSkill.drawOnKill");
rejects(d => { d.characters.char_anye.activeSkill.effect = "missing"; d.characters.char_anye.activeSkill.disabled = true; }, "characters.char_anye.activeSkill.effect");
rejects(d => { d.characters.char_anye.activeSkill = { effect: "bossAura", cooldown: 1, atkPer: 1, defPer: 1 }; }, "characters.char_anye.activeSkill.effect");
rejects(d => { d.monsters.maid_anruosu.passives[0].minDiff = "hardd"; }, "monsters.maid_anruosu.passives[0].minDiff");
rejects(d => { d.monsters.maid_anruosu.passives[0].moveByCategory = { elite: 2 }; }, "monsters.maid_anruosu.passives[0].moveByCategory.default");
rejects(d => { d.monsters.maid_anruosu.passives[1].onceKey = "player"; }, "monsters.maid_anruosu.passives[1].onceKey");
rejects(d => { d.monsters.maid_anruosu.passives[1].onceKey = "__proto__"; }, "monsters.maid_anruosu.passives[1].onceKey");
rejects(d => { d.monsters.maid_anruosu.passives[1].threshold = 2; }, "monsters.maid_anruosu.passives[1].threshold");
rejects(d => { d.monsters.maid_yuncai.skill.summon = "missing"; d.monsters.maid_yuncai.skill.copyStats = ["def"]; }, "monsters.maid_yuncai.skill.summon", "monsters.maid_yuncai.skill.copyStats[0]");
rejects(d => { d.monsters.lab_chimera.passives[0].perCount.normal = 0; }, "monsters.lab_chimera.passives[0].perCount.normal");
rejects(d => { delete d.monsters.lab_chimera.passives[0].perCount.normal; }, "monsters.lab_chimera.passives[0].perCount.normal");
rejects(d => { d.monsters.lab_chimera.passives[0].perCount.typo = 1; }, "monsters.lab_chimera.passives[0].perCount.typo");
rejects(d => { d.monsters.lab_variant.skill.tiers[0].into = []; }, "monsters.lab_variant.skill.tiers[0].into");
rejects(d => { d.monsters.lab_variant.skill.tiers[1].from = ["missing"]; }, "monsters.lab_variant.skill.tiers[1].from[0]");
rejects(d => { d.monsters.dummy.diffStats.typo = { attack: 2 }; d.monsters.boss.growth.everyRounds = 0; }, "monsters.dummy.diffStats.typo", "monsters.boss.growth.everyRounds");
rejects(d => { d.maps.ring_chord.startTile = 99; d.maps.ring_chord.bossTile = -1; }, "maps.ring_chord.startTile", "maps.ring_chord.bossTile");
rejects(d => { d.maps.ring_chord.edges.push([0, 99]); }, "maps.ring_chord.edges[13][1]");
rejects(d => { d.maps.ring_chord.edges.push([1, 0]); }, "maps.ring_chord.edges[13]");
rejects(d => { d.maps.ring_chord.edges.push([1, 1]); }, "maps.ring_chord.edges[13]");
rejects(d => { d.maps.ring_chord.edges = [[0, 1], [2, 3]]; }, "maps.ring_chord.edges");
rejects(d => { delete d.maps.tutorial_ring.tiles[4]; delete d.battlePool[0]; }, "maps.tutorial_ring.tiles[4]", "battlePool[0]");
rejects(d => { d.maps.maid_cafe.tiles[0].t = "typo"; delete d.maps.maid_cafe.tiles[1].x; }, "maps.maid_cafe.tiles[0].t", "maps.maid_cafe.tiles[1].x");
rejects(d => { d.maps.tutorial_ring.tiles[4].mob = "missing"; }, "maps.tutorial_ring.tiles[4].mob");
rejects(d => { d.maps.maid_cafe.globalEvents[0].spawns[0].mob = "missing"; }, "maps.maid_cafe.globalEvents[0].spawns[0].mob");
rejects(d => { d.maps.maid_cafe.globalEvents[0].spawns[0].tiles = [999]; }, "maps.maid_cafe.globalEvents[0].spawns[0].tiles[0]");
rejects(d => { d.maps.maid_cafe.globalEvents[0].spawns[0].tiles = "boss"; }, "maps.maid_cafe.globalEvents[0].spawns[0].tiles");
rejects(d => { d.maps.card_lab.globalEvents[0].spawns[0].dir = [0, 0]; }, "maps.card_lab.globalEvents[0].spawns[0].dir");
rejects(d => { d.maps.maid_cafe.globalEvents[0].round = 999; d.maps.maid_cafe.globalEvents[0].effect = "typo"; }, "maps.maid_cafe.globalEvents[0].round", "maps.maid_cafe.globalEvents[0].effect");
rejects(d => { d.maps.maid_cafe.quests[0].targets = ["missing"]; d.maps.maid_cafe.quests[1].rewardTier = 4; }, "maps.maid_cafe.quests[0].targets[0]", "maps.maid_cafe.quests[1].rewardTier");
rejects(d => { d.maps.tutorial_ring.fixedDifficulty = "typo"; d.diff = "typo"; }, "maps.tutorial_ring.fixedDifficulty", "diff");
rejects(d => { d.maps.tutorial_ring.upgradeCost = () => { throw new Error("bad cost"); }; }, "maps.tutorial_ring.upgradeCost(0)");
rejects(d => { d.maps.tutorial_ring.upgradeCost = () => 1; }, "maps.tutorial_ring.upgradeCost(3)");
rejects(d => { d.cards.charge.grant = "missing"; d.cards.atk_s.max = -1; }, "cards.charge.grant", "cards.atk_s.max");
rejects(d => { d.battlePool = []; d.effectPool.push("atk_s"); }, "battlePool", "effectPool[14]");
rejects(d => { d.chips.wp1.perWealthDiv = 0; d.chips.sharp1.rarity = "red"; }, "chips.wp1.perWealthDiv", "chips.sharp1.rarity");
rejects(d => { d.player = { ...d.player, attack: "3" }; }, "player.attack");
rejects(d => { d.map = { ...d.map, startTile: -1 }; }, "map.startTile");
// 错误容器结构应汇总为字段错误，不能先抛 TypeError。
rejects(d => { d.characters = null; d.maps.maid_cafe.tiles = null; d.monsters.dummy.passives = [null]; }, "characters", "maps.maid_cafe.tiles", "monsters.dummy.passives[0]");
assert.equal(validate(null)[0].path, "GAME_DATA");

// 保留已有默认语义，接受新 ID、自定义规则、默认环路和非固定防御倾向。
{
  const w = loadConfiguration(), d = w.GAME_DATA, e = w.Engine;
  e.registerEffect("turnGift", { playerTurnStart() {} }, { value: "nonnegativeInt" });
  d.characters.test = { ...d.player, id: "test", starGrowth: undefined, passiveSkill: { effect: "turnGift", value: 2 } };
  d.player = d.characters.test;
  d.maps.test = { ...d.maps.tutorial_ring, id: "test", edges: [], tiles: [{ t: "start" }, { t: "heal" }], bossTile: undefined, globalEvents: [], quests: [] };
  d.map = d.maps.test;
  delete d.characters.char_rococo.activeSkill.growth;
  d.monsters.dummy.defend = { rule: "hpThreshold", threshold: 0.5, above: "dodge", belowOrEqual: "defend" };
  d.monsters.lab_variant.skill = { effect: "fuseMinions", cooldown: 2, mob: "lab_wander", into: ["lab_chimera"], radius: 1 };
  e.assertConfig();
  d.player.passiveSkill.value = "2";
  assert.ok(e.validateConfig().some(i => i.path === "characters.test.passiveSkill.value"));
}

// 拒绝开局时不能丢失旧局，也不能调用 UI、随机数或技能。
{
  const w = loadConfiguration(), e = w.Engine;
  w.UI = { log() {}, renderAll() {} };
  e.newGame();
  const previous = e.state, snapshot = JSON.stringify(previous);
  w.UI = { log() { throw new Error("不应输出日志"); }, renderAll() { throw new Error("不应渲染"); } };
  w.GAME_DATA.maps.maid_cafe.startTile = -1;
  assert.throws(() => e.newGame(), error => error.name === "ConfigValidationError");
  assert.equal(e.state, previous);
  assert.equal(JSON.stringify(e.state), snapshot);
}

// 真实页面在展示选择界面前检查；错误信息使用纯文本，禁用开始按钮。
(async () => {
  const virtualConsole = new VirtualConsole(), errors = [];
  virtualConsole.on("jsdomError", error => errors.push(error.message));
  const dom = await JSDOM.fromFile(path.join(__dirname, "../index.html"), {
    resources: "usable", runScripts: "dangerously", virtualConsole,
    beforeParse(w) {
      w.addEventListener("DOMContentLoaded", () => { w.GAME_DATA.characters.char_anye.activeSkill.effect = "<b>missing</b>"; });
    },
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("页面加载超时")), 5000);
      if (dom.window.document.readyState === "complete") resolve();
      else dom.window.addEventListener("load", resolve, { once: true });
    });
    const doc = dom.window.document;
    assert.equal(dom.window.Engine.state, null);
    assert.equal(doc.getElementById("btn-start").disabled, true);
    assert.match(doc.querySelector('[role="alert"]').textContent, /characters.char_anye.activeSkill.effect/);
    assert.equal(doc.querySelector('[role="alert"] b'), null);
    assert.equal(doc.getElementById("char-list").children.length, 0);
    assert.deepEqual(errors, []);
  } finally { clearTimeout(timer); dom.window.close(); }
  console.log(`PASS 配置校验：${cases} 组无效配置、合法扩展、无副作用和真实页面错误拦截`);
})().catch(error => { console.error(error); process.exitCode = 1; });
