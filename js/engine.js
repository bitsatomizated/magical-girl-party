// 引擎层：轮次/回合状态机、移动、地块结算、战斗、卡池、筹码（docs/设计文档 01/02/03/06）
window.Engine = (() => {
  const D = window.GAME_DATA;
  const AI_DELAY = window.__FAST__ ? 0 : 400; // 无头测试置 __FAST__ 关闭演出延迟
  const ANIM = window.__FAST__ ? 0 : 220;     // 移动步进动画间隔
  const rnd = (n) => Math.floor(Math.random() * n);
  const d6 = () => rnd(6) + 1;                // 战斗骰
  const d10 = () => rnd(10) + 1;              // 移动骰
  const rollRange = (c) => c.min + rnd(c.max - c.min + 1); // 随机数值牌打出时掷点
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => window.UI.log(...args); // 延迟解析：engine 先于 ui 加载时不崩溃

  let S = null; // 游戏状态
  const monstersAt = (pos) => S.monsters.filter(m => m.pos === pos && m.hp > 0);

  // ================= 筹码系统（设计文档06 §5）=================
  const RARITY_CN = { blue: "蓝", purple: "紫", gold: "金" };
  const PROB_TABLE = { // 概率档：1级(0-1星) / 2级(2星) / 3级(3星)
    1: { blue: 0.60, purple: 0.37, gold: 0.03, fixed: "blue" },
    2: { blue: 0.40, purple: 0.45, gold: 0.15, fixed: "purple" },
    3: { blue: 0.25, purple: 0.50, gold: 0.25, fixed: "gold" },
  };
  const probTier = (star) => star >= 3 ? 3 : star >= 2 ? 2 : 1;

  function chipList() { return S.player.chips.map(id => D.chips[id]); }
  function hasChip(pred) { return chipList().some(pred); }
  function chipSum(key) { return chipList().reduce((s, c) => s + (c[key] || 0), 0); }
  function addChip(id) {
    const c = D.chips[id]; if (!c) return false;
    S.player.chips.push(id);
    log(`获得筹码【${c.name}】（${c.school}·${RARITY_CN[c.rarity]}）：${c.desc}`, "good");
    // 层数词条：财富层数入手立即入层（下回合开始产币）；
    // 再生不留待入层——它在每回合开始时按已有芯片重新获得层数（见 turnStartEffects）
    if (c.wealthStacks) { S.player.wealth += c.wealthStacks; log(`【财富】层数 +${c.wealthStacks}（现 ${S.player.wealth}）。`, "good"); }
    // 回合开始类词条（学识）不在入手时结算：统一在下回合开始结算前生效，
    // 由 startRound 的筹码等待机制保证（避免回合内获得被提前/重复结算）
    return true;
  }
  // 流派限持：财富/再生/标记三派合计限两派（通用不受限）
  function schoolsHeld() { const s = new Set(); chipList().forEach(c => { if (c.school !== "通用") s.add(c.school); }); return s; }
  function schoolAvailable(school) { const s = schoolsHeld(); return s.has(school) || s.size < 2; }

  function rollRarity(tier) {
    const p = PROB_TABLE[tier], r = Math.random();
    if (r < p.gold) return "gold";
    if (r < p.gold + p.purple) return "purple";
    return "blue";
  }
  // 3 选 1：首格固定稀有度（tier 可被任务奖励覆盖），其余按概率表；
  // 不重复：同一次 3 选 1 内互不相同，且不与上次刷新重叠
  function genChipChoices(tier = probTier(S.player.star)) {
    const last = S.lastChips || [];
    const opts = [], used = new Set();
    for (let slot = 0; slot < 3; slot++) {
      const rar = slot === 0 ? PROB_TABLE[tier].fixed : rollRarity(tier);
      const ok = (id) => {
        const c = D.chips[id];
        return !used.has(id) && !S.player.chips.includes(id) && !last.includes(id)
          && (c.school === "通用" || schoolAvailable(c.school));
      };
      let pool = Object.keys(D.chips).filter(id => D.chips[id].rarity === rar && ok(id));
      if (!pool.length) pool = Object.keys(D.chips).filter(ok); // 该稀有度无可用：放宽稀有度
      if (!pool.length) pool = Object.keys(D.chips).filter(id => !used.has(id) && !S.player.chips.includes(id)); // 极端：放宽流派
      const pick = pool[rnd(pool.length)];
      used.add(pick);
      opts.push(pick);
    }
    S.lastChips = opts.slice();
    return opts;
  }
  // 筹码选择队列：升星/商店/任务奖励统一入队，逐个弹出（任务同轮多完成时依次结算）
  function requestChipChoice(tierOverride) {
    return new Promise((resolve) => {
      S.chipQueue = S.chipQueue || [];
      // 选完的续接动作：渲染 → 驱动队列下一位（排空时恢复被挂起的回合开始）→ 解 promise
      S.chipQueue.push({
        tier: tierOverride ?? probTier(S.player.star),
        resolve: () => { window.UI.renderAll(); startNextChipChoice(); resolve(); },
      });
      if (!S.chipChoice) startNextChipChoice();
    });
  }
  function startNextChipChoice() {
    const item = S.chipQueue?.shift();
    if (!item) {
      if (S.waitForChips) beginPlayerPhase(); // 轮次曾挂起等待选牌：继续回合开始结算
      return;
    }
    S.chipChoice = { options: genChipChoices(item.tier), tier: item.tier, done: item.resolve };
    window.UI.renderAll();
  }
  // 刷新：初始 2 次，每获得 1 星 +1；刷新后不出现上次出现过的筹码（lastChips 排除）
  function refreshChips() {
    if (!S.chipChoice) return;
    if ((S.chipRefreshLeft || 0) <= 0) { log("没有剩余刷新次数了。", "warn"); return; }
    S.chipRefreshLeft--;
    S.chipChoice.options = genChipChoices(S.chipChoice.tier);
    log(`刷新筹码 3 选 1（剩余 ${S.chipRefreshLeft} 次）。`);
    window.UI.renderAll();
  }
  async function openChipChoice() { await requestChipChoice(); }
  function pickChip(i) {
    if (!S.chipChoice) return;
    const id = S.chipChoice.options[i];
    if (!id) return;
    addChip(id);
    const done = S.chipChoice.done;
    S.chipChoice = null;
    window.UI.renderAll();
    done();
  }
  // 筹码商店：第 N 次购买 = base + (N-1)*step，购买计数全局累计不重置
  function chipShopPrice() { return D.map.chipShopBase + (S.chipPurchases || 0) * D.map.chipShopStep; }
  async function openChipShop() {
    const price = chipShopPrice();
    if (S.player.coins < price) { log(`筹码商店：购买需要 ${price} 金币（金币不足）。`, "warn"); return; }
    if (!(await askYesNo(`筹码商店：花费 ${price} 金币抽取一次筹码 3 选 1？`, `花 ${price} 金币抽取`, "先不抽"))) return;
    S.player.coins -= price;
    S.chipPurchases = (S.chipPurchases || 0) + 1;
    log(`筹码商店：支付 ${price} 金币（下次购买 ${chipShopPrice()} 金币）。`);
    await openChipChoice();
  }

  // ---------- 派生数值（基础 + 筹码词条）----------
  function derived() {
    const P = S.player;
    let atk = P.atk + chipSum("atk") + buffSum("atk"), def = P.def + chipSum("def"); // buff：王之力/狂暴
    const speed = (P.speedBonus || 0) + (P.turnMoveBonus || 0) + chipSum("speed"); // turnMoveBonus：本回合内的临时移速（青鸾雏焰）
    const pts = 3 + P.star + chipSum("point");
    const lowHp = P.hp <= P.hpMax / 2;
    if (lowHp) atk += chipSum("lowHpAtk"); // 不屈 II
    return { atk, def, speed, pts, lowHp };
  }

  // ================= 初始化 =================
  function newGame() {
    const p = D.player, m = D.map;
    S = {
      round: 1, phase: "idle", over: false, ask: null, // ask：待玩家回答的询问（由非模态面板渲染）
      tiles: m.tiles.map(t => ({ ...t, monsters: [] })),
      // 道路拓扑：edges 缺省时按单环生成（环道 = 图的特例）；S.adj 为邻接表
      // 移动通则：初始方向固定（优先顺时针邻格），途中禁止掉头；岔路在非来路选项中选择
      adj: (() => {
        const n = m.tiles.length;
        const adj = Array.from({ length: n }, () => []);
        const edges = (m.edges && m.edges.length) ? m.edges : Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
        edges.forEach(([a, b]) => { if (!adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); } });
        return adj;
      })(),
      player: {
        name: p.name, hp: p.hpMax, hpMax: p.hpMax, atk: p.attack, def: p.defense,
        star: 0, coins: p.initialCoins, pos: m.startTile,
        hand: [], chips: [], wealth: 0, regen: 0,
        skillCd: 0, atkBuffNextBattle: 0, moveBonus: 0, speedBonus: 0, turnMoveBonus: 0, buffs: [],
        nextDouble: false, nextFixed: 0, nextChooseDir: false,
        flameActive: false,          // 青鸾雏焰：本回合移动铺设青焰（持续到下回合开始的是 S.flames）
        flameBonus: 0,               // 凤凰再生：主动技（青焰）伤害永久加成
        phoenixLeft: D.player.passiveSkill?.effect === "phoenixReborn" ? (D.player.passiveSkill.maxCharges || 3) : 0,
        lastFrom: null, // 上一回合的来路：下回合起步继承，禁止随意转向/掉头
        ko: false,
      },
      monsters: [], monsterSeq: 0, defCount: {}, // defCount：同名怪编号计数
      allies: [], allySeq: 0, // 友方召唤物（甜品使魔等）；与怪物分列，玩家无法攻击
      famAtkBonus: 0, famHpBonus: 0, // 甜品登场：全体甜品使魔攻击力/生命上限的永久全局加成（新生成的同样生效）
      roundsLimit: m.rounds, // 轮数上限（任务「轮次进度-1」在无法回退时改为延长上限）
      firedRounds: {}, // 已结算过轮次开始效果的轮次：轮次进度回退后再次经过该轮时不得重复刷怪/重复加成
      bossRounds: 0, battle: null, chipPurchases: 0, lastChips: [], chipQueue: [], chipRefreshLeft: 2,
      yuncaiRescued: false, // 晕彩救援：每局仅一次（血线触发或被击倒保底触发）
      globalBonus: { atk: 0, def: 0, bossAtk: 0, bossDef: 0 }, // 进度事件的全地图强化（新刷出的怪同样生效）
      flames: null, // 青鸾雏焰：格子编号 → 伤害 的青焰地块（持续到下回合开始）
      quests: (D.map.quests || []).map(q => ({ ...q, progress: 0, done: false })),
      _dbg: { fpt: 0, aiStart: 0, aiEnd: 0, endRound: 0, startRound: 0 },
    };
    // 起始卡组：随机 2 战斗（不含蓄力/全力）+ 随机 2 效果（设计文档06 §4）
    const bp = D.battlePool.slice(), ep = D.effectPool.slice();
    for (let i = 0; i < 2; i++) S.player.hand.push({ ...D.cards[bp[rnd(bp.length)]] });
    for (let i = 0; i < 2; i++) S.player.hand.push({ ...D.cards[ep[rnd(ep.length)]] });
    // 初始怪物：默认开局铺怪 + BOSS 驻守；地图可配 initialSpawn:false（刷怪格空置，踩上才刷）与省略 bossTile（BOSS 由事件刷出）
    if (m.initialSpawn !== false) m.tiles.forEach((t, i) => { if (t.t === "spawn") spawnMonster(t.mob, i); });
    if (m.bossTile != null) {
      const b = D.monsters[m.bossMob || "boss"]; // 地图可指定驻守 BOSS（默认灾厄核心）
      S.monsters.push(makeMonster(b, m.bossTile));
    }
    log(`地图「${m.name}」：共 ${m.rounds} 轮。击败${m.bossName || "最终 BOSS"}即获胜！`);
    startRound();
  }

  // 同名怪编号：小怪与显式标记 numbered 的怪（如晕彩分身）按登场顺序编号，
  // 精英与 BOSS 不加编号；编号按怪物种类累计，怪被击败后不回收（避免同场重号）
  function numberedName(def) {
    if (def.category !== "minion" && !def.numbered) return def.name;
    S.defCount = S.defCount || {};
    const n = (S.defCount[def.id] = (S.defCount[def.id] || 0) + 1);
    return `${def.name}${n}`;
  }

  function makeMonster(def, pos) {
    const ds = def.diffStats?.[D.diff] || {}; // 分难度数值（未配置的项沿用普通值）
    const gb = globalBonusFor(def);           // 进度事件的全局强化：此后出现的敌人同样带上
    return { uid: ++S.monsterSeq, def, name: numberedName(def), pos,
      hp: ds.hpMax ?? def.hpMax, hpMax: ds.hpMax ?? def.hpMax,
      atk: (ds.attack ?? def.attack) + gb.atk, def_: (ds.defense ?? def.defense) + gb.def,
      skillCd: 0, growthBuffs: 0, marks: 0, hunt: 0,
      lastFrom: null }; // 上一回合的来路：下回合起步继承（首次移动为 null → 用登场/初始方向）
  }

  // 光环类被动（卡牌守护）：场上每存在一只其他怪物，自身攻防 +1
  // 动态计算、不写回 m.atk/def_，因此怪多怪少会即时反映，击倒小怪即可削弱 BOSS
  function auraBonus(m) {
    const p = m.def.passives?.find(x => x.effect === "bossAura");
    if (!p) return { atk: 0, def: 0 };
    const n = S.monsters.filter(x => x !== m && x.hp > 0).length;
    return { atk: n * (p.atkPer || 1), def: n * (p.defPer || 1) };
  }
  // 战斗取数口：基础值 + 「下次战斗」临时加成 + 光环；所有战斗结算统一走这里
  function effAtk(m) { return m.atk + (m.nextBattleAtk || 0) + auraBonus(m).atk; }
  function effDef(m) { return m.def_ + (m.nextBattleDef || 0) + auraBonus(m).def; }

  // 全局强化取用：BOSS 与普通怪分别累计（旧地图效果「不含 BOSS」需要区分）
  function globalBonusFor(def) {
    const b = S.globalBonus || {};
    return def?.category === "boss"
      ? { atk: b.bossAtk || 0, def: b.bossDef || 0 }
      : { atk: b.atk || 0, def: b.def || 0 };
  }
  // 进度事件的全地图强化：立即作用于在场敌人，并记入全局修正（此后刷出的敌人同样生效）
  function applyGlobalMonsterBonus(atk, def, excludeBoss) {
    if (!atk && !def) return;
    S.globalBonus.atk += atk; S.globalBonus.def += def;
    if (!excludeBoss) { S.globalBonus.bossAtk += atk; S.globalBonus.bossDef += def; }
    S.monsters.forEach(m => {
      if (excludeBoss && m.def.category === "boss") return;
      m.atk += atk; m.def_ += def;
    });
  }

  // 下一步方向预掷：刷出时与每步落地时各掷一次（queuedNext），预告箭头与实际移动共用同一结果
  // spawnRandom：登场首步在全部邻格中随机；若带 spawnDir（事件配置的登场方向）则固定为该方向
  // 非登场步：在「不掉头」可选格中按主动怪贪心 / 被动怪随机决定
  function rollNextStep(m, spawnRandom) {
    let opts;
    if (spawnRandom && m.spawnDir) {
      const hit = dirNeighbor(m.pos, m.spawnDir);
      opts = hit != null ? [hit] : S.adj[m.pos]; // 该方向没有邻格时退回全邻格随机
    } else {
      opts = spawnRandom ? S.adj[m.pos] : stepOptions(m.pos, m.lastFrom ?? null);
    }
    if (!opts.length) { m.queuedNext = null; return; }
    if (opts.length === 1) { m.queuedNext = opts[0]; return; }
    if (!spawnRandom && m.def.tags.includes("aggressive") && m.pos !== S.player.pos) {
      let next = opts[0], bd = graphDist(next, S.player.pos);
      for (const o of opts) { const d = graphDist(o, S.player.pos); if (d < bd) { bd = d; next = o; } }
      m.queuedNext = next;
    } else {
      m.queuedNext = opts[rnd(opts.length)];
    }
  }
  function spawnMonster(id, pos, dir) {
    const m = makeMonster(D.monsters[id], pos);
    m.initRandom = true;
    if (dir) m.spawnDir = dir; // 事件可指定登场方向（如开局小怪统一朝上）
    rollNextStep(m, true); // 登场首步即预掷：岔路刷新也有确定方向
    S.monsters.push(m);
    return m;
  }

  // 当前地图的小怪池：只收本图数据真正引用过的小怪（刷怪格 mob 配置 + 全局事件投放）。
  // 刷怪格兜底与随机事件刷怪都从这里取，避免刷出别的地图的小怪。
  // 地图完全没有小怪配置时回退全库，保证旧数据仍可运行。
  function mapMinionPool() {
    const ids = new Set();
    const add = (id) => { const d = id && D.monsters[id]; if (d && d.category === "minion") ids.add(id); };
    (D.map.tiles || []).forEach(t => add(t.mob));
    (D.map.globalEvents || []).forEach(e => (e.spawns || []).forEach(sp => add(sp.mob)));
    if (!ids.size) return Object.values(D.monsters).filter(d => d.category === "minion");
    return [...ids].map(id => D.monsters[id]);
  }

  function drawCard(silent) {
    if (S.player.hand.length >= 8) { if (!silent) log("手牌已满（8），无法抽取。"); return false; }
    const pool = D.battlePool.concat(D.effectPool);
    S.player.hand.push({ ...D.cards[pool[rnd(pool.length)]] });
    if (!silent) log("抽了 1 张牌。");
    return true;
  }

  // ================= 轮次（设计文档01 §1）=================
  // 轮次开始效果（第 r 轮）：BOSS 成长 + 全局回合事件
  // 独立成函数的原因：被击倒时轮次进度 +1 会跳进一轮，被跨过的那一轮事件必须在推进瞬间补触发（否则该轮刷怪凭空消失）
  const tilesOf = (sel) => Array.isArray(sel)
    ? sel
    : S.tiles.map((t, i) => (t.t === sel ? i : -1)).filter(i => i >= 0);

  // 事件刷怪落点：tiles 指定的格型/格号是优先池；写了 count 且超过池容量时，余量补到全图空格（避开玩家与已有敌人）
  function spawnSpotsFor(sp) {
    const pool = tilesOf(sp.tiles);
    const n = sp.count ?? pool.length;
    const spots = pool.slice(0, n);
    if (n <= spots.length) return spots;
    const busy = new Set(S.monsters.filter(x => x.hp > 0).map(x => x.pos));
    busy.add(S.player.pos);
    spots.forEach(i => busy.add(i));
    const free = S.tiles.map((t, i) => i).filter(i => !busy.has(i));
    while (free.length && spots.length < n) spots.push(free.splice(rnd(free.length), 1)[0]);
    return spots;
  }

  function fireRoundStartEffects(r) {
    // 每轮只结算一次：轮次进度回退（进度 -1）后再次经过同一轮时，事件不得重复触发
    S.firedRounds = S.firedRounds || {};
    if (S.firedRounds[r]) { log(`（第 ${r} 轮的事件已结算过，不重复触发）`); return; }
    S.firedRounds[r] = true;
    // BOSS 成长（设计文档03 §6 / 05 §4）——仅对配置了 growth 的 BOSS 生效（如灾厄核心）
    const boss = S.monsters.find(m => m.def.category === "boss");
    const g = boss?.def.growth;
    if (g && r > 1) {
      S.bossRounds++;
      if (S.bossRounds % g.everyRounds === 0) { boss.atk += g.atk; boss.def_ += g.def; log(`【${boss.name}】增强：攻击+${g.atk} 防御+${g.def}（现 ${boss.atk}/${boss.def_}）`, "warn"); }
      if (S.bossRounds % g.everyRoundsHp === 0) { boss.hpMax += g.hpGain; boss.hp += g.heal; log(`【${boss.name}】生命上限+${g.hpGain} 并回复 ${g.heal}（现 ${boss.hp}/${boss.hpMax}）`, "warn"); }
    }
    // 全局回合事件（设计文档03 §5）：spawns 支持格型名或格子编号数组；effect allMonstersStats 含精英与BOSS
    D.map.globalEvents?.forEach(e => {
      if (e.round !== r) return;
      log(`⚡ 第 ${e.round} 轮事件${e.name ? `【${e.name}】` : ""}：${e.desc}`, "warn");
      e.spawns?.forEach(sp => {
        spawnSpotsFor(sp).forEach(i => { const m = spawnMonster(sp.mob, i, sp.dir); log(`　【${m.name}】出现在第 ${i} 格。`, "warn"); });
      });
      if (e.effect === "allMonstersStats" || e.effect === "allMonstersPlus1") {
        const noBoss = e.effect === "allMonstersPlus1"; // 旧地图效果：不含 BOSS
        const a = e.atk ?? (noBoss ? 1 : 0), d = e.def ?? (noBoss ? 1 : 0);
        applyGlobalMonsterBonus(a, d, noBoss);
        log(`　所有敌人攻防 +${a}/+${d}${noBoss ? "（不含 BOSS）" : "（此后出现的敌人同样生效）"}。`, "warn");
      }
    });
  }

  function startRound() {
    S._dbg.startRound++;
    if (S.over) return;
    log(`—— 第 ${S.round} 轮 ——`, "round");
    fireRoundStartEffects(S.round);

    // 玩家回合开始时（设计文档01 §2）
    const P = S.player;
    if (P.ko) { // 上轮被击倒：本回合开始时原地复活（位置与来路不变），可直接行动
      P.ko = false; P.hp = P.hpMax;
      log("玩家原地复活（生命回满），保持原方向，本回合可直接行动。", "warn");
    }
    // 待处理的筹码选择（轮末任务奖励等）：挂起回合推进，选完后进入回合开始结算
    if (S.chipChoice || (S.chipQueue && S.chipQueue.length)) { S.waitForChips = true; return; }
    beginPlayerPhase();
  }

  // 回合开始结算（等待筹码选择完毕后调用）：筹码词条于此处统一生效
  function beginPlayerPhase() {
    S.waitForChips = false;
    turnStartEffects(); // 学识抽牌 / 财富金币 / 再生回血 / 以毒攻毒
    const P = S.player;
    if (!P.reviveSkip) {
      // 被动【逆境】：回合开始低于半血抽 1（按 passiveSkill.effect 挂载，未装备则不生效）
      if (D.player.passiveSkill?.effect === "drawIfHpBelowHalf" && P.hp < P.hpMax / 2) {
        if (drawCard()) log("【逆境】发动：抽 1 张牌。", "good");
      }
    }
    window.UI.renderAll();
    enterPlayerTurn();
  }

  // 回合开始词条：学识抽牌 / 财富金币 / 再生回血 / 以毒攻毒（buff.heal）
  // 并清除「持续到下回合开始」类 buff（像素化）
  function turnStartEffects() {
    const P = S.player;
    if (S.flames) { S.flames = null; log(`青焰熄灭了。`); } // 青鸾雏焰：持续到下回合开始
    P.turnMoveBonus = 0; // 本回合临时移速同样只持续到本回合结束
    const hadPixel = P.buffs.some(b => b.pixel);
    if (hadPixel) { P.buffs = P.buffs.filter(b => !b.pixel); log(`【像素化】效果结束。`); }
    const draws = chipSum("draw");
    for (let i = 0; i < draws; i++) { if (drawCard(true)) log(`【学识】回合开始抽 1 张牌。`); }
    // 再生：每回合开始都按持有的再生筹码获得对应层数（再生 I +2 / 再生 II +5），再按总层数回血（设计文档06 §5.4）
    const regenPerTurn = chipSum("regenStacks");
    if (regenPerTurn > 0) { P.regen += regenPerTurn; log(`【再生】回合开始获得 ${regenPerTurn} 层（现 ${P.regen}）。`, "good"); }
    if (P.regen > 0) { const h = Math.min(P.regen, P.hpMax - P.hp); P.hp += h; if (h > 0) log(`【再生】回合开始：回复 ${h} 生命（剩 ${P.hp}）。`, "good"); }
    if (P.wealth > 0) { P.coins += P.wealth; log(`【财富】回合开始：获得 ${P.wealth} 金币（现 ${P.coins}）。`, "good"); }
    // 辐射：回合开始按范围给怪物挂标记（多枚辐射同持时逐条结算；auraRange null = 全图）
    chipList().filter(c => c.auraMarks).forEach(c => {
      const targets = S.monsters.filter(m => m.hp > 0 && (c.auraRange == null || graphDist(m.pos, P.pos) <= c.auraRange));
      targets.forEach(m => { m.marks = (m.marks || 0) + c.auraMarks; });
      if (targets.length) log(`【${c.name}】回合开始：${targets.length} 只怪物获得 ${c.auraMarks} 层标记。`, "good");
    });
    buffSum("heal") > 0 && (() => { const h = Math.min(buffSum("heal"), P.hpMax - P.hp); if (h > 0) { P.hp += h; log(`【以毒攻毒】回合开始：回复 ${h} 生命。`, "good"); } })();
  }

  // 回合结束词条：再生层数减半 / 怪物标记 -1 层 / buff 持续回合递减
  function turnEndEffects() {
    const P = S.player;
    if (P.regen > 0) { P.regen = Math.floor(P.regen / 2); if (P.regen === 0) log("【再生】层数耗尽。"); }
    S.monsters.forEach(m => { if (m.marks > 0) { m.marks--; if (m.marks === 0) log(`【${m.name}】的标记消退。`); } });
    P.buffs = P.buffs.filter(b => { b.turns--; if (b.turns <= 0) { log(`效果【${b.name}】结束。`); return false; } return true; });
  }

  function buffSum(key) { return S.player.buffs.reduce((s, b) => s + (b[key] || 0), 0); }

  // 任务判定：每轮结束时执行一次（设计：非实时结算）
  function judgeQuests() {
    S.quests?.forEach(q => {
      if (!q.done && q.progress >= q.need) {
        q.done = true;
        log(`✅ 任务完成：【${q.desc}】！奖励：${q.rewardTier} 级概率筹码 3 选 1。`, "good");
        if (q.extra === "roundProgressMinus1") rewindRoundProgress(1);
        requestChipChoice(q.rewardTier); // 入队，不阻塞轮次推进
      }
    });
  }

  // 轮次进度推进（被击倒等效果即时引发）：计数 +1 并立刻触发新轮次的开始效果（刷怪/全局效果/BOSS 成长）
  // 「轮次进度 +1」是即时结算的效果，不与回合结束的自然推进合并
  function advanceRoundProgress(n = 1) {
    for (let i = 0; i < n; i++) {
      if (S.round >= S.roundsLimit) break; // 已到上限：交由回合结束的判负处理，不越界
      S.round++;
      log(`—— 第 ${S.round} 轮（轮次进度 +1）——`, "round");
      fireRoundStartEffects(S.round);
    }
    window.UI.renderAll();
  }

  // 轮次进度回退（任务奖励「轮次进度 -1」）：即时把轮次计数 -1，等于把已消耗的一轮还回来。
  // 该轮的轮次开始效果不会重复触发（见 fireRoundStartEffects 的去重），因此不会重复刷怪/重复加成。
  function rewindRoundProgress(n = 1) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (S.round <= 1) break; // 已在第 1 轮：无处可退
      S.round--; moved++;
    }
    if (moved > 0) log(`轮次进度 -1（现第 ${S.round} 轮 / 共 ${S.roundsLimit} 轮）。`, "good");
    else { S.roundsLimit += 1; log(`轮次进度 -1：已在第 1 轮，改为总轮数 +1（现共 ${S.roundsLimit} 轮）。`, "good"); }
    window.UI.renderAll();
  }

  function endRound() {
    S._dbg.endRound++;
    judgeQuests();
    if (S.round >= S.roundsLimit && !S.over) { gameOver(false); return; } // 轮数耗尽即败（BOSS 未击败，含未刷出情形）
    S.round++;
    startRound();
  }

  // ================= 玩家回合（设计文档01 §2）=================
  function enterPlayerTurn() {
    S.phase = "play";
    if (S.player.skillCd > 0) S.player.skillCd--;
    window.UI.renderAll();
  }

  function useSkill() {
    const p = D.player.activeSkill;
    if (S.player.skillCd > 0 || S.phase !== "play") return;
    if (p.effect === "pixelate") {
      // 像素化：攻+3 至下回合开始；期间怪物无法主动攻击（stepMonster 判定）
      S.player.buffs.push({ name: p.name, atk: p.value, turns: 99, pixel: true });
      log(`【${p.name}】发动：本回合攻击力+${p.value}，怪物无法主动攻击（持续到下回合开始）。`, "good");
    } else if (p.effect === "azureFlame") {
      // 青鸾雏焰：本回合移动经过的节点（含起点与终点）铺设青焰，持续到下回合开始（turnStartEffects 清除）；本回合移速 +3
      S.player.flameActive = true;
      // 写成 turnMoveBonus 而不是 moveBonus：后者是一次性的，掷骰时就被消耗清零，
      // 而「本回合移动速度 +N」必须同时覆盖掷骰与疾行续走（见 derived）
      const spd = p.moveBonus || 0;
      S.player.turnMoveBonus += spd;
      log(`【${p.name}】发动：本回合移动速度 +${spd}，本次移动经过的节点将被青焰环绕（敌人经过受 ${flameDamage()} 点伤害，持续到下回合开始）。`, "good");
    } else if (p.effect === "sweetDeploy") {
      // 甜品登场：进入地块瞄准模式，选点后结算（chooseDeployTile）
      const cands = S.tiles.map((t, i) => i).filter(i => graphDist(S.player.pos, i) <= 3);
      S.targeting = { deploy: true, candidates: cands, cardName: p.name };
      log(`【${p.name}】进入瞄准：请在棋盘上选择 3 格内的地块放置甜品使魔（${cands.length} 个候选）。`);
      window.UI.renderAll();
      return; // 冷却在选点结算时才开始计算
    } else {
      S.player.atkBuffNextBattle = p.value;
      log(`【${p.name}】发动：下一场战斗攻击力+${p.value}。`, "good");
    }
    S.player.skillCd = p.cooldown;
    window.UI.renderAll();
  }

  // 青焰伤害：基础值 + 凤凰再生的永久加成
  function flameDamage() { return (D.player.activeSkill?.effect === "azureFlame" ? D.player.activeSkill.value : 0) + (S.player.flameBonus || 0); }
  // 铺设青焰：S.flames 为 格子编号 → 伤害 的映射，持续到下回合开始
  function layFlame(pos) {
    S.flames = S.flames || {};
    if (!S.flames[pos]) { S.flames[pos] = flameDamage(); log(`青焰环绕了第 ${pos} 格。`); }
  }

  // 出牌阶段：效果牌（async：遥控骰子需要等玩家在面板上选点数）
  async function playCard(idx) {
    if (S.phase !== "play" || S.targeting || S.chipChoice || S.ask) return false;
    const c = S.player.hand[idx];
    if (!c) return false;
    const P = S.player;
    if (c.kind === "damage") {
      const targets = S.monsters.filter(m => m.hp > 0 && graphDist(m.pos, P.pos) <= c.range);
      if (!targets.length) { log(`【${c.name}】：射程 ${c.range} 格内没有怪物，无法使用。`, "warn"); return false; }
      // 进入瞄准模式：牌保留在手，选目标后结算
      S.targeting = { cardIdx: idx, candidates: targets.map(t => t.uid), cardName: c.name };
      log(`【${c.name}】进入瞄准：请在棋盘上选择射程内的怪物（${targets.length} 个候选）。`);
      window.UI.renderAll();
      return true;
    } else if (c.kind === "moveMod") {
      S.player.hand.splice(idx, 1);
      if (c.doubleDice) { P.nextDouble = true; log(`【${c.name}】下次移动掷两个骰子。`); }
      else if (c.chooseDir) { P.nextChooseDir = true; log(`【${c.name}】下次移动自选方向。`); }
      else if (c.fixedDice) {
        const ans = await ask("遥控骰子：选择下次移动固定的点数",
          [1, 2, 3, 4, 5, 6].map(n => ({ label: String(n), value: n })));
        P.nextFixed = Math.min(6, Math.max(1, Number(ans) || 6));
        log(`【${c.name}】下次移动固定 ${P.nextFixed} 点。`);
      }
    } else if (c.kind === "buff") {
      S.player.hand.splice(idx, 1);
      if (c.hpCost) { P.hp -= c.hpCost; log(`【${c.name}】失去 ${c.hpCost} 生命。`, "warn"); }
      P.buffs.push({ name: c.name, atk: c.atk || 0, dmgTaken: c.dmgTaken || 0, heal: c.heal || 0, turns: c.turns });
      log(`【${c.name}】发动：持续 ${c.turns} 回合。`, "good");
    } else if (c.kind === "heal") {
      S.player.hand.splice(idx, 1);
      const h = Math.min(c.heal, P.hpMax - P.hp);
      P.hp += h; log(`【${c.name}】回复 ${h} 点生命。`, "good");
    } else return false;
    onCardPlayed(); // 回收词条
    checkPlayerKo();
    window.UI.renderAll();
    return true;
  }

  // 瞄准结算：突击模式 → 传送突袭；伤害模式 → 消耗手牌结算
  function chooseTarget(uid) {
    if (!S.targeting) return;
    if (!S.targeting.candidates.includes(uid)) { log("目标不在候选内。", "warn"); return; }
    if (S.targeting.assault) { S.targetingResume = false; doAssault(uid); return; }
    S.targetingResume = false;
    const idx = S.targeting.cardIdx;
    const c = S.player.hand[idx];
    S.targeting = null;
    if (!c) { window.UI.renderAll(); return; }
    S.player.hand.splice(idx, 1);
    const t = S.monsters.find(m => m.uid === uid);
    log(`【${c.name}】瞄准【${t.name}】！`);
    dealToMonster(t, c.dmg);
    if (c.aoe) S.monsters.filter(m => m !== t && m.hp > 0 && graphDist(m.pos, t.pos) <= c.aoe)
      .forEach(m => { log(`波及【${m.name}】！`); dealToMonster(m, c.dmg); });
    onCardPlayed(); // 回收词条
    checkPlayerKo();
    window.UI.renderAll();
  }

  // 突击：玩家移动到目标怪物所在格（剩余步数作废），然后开战；战后直接收尾回合
  function doAssault(uid) {
    const m = S.monsters.find(x => x.uid === uid);
    S.targeting = null;
    if (!m || m.hp <= 0) { window.UI.renderAll(); return; }
    S.player.pos = m.pos;
    S.player.lastFrom = null; // 突袭落地：无来路，按初始方向起步
    if (S.player.flameActive) layFlame(S.player.pos); // 突袭落地格同样视为本次移动的终点
    if (S.move) S.move.steps = 0; // 突击即落地：剩余步数作废
    log(`突击门：突袭至【${m.name}】所在格（剩余步数作废）！`, "good");
    startBattle("player", m);
  }
  function cancelTargeting() {
    if (!S.targeting) return;
    S.targeting = null;
    log("取消瞄准。");
    if (S.targetingResume) { // 突击门取消选目标：回合照常结束
      S.targetingResume = false;
      finishPlayerTurn();
      return;
    }
    window.UI.renderAll();
  }

  function onCardPlayed() { const n = chipSum("coinPerCard"); if (n > 0) { S.player.coins += n; log(`【回收】获得 ${n} 金币。`); } }

  // ---------- 拓扑工具（图泛化，环道为特例）----------
  // 指定方向上的邻格：方向用向量表达（如 [0,-1] 向上）；该方向没有邻格时返回 null
  function dirNeighbor(pos, dv) {
    if (!dv || S.tiles[pos].x == null) return null;
    const tx = S.tiles[pos].x + dv[0], ty = S.tiles[pos].y + dv[1];
    return S.adj[pos].find(nb => S.tiles[nb].x === tx && S.tiles[nb].y === ty) ?? null;
  }
  // 初始方向：地图可配 initialDir 向量（如 [0,1] 向下）优先匹配；否则顺时针邻格，再次逆时针，最后任一邻格
  function initialNext(pos) {
    const n = S.tiles.length;
    const dv = D.map.initialDir;
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
    if (prev == null) return [initialNext(cur)];
    const opts = S.adj[cur].filter(x => x !== prev);
    return opts.length ? opts : [prev];
  }
  // BFS：from → to 的最短路第一跳
  function bfsNext(from, to) {
    if (from === to) return from;
    const prev = new Array(S.tiles.length).fill(-1);
    prev[from] = from;
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const nb of S.adj[c]) {
        if (prev[nb] !== -1) continue;
        prev[nb] = c;
        if (nb === to) { let cur = nb; while (prev[cur] !== from) cur = prev[cur]; return cur; }
        q.push(nb);
      }
    }
    return from; // 不可达：原地
  }
  // BFS 距离（格数），用于直伤射程等
  function graphDist(a, b) {
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
  function nearestMonsterInRange(pos, range) {
    let best = null, bd = 1e9;
    S.monsters.forEach(m => {
      if (m.hp <= 0) return;
      const d = graphDist(m.pos, pos);
      if (d <= range && d < bd) { bd = d; best = m; }
    });
    return best;
  }
  function nearestMonster(pos) {
    let best = null, bd = 1e9;
    S.monsters.forEach(m => { if (m.hp <= 0) return; const d = graphDist(m.pos, pos); if (d < bd) { bd = d; best = m; } });
    return best;
  }

  function finishPlayPhase() {
    if (S.phase !== "play" || S.targeting || S.chipChoice) return;
    S.phase = "move";
    log("进入移动阶段。");
    window.UI.renderAll();
  }

  // ================= 移动阶段 =================
  function rollAndMove() {
    if (S.phase !== "move" || S.battle || S.move || S.targeting || S.chipChoice) return;
    const P = S.player, faces = D.player.move.faces || 10;
    let steps;
    if (P.nextFixed > 0) { steps = P.nextFixed; P.nextFixed = 0; log(`遥控骰子：固定 ${steps} 点，开始移动。`); }
    else {
      let r = die(faces);
      if (P.nextDouble) { r += die(faces); P.nextDouble = false; log("【加急加快】双骰！"); }
      steps = r + P.moveBonus + derived().speed;
      log(`掷骰：${steps} 点，开始移动。`);
    }
    P.moveBonus = 0;
    if (P.flameActive) layFlame(P.pos); // 青焰含移动起点
    // 「方向抉择」不再开局弹窗：移动开始时若处于岔口，全向高亮由玩家点击（见 stepPlayer）
    // 起步方向继承上一回合的来路（lastFrom）：不能随意转向，更不能掉头
    S.move = { who: "player", steps, prev: P.lastFrom ?? null, forcedNext: null };
    window.UI.renderAll();
    stepPlayer();
  }
  function die(f) { return rnd(f) + 1; }

  const TILE_CN = { start: "起始点", upgrade: "升级点", chipshop: "筹码商店" };
  const CAN_STOP = ["start", "upgrade"];

  // ---------- 玩家询问（替代原生 confirm / prompt）----------
  // 原生弹窗是模态的：它阻塞整个页面，玩家无法在决定前滚动信息栏查看怪物、手牌与筹码。
  // 这里把问题写入 S.ask，交给 UI 渲染成非模态面板，返回 Promise 等待玩家点击。
  // 测试可用 window.__askAuto（同步返回所选 value）注入应答，从而不依赖 DOM。
  function ask(question, options, detail) {
    const auto = window.__askAuto;
    if (typeof auto === "function") return Promise.resolve(auto(question, options, detail));
    return new Promise((resolve) => {
      S.ask = { question, options, detail, resolve };
      window.UI.renderAll();
    });
  }

  // UI 点击选项后回调：先清状态再 resolve，避免 Promise 回调重入时读到旧状态
  function answerAsk(value) {
    const a = S.ask;
    if (!a) return;
    S.ask = null;
    window.UI.renderAll();
    a.resolve(value);
  }

  // 是/否二选一的便捷封装
  function askYesNo(question, yesLabel, noLabel, detail) {
    return ask(question, [
      { label: yesLabel || "确定", value: true, cls: "primary" },
      { label: noLabel || "取消", value: false },
    ], detail);
  }

  // 路过可停留地块时的询问文案：起始点/升级点附带升星差价，便于判断是否值得停下
  function stopPrompt(t, steps) {
    const suffix = `（剩余 ${steps} 步将放弃）`;
    if (t !== "upgrade" && t !== "start") return `经过${TILE_CN[t]}，是否停留？${suffix}`;
    const cost = D.map.upgradeCost(S.player.star);
    if (cost == null) return `经过${TILE_CN[t]}，是否停留？你已达最高星级。${suffix}`;
    const gap = cost - S.player.coins;
    const info = gap > 0
      ? `升到 ${S.player.star + 1} 星需要 ${cost} 金币，还差 ${gap} 金币（现有 ${S.player.coins}）。`
      : `升到 ${S.player.star + 1} 星需要 ${cost} 金币，金币充足（现有 ${S.player.coins}）。`;
    return `经过升级点，是否停留？${info}${suffix}`;
  }

  async function stepPlayer() {
    const mv = S.move;
    // 被击倒后立即停止行动（设计文档02 §6「跳过后续行动」）：剩余步数作废，由落格结算收尾
    while (mv && mv.steps > 0 && !S.over && !S.battle && !S.player.ko) {
      let next;
      if (mv.forcedNext != null) {
        next = mv.forcedNext; // 岔路/方向抉择的既定选择
      } else {
        // 开局无来路：「方向抉择」生效时全向可选，否则固定初始方向；途中禁止掉头
        const freeChoice = mv.prev == null && S.player.nextChooseDir;
        const opts = freeChoice ? S.adj[S.player.pos].slice() : stepOptions(S.player.pos, mv.prev);
        if (freeChoice) S.player.nextChooseDir = false;
        if (opts.length > 1) {
          // 岔路：高亮待选，由玩家点击续走。必须把阶段切回等待方的阶段，
          // 否则从战斗/地块效果续走进岔路时阶段会停留在 "battle"，前端不再接受方向点击
          mv.await = opts;
          S.phase = mv.who === "player" ? "move" : "turnEnd";
          window.UI.renderAll();
          return;
        }
        next = opts[0];
      }
      mv.forcedNext = null; mv.await = null;
      mv.prev = S.player.pos;
      S.player.lastFrom = mv.prev; // 记录来路：下回合从这一格的位置继续，方向不重置
      mv.steps--;
      S.player.pos = next;
      mv.asked = null; // 进入新格即清空「本格已询问」记录：绕回同一格会重新询问（每次经过都能再战）
      if (S.player.flameActive) layFlame(next); // 青焰含途经与终点格
      healPassAllies(next); // 治愈魔法：路过甜品使魔所在格即触发
      window.UI.renderAll(); // 步进可视化
      if (ANIM) await delay(ANIM);
      if (S.over || S.battle) break;
      if (mv.steps === 0) break; // 已到目标格：落地结算在循环外
      // 路过结算：顺序为「先交战 → 再问是否停留 → 地块效果」，与落格结算保持一致
      const r = await passThroughTile(S.tiles[S.player.pos]);
      if (r === "battle") return;                 // 战斗中：由 endBattle 续接剩余步数
      if (r === "stop") { mv.steps = 0; break; }  // 选择停留：转入落格结算
    }
    if (S.over) { S.move = null; return; }
    if (S.battle) return;                     // 战斗中：由 endBattle 续走剩余步数
    await settleLandTile();
  }

  // 落格结算：刷怪格的效果先行（新怪与格上旧怪一起进入逐个询问），其余地块在怪物处理完后结算
  // （战斗中由 endBattle 调用本函数继续：接着打下一只，或结算地块）
  // 本次落格的刷怪只执行一次（mv.spawnDone 标记），防止战斗重入反复刷怪；回血等其他效果不受影响
  async function settleLandTile() {
    const P = S.player, mv = S.move;
    if (S.over) { S.move = null; return; }
    if (P.ko) { S.move = null; finishPlayerTurn(); return; } // 被打倒：不触发地块效果
    const tile = S.tiles[P.pos];
    if (!(mv && mv.spawnDone) && tile.t === "spawn") { // 刷怪先行：落格必刷一只（已有怪也叠刷）
      await resolveLandTile(tile);
      if (mv) mv.spawnDone = true;
      if (S.over || S.battle) return;
    }
    if (await offerTileFight("land")) return;
    if (tile.t === "shop") { drawCard(); log("停在商店：随机获得 1 张牌。", "good"); await openShop(); onPassShop(); }
    if (tile.t === "chipshop") await openChipShop();
    if (S.over || S.battle) return;
    const extra = (await resolveLandTile(tile)) || 0;
    if (mv) mv.spawnDone = true; // 本地块已刷怪：战斗重入不得再次刷
    if (S.battle) return;
    if (S.over) { S.move = null; return; }
    if (await offerTileFight("land")) return; // 地块效果刚刷出的怪：同样按怪询问一次
    if (extra > 0 && mv) { // 疾行等加步效果：回到移动阶段继续走
      mv.spawnDone = false; // 续走后的新落地格重新结算效果
      S.phase = mv.who === "player" ? "move" : "turnEnd";
      mv.steps = extra;
      stepPlayer();
      return;
    }
    S.move = null;
    finishPlayerTurn();
  }

  // 岔路选择：玩家点击高亮地块后续走（UI → 引擎入口）
  function pickMoveStep(pos) {
    const mv = S.move;
    if (!mv || mv.who !== "player" || !mv.await || !mv.await.includes(pos)) return;
    S.phase = "move"; // 防御：等待选向期间阶段一定是移动阶段
    mv.forcedNext = pos;
    stepPlayer();
  }

  // 路过商店词条（学识 drawPass）
  function onPassShop() { const n = chipSum("drawPass"); for (let i = 0; i < n; i++) if (drawCard(true)) log("【学识】路过商店加抽 1 张牌。"); }

  // ---------- 卡牌商店 ----------
  function openShop() {
    return new Promise((resolve) => {
      const pick = (pool) => D.cards[pool[rnd(pool.length)]];
      const offers = [];
      let eff = D.map.shopOffers?.effect ?? 2, bat = D.map.shopOffers?.battle ?? 1;
      if (hasChip(c => c.shopExtra)) { // 学识 III：商品 +2（1 战斗 1 效果）
        eff += 1; bat += 1;
      }
      for (let i = 0; i < eff; i++) offers.push({ card: { ...pick(D.effectPool) }, cost: D.map.shopCost, sold: false });
      for (let i = 0; i < bat; i++) offers.push({ card: { ...pick(D.battlePool) }, cost: D.map.shopCost, sold: false });
      S.shop = { offers, resolve };
      window.UI.renderAll();
    });
  }

  function buyShop(indices) {
    if (!S.shop) return;
    indices.forEach(i => {
      const o = S.shop.offers[i];
      if (!o || o.sold) return;
      if (S.player.coins < o.cost) { log(`金币不足，无法购买【${o.card.name}】。`, "warn"); return; }
      if (S.player.hand.length >= 8) { log("手牌已满（8），无法购买。", "warn"); return; }
      S.player.coins -= o.cost;
      S.player.hand.push({ ...o.card });
      o.sold = true;
      log(`购入【${o.card.name}】（-${o.cost} 金币）。`);
    });
    window.UI.renderAll();
  }

  function closeShop() {
    if (!S.shop) return;
    const r = S.shop.resolve;
    S.shop = null;
    window.UI.renderAll();
    r();
  }

  // 地块怪物结算（路过与停留的统一入口）：
  // 先处理地块上的怪物——**按怪逐个询问**是否交战，答应则与之战斗；返回 true 表示已开战
  // asked 记录本次结算中已询问过的怪物 uid：一次结算内同一只怪不重复询问（拒绝后可继续问同格其他怪），
  // 战斗结束重入结算时同样不会重复问；但每次进入新格都会清空（见移动循环），因此再次经过同一格会重新询问
  async function offerTileFight(pendingKind) {
    const P = S.player, mv = S.move;
    if (S.over || P.ko) return false;
    const asked = mv ? (mv.asked = mv.asked || {}) : {};
    for (;;) {
      const m = monstersAt(P.pos).filter(x => x.hp > 0).find(x => !asked[x.uid]);
      if (!m) return false; // 该地块上的怪物都询问过了
      asked[m.uid] = true;
      const detail = `HP ${m.hp}/${m.hpMax}　攻 ${m.atk}　防 ${m.def_}`;
      if (!(await askYesNo(`是否与【${m.name}】交战？`, "交战", "避开", detail))) {
        log(`你选择避开【${m.name}】。`);
        continue; // 继续询问同地块的下一只怪
      }
      S.pendingTile = pendingKind; // 战斗结束后回到对应结算流程
      startBattle("player", m);
      return true;
    }
  }

  // 路过一格的统一结算顺序：先按怪询问是否交战 → 再问是否在此停留 → 最后结算地块效果。
  // 返回值："battle" 已开战（战斗结束后由 endBattle 重新进入本函数续接，已询问过的怪不会重复问）；
  //         "stop"   玩家选择停留（调用方清零剩余步数并转入落格结算）；
  //         "done"   本格处理完毕，可以继续走
  async function passThroughTile(tile) {
    if (await offerTileFight("pass")) return "battle";
    const mv = S.move;
    if (mv && mv.steps > 0 && CAN_STOP.includes(tile.t) &&
        await askYesNo(stopPrompt(tile.t, mv.steps), "停留", "继续前进")) return "stop";
    if (tile.t === "shop") { await openShop(); onPassShop(); }
    else if (tile.t === "chipshop") await openChipShop();
    return "done";
  }

  // 返回值：疾行追加步数；其余 0。async：升级后需等待筹码 3 选 1
  async function resolveLandTile(tile) {
    const P = S.player, pos = P.pos;
    switch (tile.t) {
      case "start": {
        P.hp = Math.min(P.hpMax, P.hp + 2);
        log("起始点：回复 2 点生命。", "good");
        if (await tryUpgrade()) await openChipChoice(); // 升星即选
        break;
      }
      case "heal": P.hp = Math.min(P.hpMax, P.hp + 2); log("回血地块：回复 2 点生命。", "good"); break;
      case "damage": playerTakesDamage(2, "掉血地块"); checkPlayerKo(); break;
      case "draw": {
        drawCard(); drawCard();
        const n = chipSum("drawPass"); for (let i = 0; i < n; i++) if (drawCard(true)) log("【学识】拿牌格加抽 1 张牌。");
        break;
      }
      case "upgrade": {
        P.hp = Math.min(P.hpMax, P.hp + 2);
        log("升级点：回复 2 点生命。", "good");
        if (D.map.upgradeCost(P.star) == null) { log("升级点：已达最高星级。"); break; }
        if (await tryUpgrade()) await openChipChoice();
        break;
      }
      case "dash": {
        // 疾行 = 再掷一次移动骰；与普通回合、双骰一致地计入移速加成（升级 + 筹码）
        const roll = d10(), spd = derived().speed;
        if (spd > 0) log(`疾行：再掷 ${roll} 点，移速 +${spd}，共 ${roll + spd} 点！`);
        else log(`疾行：再掷 ${roll} 点！`);
        return roll + spd;
      }
      case "event": randomEvent(); break;
      case "spawn": {
        // 刷怪格：每次落格必刷一只（已有怪也叠刷）；战斗重入时由 mv.spawnDone 挡住不重复刷。
        // 交战一律交给上层的「按怪询问」流程，否则格上原有怪物会被询问一次、又被地块效果强制开战一次
        if (S.move && S.move.spawnDone) break;
        const def = tile.mob ? D.monsters[tile.mob] : null;
        const id = def ? def.id : (() => { const pool = mapMinionPool(); return pool[rnd(pool.length)].id; })();
        const nm = spawnMonster(id, pos);
        log(`刷怪地块：一只【${nm.name}】出现了！`, "warn");
        break;
      }
      case "assault": {
        const alive = S.monsters.filter(m => m.hp > 0);
        if (alive.length) {
          // 突击门：自选任意怪物，突袭至其所在格后开战
          S.targeting = { assault: true, candidates: alive.map(m => m.uid), cardName: "突击门" };
          log(`突击门：请选择突击目标（${alive.length} 个候选，将突袭至其所在格）。`);
        } else log("突击门：场上没有怪物。");
        break;
      }
      case "boss":
        // BOSS 格：同样不强制开战（无「强制战斗」规则），交战由按怪询问流程处理
        break;
    }
    window.UI.renderAll();
    return 0;
  }

  // 升级：金币足够则自动升星并结算升级树；返回是否升星成功（成功后弹筹码 3 选 1）
  async function tryUpgrade() {
    const P = S.player;
    const cost = D.map.upgradeCost(P.star);
    if (cost == null) return false;
    if (P.coins >= cost) {
      P.coins -= cost; P.star++;
      applyStarGrowth(P.star);
      return true;
    }
    log(`升级：升到 ${P.star + 1} 星需要 ${cost} 金币，还差 ${cost - P.coins} 金币（现有 ${P.coins}）。`, "warn");
    return false;
  }

  // 升级树：1星+1攻+2血上限；2星+2攻；3星+2攻+2移速
  function applyStarGrowth(star) {
    const P = S.player;
    S.chipRefreshLeft = (S.chipRefreshLeft || 0) + 1;
    log(`筹码刷新次数 +1（现有 ${S.chipRefreshLeft} 次）。`);
    if (star === 1) { P.atk += 1; P.hpMax += 2; P.hp += 2; log(`升级！当前 ${star} 星：攻击+1，血上限+2。`, "good"); }
    else if (star === 2) { P.atk += 2; log(`升级！当前 ${star} 星：攻击+2。`, "good"); }
    else if (star === 3) { P.atk += 2; P.speedBonus += 2; log(`升级！当前 ${star} 星：攻击+2，移动速度+2。`, "good"); }
    else log(`升级！当前 ${star} 星。`, "good");
  }

  // 事件池（8 条，均匀随机各 12.5%）：条目与数值见设计文档 07 §8
  // 事件扣血不走 playerTakesDamage：事件不是战斗伤害，不受战斗芯片（不屈/狂暴/缓冲）影响
  function randomEvent() {
    const P = S.player;
    const r = rnd(8);
    if (r === 0) { P.coins += 5; log("事件：捡到 5 金币！", "good"); }
    else if (r === 1) { P.coins = Math.max(0, P.coins - 3); log("事件：丢失 3 金币…", "warn"); }
    else if (r === 2) { P.moveBonus += 3; log("事件：下次移动速度 +3。", "good"); }
    else if (r === 3) {
      // 满手降级为金币：drawCard(true) 静默返回 false，避免与「手牌已满」提示重复且矛盾
      if (drawCard(true)) log("事件：获得 1 张卡牌。", "good");
      else { P.coins += 6; log("事件：手牌已满，改为获得 6 金币。", "good"); }
    }
    else if (r === 4) { eventSpawnMinions(2); }
    else if (r === 5) { P.atkBuffNextBattle = (P.atkBuffNextBattle || 0) + 5; log("事件：下次攻击 +5。", "good"); }
    else if (r === 6) {
      const h = Math.min(3, P.hpMax - P.hp);
      P.hp += h;
      log(h > 0 ? `事件：恢复 ${h} 生命（现 ${P.hp}/${P.hpMax}）。` : "事件：生命已满，未恢复。", "good");
    }
    else {
      P.hp -= 3;
      log(`事件：失去 3 生命…（剩 ${Math.max(0, P.hp)}）`, "warn");
      checkPlayerKo(); // 允许被打到 0 血：走凤凰再生拦截与被击倒流程（含轮次进度 +1）
    }
  }

  // 事件刷怪：全图随机挑 n 个互不相同的地块，每格刷 1 只随机小怪（不排除任何地块类型）
  function eventSpawnMinions(n) {
    const pool = mapMinionPool();
    const total = D.map.tiles.length;
    const picked = [];
    for (let guard = 0; picked.length < n && guard < 100; guard++) {
      const p = rnd(total);
      if (picked.indexOf(p) < 0) picked.push(p);
    }
    picked.forEach(p => {
      const nm = spawnMonster(pool[rnd(pool.length)].id, p);
      log(`事件：一只【${nm.name}】出现在了地图上！`, "warn");
    });
  }

  // ================= 战斗（设计文档02）=================
  function startBattle(by, target) {
    if (by === "player") {
      S.battle = { mode: "playerAttack", target, cardBonus: 0, defBonus: 0, finalMult: 1, spentPoints: 0, noCounter: false };
      log(`⚔ 玩家对【${target.name}】发起战斗！`, "battle");
      S.phase = "battle";
      window.UI.renderAll(); window.UI.enterBattle();
    } else {
      monsterAttack(target);
    }
  }

  function playerBattlePoints() { return derived().pts; }

  // 战斗牌通用打出（攻方加成 / 守方防御加成）
  function playBattleCard(cardId) {
    const b = S.battle; if (!b) return;
    const c = D.cards[cardId], idx = S.player.hand.findIndex(h => h.id === cardId);
    if (!c || idx < 0) return;
    const attacking = b.mode === "playerAttack";
    if (attacking ? c.kind !== "atk" : c.kind !== "def") { log(`【${c.name}】在当前战斗中无法使用。`, "warn"); return; }
    if (b.spentPoints + c.cost > playerBattlePoints()) { log("战斗点数不足。", "warn"); return; }
    S.player.hand.splice(idx, 1);
    b.spentPoints += c.cost;
    const v = rollRange(c);
    if (c.kind === "atk") {
      b.cardBonus += v;
      log(`打出【${c.name}】（耗 ${c.cost} 点）：攻击 +${v}（合计 +${b.cardBonus}）。`);
      if (c.finalMult) { b.finalMult = c.finalMult; log("最终攻击结算 +50%！"); }
      if (c.grant) { S.player.hand.push({ ...D.cards[c.grant] }); log(`获得 1 张【${D.cards[c.grant].name}】！`, "good"); }
      if (c.noCounter) b.noCounter = true; // 暗影突袭：本次攻击不会被反击
    } else {
      b.defBonus += v;
      log(`打出【${c.name}】（耗 ${c.cost} 点）：防御 +${v}（合计 +${b.defBonus}）。`);
    }
    onCardPlayed(); // 回收词条
    window.UI.renderAll(); window.UI.enterBattle();
  }

  // 攻击总力：基础 + 筹码（财力/生命之力/猎印III/散财）+ 技能 + 战斗牌
  // preview=true 时只做数值预览，不触发任何消耗副作用（散财扣币）与日志
  function computeAttack(target, b, preview = false) {
    const P = S.player;
    let atk = derived().atk + (b ? b.cardBonus : 0) + (P.atkBuffNextBattle || 0); // derived 已含 buffSum("atk")
    chipList().forEach(c => { if (c.perWealthDiv) atk += Math.floor(P.wealth / c.perWealthDiv); }); // 财力
    // 生命之力：持有该系筹码时，满血攻击力 = 各生命之力数值之和 + 再生层数×持有枚数
    // （「+当前再生层数」按每枚生命之力独立结算，I+II 同持即加两倍再生层数）；
    // 未持有时不提供任何加成（再生层数本身不转化为攻击）
    const lfCount = chipList().filter(c => c.fullHpAtk).length;
    if (P.hp >= P.hpMax && lfCount > 0) atk += chipSum("fullHpAtk") + P.regen * lfCount;
    if (target && hasChip(c => c.atkPerMark)) atk += target.marks || 0; // 猎印 III
    // 喵之追猎：目标带追猎层 → 攻击 +value（层数不消耗，持续提供加成）
    const pv = D.player.passiveSkill?.effect === "huntOnPass" ? (D.player.passiveSkill.value || 3) : 0;
    if (target && pv > 0 && (target.hunt || 0) > 0) {
      atk += pv;
      if (!preview) { log(`【喵之追猎】目标带【追猎】：攻击 +${pv}。`, "good"); }
    }
    if (hasChip(c => c.sancai) && P.coins > 20) { // 散财
      const bonus = Math.floor(P.coins * 0.3);
      atk += bonus;
      if (!preview) { P.coins -= 8; log(`【散财】发动：攻击 +${bonus}，失去 8 金币。`, "good"); }
    }
    return atk;
  }

  // 战斗面板预览：总攻击力 + 额外加成明细（不含战斗牌，牌加成单独显示）
  function attackPreview(target) {
    const P = S.player, parts = [];
    if (P.atkBuffNextBattle) parts.push(`技能+${P.atkBuffNextBattle}`);
    chipList().forEach(c => { if (c.perWealthDiv) parts.push(`【${c.name}】+${Math.floor(P.wealth / c.perWealthDiv)}`); });
    const lfCount2 = chipList().filter(c => c.fullHpAtk).length;
    const lfBonus = lfCount2 > 0 ? chipSum("fullHpAtk") + P.regen * lfCount2 : 0;
    if (P.hp >= P.hpMax && lfBonus > 0) parts.push(`生命之力+${lfBonus}`);
    const pv = D.player.passiveSkill?.effect === "huntOnPass" ? (D.player.passiveSkill.value || 3) : 0;
    if (target && pv > 0 && (target.hunt || 0) > 0) parts.push(`追猎+${pv}`);
    if (hasChip(c => c.sancai) && P.coins > 20) parts.push(`散财+${Math.floor(P.coins * 0.3)}（耗8金币）`);
    return { total: computeAttack(target, null, true), parts, stance: target ? monsterStance(target) : null,
      enemyAtk: target ? effAtk(target) : null,
      enemyDef: target ? effDef(target) : null };
  }

  function onHitEnemy(target) {
    chipList().forEach(c => {
      if (c.hitCoin) { S.player.coins += c.hitCoin; log(`【${c.name}】命中获得 ${c.hitCoin} 金币。`); }
      // 猎印系：攻击命中后给目标挂标记（多枚猎印同持时逐条叠加）
      if (c.marksOnHit && target && target.marks != null) {
        target.marks += c.marksOnHit;
        log(`【${c.name}】命中：【${target.name}】获得 ${c.marksOnHit} 层标记（现 ${target.marks}）。`);
      }
    });
  }

  // 对怪物造成伤害：每层标记使本次伤害 +1；返回实际总伤害
  // 命中词条（猎印挂标记 / 财力挣金币）不在这里触发——它只属于「战斗攻击」，
  // 由 resolvePlayerAttack 在结算后显式调用 onHitEnemy；出牌伤害与青焰等效果伤害不触发。
  function dealToMonster(m, base) {
    const marks = m.marks || 0;
    const total = Math.max(1, base) + marks;
    if (marks > 0) log(`【${m.name}】身负 ${marks} 层标记，伤害 +${marks}。`);
    m.hp -= total;
    log(`对【${m.name}】造成 ${total} 点伤害${m.hp <= 0 ? "，将其击倒！" : `（剩 ${Math.max(0, m.hp)}）`}`, "good");
    if (m.hp <= 0) defeatMonster(m);
    // 晕彩救援：安若素血线跌破阈值触发；被击倒时（含在阈值前就被一次打死）也保底触发
    const rescue = m.def.passives?.find(p => p.effect === "yuncaiRescue");
    if (rescue && (m.hp <= 0 || m.hp < Math.floor(m.hpMax * rescue.threshold))) tryYuncaiRescue();
    return total;
  }

  // 晕彩救援：升星点刷出女仆晕彩；每局仅一次，晕彩（或任意 BOSS）在场时不触发
  function tryYuncaiRescue() {
    if (S.yuncaiRescued) return false;
    if (S.monsters.some(x => x.def.category === "boss")) return false;
    S.yuncaiRescued = true;
    const upIdx = D.map.tiles.findIndex(x => x.t === "upgrade");
    const b = makeMonster(D.monsters.maid_yuncai, upIdx >= 0 ? upIdx : D.map.startTile);
    b.initRandom = true; // 登场方向随机
    rollNextStep(b, true);
    S.monsters.push(b);
    log(`【晕彩救援】发动：女仆晕彩登场了！！`, "warn");
    return true;
  }

  function monsterStance(m) {
    const r = m.def.defend;
    if (!r) return "defend"; // 未配置防御倾向：默认防御
    if (r.rule === "always") return r.stance;
    if (r.rule === "hpThreshold") return m.hp > m.hpMax * r.threshold ? r.above : r.belowOrEqual;
    return "defend";
  }

  function resolvePlayerAttack() {
    const b = S.battle, t = b.target, P = S.player;
    let atk = computeAttack(t, b);
    P.atkBuffNextBattle = 0;
    // BOSS 技能：无视战斗牌加成2点
    if (t.def.skill?.effect === "ignoreCardBonus" && t.skillCd === 0) {
      const ig = Math.min(t.def.skill.value, b.cardBonus);
      atk -= ig; log(`【${t.def.skill.name}】发动：无视战斗牌加成 ${ig} 点！`, "battle");
      t.skillCd = bossSkillCd(t);
    }
    const pRoll = d6(), mRoll = d6();
    const stance = monsterStance(t);
    const enemyDef = effDef(t); // 骑士守护的临时防御与光环加成都计入本次防守
    t.nextBattleAtk = 0; t.nextBattleDef = 0; // 「下次战斗」仅生效一次，反击是另一场战斗
    let dmg;
    if (stance === "dodge") {
      const ok = pRoll >= mRoll;
      if (ok) { log(`闪避成功（${pRoll} vs ${mRoll}）：未造成伤害。`, "battle"); dmg = 0; }
      else { dmg = Math.max(1, atk + pRoll - mRoll); log(`闪避失败（${pRoll} vs ${mRoll}）：防御按0结算。`, "battle"); }
    } else {
      dmg = Math.max(1, atk + pRoll - (enemyDef + mRoll));
      log(`对拼：我方 ${atk}+${pRoll} vs 敌方 ${enemyDef}+${mRoll}（防御姿态）`);
    }
    if (dmg > 0 && b.finalMult > 1) { dmg = Math.floor(dmg * b.finalMult); log(`【全力攻击】最终结算 ×${b.finalMult} → ${dmg} 点！`, "battle"); }
    if (dmg > 0) { dealToMonster(t, dmg); onHitEnemy(t); } // 命中词条只认战斗攻击：出牌伤害与青焰伤害不触发
    // 反击：目标存活且有 counter 标签 → 立即进入一次完整的「怪物攻击」战斗
    // （与怪物主动攻击同流程：玩家选姿态、打出防御牌、双方掷骰后结算）
    if (t.hp > 0 && !S.over && t.def.tags.includes("counter")) {
      if (b.noCounter) { // 暗影突袭：免反击
        log("【暗影突袭】生效：本次攻击不会被反击。", "good");
      } else {
      log(`【${t.name}】反击！！`, "battle");
      S.battle = null;
      monsterAttack(t, "counter");
      return;
      }
    }
    endBattle();
  }

  function bossSkillCd(t) { return t.def.phase.effect === "skillEveryRound" && t.hp <= t.hpMax * t.def.phase.threshold ? 1 : t.def.skill.cooldown; }

  function defeatMonster(t) {
    S.player.coins += t.def.coinDrop;
    log(`获得 ${t.def.coinDrop} 金币。`, "good");
    // 击倒类词条：财力 II 击倒敌人获得财富层
    const kw = chipSum("killWealth");
    if (kw > 0) { S.player.wealth += kw; log(`【财力 II】击倒敌人：财富层数 +${kw}（现 ${S.player.wealth}）。`, "good"); }
    // 喵之追猎：击倒带【追猎】的敌人后，随机抽取 1 张战斗牌
    if (D.player.passiveSkill?.effect === "huntOnPass" && (t.hunt || 0) > 0) {
      if (S.player.hand.length >= 8) {
        log("【喵之追猎】击倒带【追猎】的敌人，但手牌已满（8），无法抽取。", "warn");
      } else {
        const card = D.cards[D.battlePool[rnd(D.battlePool.length)]];
        S.player.hand.push({ ...card });
        log(`【喵之追猎】击倒带【追猎】的敌人：抽取 1 张战斗牌【${card.name}】。`, "good");
      }
    }
    // 任务计数（实时累计，完成判定在每轮结束时统一进行）
    S.quests?.forEach(q => {
      const hit = q.targets ? q.targets.includes(t.def.id) : q.target === t.def.id;
      if (!q.done && hit) q.progress++;
    });
    S.monsters = S.monsters.filter(m => m !== t);
    if (t.def.category === "boss") gameOver(true);
  }

  // ================= 友方召唤物：甜品使魔（洛可可）=================
  // 甜品使魔是友方单位：玩家无法攻击、敌人可以攻击；行动顺序为 玩家 → 友方 → 敌方
  function spawnFamiliar(pos) {
    const def = D.allies.dessert_familiar;
    const a = { uid: ++S.allySeq, def, name: `${def.name}${S.allySeq}`, pos,
      hp: def.hpMax + (S.famHpBonus || 0), hpMax: def.hpMax + (S.famHpBonus || 0),
      atk: def.attack + (S.famAtkBonus || 0), def: def.defense,
      nextMoveBonus: 0, firstStep: null, // firstStep：登场时玩家指定的初始移动方向
      lastFrom: null, queuedNext: null }; // 来路继承与预掷方向：与怪物同一套「不掉头」通则
    S.allies.push(a);
    rollAllyNext(a);
    return a;
  }

  // 使魔方向预掷：首步优先玩家指定的初始方向；否则贪心追击最近怪物（并列距离随机）；
  // 场上没有怪物时按通则继承来路方向前进（不掉头，死路才回头）。预告箭头与实际走位共用同一结果
  function rollAllyNext(a) {
    let pool;
    if (a.firstStep != null && S.adj[a.pos].includes(a.firstStep)) {
      pool = [a.firstStep];
    } else {
      const target = nearestMonster(a.pos);
      const opts = a.lastFrom != null ? stepOptions(a.pos, a.lastFrom) : S.adj[a.pos].slice();
      if (target) {
        let bd = 1e9;
        pool = [];
        for (const o of opts) { const d = graphDist(o, target.pos); if (d < bd) { bd = d; pool = [o]; } else if (d === bd) pool.push(o); }
      } else {
        pool = opts; // 无怪可追：不掉头前进，岔路随机选（已预掷，预告即真相）
      }
    }
    a.queuedNext = pool.length ? pool[rnd(pool.length)] : null;
  }

  // 甜品登场两段瞄准：
  //   deploy    阶段——选择登场地块，生成使魔并给全体使魔（含此后生成的）攻击力永久 +2
  //   deployDir 阶段——点击登场格的相邻地块，确定使魔的初始移动方向
  function chooseDeployTile(pos) {
    const t = S.targeting;
    if (!t || !t.candidates.includes(pos)) return;
    if (t.deployDir) {
      const a = t.ally;
      S.targeting = null;
      if (a && S.allies.includes(a)) {
        a.firstStep = pos;
        rollAllyNext(a); // 方向已定：刷新预掷，预告箭头立即指向初始方向
        log(`【${a.name}】的初始移动方向已确定。`, "good");
      }
      window.UI.renderAll();
      return;
    }
    if (!t.deploy) return;
    S.targeting = null;
    S.famAtkBonus = (S.famAtkBonus || 0) + 2;
    S.famHpBonus = (S.famHpBonus || 0) + 2;
    S.allies.forEach(a => { a.atk += 2; a.hpMax += 2; a.hp += 2; });
    const a = spawnFamiliar(pos);
    const p = D.player.activeSkill;
    S.player.skillCd = p.cooldown;
    log(`【${p.name}】发动：【${a.name}】在第 ${pos} 格登场！所有甜品使魔最大生命与攻击力永久 +2（现 ${a.hp}/${a.hpMax}，攻 ${a.atk}）。`, "good");
    // 第二段：初始方向选择（候选 = 登场格的全部邻格；取消则由使魔自行追击）
    S.targeting = { deployDir: true, ally: a, candidates: S.adj[pos].slice(), cardName: p.name };
    log(`请点击相邻地块，确定【${a.name}】的初始移动方向。`);
    window.UI.renderAll();
  }

  // 治愈魔法：玩家路过甜品使魔所在格时触发（途经与落格均算路过）
  // 只回复使魔，不回复玩家自身
  function healPassAllies(pos) {
    if (D.player.passiveSkill?.effect !== "healingPass") return;
    const heal = D.player.passiveSkill.value || 5;
    (S.allies || []).forEach(a => {
      if (a.hp <= 0 || a.pos !== pos) return;
      const ah = Math.min(heal, a.hpMax - a.hp);
      if (ah > 0) { a.hp += ah; log(`【治愈魔法】：【${a.name}】回复 ${ah} 生命（现 ${a.hp}/${a.hpMax}）。`, "good"); }
      a.nextMoveBonus = 3; // 覆盖：同回合反复路过仍为 +3
      log(`【治愈魔法】：【${a.name}】下次移动速度 +3。`);
    });
  }

  // 使魔击倒怪物：视为玩家击倒（金币与任务进度照常），但不触发任何筹码效果（财力II/追猎等）
  function defeatMonsterByAlly(t) {
    S.player.coins += t.def.coinDrop;
    log(`获得 ${t.def.coinDrop} 金币。`, "good");
    S.quests?.forEach(q => {
      const hit = q.targets ? q.targets.includes(t.def.id) : q.target === t.def.id;
      if (!q.done && hit) q.progress++;
    });
    S.monsters = S.monsters.filter(m => m !== t);
    if (t.def.category === "boss") gameOver(true);
  }

  // 使魔攻击一只怪物：双方各掷 d6；不触发任何筹码效果（不加标记伤害、不走 onHitEnemy）
  function allyStrike(a, m) {
    const aRoll = d6(), mRoll = d6();
    const dmg = Math.max(1, a.atk + aRoll - (m.def_ + mRoll));
    log(`【${a.name}】攻击【${m.name}】：${a.atk}+${aRoll} vs ${m.def_}+${mRoll}，造成 ${dmg} 点伤害${m.hp - dmg <= 0 ? "，将其击倒！" : `（剩 ${Math.max(0, m.hp - dmg)}）`}`, "good");
    m.hp -= dmg;
    if (m.hp <= 0) { defeatMonsterByAlly(m); return; }
    // 怪物还手：同样自动结算
    const cRoll = d6(), fRoll = d6();
    const cdmg = Math.max(1, effAtk(m) + cRoll - (a.def + fRoll));
    a.hp -= cdmg;
    log(`【${m.name}】还手：【${a.name}】受到 ${cdmg} 点伤害（剩 ${Math.max(0, a.hp)}）。`, "warn");
    if (a.hp <= 0) {
      S.allies = S.allies.filter(x => x !== a);
      log(`【${a.name}】被击碎了……`, "warn");
    }
  }

  // 敌人路过甜品使魔所在格：主动攻击的敌人会攻击它（自动结算，无需玩家选姿态）
  function monsterStrikeAlly(m, a) {
    const mRoll = d6(), aRoll = d6();
    const dmg = Math.max(1, effAtk(m) + mRoll - (a.def + aRoll));
    a.hp -= dmg;
    log(`⚔【${m.name}】攻击【${a.name}】：造成 ${dmg} 点伤害（剩 ${Math.max(0, a.hp)}）。`, "battle");
    if (a.hp <= 0) {
      S.allies = S.allies.filter(x => x !== a);
      log(`【${a.name}】被击碎了……`, "warn");
    }
  }

  // 友方阶段：玩家回合结束后、敌方行动前，每个使魔依次行动
  function allyTurns() {
    if (S.over) { aiTurns(); return; }
    const list = (S.allies || []).slice();
    const step = (i) => {
      if (S.over) return;
      if (i >= list.length) { aiTurns(); return; }
      const a = list[i];
      if (a.hp <= 0 || !S.allies.includes(a)) { step(i + 1); return; }
      allyMove(a, () => step(i + 1));
    };
    step(0);
  }

  function allyMove(a, done) {
    const roll = d10();
    const bonus = a.nextMoveBonus || 0;
    if (bonus) log(`【${a.name}】移速提升 +${bonus}。`, "good");
    a.nextMoveBonus = 0;
    log(`【${a.name}】掷骰 ${roll}${bonus ? "（+" + bonus + " 移速）" : ""} 点，开始追击。`);
    S.move = { who: a, isAlly: true, steps: roll + bonus, done, prev: null };
    window.UI.renderAll();
    stepAlly();
  }

  // 使魔移动：按预掷方向走（预告即真相）；进入怪物所在格即攻击格上所有怪物
  async function stepAlly() {
    const mv = S.move;
    if (!mv || !mv.isAlly) return;
    const a = mv.who;
    while (mv.steps > 0 && !S.over && a.hp > 0) {
      let next;
      if (a.queuedNext != null && S.adj[a.pos].includes(a.queuedNext)) {
        next = a.queuedNext; // 首选预掷方向（预告即真相）
      } else {
        rollAllyNext(a); // 无预掷记录 / 记录失效：兜底现掷
        if (a.queuedNext == null || !S.adj[a.pos].includes(a.queuedNext)) break;
        next = a.queuedNext;
      }
      mv.steps--;
      a.lastFrom = a.pos; // 记录来路：下步不掉头（无怪可追时沿路继续）
      a.pos = next;
      if (a.firstStep === next) a.firstStep = null; // 初始方向仅约束首步
      rollAllyNext(a); // 落地即预掷下一步：预告箭头任何时刻都有解
      window.UI.renderAll();
      if (ANIM) await delay(ANIM);
      if (S.over || a.hp <= 0) break;
      // 攻击所有自己路过的怪物（含同格多只）
      const foes = monstersAt(a.pos).filter(x => x.hp > 0);
      for (const foe of foes) {
        allyStrike(a, foe);
        if (a.hp <= 0 || S.over) break;
      }
    }
    const d = mv.done; S.move = null;
    if (d) d();
  }

  // 怪物攻玩家（骰点在玩家选定姿态后才掷，保证随机感）
  function monsterAttack(m, reason) {
    const counter = reason === "counter";
    log(counter ? `⚔【${m.name}】的反击袭来！` : `⚔【${m.name}】向玩家发起战斗！`, "battle");
    S.battle = { mode: "monsterAttack", target: m, counter, cardBonus: 0, defBonus: 0, finalMult: 1, spentPoints: 0, pending: null };
    S.phase = "battle";
    window.UI.renderAll(); window.UI.enterBattle();
  }

  function playerChooseStance(stance) {
    const b = S.battle, t = b.target, P = S.player;
    // 姿态确定后掷骰
    let mDiceBonus = 0;
    if (t.def.skill?.effect === "selfDicePlus" && t.skillCd === 0) { mDiceBonus = t.def.skill.value; t.skillCd = t.def.skill.cooldown; log(`【${t.def.skill.name}】发动：怪物骰点+${mDiceBonus}。`, "battle"); }
    const mRaw = d6(), pRoll = d6();
    const mRoll = mRaw + mDiceBonus;
    const mAtk = effAtk(t); // 骑士守护的临时攻击与光环加成都计入本次出手
    b.pending = { mRoll, pRoll };
    log(`掷骰：我方 ${pRoll} vs 敌方 ${mRaw}${mDiceBonus ? "+" + mDiceBonus : ""}（${stance === "dodge" ? "闪避" : "防御"}姿态）`);
    let dmg;
    if (stance === "dodge") {
      // 闪避判定：只比裸 d6 大小，不看攻防与技能加成
      if (pRoll >= mRaw) { log("闪避成功：未受伤。", "good"); dmg = 0; }
      else { dmg = Math.max(1, mAtk + mRoll - pRoll); log("闪避失败：防御按0结算！", "battle"); }
    } else {
      const myDef = derived().def + (b.defBonus || 0);
      dmg = Math.max(1, (mAtk + mRoll) - (myDef + pRoll));
      log(`对拼：敌方 ${mAtk}+${mRoll} vs 我方 ${myDef}+${pRoll}`);
    }
    t.nextBattleAtk = 0; t.nextBattleDef = 0; // 消耗「下次战斗」加成
    const dealt = dmg > 0 ? playerTakesDamage(dmg, `【${t.name}】的攻击`) : 0;
    // 鲜血汲取：按实际结算伤害回血，包含不屈减伤与狂暴增伤
    if (dealt > 0 && t.hp > 0 && t.def.passives?.some(p => p.effect === "bloodDrain")) {
      const heal = Math.min(t.hpMax - t.hp, dealt);
      if (heal > 0) { t.hp += heal; log(`【鲜血汲取】：【${t.name}】恢复 ${heal} 点（现 ${t.hp}）。`, "battle"); }
    }
    checkPlayerKo();
    endBattle();
  }

  // 玩家受伤入口：不屈（低血减伤）/ 狂暴（受伤+1）/ 缓冲（受伤得再生）
  function playerTakesDamage(raw, source) {
    const P = S.player;
    let dmg = raw;
    if (derived().lowHp && chipSum("lowHpDef") > 0) { dmg -= chipSum("lowHpDef"); log(`【不屈】受到伤害 -${chipSum("lowHpDef")}。`); }
    const extra = buffSum("dmgTaken");
    if (extra > 0) { dmg += extra; log("【狂暴】受到伤害 +1。", "warn"); }
    dmg = Math.max(0, dmg);
    if (dmg > 0) {
      P.hp -= dmg;
      log(`${source ? source + "：" : ""}受到 ${dmg} 点伤害（剩 ${Math.max(0, P.hp)}）。`, "battle");
      const g = chipSum("onHurtRegen");
      if (g > 0) { P.regen += g; log(`【缓冲】获得 ${g} 层再生（现 ${P.regen}）。`, "good"); }
    }
    return dmg;
  }

  function checkPlayerKo() {
    const P = S.player;
    // 凤凰再生：致死伤害落定瞬间拦截——免死、回满、失去上限、永久成长；未用完次数则不进入被击倒流程
    if (P.hp <= 0 && !P.ko && D.player.passiveSkill?.effect === "phoenixReborn" && (P.phoenixLeft || 0) > 0) {
      const ps = D.player.passiveSkill;
      P.phoenixLeft--;
      P.hpMax = Math.max(1, P.hpMax - (ps.value || 4));
      P.hp = P.hpMax;
      P.flameBonus = (P.flameBonus || 0) + 1;
      log(`【${ps.name}】发动：免疫致命伤害！最大生命 -${ps.value}（现 ${P.hpMax}）并回满，青焰伤害永久 +1（剩余 ${P.phoenixLeft} 次）。`, "good");
      return;
    }
    if (P.hp <= 0 && !P.ko) {
      P.hp = 0; P.ko = true;
      P.atkBuffNextBattle = 0; P.moveBonus = 0; P.turnMoveBonus = 0; P.nextDouble = false; P.nextFixed = 0; P.nextChooseDir = false;
      log("玩家被击倒！所有 buff 清空，跳过后续行动，下回合开始时原地复活。", "warn");
      advanceRoundProgress(1); // 轮次进度 +1（设计文档02 §6）：倒地瞬间即时结算，被跨过的那一轮事件照常触发
    }
  }

  // 战斗结束后的续接：优先回到地块结算流程（先怪物后地块），否则按原逻辑续走/收尾
  function endBattle() {
    S.battle = null;
    if (!S.over) {
      const pend = S.pendingTile;
      if (pend === "land") {
        S.pendingTile = null;
        settleLandTile();
      } else if (pend === "pass") {
        S.pendingTile = null;
        // 战斗后重新处理本格：怪已询问过不会重复问，接着问是否停留并结算地块效果
        passThroughTile(S.tiles[S.player.pos]).then((r) => {
          if (S.battle || S.over) return;
          if (r === "stop") { if (S.move) S.move.steps = 0; settleLandTile(); return; }
          continueMove();
        });
      } else {
        continueMove();
      }
    }
    window.UI.renderAll();
  }

  function continueMove() {
    if (S.over) return;
    const mv = S.move;
    if (mv && mv.steps > 0) {
      S.phase = mv.who === "player" ? "move" : "turnEnd";
      if (mv.who === "player") stepPlayer(); else stepMonster();
    } else if (mv) {
      const who = mv.who, d = mv.done;
      S.move = null;
      S.phase = "turnEnd";
      if (who === "player") finishPlayerTurnIfNeeded(); else if (d) d();
    } else {
      S.phase = "turnEnd";
      finishPlayerTurnIfNeeded();
    }
  }

  function finishPlayerTurnIfNeeded() {
    if (S.phase === "turnEnd") finishPlayerTurn();
  }

  // ================= 玩家回合结束 → AI 回合（设计文档01 §3）=================
  function finishPlayerTurn() {
    // 瞄准未决（如突击门等待选目标）：回合挂起，选完目标或取消后再交给 AI
    if (S.targeting) { S.targetingResume = true; return; }
    S._dbg.fpt++;
    const P = S.player;
    P.flameActive = false; // 青焰铺设只覆盖本次移动；地块火焰（S.flames）持续到下回合开始
    turnEndEffects(); // 再生减半 / 标记 -1 / buff 递减
    while (P.hand.length > 8) P.hand.pop();
    S.phase = "turnEnd";
    log("玩家回合结束。AI 行动中…");
    window.UI.renderAll();
    if (S.aiBusy) return;
    setTimeout(allyTurns, AI_DELAY); // 行动顺序：玩家 → 友方（甜品使魔）→ 敌方
  }

  function aiTurns() {
    S._dbg.aiStart++;
    if (S.over || S.aiBusy) return;
    S.aiBusy = true;
    const acted = new Set(); // 按登场顺序取尚未行动的怪物，纳入本轮新生成的分身
    const step = () => {
      if (S.over) { S.aiBusy = false; return; }
      const m = S.monsters.find(x => !acted.has(x.uid));
      if (!m) { S.aiBusy = false; S._dbg.aiEnd++; endRound(); return; }
      acted.add(m.uid);
      // 被击倒的怪、以及本回合刚由吸收进化出的产物：本回合不再行动
      if (m.hp <= 0 || m.fusedRound === S.round) { step(); return; }
      if (m.skillCd > 0) m.skillCd--;
      // 驻守怪（卡牌实验室的变彩）：只结算回合开始技能，不移动
      if (m.def.move?.stationary) {
        runMonsterSkill(m);
        window.UI.renderAll();
        setTimeout(step, AI_DELAY);
        return;
      }
      aiMove(m, () => { window.UI.renderAll(); setTimeout(step, AI_DELAY); });
    };
    step();
  }

  // 回合开始主动技能：可移动的怪在 aiMove 里结算，驻守怪由 aiTurns 直接结算（否则会被整只跳过）
  function runMonsterSkill(m) {
    const sk = m.def.skill;
    if (!sk || m.skillCd > 0) return;
    if (sk.effect === "yuxiaShot") {
      let dmg = typeof sk.value === "object" ? (sk.value[D.diff] ?? sk.value.normal) : sk.value;
      if (D.diff === "nightmare" || D.diff === "crazy") {
        // 噩梦/疯狂：场上每有一名精英或 BOSS（不含自身）伤害 +1
        const strong = S.monsters.filter(x => x !== m && x.hp > 0 && (x.def.category === "elite" || x.def.category === "boss")).length;
        if (strong) { dmg += strong; log(`【映霞】强化：场上每名精英/BOSS +1 伤害（共 +${strong}）。`, "warn"); }
      }
      log(`【${m.name}】发动【${sk.name}】：远程射击！`, "battle");
      playerTakesDamage(dmg, `【映霞】的箭矢`);
      checkPlayerKo();
      m.skillCd = sk.cooldown;
    } else if (sk.effect === "lightSplit") {
      const c = makeMonster(D.monsters.maid_yuncai_clone, m.pos); // 本体同格
      c.atk = m.atk; c.def_ = m.def_; // 攻防复制生成时本体数值
      S.monsters.push(c); // 追加到队尾：本体行动后行动
      log(`【析光】发动：一名晕彩分身现身（攻防复制本体 ${m.atk}/${m.def_}）！`, "warn");
      m.skillCd = sk.cooldown;
    } else if (sk.effect === "spawnAround") {
      // 魔物增生：在自身周围随机空格生成游荡魔物（周围被占满时少生成）
      let born = 0;
      for (let i = 0; i < (sk.count || 1); i++) if (spawnNear(sk.mob, m.pos, sk.radius || 2)) born++;
      log(`【${m.name}】发动【${sk.name}】：${born} 只游荡魔物在周围现身！`, "warn");
      m.skillCd = sk.cooldown;
    } else if (sk.effect === "fuseMinions") {
      // 卡牌融合：按 tiers 数组顺序取第一个素材足够的档位——数组顺序即优先级（见 data.js 的注释）
      const tiers = sk.tiers || [{ from: [sk.mob], count: sk.count || 2, into: sk.into }];
      for (const tier of tiers) {
        const need = tier.count || 2;
        const prey = S.monsters.filter(x => x.hp > 0 && tier.from.includes(x.def.id));
        if (prey.length < need) continue; // 本档素材不足：降档再试
        const picks = [];
        for (let i = 0; i < need; i++) picks.push(prey.splice(rnd(prey.length), 1)[0]);
        S.monsters = S.monsters.filter(x => !picks.includes(x));
        const into = tier.into[rnd(tier.into.length)];
        const born = spawnNear(into, m.pos, sk.radius || 2) || (() => {
          // 周围没有空格：产物改落在素材原格
          const fb = makeMonster(D.monsters[into], picks[0].pos);
          S.monsters.push(fb);
          return fb;
        })();
        log(`【${m.name}】发动【${sk.name}】：${need} 只素材融合，【${born.name}】现身！`, "warn");
        m.skillCd = sk.cooldown;
        return;
      }
      // 所有档位都不足：不发动、不进 CD，下回合再试
    }
  }

  function aiMove(m, done) {
    if (S.player.ko) { done(); return; }
    runMonsterSkill(m);
    if (S.player.ko) { done(); return; }
    const roll = d10();
    const bonus = (m.def.move.steps || 1) - 1 + (m.moveBonusNext || 0);
    if (m.moveBonusNext) log(`【${m.name}】移速提升 +${m.moveBonusNext}。`);
    m.moveBonusNext = 0;
    log(`【${m.name}】掷骰 ${roll}${bonus ? "（+" + bonus + " 移速）" : ""} 点，开始移动。`);
    // 起步方向继承上一回合的来路；首次移动（lastFrom 为空）才用登场随机方向 / 初始方向
    const mvPrev = m.lastFrom ?? null;
    S._dbg.lastAiPrev = mvPrev; // 调试：本回合起步来路
    S.move = { who: m, steps: roll + bonus, attacked: false, done, prev: mvPrev };
    window.UI.renderAll();
    stepMonster();
  }

  // 「经过时」被动结算：m 刚移动到新格，与格上其他敌人的交互
  // 反复经过会反复触发，但赋予的加成是覆盖（重设为目标值），不会互相叠加
  function passByEffects(m) {
    const others = monstersAt(m.pos).filter(x => x !== m && x.hp > 0);
    if (!others.length) return;
    const ps = m.def.passives || [];
    for (const o of others) {
      for (const p of ps) {
        if (p.effect === "maidLink") {
          if (D.diff !== "nightmare" && D.diff !== "crazy") continue;
          const add = o.def.category === "minion" ? 2 : 4; // 精英/BOSS 翻倍
          o.moveBonusNext = add; // 覆盖：连续经过仍为 +2 / +4
          log(`【女仆链接】：【${o.name}】下次移动速度 +${add}。`, "warn");
        } else if (p.effect === "knightGuard" && o.def.id === "maid_tina") {
          const heal = Math.min(o.hpMax - o.hp, 3);
          if (heal > 0) o.hp += heal;
          o.nextBattleAtk = 3; o.nextBattleDef = 3; // 覆盖：连续经过仍为 +3
          log(`【骑士守护】：【${o.name}】回复 ${heal} 点，下次战斗攻防 +3。`, "warn");
        } else if (p.effect === "princessFocus" && o.def.id === "maid_sutaoyao" && o.skillCd > 0) {
          o.skillCd = 0;
          log(`【公主关注】：【${o.name}】的【映霞】CD 已刷新。`, "warn");
        }
      }
    }
  }

  // ---------- 卡牌实验室：吸收与融合（设计文档 08）----------
  // 距 pos 不超过 radius 步的空格（排除玩家所在格与已有敌人格）
  function freeTilesNear(pos, radius) {
    const busy = new Set(S.monsters.filter(x => x.hp > 0).map(x => x.pos));
    busy.add(S.player.pos);
    const out = [], seen = new Set([pos]), q = [{ p: pos, d: 0 }];
    while (q.length) {
      const cur = q.shift();
      if (cur.d >= radius) continue;
      for (const nb of S.adj[cur.p]) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        q.push({ p: nb, d: cur.d + 1 });
        if (!busy.has(nb)) out.push(nb);
      }
    }
    return out;
  }
  // 在 pos 附近随机空格刷怪；无空格则返回 null
  function spawnNear(mobId, pos, radius) {
    const cand = freeTilesNear(pos, radius);
    if (!cand.length) return null;
    return spawnMonster(mobId, cand[rnd(cand.length)]);
  }

  // 游荡魔物互相吸收：移动方与同格的另一只同类合而为一，随机进化成一只一级精英
  // 产物满血、本回合不再行动；不视为击败（不给金币、不推进任务），只做单位替换
  function devourMinion(m) {
    const p = m.def.passives?.find(x => x.effect === "devourMinion");
    if (!p || m.hp <= 0) return false;
    const other = monstersAt(m.pos).find(x => x !== m && x.hp > 0 && x.def.id === m.def.id);
    if (!other) return false;
    const fused = makeMonster(D.monsters[p.into[rnd(p.into.length)]], m.pos);
    fused.fusedRound = S.round;  // 本回合不再行动
    fused.lastFrom = m.lastFrom; // 方向继承：下回合起步不掉头
    S.monsters = S.monsters.filter(x => x !== m && x !== other);
    S.monsters.push(fused);
    rollNextStep(fused, false);
    log(`【吸收】：两只游荡魔物合而为一，【${fused.name}】现身（${fused.hp}/${fused.hpMax}）！`, "warn");
    return true;
  }

  // 奇美拉「万魔之王」：只有奇美拉**自己移动**到小怪所在格时才吸收（单向）
  // 小怪路过奇美拉不会被吃掉——否则「魔物增生」产出的小怪会白白喂养本体，形成打不断的滚雪球
  // 成长速率按难度分档：普通/困难每 perCount 只 +1 攻击，噩梦/疯狂每只 +1
  function absorbMinions(m) {
    if (m.hp <= 0) return false;
    const p = m.def.passives?.find(x => x.effect === "devourMinions");
    if (!p) return false;
    const prey = monstersAt(m.pos).filter(x => x.hp > 0 && x.def.id === "lab_wander");
    if (!prey.length) return false;
    S.monsters = S.monsters.filter(x => !prey.includes(x));
    const per = typeof p.perCount === "object" ? (p.perCount[D.diff] ?? 1) : (p.perCount || 1);
    const before = m.devourCount || 0;
    m.devourCount = before + prey.length;
    const gain = (Math.floor(m.devourCount / per) - Math.floor(before / per)) * (p.atkPer || 1);
    m.atk += gain;
    log(`【万魔之王】：【${m.name}】吸收 ${prey.length} 只游荡魔物（累计 ${m.devourCount}/${per}）` +
      (gain > 0 ? `，攻击力永久 +${gain}（现 ${m.atk}）。` : `，攻击力未提升。`), "warn");
    return true;
  }

  async function stepMonster() {
    const mv = S.move;
    if (!mv || mv.who === "player" || mv.isAlly) return;
    const m = mv.who, P = S.player;
    while (mv.steps > 0 && !S.over && !S.battle) {
      let next;
      if (m.queuedNext != null && S.adj[m.pos].includes(m.queuedNext)) {
        next = m.queuedNext; // 首选预掷方向（预告即真相）
      } else if (mv.prev == null && m.initRandom) {
        const opts = S.adj[m.pos]; next = opts[rnd(opts.length)]; // 无预掷记录：兜底现掷
      } else if (m.def.tags.includes("aggressive") && m.pos !== P.pos) {
        // 主动怪：不回头前提下，贪心选使到玩家 BFS 距离最小的方向（可利用顺路捷径）
        const opts = stepOptions(m.pos, mv.prev);
        next = opts[0];
        let bd = graphDist(next, P.pos);
        for (const o of opts) { const d = graphDist(o, P.pos); if (d < bd) { bd = d; next = o; } }
      } else {
        const opts = stepOptions(m.pos, mv.prev);
        next = opts[rnd(opts.length)]; // 被动怪 / 已与玩家同格的主动怪：随机走开
      }
      mv.prev = m.pos;
      m.lastFrom = mv.prev; // 记录来路：下回合起步继承，怪物不能每回合随意转向
      mv.steps--;
      m.pos = next;
      rollNextStep(m, false); // 落地即预掷下一步：预告箭头任何时刻都有解
      window.UI.renderAll();
      if (ANIM) await delay(ANIM);
      if (S.over || S.battle) break;
      // 青焰：进入青焰地块的敌人受到伤害（起步所在格不结算，与「经过」语义一致）
      if (S.flames && S.flames[m.pos]) {
        const dmg = S.flames[m.pos];
        log(`【${m.name}】踏入青焰，受到 ${dmg} 点伤害！`, "good");
        dealToMonster(m, dmg);
        if (m.hp <= 0) break; // 被青焰击倒：本次移动结束（defeatMonster 已结算）
        if (S.over) break;
      }
      // 敌人路过甜品使魔：主动攻击的敌人会攻击它（每名敌人每回合只发动一次攻击，
      // 先经过使魔再经过玩家时只攻击使魔）
      if (!mv.attacked && m.def.tags.includes("aggressive")) {
        const ally = (S.allies || []).find(x => x.hp > 0 && x.pos === m.pos);
        if (ally) { mv.attacked = true; monsterStrikeAlly(m, ally); }
      }
      if (m.pos === P.pos && !mv.attacked) {
        mv.attacked = true;
        // 喵之追猎：怪物路过玩家所在格 → 施加 1 层追猎
        if (D.player.passiveSkill?.effect === "huntOnPass") {
          m.hunt = (m.hunt || 0) + 1;
          log(`【喵之追猎】发动：【${m.name}】路过玩家，获得 1 层【追猎】（现 ${m.hunt}）。`, "good");
        }
        if (m.def.tags.includes("aggressive") && S.player.buffs.some(b => b.pixel)) {
          log(`【像素化】：【${m.name}】无法主动攻击你，继续移动。`);
        } else if (m.def.tags.includes("aggressive")) {
          monsterAttack(m);
          return;
        } else if (m.def.passives?.some(p => p.effect === "passDamage")) {
          // 卡牌·雷鸟：不主动开战，但掠过玩家即造成自身当前攻击力的伤害
          const dmg = effAtk(m);
          log(`【${m.name}】掠过：对你造成 ${dmg} 点伤害！`, "warn");
          playerTakesDamage(dmg, `【${m.name}】的掠过`);
          checkPlayerKo();
          if (S.over) return;
        }
      }
      // 「经过时」效果：只触发移动方的被动（A 过 B 只算 A 的经过；起步同格不触发）
      passByEffects(m);
      // 卡牌实验室的吸收：奇美拉自己走到小怪格上才吸收（单向，不影响移动方存活）；两只游荡魔物相遇则互相吸收并进化
      absorbMinions(m);
      if (devourMinion(m)) break;
    }
    if (S.over || S.battle) return;
    const d = mv.done; S.move = null;
    if (d) d();
  }

  // ================= 终局 =================
  function bossDefeated() { return !S.monsters.some(m => m.def.category === "boss"); }
  function gameOver(win) {
    S.over = true; S.win = !!win;
    const bossName = D.map.bossName || "最终 BOSS";
    log(win ? `★ ${bossName}被击败！胜利！` : `轮数耗尽，未能击败${bossName}……失败。`, win ? "good" : "warn");
    if (win) recordWin();
    window.UI.renderAll();
  }

  // 胜利场次持久化（localStorage；无痕环境等异常时静默跳过，不影响对局）
  function recordWin() {
    try {
      const k = "maidparty_wins";
      const n = (+localStorage.getItem(k) || 0) + 1;
      localStorage.setItem(k, String(n));
      log(`🏆 累计胜利 ${n} 场。`, "good");
    } catch (e) { /* localStorage 不可用：跳过 */ }
  }

  // 供 UI 的预览钩子：玩家/怪物下一步意向格（岔路时返回 null 由玩家选）
  function peekPlayerNext() {
    const opts = peekPlayerOptions();
    return opts.length === 1 ? opts[0] : null;
  }
  // 玩家本回合（未起步时为本回合将走的方向）的可选方向：用于棋盘箭头与岔路提示
  function peekPlayerOptions() {
    const P = S.player;
    const mv = (S.move && S.move.who === "player") ? S.move : null;
    if (mv && mv.await) return mv.await.slice();            // 岔路待选：全部候选
    if (mv && mv.forcedNext != null) return [mv.forcedNext];
    if (!mv && P.nextChooseDir) return S.adj[P.pos].slice(); // 方向抉择：全向可选
    const prev = mv ? mv.prev : (P.lastFrom ?? null);
    return stepOptions(P.pos, prev);
  }
  // 怪物下一步意向格：只在方向确定时返回（方向随机的怪不预告，避免误导）
  // 怪物方向预告：直接读预掷结果（queuedNext）——任何位置（含岔路）都有确定方向
  function peekNext(m) {
    if (!m || m.hp <= 0) return null;
    return m.queuedNext ?? null;
  }
  // 使魔下一步意向格：直接读预掷结果（与 stepAlly 实际走位共用同一结果，任何位置都有确定方向）
  function peekAllyNext(a) {
    if (!a || a.hp <= 0) return null;
    return a.queuedNext ?? null;
  }
  // 防御/闪避前的数值预览：选姿态前就告知双方攻防与骰点加成
  function defensePreview(t) {
    const b = S.battle, dv = derived();
    const atkBonus = t.nextBattleAtk || 0;
    const diceBonus = (t.def.skill?.effect === "selfDicePlus" && t.skillCd === 0) ? (t.def.skill.value || 0) : 0;
    return {
      myDef: dv.def + (b?.defBonus || 0), baseDef: dv.def, defBonus: b?.defBonus || 0,
      enemyAtk: effAtk(t), enemyBaseAtk: t.atk, enemyAtkBonus: atkBonus,
      enemyDiceBonus: diceBonus, stance: monsterStance(t),
    };
  }

  // ================= 供 UI / 测试调用 =================
  return {
    newGame, useSkill, playCard, finishPlayPhase, rollAndMove, answerAsk,
    playerBattlePoints, playBattleCard, playerPlayBattleCard: playBattleCard, resolvePlayerAttack, playerChooseStance,
    attackPreview, defensePreview, pickMoveStep, peekPlayerNext, peekPlayerOptions, peekNext, peekAllyNext, graphDist,
    buyShop, closeShop, pickChip, chipShopPrice, chooseTarget, cancelTargeting, refreshChips,
    chooseDeployTile,
    derived,
    // 测试挂钩（chip-test 专用，不在页面 UI 中使用）
    _test: {
      addChip, genChipChoices, chipList, schoolsHeld, judgeQuests,
      computeAttack, playerTakesDamage, dealToMonster, onHitEnemy, onCardPlayed,
      turnStartEffects, turnEndEffects, derived,
      // 卡牌实验室机制（card-lab-mechanics-test 专用）
      makeMonster, spawnMonster, monstersAt, rollNextStep, runMonsterSkill,
      devourMinion, absorbMinions, auraBonus, effAtk, effDef, freeTilesNear, spawnNear, stepMonster,
      fireRoundStartEffects, spawnSpotsFor, tilesOf, defeatMonster,
      // 洛可可 / 甜品使魔（rococo-test 专用）
      spawnFamiliar, stepAlly, allyStrike, monsterStrikeAlly, defeatMonsterByAlly, allyTurns, healPassAllies,
    },
    get state() { return S; },
  };
})();
