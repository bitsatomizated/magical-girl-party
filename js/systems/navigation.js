// 独立子系统：通过参数取得对局状态与外部服务，不直接访问 UI 或 DOM。
(function () {
  function create({ getState, getMap }) {
    // ---------- 拓扑工具（图泛化，环道为特例）----------
    // 指定方向上的邻格：方向用向量表达（如 [0,-1] 向上）；该方向没有邻格时返回 null
    function dirNeighbor(pos, dv) {
      const S = getState();
      if (!dv || S.tiles[pos].x == null) return null;
      const tx = S.tiles[pos].x + dv[0], ty = S.tiles[pos].y + dv[1];
      return S.adj[pos].find(nb => S.tiles[nb].x === tx && S.tiles[nb].y === ty) ?? null;
    }
    // 初始方向：地图可配 initialDir 向量（如 [0,1] 向下）优先匹配；否则顺时针邻格，再次逆时针，最后任一邻格
    function initialNext(pos) {
      const S = getState();
      const n = S.tiles.length;
      const dv = getMap().initialDir;
      if (dv && S.tiles[pos].x != null) {
        const tx = S.tiles[pos].x + dv[0], ty = S.tiles[pos].y + dv[1];
        const hit = S.adj[pos].find(nb => S.tiles[nb].x === tx && S.tiles[nb].y === ty);
        if (hit != null) return hit;
      }
      const cw = (pos + 1) % n, ccw = (pos - 1 + n) % n;
      if (S.adj[pos].includes(cw)) return cw;
      if (S.adj[pos].includes(ccw)) return ccw;
      return S.adj[pos][0];
    }
    // 可走邻格：排除来路（禁止掉头）；死路时允许回头
    function stepOptions(cur, prev) {
      const S = getState();
      if (prev == null) return [initialNext(cur)];
      const opts = S.adj[cur].filter(x => x !== prev);
      return opts.length ? opts : [prev];
    }
    // BFS 距离（格数），用于直伤射程等
    function graphDist(a, b) {
      const S = getState();
      if (a === b) return 0;
      const seen = new Array(S.tiles.length).fill(false);
      seen[a] = true;
      let layer = [a], d = 0;
      while (layer.length) {
        d++;
        const nx = [];
        for (const c of layer) for (const nb of S.adj[c]) {
          if (seen[nb]) continue;
          if (nb === b) return d;
          seen[nb] = true; nx.push(nb);
        }
        layer = nx;
      }
      return 9999; // 不可达
    }
    function nearestMonster(pos, predicate = () => true) {
      const S = getState();
      let best = null, bd = 1e9;
      S.monsters.forEach(m => { if (m.hp <= 0 || !predicate(m)) return; const d = graphDist(m.pos, pos); if (d < bd) { bd = d; best = m; } });
      return best;
    }

    return { dirNeighbor, stepOptions, graphDist, nearestMonster };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameNavigation = api;
})();
