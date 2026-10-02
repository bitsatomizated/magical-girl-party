// 浏览器级复现：jsdom 加载真实 index.html，捕获页面异常
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const errors = [];
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:8765/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
dom.window.__askAuto = () => true;
dom.window.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));

// 手动按 index.html 的顺序执行脚本，等价于浏览器加载
for (const src of require("../tools/runtime-source.cjs").scriptPaths) {
  const code = fs.readFileSync(path.join(root, src), "utf8");
  try {
    dom.window.eval(code);
  } catch (e) {
    errors.push(`[${src}] 加载期异常: ${e.stack || e}`);
  }
}

// 触发 DOMContentLoaded（main.js 现在渲染开场选择界面）
dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));

// 玩法介绍页：打开 → 返回
const doc0 = dom.window.document;
doc0.getElementById("btn-help").onclick();
if (doc0.getElementById("help-screen").className.includes("hidden")) { console.log("玩法介绍页未能打开"); process.exit(1); }
doc0.getElementById("btn-help-back").onclick();
if (!doc0.getElementById("help-screen").className.includes("hidden")) { console.log("返回后帮助页未隐藏"); process.exit(1); }
if (doc0.getElementById("start-screen").className.includes("hidden")) { console.log("返回后选人界面未恢复"); process.exit(1); }

// 点击「开始游戏」→ 开场剧情 →「推门而入」进入对局
const startBtn = dom.window.document.getElementById("btn-start");
if (!startBtn || !startBtn.onclick) { console.log("开场界面未就绪"); process.exit(1); }
startBtn.onclick();

const introScreen = dom.window.document.getElementById("intro-screen");
if (introScreen.className.includes("hidden")) { console.log("点击开始后未显示开场剧情页"); process.exit(1); }
const introText = dom.window.document.getElementById("intro-text").textContent || "";
if (introText.length < 10) { console.log("开场剧情文案为空"); process.exit(1); }
console.log("开场剧情标题:", dom.window.document.getElementById("intro-title").textContent);

const introBtn = dom.window.document.getElementById("btn-intro-ok");
if (!introBtn || !introBtn.onclick) { console.log("剧情页按钮未绑定"); process.exit(1); }
introBtn.onclick();
if (!introScreen.className.includes("hidden")) { console.log("点击「推门而入」后剧情页未隐藏"); process.exit(1); }

// 跑一小段真实时间让 AI 计时器走起来
setTimeout(() => {
  const doc = dom.window.document;
  const board = doc.getElementById("board");
  const tiles = board ? board.querySelectorAll("g.node").length : 0;
  const edges = board ? board.querySelectorAll("line.edge").length : 0;
  console.log("tile 数量:", tiles, "连线数量:", edges);
  console.log("tile 数量:", tiles);
  console.log("轮次显示:", doc.getElementById("hud-round").textContent);
  console.log("阶段显示:", doc.getElementById("hud-phase").textContent);
  console.log("日志行数:", doc.getElementById("log").children.length);

  // 筹码悬浮说明：给玩家塞一枚筹码 → 重渲染 → 模拟悬浮，检查浮层内容
  const D = dom.window.GAME_DATA;
  const chipId = Object.keys(D.chips)[0];
  dom.window.Engine.state.player.chips = [chipId];
  dom.window.UI.renderAll();
  const tag = doc.querySelector("#info .chip-tag");
  if (!tag || tag.dataset.chip !== chipId) { console.log("筹码标签未带 data-chip 或未渲染"); process.exit(1); }
  tag.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  const tip = doc.getElementById("chip-tip");
  if (!tip || tip.className.includes("hidden")) { console.log("筹码悬浮说明未显示"); process.exit(1); }
  if (!tip.textContent.includes(D.chips[chipId].name) || !tip.textContent.includes(D.chips[chipId].desc)) {
    console.log("筹码悬浮说明内容不符:", tip.textContent); process.exit(1);
  }
  console.log("筹码悬浮说明:", tip.textContent.slice(0, 46));

  // 询问面板：容器必须存在且初始隐藏（原生 confirm/prompt 已由它取代）
  const askPanel = doc.getElementById("ask-panel");
  if (!askPanel) { console.log("缺少询问面板容器 #ask-panel"); process.exit(1); }
  if (!askPanel.className.includes("hidden")) { console.log("询问面板初始应处于隐藏状态"); process.exit(1); }

  if (errors.length) { console.log("捕获异常:"); errors.forEach(e => console.log("  " + e.split("\n")[0])); process.exit(1); }
  else if (tiles === 0) { console.log("页面未渲染出棋盘（无捕获异常，但初始化未完成）"); process.exit(1); }
  else { console.log("页面初始化正常"); }
  process.exit(0);
}, 1500);
