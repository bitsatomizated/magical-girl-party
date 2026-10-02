// 渲染层
window.UI = (() => {
  const $ = (id) => document.getElementById(id);

  // 立绘装载：路径为空或加载失败时自动隐藏，不影响 UI 与测试
  // URL 带 ?nocache 时给图片追加时间戳，换图后无需强刷（试玩调试用）
  const NOCACHE = typeof location !== "undefined" && /[?&]nocache/.test(location.search || "");
  function setArt(img, path) {
    if (!img) return;
    if (!path) { img.style.display = "none"; img.removeAttribute("src"); return; }
    if (NOCACHE) path += (path.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.onerror = () => { img.style.display = "none"; };
    img.onload = () => { img.style.display = ""; };
    if (img.getAttribute("src") !== path) img.setAttribute("src", path);
  }
  const TILE_INFO = {
    start:   { icon: "🚩", name: "起始" },  shop:   { icon: "🏪", name: "商店" },
    dash:    { icon: "💨", name: "疾行" },  damage: { icon: "💥", name: "掉血" },
    heal:    { icon: "💖", name: "回血" },  spawn:  { icon: "👾", name: "刷怪" },
    assault: { icon: "⚔", name: "突击" },  upgrade:{ icon: "⭐", name: "升级" },
    event:   { icon: "❓", name: "事件" },  draw:   { icon: "🃏", name: "拿牌" },
    boss:    { icon: "💀", name: "BOSS" },  chipshop:{ icon: "🎰", name: "筹码店" },
  };

  function log(msg, cls) {
    const el = $("log");
    const div = document.createElement("div");
    if (cls) div.className = cls;
    div.textContent = msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function renderAll() {
    const S = Engine.state;
    if (!S) return;
    window.Tutorial?.update(S);
    const P = S.player;
    $("hud-round").textContent = S.round;
    $("hud-rounds").textContent = S.roundsLimit ?? window.GAME_DATA.map.rounds;
    $("hud-hp").textContent = `${P.hp}/${P.hpMax}`;
    $("hud-star").textContent = P.star;
    $("hud-coin").textContent = P.coins;
    const dv = Engine.derived ? Engine.derived() : { atk: P.atk, def: P.def };
    $("hud-atk").textContent = dv.atk + (P.atkBuffNextBattle ? `（+${P.atkBuffNextBattle}）` : "");
    $("hud-def").textContent = dv.def;
    $("hud-skill").textContent = P.skillCd > 0 ? `冷却${P.skillCd}` : "就绪";
    $("hud-phase").textContent = S.over ? "终局" : ({ play: "出牌阶段", move: "移动阶段", battle: "战斗", turnEnd: "AI回合", idle: "-" })[S.phase] || "-";
    setArt($("hud-avatar"), window.GAME_DATA.player?.art?.full);

    // 面板可见性统一由战斗/商店/筹码状态驱动
    $("battle-panel").classList.toggle("hidden", !S.battle);
    $("shop-panel").classList.toggle("hidden", !S.shop);
    $("chip-panel").classList.toggle("hidden", !S.chipChoice);
    const askOn = !!S.ask;
    $("ask-panel").classList.toggle("hidden", !askOn);
    // 询问期间不隐藏 #turn-panel：玩家需要一边看手牌/信息一边决定（此时出牌已被 S.ask 拦住）
    $("turn-panel").classList.toggle("hidden", !S.over && (!!S.battle || !!S.shop || !!S.chipChoice));
    if (S.shop) renderShop(S);
    if (S.chipChoice) renderChipChoice(S);
    if (askOn) renderAsk(S);
    else $("ask-actions").innerHTML = ""; // 隐藏时清空选项，避免按钮残留在 DOM 中
    if (S.battle) enterBattle();

    renderInfo(S); renderMapSide(S);
    renderBoard(S); renderHand(S); renderActions(S);
    window.Tutorial?.render(S);
  }

  // 棋盘左侧栏：事件日程与地图任务（与怪物信息分离，避免信息面板过长）
  function renderMapSide(S) {
    const D = window.GAME_DATA;
    const evEl = $("event-list"), qEl = $("quest-list");
    if (!evEl || !qEl) return;
    const evs = D.map?.globalEvents || [];
    evEl.classList.toggle("hidden", !evs.length);
    evEl.innerHTML = evs.length ? `<div class="mp-head">🗓 事件日程</div>` + evs.map(e => {
      const state = S.round > e.round ? "（已触发）" : S.round === e.round ? "｜<span class='warn'>本轮触发！</span>" : "";
      const cls = S.round > e.round ? "ev-row past" : S.round === e.round ? "ev-row now" : "ev-row";
      return `<div class="${cls}">第 ${e.round} 轮${e.name ? `【${e.name}】` : ""}：${e.desc}${state}</div>`;
    }).join("") + (() => {
      const b = S.globalBonus || {};
      if (!b.atk && !b.def) return "";
      return `<div class="ev-row now">当前全局强化：所有敌人 攻 +${b.atk} 防 +${b.def}（含此后刷出的敌人）</div>`;
    })() : "";
    const qs = S.quests || [];
    qEl.classList.toggle("hidden", !qs.length);
    qEl.innerHTML = qs.length ? `<div class="mp-head">📋 地图任务</div>` + qs.map(q =>
      `<div class="q-row${q.done ? " done" : ""}">【${q.desc}】<b>${q.progress}/${q.need}</b>${q.done ? "｜<span class='good'>已完成</span>" : ""}` +
      `<br><span class="q-reward">奖励：${q.rewardTier} 级概率筹码${q.extra === "roundProgressMinus1" ? "，轮次进度 -1" : ""}</span></div>`
    ).join("") : "";
  }

  function renderShop(S) {
    const shop = S.shop;
    $("shop-coins").innerHTML = `当前金币：<b>${S.player.coins}</b>｜每张卡售价见卡片（手牌上限 ${Engine.maxHandSize()}）`;
    const offers = $("shop-offers");
    offers.innerHTML = "";
    shop.offers.forEach((o, i) => {
      const el = document.createElement("label");
      el.className = "shop-item";
      const c = o.card;
      el.innerHTML = `<input type="checkbox" data-idx="${i}" ${o.sold ? "disabled" : ""}>` +
        `<span class="card ${c.type}${o.sold ? " disabled" : ""}"><b>${c.name}</b>${c.type === "battle" ? `<span class="cost">战斗牌</span>` : "<span class='cost'>效果牌</span>"}${Engine.cardDescription(c)}</span>` +
        `<span class="price">${o.sold ? "已售出" : `◉ ${o.cost}`}</span>`;
      offers.appendChild(el);
    });
    const act = $("shop-actions");
    act.innerHTML = "";
    addButton(act, "🛒 购买勾选", () => {
      const sel = [...$("shop-offers").querySelectorAll("input:checked")].map(x => +x.dataset.idx);
      Engine.buyShop(sel);
    }, "", !Engine.canAct("shop"));
    addButton(act, "离开商店", () => Engine.closeShop(), "primary", !Engine.canAct("shop"));
  }

  const RARITY_CN = { blue: "蓝", purple: "紫", gold: "金" };

  // 询问面板：保留信息浏览，改变对局的操作统一由 canAct 控制。
  function renderAsk(S) {
    const a = S.ask;
    $("ask-question").textContent = a.question;
    const detail = $("ask-detail");
    detail.textContent = a.detail || "";
    detail.classList.toggle("hidden", !a.detail);
    const act = $("ask-actions");
    act.innerHTML = "";
    a.options.forEach(o => {
      const b = document.createElement("button");
      b.textContent = o.label;
      if (o.cls) b.className = o.cls;
      b.onclick = () => Engine.answerAsk(o.value, a);
      act.appendChild(b);
    });
  }

  function renderChipChoice(S) {
    const wrap = $("chip-options");
    wrap.innerHTML = "";
    S.chipChoice.options.forEach((id, i) => {
      const c = window.GAME_DATA.chips[id];
      if (!c) return;
      const el = document.createElement("div");
      const can = Engine.canAct("chip");
      el.className = `card chip rarity-${c.rarity}` + (can ? " selectable" : " disabled");
      el.innerHTML = `<b>${c.name}</b><span class="cost">${c.school}·${RARITY_CN[c.rarity]}</span>${c.desc}`;
      if (can) el.onclick = () => Engine.pickChip(i);
      wrap.appendChild(el);
    });
    const left = S.chipRefreshLeft || 0;
    $("chip-title").textContent = `🎴 筹码 3 选 1（剩余刷新 ${left} 次）`;
    const act = $("chip-actions");
    act.innerHTML = "";
    addButton(act, `🔄 刷新（剩 ${left} 次）`, () => Engine.refreshChips(), "", left <= 0 || !Engine.canAct("chip"));
  }

  const TAG_CN = { passive: "不主动攻击", aggressive: "主动攻击", canDodge: "会闪避", usesSkill: "使用技能", boss: "BOSS", counter: "会反击" };
  const STANCE_CN = { defend: "防御", dodge: "闪避" };

  const tileNameAt = (S, pos) => TILE_INFO[S.tiles[pos].t].name;

  function renderInfo(S) {
    const D = window.GAME_DATA, P = D.player;
    const el = $("info");
    if (!el) return;
    const cd = S.player.skillCd;
    let html = `<div class="info-sec"><b>我的技能</b>（难度：${D.difficulties?.[D.diff] || "普通"}）<br>` +
      `移动去向：${(() => { const p = Engine.peekPlayerNext(); return p != null ? `下一步 → ${tileNameAt(S, p)}` : "前方岔路，移动时选择"; })()}<br>` +
      `财富层数 ${S.player.wealth}｜再生层数 ${S.player.regen}` +
      ((() => { const per = (S.player.chips || []).reduce((n, id) => n + (D.chips[id]?.regenStacks || 0), 0); return per ? `（每回合开始时 +${per}）` : ""; })()) +
      `<br>手牌 ${S.player.hand.length}/${Engine.maxHandSize()}` +
      `<br>主动【${P.activeSkill.name}】（CD${Engine.skillCooldown()}）：${P.activeSkill.desc} ${cd > 0 ? `｜冷却中：${cd} 轮` : "｜<span class='good'>就绪</span>"}` +
      `<br>被动【${P.passiveSkill.name}】：${P.passiveSkill.desc}` +
      Object.keys(S.player.cardDamageBonuses || {}).map(id =>
        `<br><span class="good">【${D.cards[id].name}】当前伤害 ${Engine.effectCardDamage(D.cards[id])}｜本局累计 +${S.player.cardDamageBonuses[id]}｜充能 ${S.player.cardPlayCounts[id] % P.passiveSkill.everyCards}/${P.passiveSkill.everyCards}</span>`).join("") +
      (S.player.buffs.length ? `<br>当前效果：${S.player.buffs.map(b =>
        `【${b.name}】${b.atk ? `攻+${b.atk}` : ""}${b.dmgTaken ? "（受伤+1）" : ""}${b.heal ? "（回合开始回血）" : ""}`).join(" ")}` : "") +
      `</div>`;
    const chips = S.player.chips || [];
    html += `<div class="info-sec"><b>我的筹码（${chips.length}）</b><br>` +
      (chips.length ? chips.map(id => {
        const c = window.GAME_DATA.chips[id];
        return `<span class="chip-tag rarity-${c.rarity}" data-chip="${id}">${c.name}</span>`;
      }).join(" ") : "暂无") + `</div>`;
    // 怪物图鉴：同一品种合并成一条，个体数值与状态改在棋盘和战斗面板上显示。
    // 例外：瞄准模式下必须按个体列出，否则无法精确锁定同格同名的两只怪。
    // 友方召唤物（甜品使魔等）：与怪物分列展示
    const allies = S.allies || [];
    if (allies.length) {
      html += `<div class="info-sec"><b>友方单位</b><br>` + allies.map(a =>
        `🍰 <b>${a.name}</b> HP ${a.hp}/${a.hpMax} 攻 ${a.atk} 防 ${a.def}` +
        (a.nextMoveBonus ? `｜下次移动速度 +${a.nextMoveBonus}` : "")
      ).join("<br>") + `</div>`;
    }
    html += `<div class="info-sec"><b>怪物图鉴</b><br><span class="info-hint">棋盘上怪物条目：名字 生命 攻/防 + 状态（▮=标记 追=追猎 CD=技能冷却）</span>`;
    const candIds = (S.targeting && !S.targeting.deploy && !S.targeting.deployDir) ? S.targeting.candidates : null;
    const GD = window.GAME_DATA;
    const RANK = { normal: 0, hard: 1, nightmare: 2, crazy: 3 };
    const curRank = RANK[GD.diff] ?? 0;
    const catCN = (c) => c === "boss" ? "BOSS" : c === "elite" ? "精英" : "小怪";
    const mobArt = (d) => d.art?.full ? `<img class="mob-avatar" src="${d.art.full}" alt="" onerror="this.style.display='none'">` : "";
    // 技能、被动与行为是品种级信息，与场上个体无关
    const speciesLines = (d) => {
      const sk = d.skill;
      const skLine = sk ? `<br><span class="mob-active">主动【${sk.name || sk.effect || "未知"}】</span>${sk.desc || ""}` +
        (sk.cooldown ? `（CD ${sk.cooldown} 轮）` : "") : "";
      const ps = (d.passives || []).filter(p => !p.minDiff || curRank >= RANK[p.minDiff]);
      const psLine = ps.map(p =>
        `<br><span class="mob-passive">被动【${p.name || p.effect || "未知"}】</span>${p.desc || ""}`).join("");
      const tags = d.tags.map(t => TAG_CN[t] || t).join("、") || "—";
      const mv = d.move || {};
      const moveBonus = (mv.steps || 1) - 1;
      const moveTxt = mv.stationary ? "驻守不动" : `每回合 1d10${moveBonus ? ` + ${moveBonus}` : ""} 格${d.tags.includes("aggressive") ? "，朝你逼近" : "，不主动靠近"}`;
      // 守方倾向：不配置就是默认防御，写了等于没写；只有会进入闪避姿态的怪才标出来
      const dv = d.defend;
      const dvStances = !dv ? [] : dv.rule === "always" ? [dv.stance]
        : dv.rule === "hpThreshold" ? [dv.above, dv.belowOrEqual] : [];
      const dvTxt = dvStances.includes("dodge")
        ? `｜守方倾向：${dv.rule === "always" ? STANCE_CN[dv.stance]
          : `按血量切换（高于 ${Math.round(dv.threshold * 100)}% 时 ${STANCE_CN[dv.above]}，否则 ${STANCE_CN[dv.belowOrEqual]}）`}`
        : "";
      return skLine + psLine + `<br>行为：${tags}｜移速：${moveTxt}${dvTxt}｜反击：${d.tags.includes("counter") ? "会反击" : "不会反击"}`;
    };
    if (candIds) {
      // —— 瞄准模式：逐个体列出，编号与棋盘标记一致 ——
      S.monsters.forEach(m => {
        const no = candIds.indexOf(m.uid) + 1;
        const pickable = no > 0 && m.hp > 0;
        html += `<div class="info-mob${pickable ? " pickable" : ""}"${pickable ? ` data-uid="${m.uid}"` : ""}${candIds && !pickable ? ' style="opacity:.4"' : ""}>` +
          (pickable ? `<span class="pick-idx">${no}</span>` : "") + mobArt(m.def) +
          `<b>${m.name}</b>（${catCN(m.def.category)}）HP ${m.hp}/${m.hpMax} 攻${m.atk} 防${m.def_}` +
          speciesLines(m.def) + `</div>`;
      });
    } else {
      // —— 图鉴模式：同品种归并为一条 ——
      const order = [], byId = new Map();
      S.monsters.forEach(m => {
        if (!byId.has(m.def.id)) { byId.set(m.def.id, []); order.push(m.def.id); }
        byId.get(m.def.id).push(m);
      });
      if (!order.length) html += `<br>暂无`;
      const rng = (arr) => arr.length === 1 ? String(arr[0]) : `${arr[0]}~${arr[arr.length - 1]}`;
      order.forEach(id => {
        const list = byId.get(id), d = list[0].def;
        const alive = list.filter(m => m.hp > 0).length;
        const atks = [...new Set(list.map(m => m.atk))].sort((a, b) => a - b);
        const defs = [...new Set(list.map(m => m.def_))].sort((a, b) => a - b);
        html += `<div class="info-mob">` + mobArt(d) +
          `<b>${d.name}</b>（${catCN(d.category)}）HP 上限 ${list[0].hpMax}｜攻 ${rng(atks)}｜防 ${rng(defs)}｜悬赏 ◉${d.coinDrop}｜` +
          `<span class="${alive ? "good" : "warn"}">场上 ${list.length} 只${alive !== list.length ? `（存活 ${alive}）` : ""}</span>` +
          speciesLines(d) + `</div>`;
      });
    }
    html += `</div>`;
    el.innerHTML = html;
    // 瞄准中的候选怪物：点击列表条目即锁定该怪物（与棋盘编号一致）
    el.querySelectorAll(".info-mob.pickable").forEach(node => {
      node.onclick = () => window.Engine.chooseTarget(+node.dataset.uid);
    });
  }

  // 棋盘怪物条目的状态后缀：标记 / 追猎 / 技能冷却（图例见右上信息面板）
  function mobStateTag(m) {
    const s = [];
    if (m.marks > 0) s.push(`▮${m.marks}`);
    if (m.hunt > 0) s.push(`追${m.hunt}`);
    if (m.skillCd > 0 && m.def.skill) s.push(`CD${m.skillCd}`);
    return s.length ? " " + s.join("") : "";
  }

  function renderBoard(S) {
    const board = $("board");
    const D = window.GAME_DATA;
    // 平面 2D 拓扑：节点 = 地块，线段 = 连接（拓扑按地图配置，文档03 §1）
    const n = S.tiles.length;
    let pos;
    if (S.tiles.some(t => t.x != null)) {
      // 显式网格坐标：归一化缩放到 800×800 画布（保持等距，居中留边）
      const xs = S.tiles.map(t => t.x ?? 0), ys = S.tiles.map(t => t.y ?? 0);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const M = 70, W = 800;
      const sc = Math.min((W - 2 * M) / Math.max(maxX - minX, 1), (W - 2 * M) / Math.max(maxY - minY, 1));
      const ox = (W - sc * (maxX - minX)) / 2, oy = (W - sc * (maxY - minY)) / 2;
      pos = S.tiles.map(t => ({ x: ox + ((t.x ?? 0) - minX) * sc, y: oy + ((t.y ?? 0) - minY) * sc }));
    } else {
      pos = S.tiles.map((t, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: 400 + 330 * Math.cos(a), y: 400 + 330 * Math.sin(a) }; });
    }
    const edges = D.map.edges || Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);

    let svg = `<svg viewBox="0 0 800 800" id="board-svg">`;
    for (const [a, b] of edges) {
      svg += `<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}" class="edge"/>`;
    }
    const awaitSet = S.move && S.move.who === "player" ? S.move.await : null;
    S.tiles.forEach((tile, i) => {
      const info = TILE_INFO[tile.t];
      const p = pos[i];
      const mobs = S.monsters.filter(m => m.pos === i);
      const isPlayer = S.player.pos === i;
      svg += `<g class="node${isPlayer ? " node-player" : ""}${mobs.length ? " node-mob" : ""}">`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="34" class="tile-circle tile-${tile.t}"/>`;
      if (S.flames && S.flames[i]) { // 青鸾雏焰：青焰环绕的地块（虚焰环 + 火焰角标）
        svg += `<circle cx="${p.x}" cy="${p.y}" r="39" class="tile-flame-ring"/>`;
        svg += `<text x="${p.x + 26}" y="${p.y - 22}" class="tile-icon" text-anchor="middle">🔥</text>`;
      }
      svg += `<text x="${p.x}" y="${p.y - 8}" class="tile-icon" text-anchor="middle">${info.icon}</text>`;
      svg += `<text x="${p.x}" y="${p.y + 12}" class="tile-name" text-anchor="middle">${info.name}</text>`;
      let ty = p.y + 26;
      if (isPlayer) { svg += `<text x="${p.x}" y="${ty}" class="token-p" text-anchor="middle">★我</text>`; ty += 13; }
      // 同格多怪：最多列 3 行，其余折叠为「+N」，避免文字压到相邻地块上
      const shown = mobs.slice(0, 3);
      shown.forEach(m => {
        const cls = m.def.category === "boss" ? "token-boss" : "token-m";
        const label = m.def.category === "boss" ? `💀${m.name} ${m.hp}/${m.hpMax}` : `${m.name} ${m.hp}/${m.hpMax}`;
        // 攻防与品种绑定（同种一致），不在棋盘上重复显示；棋盘只标个体差异：当前生命与状态。
        // 奇美拉「万魔之王」造成的个体攻击差异，在图鉴（攻/防显示为范围）、战斗面板与日志里都能看到。
        const tag = mobStateTag(m);
        svg += `<text x="${p.x}" y="${ty}" class="${cls}" text-anchor="middle">${label}` +
          (tag ? `<tspan class="token-stat">${tag}</tspan>` : "") + `</text>`;
        ty += 13;
      });
      if (mobs.length > shown.length) {
        svg += `<text x="${p.x}" y="${ty}" class="token-more" text-anchor="middle">…还有 ${mobs.length - shown.length} 只</text>`;
        ty += 13;
      }
      // 友方召唤物（甜品使魔）：绿色标识，玩家无法攻击
      (S.allies || []).filter(a => a.pos === i && a.hp > 0).forEach(a => {
        svg += `<text x="${p.x}" y="${ty}" class="token-ally" text-anchor="middle">🍰${a.name} ${a.hp}/${a.hpMax}</text>`;
        ty += 13;
      });
      if (awaitSet && awaitSet.includes(i)) { // 岔路待选项：可点击高亮
        svg += `<g class="move-choice" data-pos="${i}" style="cursor:pointer">` +
          `<circle cx="${p.x}" cy="${p.y}" r="40" class="move-ring"/>` +
          `<circle cx="${p.x}" cy="${p.y}" r="44" fill="transparent"/></g>`;
      }
      // 甜品登场（部署/初始方向）：候选地块高亮，点击确认
      if (S.targeting && (S.targeting.deploy || S.targeting.deployDir) && S.targeting.candidates.includes(i)) {
        svg += `<g class="deploy-choice" data-pos="${i}" style="cursor:pointer">` +
          `<circle cx="${p.x}" cy="${p.y}" r="40" class="deploy-ring"/>` +
          `<circle cx="${p.x}" cy="${p.y}" r="44" fill="transparent"/></g>`;
      }
      svg += `</g>`;
    });
    // 移动方向箭头：黄=我方、红=怪物、紫=BOSS、虚线=岔路候选（点击选择）
    // 只在方向确定时显示，方向未知（登场随机）不预告，避免与真实走向不一致造成误读
    const arrow = (cur, next, t, cls, off = 0) => {
      const a = pos[cur], b = pos[next];
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ox = -((b.y - a.y) / len) * off, oy = ((b.x - a.x) / len) * off;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      return `<g transform="translate(${x + ox},${y + oy}) rotate(${ang})"><path d="M 8 0 L -5 -6 L -2 0 L -5 6 Z" class="${cls}"/></g>`;
    };
    if (!S.over) {
      const mv = (S.move && S.move.who === "player") ? S.move : null;
      const pOpts = Engine.peekPlayerOptions();
      if (pOpts.length === 1) {
        svg += arrow(S.player.pos, pOpts[0], 0.5, "arr-p");
      } else {
        // 岔路待选：每个候选方向画一枚虚线箭头，横向错开便于分辨
        pOpts.forEach((n, i) => {
          svg += arrow(S.player.pos, n, 0.5, "arr-p arr-choice", (i - (pOpts.length - 1) / 2) * 14);
        });
      }
      let mi = 0;
      S.monsters.forEach(m => {
        if (m.hp <= 0) return;
        const n = Engine.peekNext(m);
        if (n == null) return;
        const cls = m.def.category === "boss" ? "arr-boss" : "arr-m";
        svg += arrow(m.pos, n, 0.66, cls, (mi++ % 3) * 7);
      });
      // 友方（甜品使魔）方向预告：绿色箭头，与 stepAlly 的实际走向同一套规则
      (S.allies || []).forEach(a => {
        if (a.hp <= 0) return;
        const n = Engine.peekAllyNext(a);
        if (n == null) return;
        svg += arrow(a.pos, n, 0.66, "arr-ally", (mi++ % 3) * 7);
      });
      // 瞄准模式：候选怪物按「目标编号」逐个标出（同格多怪水平排开，避免标记重叠、便于精确锁怪）
      // 甜品登场的瞄准对象是地块不是怪物，跳过（candidates 是地块编号，与怪物 uid 数值可能重叠）
      if (S.targeting && !S.targeting.deploy && !S.targeting.deployDir) {
        const candIds = S.targeting.candidates;
        const cand = S.monsters.filter(m => candIds.includes(m.uid) && m.hp > 0);
        const byTile = {};
        cand.forEach(m => { (byTile[m.pos] = byTile[m.pos] || []).push(m); });
        Object.keys(byTile).forEach(k => {
          const p = pos[+k], list = byTile[k];
          list.forEach((m, i) => {
            const dx = (i - (list.length - 1) / 2) * 52;
            const cx = p.x + dx, cy = p.y - 62;
            const no = candIds.indexOf(m.uid) + 1;
            svg += `<g class="target-hit" data-uid="${m.uid}" style="cursor:pointer">` +
              `<line x1="${cx}" y1="${cy + 18}" x2="${p.x}" y2="${p.y - 26}" class="target-lead"/>` +
              `<circle cx="${cx}" cy="${cy}" r="19" class="target-ring"/>` +
              `<text x="${cx}" y="${cy + 6}" class="target-idx" text-anchor="middle">${no}</text></g>`;
          });
        });
      }
    }
    svg += `</svg>`;
    board.innerHTML = svg;
    board.querySelectorAll(".move-choice").forEach(el => {
      el.onclick = () => Engine.pickMoveStep(+el.dataset.pos);
    });
    board.querySelectorAll(".deploy-choice").forEach(el => {
      el.onclick = () => Engine.chooseDeployTile(+el.dataset.pos);
    });
    if (S.targeting) board.querySelectorAll(".target-hit").forEach(el => {
      el.onclick = () => Engine.chooseTarget(+el.dataset.uid);
    });
  }

  function renderHand(S) {
    const hand = $("hand");
    hand.innerHTML = "";
    const inPlay = Engine.canAct("play");
    S.player.hand.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = `card ${c.type}` + (inPlay && c.type === "effect" ? " selectable" : "");
      el.innerHTML = `<b>${c.name}</b>${c.type === "battle" ? `<span class="cost">耗${c.cost}点</span>` : ""}${Engine.cardDescription(c)}`;
      if (inPlay && c.type === "effect") el.onclick = () => Engine.playCard(i);
      hand.appendChild(el);
    });
  }

  function renderActions(S) {
    const act = $("actions");
    act.innerHTML = "";
    if (S.over) { addButton(act, "重新开始", () => { $("log").innerHTML = ""; Engine.newGame(); }, "primary"); return; }
    if (S.phase === "play") {
      if (S.targeting) {
        if (S.targeting.deploy) {
          addButton(act, `🍰 ${S.targeting.cardName}：点击棋盘绿色高亮地块放置甜品使魔`, () => {}, "", true);
        } else if (S.targeting.deployDir) {
          addButton(act, `🍰 ${S.targeting.cardName}：点击相邻地块，确定使魔的初始移动方向`, () => {}, "", true);
        } else {
          addButton(act, `🎯 瞄准中：${S.targeting.cardName}（点棋盘编号标记或右侧怪物条目锁怪）`, () => {}, "", true);
        }
        addButton(act, "取消瞄准", () => Engine.cancelTargeting(), "primary", !Engine.canAct("target"));
        return;
      }
      const ready = S.player.skillCd === 0;
      addButton(act, `主动技能${ready ? "" : `（冷却${S.player.skillCd}）`}`, () => Engine.useSkill(), "", !Engine.canAct("skill"));
      addButton(act, "结束出牌阶段 →", () => Engine.finishPlayPhase(), "primary", !Engine.canAct("play"));
    } else if (S.phase === "move") {
      if (S.targeting) {
        addButton(act, `🎯 ${S.targeting.cardName}：点棋盘编号标记或右侧怪物条目锁怪`, () => {}, "", true);
        addButton(act, "取消选择", () => Engine.cancelTargeting(), "primary", !Engine.canAct("target"));
        return;
      }
      const mv = S.move && S.move.who === "player" ? S.move : null;
      if (mv && mv.await) {
        // 岔路待选：提示剩余步数与可选方向数，点击棋盘高亮地块续走
        const hint = document.createElement("div");
        hint.className = "hint-row";
        const directionRule = mv.prev != null && mv.await.includes(mv.prev) ? "方向抉择：首步可掉头" : "不能掉头";
        hint.textContent = `🛤 请选择前进方向：剩余 ${mv.steps} 步，可选 ${mv.await.length} 个方向（${directionRule}）`;
        act.appendChild(hint);
        return;
      }
      addButton(act, "🎲 掷骰移动", () => Engine.rollAndMove(), "primary", !Engine.canAct("move"));
    }
  }

  // ---------- 战斗面板 ----------
  // 战斗面板的「状态」行：双方当前生效的 buff、标记、追猎与技能冷却
  function battleStateLine(S, t) {
    const P = S.player;
    const mine = P.buffs.length
      ? P.buffs.map(b => `【${b.name}】${[b.atk ? `攻+${b.atk}` : "", b.dmgTaken ? "受伤+1" : "", b.heal ? "回合回血" : ""].filter(Boolean).join("/")}`).join(" ")
      : "无";
    const foe = [];
    if (t.marks > 0) foe.push(`标记 ${t.marks} 层`);
    if (t.hunt > 0) foe.push(`追猎 ${t.hunt} 层`);
    if (t.nextBattleAtk) foe.push(`本次攻击 +${t.nextBattleAtk}`);
    if (t.skillCd > 0 && t.def.skill) foe.push(`${t.def.skill.name} 冷却 ${t.skillCd} 轮`);
    return `<b>状态</b>我方：${mine}｜敌方：${foe.length ? foe.join("、") : "无"}<br>`;
  }

  function enterBattle() {
    const S = Engine.state, b = S.battle;
    if (!b) return; // 可见性由 renderAll 统一处理
    $("battle-title").textContent = b.mode === "playerAttack" ? `战斗：对【${b.target.name}】` : `战斗：【${b.target.name}】${b.counter ? "反击你！" : "攻击你！"}`;
    setArt($("battle-art-player"), window.GAME_DATA.player?.art?.full);
    setArt($("battle-art-enemy"), b.target?.def?.art?.full);
    $("battle-art-enemy-name").textContent = b.target?.name || "敌方";
    $("battle-info").innerHTML = "";
    const cardsEl = $("battle-cards"), actEl = $("battle-actions");
    cardsEl.innerHTML = "";
    actEl.innerHTML = "";

    if (b.mode === "playerAttack") {
      const t = b.target;
      const dv = Engine.derived();
      const apv = Engine.attackPreview ? Engine.attackPreview(t) : { total: dv.atk, parts: [] };
      const enemyAtk = apv.enemyAtk ?? t.atk, enemyDef = apv.enemyDef ?? t.def_;
      $("battle-title").textContent = `战斗：对【${t.name}】`;
      $("battle-info").innerHTML =
        `<b>我方</b>攻击 <b>${apv.total}</b>${b.cardBonus ? "+" + b.cardBonus : ""}${apv.parts.length ? `（${apv.parts.join("，")}）` : ""}｜战斗点数 <b>${Engine.playerBattlePoints() - b.spentPoints}</b>（已用 ${b.spentPoints}）<br>` +
        `<b>敌方</b>【${t.name}】HP <b>${t.hp}/${t.hpMax}</b>｜攻 <b>${enemyAtk}</b>｜防 <b>${enemyDef}</b>｜姿态 <b>${STANCE_CN[apv.stance] || "防御"}</b>${t.marks ? `｜标记 ${t.marks} 层（我方伤害 +${t.marks}）` : ""}<br>` +
        battleStateLine(S, t) +
        `结算：我方 ${apv.total}${b.cardBonus ? "+" + b.cardBonus : ""} + 我方骰 vs 敌方 ${enemyDef} + 敌方骰，伤害保底 1${apv.stance === "dodge" ? "；敌方闪避姿态时改比骰点（我方骰 ≥ 敌方骰则它不受伤）" : ""}`;
      const pts = Engine.playerBattlePoints() - b.spentPoints;
      S.player.hand.filter(c => c.type === "battle" && c.kind === "atk").forEach(c => {
        const el = document.createElement("div");
        const can = Engine.canAct("battle") && c.cost <= pts;
        el.className = "card battle" + (can ? " selectable" : " disabled");
        el.innerHTML = `<b>${c.name}</b><span class="cost">耗${c.cost}点</span>${c.desc}`;
        if (can) el.onclick = () => Engine.playerPlayBattleCard(c.id);
        cardsEl.appendChild(el);
      });
      addButton(actEl, "⚔ 结算攻击", () => Engine.resolvePlayerAttack(), "primary", !Engine.canAct("battle"));
    } else {
      const t = b.target, dv = Engine.derived();
      const dpv = Engine.defensePreview ? Engine.defensePreview(t) : null;
      const stanceTxt = dpv ? (dpv.stance === "dodge" ? "闪避" : "防御") : "防御";
      $("battle-title").textContent = `战斗：【${t.name}】${b.counter ? "反击你！" : "攻击你！"}`;
      $("battle-info").innerHTML =
        `<b>我方</b>生命 <b>${S.player.hp}/${S.player.hpMax}</b>｜防御 <b>${dpv ? dpv.myDef : dv.def}</b>` +
        (dpv && dpv.defBonus ? `（基础 ${dpv.baseDef} + 防御牌 ${dpv.defBonus}）` : "") + `<br>` +
        `<b>敌方</b>【${t.name}】攻击 <b>${dpv ? dpv.enemyAtk : t.atk}</b>` +
        (dpv && dpv.enemyAtkBonus ? `（基础 ${dpv.enemyBaseAtk} + 加成 ${dpv.enemyAtkBonus}）` : "") +
        (dpv && dpv.enemyDiceBonus ? `｜骰点 +${dpv.enemyDiceBonus}` : "") +
        `｜姿态 ${stanceTxt}<br>` +
        battleStateLine(S, t) +
        `结算方式：<b>防御</b>＝敌方攻+敌骰 −（我方防+我骰），伤害保底 1；<b>闪避</b>＝只比骰点，我方骰 ≥ 敌方骰即不受伤（失败则防御按 0 算）<br>` +
        `先打防御牌可提升我方防御，姿态确定后才掷骰。`;
      const pts = Engine.playerBattlePoints() - b.spentPoints;
      S.player.hand.filter(c => c.type === "battle" && c.kind === "def").forEach(c => {
        const el = document.createElement("div");
        const can = Engine.canAct("battle") && c.cost <= pts;
        el.className = "card battle" + (can ? " selectable" : " disabled");
        el.innerHTML = `<b>${c.name}</b><span class="cost">耗${c.cost}点</span>${c.desc}`;
        if (can) el.onclick = () => Engine.playerPlayBattleCard(c.id);
        cardsEl.appendChild(el);
      });
      addButton(actEl, "🛡 防御", () => Engine.playerChooseStance("defend"), "", !Engine.canAct("battle"));
      addButton(actEl, "💨 闪避", () => Engine.playerChooseStance("dodge"), "primary", !Engine.canAct("battle"));
    }
  }

  function addButton(parent, text, onclick, cls = "", disabled = false) {
    const b = document.createElement("button");
    b.textContent = text;
    if (cls) b.className = cls;
    b.disabled = disabled;
    b.onclick = onclick;
    parent.appendChild(b);
  }

  // ---------- 筹码悬浮说明 ----------
  // 浮层挂在 body 上：筹码列表位于 #info 内，而 #info 是 overflow-y:auto 的滚动容器，内部绝对定位会被裁剪
  function ensureChipTip() {
    let tip = document.getElementById("chip-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "chip-tip";
      tip.className = "hidden";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function hideChipTip() {
    const tip = document.getElementById("chip-tip");
    if (tip) tip.classList.add("hidden");
  }

  function showChipTip(tag) {
    const c = window.GAME_DATA.chips[tag.dataset.chip];
    if (!c) return;
    const tip = ensureChipTip();
    tip.innerHTML = `<b>${c.name}</b><span class="tip-meta">${c.school}·${RARITY_CN[c.rarity]}</span>` +
      `<div class="tip-desc">${c.desc}</div>`;
    tip.classList.remove("hidden");
    // 先显示再量尺寸，然后按视口边界校正：默认贴上方，顶部空间不足则改到下方
    const r = tag.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top = r.top - th - 6;
    if (top < 8) top = r.bottom + 6;
    tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - tw - 8)) + "px";
    tip.style.top = Math.max(8, Math.min(top, window.innerHeight - th - 8)) + "px";
  }

  // 事件委托：#info 的 innerHTML 每次渲染都会重建，事件必须绑在容器上才不会失效
  function bindChipTip() {
    const info = $("info");
    if (!info) return;
    info.addEventListener("mouseover", (e) => {
      const tag = e.target.closest && e.target.closest(".chip-tag");
      if (tag) showChipTip(tag);
    });
    info.addEventListener("mouseout", (e) => {
      if (e.target.closest && e.target.closest(".chip-tag")) hideChipTip();
    });
    info.addEventListener("scroll", hideChipTip);
  }

  // ---------- 开场剧情 ----------
  function beginRun() {
    $("log").innerHTML = "";
    window.Engine.newGame();
  }

  function showIntro() {
    const m = window.GAME_DATA.map;
    if (!m || !m.intro) { beginRun(); return; } // 未写剧情的地图直接开局
    $("intro-title").textContent = m.name;
    $("intro-text").textContent = m.intro;
    $("intro-screen").classList.remove("hidden");
  }

  // ---------- 开场选择界面 ----------
  function renderSetup() {
    const D = window.GAME_DATA;
    renderWinRecord();
    window.__setup = {
      char: Object.keys(D.characters)[0],
      map: (Object.values(D.maps).find(m => !m.hidden) || Object.values(D.maps)[0]).id,
      diff: "normal",
    };
    // 角色卡
    const cl = $("char-list");
    cl.innerHTML = "";
    Object.values(D.characters).forEach(c => {
      const el = document.createElement("div");
      el.className = "setup-card" + (c.id === window.__setup.char ? " selected" : "");
      el.innerHTML = (c.art?.full ? `<img class="setup-art" src="${c.art.full}" alt="" onerror="this.style.display='none'">` : "") +
        `<b>${c.name}</b>` +
        `<span class="setup-stat">HP ${c.hpMax}｜攻 ${c.attack}｜防 ${c.defense}｜金币 ${c.initialCoins}</span>` +
        `<span class="setup-skill">主动【${c.activeSkill.name}】（CD${c.activeSkill.cooldown}）：${c.activeSkill.desc}</span>` +
        `<span class="setup-skill">被动【${c.passiveSkill.name}】：${c.passiveSkill.desc}</span>`;
      el.onclick = () => {
        window.__setup.char = c.id;
        [...cl.children].forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
      };
      cl.appendChild(el);
    });
    // 地图卡：hidden 的地图（测试用）不出现在选关列表
    const ml = $("map-list");
    ml.innerHTML = "";
    Object.values(D.maps).filter(m => !m.hidden).forEach(m => {
      const el = document.createElement("div");
      el.className = "setup-card" + (m.id === window.__setup.map ? " selected" : "");
      el.innerHTML = `<b>${m.name}</b>` +
        `<span class="setup-stat">${m.rounds} 轮｜${m.tiles.length} 格｜任务 ${m.quests?.length || 0} 个</span>`;
      el.onclick = () => {
        window.__setup.map = m.id;
        [...ml.children].forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        // 教学图锁定难度：切图后若当前难度不可用则回落到锁定难度，并刷新难度按钮
        const locked = D.maps[window.__setup.map].fixedDifficulty;
        if (locked && window.__setup.diff !== locked) window.__setup.diff = locked;
        renderDiffList();
      };
      ml.appendChild(el);
    });
    renderDiffList();
    // 难度选择（教学图等 fixedDifficulty 地图仅锁定难度可选，其余灰掉）
    function renderDiffList() {
      const locked = D.maps[window.__setup.map]?.fixedDifficulty;
      const dl = $("diff-list");
      dl.innerHTML = "";
      Object.entries(D.difficulties).forEach(([id, name]) => {
        const disabled = locked && id !== locked;
        const el = document.createElement("div");
        el.className = "diff-btn" + (id === window.__setup.diff ? " selected" : "") + (disabled ? " disabled" : "");
        el.textContent = name + (disabled ? "（教学图不可选）" : "");
        el.onclick = () => {
          if (disabled) return;
          window.__setup.diff = id;
          renderDiffList();
        };
        dl.appendChild(el);
      });
    }
    $("btn-start").onclick = startGame;
    $("btn-intro-ok").onclick = () => {
      $("intro-screen").classList.add("hidden");
      beginRun();
    };
    bindChipTip();
    // 玩法介绍页：进入/返回（遮罩互斥显示）
    $("btn-help").onclick = () => {
      $("start-screen").classList.add("hidden");
      $("help-screen").classList.remove("hidden");
    };
    $("btn-help-back").onclick = () => {
      $("help-screen").classList.add("hidden");
      $("start-screen").classList.remove("hidden");
    };
    if ($("btn-tutorial")) $("btn-tutorial").onclick = () => window.Tutorial?.start();
    window.Tutorial?.renderEntry();
  }

  // 开场界面的胜利场次展示（读取 localStorage，与引擎记录键一致）
  function renderWinRecord() {
    const el = $("win-record");
    if (!el) return;
    let n = 0;
    try { n = +localStorage.getItem("maidparty_wins") || 0; } catch (e) { /* 不可用：按 0 处理 */ }
    el.textContent = n > 0 ? `🏆 累计胜利 ${n} 场` : "尚无胜利记录，祝你首胜顺利";
  }

  function startGame() {
    const D = window.GAME_DATA, sel = window.__setup;
    if (!sel) return;
    D.player = D.characters[sel.char];
    D.map = D.maps[sel.map];
    D.diff = sel.diff || "normal";
    $("start-screen").classList.add("hidden");
    showIntro(); // 先播开场剧情，点「推门而入」再真正开局
  }

  return { log, renderAll, enterBattle, renderSetup, startGame };
})();
