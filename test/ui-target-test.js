// 瞄准索敌 UI 测试：伤害效果牌按怪物（uid）锁定，棋盘编号标记与右侧列表均可点击
// node test/ui-target-test.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  url: "http://127.0.0.1:8765/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const w = dom.window;
w.__FAST__ = true;
w.__askAuto = () => true;
w.prompt = () => "6";

const errors = [];
w.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));
for (const src of require("../tools/runtime-source.cjs").scriptPaths) {
  try { w.eval(fs.readFileSync(path.join(root, src), "utf8")); }
  catch (e) { errors.push(`[${src}] ${e.stack || e}`); }
}
w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));

let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

// 开局：直接切到女仆咖啡厅
w.GAME_DATA.map = w.GAME_DATA.maps.maid_cafe;
w.GAME_DATA.diff = "normal";
w.Engine.newGame();
const S = w.Engine.state;
S.aiBusy = true;
S.monsters = [];
const putMob = (uid, pos) => {
  const def = w.GAME_DATA.monsters.dummy;
  const m = { uid, def, name: "训练假人" + uid, pos, hp: def.hpMax, hpMax: def.hpMax, atk: def.attack, def_: def.defense, skillCd: 0, hunt: 0 };
  S.monsters.push(m);
  return m;
};
const m1 = putMob(101, 5), m2 = putMob(102, 5), m3 = putMob(103, 7); // 前两只同格
S.player.pos = 5;
S.phase = "play";
S.chipChoice = null;
S.player.hand = [{ ...w.GAME_DATA.cards.brick }]; // 板砖：3 格内 5 点伤害
w.Engine.playCard(0);
w.UI.renderAll();

console.log("[1] 瞄准模式：棋盘标记按怪物生成");
const board = w.document.getElementById("board");
const info = w.document.getElementById("info");
const hits = [...board.querySelectorAll(".target-hit")];
check(`棋盘生成 3 个可点标记（实际 ${hits.length}）`, hits.length === 3);
check("每个标记绑定到具体怪物 uid",
  JSON.stringify(hits.map(g => +g.dataset.uid).sort()) === JSON.stringify([101, 102, 103]));
const idxText = [...board.querySelectorAll(".target-idx")].map(t => t.textContent);
check(`标记带目标编号 1/2/3（实际 ${idxText.join("/")}）`, JSON.stringify(idxText) === JSON.stringify(["1", "2", "3"]));
const xs = hits.map(g => +(g.querySelector("circle").getAttribute("cx")));
check(`同格两只怪的标记横向错开（${xs[0]} vs ${xs[1]}）`, xs[0] !== xs[1]);

console.log("[2] 右侧怪物列表：候选可点击锁定");
const picks = [...info.querySelectorAll(".info-mob.pickable")];
check(`列表中 3 个候选可点（实际 ${picks.length}）`, picks.length === 3);
check("列表条目携带怪物 uid",
  JSON.stringify(picks.map(n => +n.dataset.uid).sort()) === JSON.stringify([101, 102, 103]));
check("列表编号与棋盘一致",
  JSON.stringify([...info.querySelectorAll(".pick-idx")].map(n => n.textContent)) === JSON.stringify(["1", "2", "3"]));

console.log("[3] 点击列表锁定第二只怪：只打中它");
picks[1].onclick();
check(`目标 2 受伤（${m2.hp}/${m2.hpMax}）`, m2.hp === m2.hpMax - 5);
check(`同格的另一只未受伤（${m1.hp}/${m1.hpMax}）`, m1.hp === m1.hpMax);
check(`射程外的第三只未受伤（${m3.hp}/${m3.hpMax}）`, m3.hp === m3.hpMax);
check("结算后退出瞄准（标记清空）", S.targeting === null && board.querySelectorAll(".target-hit").length === 0);

console.log("[4] 点击棋盘标记锁定第三只怪");
S.player.hand = [{ ...w.GAME_DATA.cards.brick }];
w.Engine.playCard(0);
w.UI.renderAll();
const hits2 = [...w.document.getElementById("board").querySelectorAll(".target-hit")];
const hit3 = hits2.find(g => +g.dataset.uid === 103);
check("找到第 3 只怪的标记", !!hit3);
hit3.onclick();
check(`目标 3 受伤（${m3.hp}/${m3.hpMax}）`, m3.hp === m3.hpMax - 5);
check(`目标 1 未受伤、目标 2 保持上一步结果（${m1.hp} / ${m2.hp}）`,
  m1.hp === m1.hpMax && m2.hp === m2.hpMax - 5);

if (errors.length) { console.log("捕获异常:"); errors.forEach(e => console.log("  " + e.split("\n")[0])); fail++; }
console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
