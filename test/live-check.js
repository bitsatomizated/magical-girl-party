// 线上站点启动检查（node test/live-check.js）：加载 GitHub Pages 上的实际页面，确认部署后仍可正常启动
const { JSDOM } = require("jsdom");

const URL = "https://bitsatomizated.github.io/magical-girl-party/";

(async () => {
  const errors = [];
  const dom = await JSDOM.fromURL(URL, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.addEventListener("error", (e) => errors.push(String(e.message)));
  w.addEventListener("unhandledrejection", (e) => errors.push("unhandled: " + String(e.reason)));

  await new Promise((r) => setTimeout(r, 4000));

  let pass = 0, fail = 0;
  const check = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));

  check("页面标题已去掉「MVP 骨架」", !/MVP/.test(w.document.title) && /魔法少女派对/.test(w.document.title));
  check("引擎与数据已加载", !!w.Engine && !!w.GAME_DATA && !!w.UI);

  const btn = w.document.getElementById("btn-start");
  check("开始按钮存在", !!btn);
  if (btn) btn.click();
  await new Promise((r) => setTimeout(r, 800));

  const intro = w.document.getElementById("intro-screen");
  check("点击开始后显示开场剧情页", !!intro && !intro.className.includes("hidden"));
  check("剧情文案已填充", (w.document.getElementById("intro-text").textContent || "").length > 10);
  const introBtn = w.document.getElementById("btn-intro-ok");
  check("剧情页按钮已绑定", !!introBtn && !!introBtn.onclick);
  if (introBtn) introBtn.click();
  await new Promise((r) => setTimeout(r, 2000));

  const board = w.document.getElementById("board");
  const nodes = w.document.querySelectorAll("#board g.node").length;
  const edges = w.document.querySelectorAll("line.edge").length;
  console.log(`      诊断：board=<${board && board.tagName}>  #board g.node=${nodes}  #board .node=${w.document.querySelectorAll("#board .node").length}  #board g=${w.document.querySelectorAll("#board g").length}  #board svg=${w.document.querySelectorAll("#board svg").length}  line.edge=${edges}`);
  check(`棋盘渲染出地块节点（${nodes} 个）`, nodes > 0);
  check(`棋盘渲染出连线（${edges} 条）`, edges > 0);

  const S = w.Engine && w.Engine.state;
  check("引擎进入可玩状态", !!S && !!S.player && Array.isArray(S.monsters));
  if (S) {
    const evTiles = w.GAME_DATA.maps.maid_cafe.tiles.filter((t) => t.t === "event").length;
    check(`当前地图含 ${evTiles} 个事件格`, evTiles === 4);
    check(`怪物已按轮次事件刷出（场上 ${S.monsters.length} 只）`, S.monsters.length > 0);
    check("手牌已发放", S.player.hand.length > 0);
  }

  check("运行期间无 JS 错误", errors.length === 0);
  if (errors.length) errors.slice(0, 5).forEach((e) => console.log("      ! " + e));

  console.log(`\n== 线上启动检查：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("加载失败:", e.message); process.exit(1); });
