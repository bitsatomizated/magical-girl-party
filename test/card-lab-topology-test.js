// 卡牌实验室拓扑测试：38 格「横置的目」几何与左右对称自检（node test/card-lab-topology-test.js）
// 只校验静态数据，不驱动引擎流程
function makeWindowStub() { global.window = global; }
makeWindowStub();
require("../js/data.js");

const D = window.GAME_DATA;
const M = D.maps.card_lab;
let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const N = M.tiles.length;

console.log("[1] 规模与索引");
check("地图已注册", !!M);
check("tiles 共 38 格", N === 38);
check("edges 共 40 条", M.edges.length === 40);
check("所有边索引合法且无自环", M.edges.every(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && a !== b));
check("无重复边", new Set(M.edges.map(([a, b]) => (a < b ? a + "," + b : b + "," + a))).size === M.edges.length);

console.log("[2] 坐标与几何");
check("每格都有显式坐标", M.tiles.every(t => t.x != null && t.y != null));
check("坐标互不重复", new Set(M.tiles.map(t => t.x + "," + t.y)).size === N);
const xs = M.tiles.map(t => t.x), ys = M.tiles.map(t => t.y);
check("外框为宽 7 × 高 8", Math.min(...xs) === 0 && Math.max(...xs) === 6 && Math.min(...ys) === 0 && Math.max(...ys) === 7);
check("起始点位于上边中央 (3,0)", M.tiles[M.startTile].x === 3 && M.tiles[M.startTile].y === 0);
check("BOSS 登场格位于下边中央 (3,7)（由第 1 轮事件投放）", M.tiles[16].x === 3 && M.tiles[16].y === 7);

console.log("[3] 图结构");
const adj = Array.from({ length: N }, () => []);
M.edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
check("四个三岔口：2(2,0) / 4(4,0) / 17(2,7) / 15(4,7)",
  [2, 4, 17, 15].every(i => adj[i].length === 3) && adj.filter(a => a.length === 3).length === 4);
check("三岔口坐标正确", [[2, 2, 0], [4, 4, 0], [17, 2, 7], [15, 4, 7]].every(([i, x, y]) => M.tiles[i].x === x && M.tiles[i].y === y));
check("其余 34 格均为二度", adj.filter(a => a.length === 2).length === 34);
const seen = new Set([M.startTile]), queue = [M.startTile];
while (queue.length) { const c = queue.shift(); for (const nb of adj[c]) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); } }
check("全图连通（自起始点可达全部 38 格）", seen.size === N);

console.log("[4] 三个腔室各宽 2 格");
check("内部（y=1..6）只有 x=0/2/4/6 四列",
  M.tiles.filter(t => t.y > 0 && t.y < 7).every(t => [0, 2, 4, 6].includes(t.x)));
check("竖列 x=2 含 6 个中间格", M.tiles.filter(t => t.x === 2 && t.y > 0 && t.y < 7).length === 6);
check("竖列 x=4 含 6 个中间格", M.tiles.filter(t => t.x === 4 && t.y > 0 && t.y < 7).length === 6);
check("竖列 x=2 逐格相连（2→26→…→31→17）", [2, 26, 27, 28, 29, 30, 31, 17].every((v, i, a) => i === 0 || adj[v].includes(a[i - 1])));
check("竖列 x=4 逐格相连（4→32→…→37→15）", [4, 32, 33, 34, 35, 36, 37, 15].every((v, i, a) => i === 0 || adj[v].includes(a[i - 1])));

console.log("[5] 左右地块类型对称（镜像 x ↔ 6-x）");
const typeAt = new Map(M.tiles.map(t => [t.x + "," + t.y, t.t]));
const missing = M.tiles.filter(t => !typeAt.has((6 - t.x) + "," + t.y));
check("每格的镜像坐标都有地块", missing.length === 0);
const asym = M.tiles.filter(t => typeAt.get((6 - t.x) + "," + t.y) !== t.t);
check(`镜像地块类型一致（不一致 ${asym.length} 处${asym.length ? "：" + asym.map(t => t.t + "@" + t.x + "," + t.y).join(" / ") : ""}）`,
  asym.length === 0);
