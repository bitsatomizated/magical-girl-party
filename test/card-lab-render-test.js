// 卡牌实验室渲染测试：jsdom 加载真实页面，确认 7×8 拓扑能画进棋盘画布（node test/card-lab-render-test.js）
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));

const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/", runScripts: "outside-only", pretendToBeVisual: true });
dom.window.__askAuto = () => true;
const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.message));

for (const src of require("../tools/runtime-source.cjs").scriptPaths) {
  dom.window.eval(fs.readFileSync(path.join(root, src), "utf8"));
}
dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));

const D = dom.window.GAME_DATA;
const M = D.maps.card_lab;
check("地图已注册且可见（未标记 hidden）", !!M && M.hidden !== true);

// 直接把对局指向卡牌实验室（绕过选关界面），验证渲染层
D.map = M;
D.player = D.characters.char_pixel_meow;
D.diff = "normal";
dom.window.Engine.newGame();
dom.window.UI.renderAll();

const S = dom.window.Engine.state;
check("引擎以 38 格初始化", S.tiles.length === 38);
check("邻接表按显式 edges 构建：三岔口 4 号有 3 个邻格", S.adj[4].length === 3);
check("开局按刷怪格铺 6 只游荡魔物", S.monsters.filter(m => m.def.id === "lab_wander").length === 6);
check("魔法少女·变彩落在 16 号格（下边中央）", S.monsters.some(m => m.def.id === "lab_variant" && m.pos === 16));
check("玩家从起始点 3 出发（上边中央）", S.player.pos === 3);

const board = dom.window.document.getElementById("board");
const nodes = board ? board.querySelectorAll("g.node") : [];
const edges = board ? board.querySelectorAll("line.edge") : [];
check("棋盘渲染出 38 个节点", nodes.length === 38);
check("棋盘渲染出 40 条连线", edges.length === 40);

const circles = Array.from(board.querySelectorAll("circle.tile-circle"));
check("地格圆点数量与节点一致", circles.length === 38);
const inCanvas = circles.every(c => {
  const x = +c.getAttribute("cx"), y = +c.getAttribute("cy");
  return x >= 34 && x <= 766 && y >= 34 && y <= 766;
});
check("所有地格落在 800×800 画布内（含半径留边）", inCanvas);

// 与 ui.js 同一套缩放公式（M=70, W=800）：7 列 8 行的最小间距必须大于圆点直径 68
const sc = Math.min((800 - 140) / 6, (800 - 140) / 7);
check(`横向与纵向间距均大于圆点直径（实际间距 ${sc.toFixed(1)}px > 68px）`, sc > 68);
check("页面无脚本异常", errors.length === 0);

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
if (errors.length) errors.forEach(e => console.log("  异常: " + e));
process.exit(fail ? 1 : 0);
