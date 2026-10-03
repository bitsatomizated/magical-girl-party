// 用户草图的道路契约及真实棋盘渲染检查。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
});
try {
  for (const src of require("../tools/runtime-source.cjs").scriptPaths)
    dom.window.eval(fs.readFileSync(path.join(root, src), "utf8"));
  const D = dom.window.GAME_DATA, M = D.maps.witch_tower;
  dom.window.Engine.assertConfig();
  assert.equal(M.tiles.length, 34);
  assert.equal(M.edges.length, 38);
  const at = (x, y) => M.tiles.findIndex(t => t.x === x && t.y === y);
  const edges = new Set(M.edges.map(([a,b]) => [a,b].sort((a,b) => a-b).join(",")));
  const adj = M.tiles.map(() => []);
  M.edges.forEach(([a,b]) => { adj[a].push(b); adj[b].push(a); });
  M.tiles.forEach((t, i) => {
    const mirror = at(-t.x, t.y);
    assert.ok(mirror >= 0, `格 ${i} 缺少镜像`);
    assert.equal(M.tiles[mirror].t, t.t, `格 ${i} 功能不对称`);
    for (const next of adj[i]) {
      const other = M.tiles[next];
      assert.ok(edges.has([mirror, at(-other.x, other.y)].sort((a,b) => a-b).join(",")), `道路 ${i}-${next} 不对称`);
    }
  });
  assert.equal(M.startTile, at(0, 0));
  assert.equal(M.tiles[M.startTile].t, "start");
  assert.equal(M.tiles[at(0, 8.7)].t, "chipshop");
  const cross = at(0, 4);
  assert.equal(M.tiles[cross].t, "upgrade");
  assert.equal(adj[cross].length, 4);
  assert.equal(adj.filter(a => a.length === 4).length, 1);
  assert.ok(adj.every(a => a.length >= 2), "不应出现断头路");
  assert.ok(edges.has("28,30"), "右下镜像连接必须补齐");
  assert.notEqual(M.hidden, true, "已配置事件和任务，应进入正式选关");
  D.map = M; D.diff = "normal";
  dom.window.Engine.newGame();
  dom.window.UI.renderAll();
  assert.equal(dom.window.Engine.state.player.pos, M.startTile);
  assert.equal(dom.window.Engine.state.monsters.length, 6);
  // 独立NPC无立绘也可显示；缠绕、技能冷却与移动方向均可读。
  const E = dom.window.Engine;
  assert.equal(E.state.npcs.length, 4);
  E.state.npcs[0].entangle = 3; E.state.npcs[0].skillCd = 2;
  E.state.player.entangle = 3; E.state.player.entangleSlow = 3;
  dom.window.UI.renderAll();
  assert.equal(dom.window.document.querySelectorAll(".token-npc").length, 4);
  assert.equal(dom.window.document.querySelectorAll(".info-npc").length, 4);
  const info = dom.window.document.getElementById("info").textContent;
  assert.ok(info.includes("缠绕 3 层") && info.includes("剩余CD 2") && info.includes("队友链接"));
  const questText = dom.window.document.getElementById("quest-list").textContent;
  assert.ok(questText.includes("本局游戏胜利") && !questText.includes("undefined"));
  assert.ok(dom.window.document.getElementById("event-list").textContent.includes("晕彩降临"));
  E.state.pendingSpecialEvents.push("yuncaiArrival");
  dom.window.UI.renderAll();
  assert.ok(dom.window.document.getElementById("event-list").textContent.includes("下回合开始触发"));
  const svg = dom.window.document.querySelector("#board-svg");
  assert.equal(svg.querySelectorAll("g.node").length, 34);
  assert.equal(svg.querySelectorAll("line.edge").length, 38);
  const circles = [...svg.querySelectorAll("circle.tile-circle")];
  const positions = circles.map(c => [+c.getAttribute("cx"), +c.getAttribute("cy"), +c.getAttribute("r")]);
  positions.forEach(([x,y,r], i) => {
    assert.ok(x-r >= 0 && y-r >= 0 && x+r <= 800 && y+r <= 800);
    positions.slice(i+1).forEach(([xx,yy,rr]) => assert.ok(Math.hypot(x-xx,y-yy) > r+rr, "棋盘地块不能重叠"));
  });
  console.log("PASS 女巫塔前：草图拓扑、镜像道路与功能、指定枢纽、初始化及棋盘无重叠");
} finally { dom.window.close(); }