check("起始点与 BOSS 登场格均落在对称轴 x=3 上", M.tiles[M.startTile].x === 3 && M.tiles[16].x === 3);
check("对称轴上只有这两个格（其余格都是成对的）",
  M.tiles.filter(t => t.x === 3).length === 2);

console.log("[6] 首步方向与地图配置");
const dv = M.initialDir;
const first = adj[M.startTile].find(nb => M.tiles[nb].x === M.tiles[M.startTile].x + dv[0] && M.tiles[nb].y === M.tiles[M.startTile].y + dv[1]);
check("initialDir 指向存在的邻格（首步方向可解析）", first != null);
check("首步向右：抵达 (4,0)", first === 4);
check("刷怪格均配置了游荡魔物（lab_wander）", M.tiles.filter(t => t.t === "spawn").every(t => t.mob === "lab_wander"));
check("开局空场：initialSpawn:false 且不设 bossTile（敌人全部由事件投放）", M.initialSpawn === false && M.bossTile === undefined);
check("指定 BOSS 为 lab_variant（魔法少女·变彩）", M.bossMob === "lab_variant" && M.bossName === "魔法少女·变彩");
const known = ["start", "shop", "draw", "event", "dash", "spawn", "damage", "heal", "chipshop", "upgrade", "assault"];
check("格型均在引擎已支持的列表内", M.tiles.every(t => known.includes(t.t)));
check("刷怪格数量为 6", M.tiles.filter(t => t.t === "spawn").length === 6);

console.log("[7] 上下半区：起始区承担惩罚、终点区更宽松（冲 BOSS 前留通行空间）");
const GOOD = ["shop", "draw", "heal", "upgrade", "chipshop", "dash", "assault"];
const BAD = ["damage", "spawn"];
const top = M.tiles.filter(t => t.y <= 3), bottom = M.tiles.filter(t => t.y >= 4);
const countOf = (arr, kinds) => arr.filter(t => kinds.includes(t.t)).length;
check(`下半区正面格（${countOf(bottom, GOOD)}）不少于上半区（${countOf(top, GOOD)}）`,
  countOf(bottom, GOOD) >= countOf(top, GOOD));
check(`上半区负面格（${countOf(top, BAD)}）不少于下半区（${countOf(bottom, BAD)}）`,
  countOf(top, BAD) >= countOf(bottom, BAD));
check(`偏差仍在可控范围（正面/负面差值均 ≤ 4）：正面 ${countOf(top, GOOD)}/${countOf(bottom, GOOD)}，负面 ${countOf(top, BAD)}/${countOf(bottom, BAD)}`,
  Math.abs(countOf(top, GOOD) - countOf(bottom, GOOD)) <= 4 &&
  Math.abs(countOf(top, BAD) - countOf(bottom, BAD)) <= 4);
check("起始点紧邻的两格均为拿牌（首步不踩坑）",
  [2, 4].every(i => M.tiles[i].t === "draw"));
check(`BOSS 位两侧为回血格（靠近终点有补给）`,
  M.tiles[15].t === "heal" && M.tiles[17].t === "heal");
check("终点行 y=7 不含负面格（冲 BOSS 前只补给、不受罚）",
  M.tiles.filter(t => t.y === 7 && BAD.includes(t.t)).length === 0);
check("疾行格共 6 个：外框上下两行左右各一 + 内圈两条竖列的中段",
  M.tiles.filter(t => t.t === "dash").length === 6 &&
  [[1, 0], [5, 0], [1, 7], [5, 7], [2, 4], [4, 4]].every(([x, y]) => M.tiles.some(t => t.x === x && t.y === y && t.t === "dash")));
check("掉血格剩 2 个，位于内圈两条竖列的上段 (2,2)/(4,2)",
  M.tiles.filter(t => t.t === "damage").length === 2 &&
  [[2, 2], [4, 2]].every(([x, y]) => M.tiles.some(t => t.x === x && t.y === y && t.t === "damage")));

console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
