// 纯数据校验：返回所有字段错误，不修正配置，也不创建或修改对局。
(function () {
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => isObject(value) && Object.hasOwn(value, key);
  const TILE_TYPES = ["start", "draw", "event", "shop", "spawn", "heal", "dash", "chipshop", "damage", "upgrade", "assault", "boss"];
  const CATEGORIES = ["minion", "elite", "boss"];
  // 救援标记目前写在 S 顶层，禁止覆盖引擎字段或 Object 原型字段。
  const RESERVED_FLAGS = new Set(("round phase over win ask askQueue tiles adj player monsters monsterSeq defCount npcs npcSeq allies allySeq allyBonuses roundsLimit firedSpecialEvents pendingSpecialEvents firedRounds bossRounds battle chipPurchases lastChips chipQueue chipRefreshLeft globalBonus flames quests _dbg move pendingTile targeting targetingResume aiBusy chipChoice waitForChips shop").split(" "));

  function validate(data, definitions = []) {
    const issues = [];
    const fail = (path, message) => issues.push({ path, message });
    const object = (value, path) => isObject(value) || (fail(path, "必须是对象"), false);
    const list = (value, path, nonempty = false) => {
      if (!Array.isArray(value)) { fail(path, "必须是数组"); return false; }
      if (nonempty && !value.length) fail(path, "数组不能为空");
      for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail(`${path}[${i}]`, "数组项缺失，请检查多余的逗号");
      return true;
    };
    if (!object(data, "GAME_DATA")) return issues;
    const effects = new Map(definitions.map(d => [d.effect, d]));
    const finite = value => typeof value === "number" && Number.isFinite(value);
    function rule(value, path, spec) {
      if (Array.isArray(spec)) {
        if (list(value, path, true)) value.forEach((item, i) => rule(item, `${path}[${i}]`, spec[0]));
        return;
      }
      if (isObject(spec)) { fields(value, path, spec, true); return; }
      if (["monsters", "allies", "npcs", "cards", "difficulty"].includes(spec)) {
        const registry = spec === "difficulty" ? "difficulties" : spec;
        if (typeof value !== "string" || !own(data[registry], value)) fail(path, `引用不存在：${registry}.${String(value)}`);
        return;
      }
      if (spec === "difficultyNonnegative" || spec === "difficultyPositiveInt") {
        const scalar = spec === "difficultyPositiveInt" ? "positiveInt" : "nonnegative";
        if (!isObject(value)) { rule(value, path, scalar); return; }
        // 运行时缺省回退 normal，因此按难度配置必须提供 normal。
        rule(value.normal, `${path}.normal`, scalar);
        for (const [key, entry] of Object.entries(value)) {
          rule(key, `${path}.${key}`, "difficulty");
          if (key !== "normal") rule(entry, `${path}.${key}`, scalar);
        }
        return;
      }
      const checks = {
        string: [typeof value === "string" && value.trim().length > 0, "必须是非空字符串"],
        boolean: [typeof value === "boolean", "必须是布尔值"],
        number: [finite(value), "必须是有限数值"],
        nonnegative: [finite(value) && value >= 0, "必须是非负有限数值"],
        positive: [finite(value) && value > 0, "必须是正有限数值"],
        nonnegativeInt: [Number.isSafeInteger(value) && value >= 0, "必须是非负整数"],
        positiveInt: [Number.isSafeInteger(value) && value > 0, "必须是正整数"],
        ratio: [finite(value) && value >= 0 && value <= 1, "必须在 0 到 1 之间"],
        tileType: [TILE_TYPES.includes(value), "未知地块类型"],
        category: [CATEGORIES.includes(value), "未知怪物分类"],
        copyStat: [["atk", "def_", "hp", "hpMax"].includes(value), "只能复制 atk / def_ / hp / hpMax 数值字段"],
        flagKey: [typeof value === "string" && /^[A-Za-z_$][\w$]*$/.test(value) && !RESERVED_FLAGS.has(value) && !(value in Object.prototype), "标记名称无效或占用了引擎字段"],
      };
      if (!checks[spec]) throw new Error(`未知配置校验规则：${spec}（${path}）`);
      if (!checks[spec][0]) fail(path, checks[spec][1]);
    }
    function fields(value, path, schema, strict = false) {
      if (!object(value, path)) return false;
      const keys = new Set();
      for (const [key, spec] of Object.entries(schema)) {
        const optional = key.endsWith("?"), name = optional ? key.slice(0, -1) : key;
        keys.add(name);
        if (optional && value[name] === undefined) continue;
        rule(value[name], `${path}.${name}`, spec);
      }
      if (strict) for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${path}.${key}`, "不支持的字段，请检查拼写或补充参数规则");
      return true;
    }
    function enumeration(value, path, choices) {
      if (!choices.includes(value)) fail(path, `必须是 ${choices.join(" / ")} 之一`);
    }
    function registry(key, visit, nonempty = true) {
      const entries = data[key];
      if (!object(entries, key)) return;
      if (nonempty && !Object.keys(entries).length) fail(key, "注册表不能为空");
      for (const [id, entry] of Object.entries(entries)) {
        const path = `${key}.${id}`;
        if (!object(entry, path)) continue;
        if (["characters", "monsters", "allies", "npcs", "cards", "maps"].includes(key) && entry.id !== id) fail(`${path}.id`, `必须与注册键 ${id} 一致`);
        visit(entry, path);
      }
    }
    if (object(data.difficulties, "difficulties")) {
      if (!own(data.difficulties, "normal")) fail("difficulties.normal", "缺少默认难度");
      for (const [id, name] of Object.entries(data.difficulties)) rule(name, `difficulties.${id}`, "string");
    }
    if (data.diff !== undefined) rule(data.diff, "diff", "difficulty");

    function skill(value, path, slot) {
      if (!object(value, path)) return;
      const common = { effect: "string", "name?": "string", "desc?": "string", "disabled?": "boolean", "minDiff?": "difficulty" };
      if (slot === "playerActive" || slot === "monsterActive" || slot === "npcActive") common.cooldown = "nonnegativeInt";
      const handler = effects.get(value.effect);
      if (!handler) { fields(value, path, common); fail(`${path}.effect`, `未注册技能：${String(value.effect)}`); return; }
      const compatible = {
        playerActive: ["playerActive"],
        playerPassive: ["playerInit", "playerTurnStart", "playerTurnEnd", "playerEffectCardDamage", "playerCardPlayed", "playerAttackValue", "playerHit", "playerDamaged", "playerEnterTile", "playerKill", "playerLethal", "playerPassAlly", "monsterPassPlayer", "monsterEnterPlayer"],
        monsterActive: ["monsterTurnStart", "monsterAttack", "monsterDefend", "monsterQuestComplete"],
        npcActive: ["npcTurnStart"],
        npcPassive: ["npcTurnStart", "npcTraits", "npcHit"],
        monsterPassive: ["monsterProtection", "monsterTurnStart", "monsterStats", "monsterDamageReduction", "monsterDamaged", "monsterDealtDamage", "monsterPassDamage", "monsterPassMonster", "monsterAbsorb", "monsterFuse"],
      };
      if (!handler.timings.some(t => compatible[slot].includes(t))) fail(`${path}.effect`, `处理器没有可用于 ${slot} 的触发时机`);
      if (handler.parameters !== null && handler.parameters !== undefined) {
        const schema = typeof handler.parameters === "function" ? handler.parameters(value) : handler.parameters;
        fields(value, path, { ...common, ...schema }, true);
      } else fields(value, path, common);
    }
    const stats = { hpMax: "positive", attack: "nonnegative", defense: "nonnegative" };
    function character(value, path) {
      if (!fields(value, path, { id: "string", name: "string", ...stats, initialCoins: "nonnegativeInt", move: { dice: "positiveInt", faces: "positiveInt" } })) return;
      skill(value.activeSkill, `${path}.activeSkill`, "playerActive");
      skill(value.passiveSkill, `${path}.passiveSkill`, "playerPassive");
      if (value.starGrowth !== undefined && object(value.starGrowth, `${path}.starGrowth`)) {
        for (const [star, growth] of Object.entries(value.starGrowth)) {
          enumeration(star, `${path}.starGrowth.${star}`, ["1", "2", "3"]);
          fields(growth, `${path}.starGrowth.${star}`, { "atk?": "nonnegative", "def?": "nonnegative", "hp?": "nonnegative", "speed?": "nonnegativeInt" }, true);
        }
      }
    }
    registry("characters", character);
    registry("allies", (value, path) => fields(value, path, { name: "string", ...stats, move: { dice: "positiveInt", faces: "positiveInt" } }), false);
    if (data.npcs !== undefined) registry("npcs", (value, path) => {
      fields(value, path, { name: "string", ...stats, move: { dice: "positiveInt", faces: "positiveInt" } });
      if (value.skill != null) skill(value.skill, `${path}.skill`, "npcActive");
      if (value.passives !== undefined && list(value.passives, `${path}.passives`)) value.passives.forEach((p, i) => skill(p, `${path}.passives[${i}]`, "npcPassive"));
    }, false);
    registry("monsters", (value, path) => {
      fields(value, path, { name: "string", ...stats, category: "category", coinDrop: "nonnegativeInt", move: { steps: "nonnegativeInt", "stationary?": "boolean" }, "numbered?": "boolean" });
      if (list(value.tags, `${path}.tags`)) value.tags.forEach((tag, i) => enumeration(tag, `${path}.tags[${i}]`, ["passive", "aggressive", "counter", "boss"]));
      if (value.skill != null) skill(value.skill, `${path}.skill`, "monsterActive");
      if (value.passives !== undefined && list(value.passives, `${path}.passives`)) value.passives.forEach((p, i) => skill(p, `${path}.passives[${i}]`, "monsterPassive"));
      if (value.diffStats !== undefined && object(value.diffStats, `${path}.diffStats`)) {
        for (const [diff, overrides] of Object.entries(value.diffStats)) {
          rule(diff, `${path}.diffStats.${diff}`, "difficulty");
          fields(overrides, `${path}.diffStats.${diff}`, { "hpMax?": "positive", "attack?": "nonnegative", "defense?": "nonnegative" }, true);
        }
      }
      if (value.growth !== undefined) fields(value.growth, `${path}.growth`, { everyRounds: "positiveInt", atk: "nonnegative", def: "nonnegative", everyRoundsHp: "positiveInt", hpGain: "nonnegative", heal: "nonnegative" }, true);
      if (value.phase !== undefined && fields(value.phase, `${path}.phase`, { threshold: "ratio", effect: "string" }, true)) enumeration(value.phase.effect, `${path}.phase.effect`, ["skillEveryRound"]);
      if (value.defend != null && object(value.defend, `${path}.defend`)) {
        enumeration(value.defend.rule, `${path}.defend.rule`, ["always", "hpThreshold"]);
        if (value.defend.rule === "hpThreshold") {
          rule(value.defend.threshold, `${path}.defend.threshold`, "ratio");
          enumeration(value.defend.above, `${path}.defend.above`, ["defend", "dodge"]);
          enumeration(value.defend.belowOrEqual, `${path}.defend.belowOrEqual`, ["defend", "dodge"]);
        } else enumeration(value.defend.stance, `${path}.defend.stance`, ["defend", "dodge"]);
      }
    });

    function map(value, path) {
      if (!fields(value, path, { id: "string", name: "string", rounds: "positiveInt", startTile: "nonnegativeInt", shopCost: "nonnegativeInt", chipShopBase: "nonnegativeInt", chipShopStep: "nonnegativeInt", "fixedDifficulty?": "difficulty", "initialSpawn?": "boolean", "eventMinionSpawns?": "boolean", "hidden?": "boolean" })) return;
      if (value.shopOffers !== undefined) fields(value.shopOffers, `${path}.shopOffers`, { "effect?": "nonnegativeInt", "battle?": "nonnegativeInt" }, true);
      // upgradeCost 是现有的纯费用查询接口；检查所有可达星级和满级返回值。
      if (typeof value.upgradeCost !== "function") fail(`${path}.upgradeCost`, "必须是费用查询函数");
      else for (let star = 0; star <= 3; star++) {
        try {
          const cost = value.upgradeCost(star);
          if (star === 3 && cost != null) fail(`${path}.upgradeCost(3)`, "满星必须返回 null 或 undefined");
          else if (cost != null) rule(cost, `${path}.upgradeCost(${star})`, "nonnegativeInt");
        } catch (error) { fail(`${path}.upgradeCost(${star})`, `执行失败：${error.message}`); }
      }
      if (!list(value.tiles, `${path}.tiles`, true)) return;
      const size = value.tiles.length;
      const tileIndex = (index, at) => {
        const valid = Number.isSafeInteger(index) && index >= 0 && index < size;
        if (!valid) fail(at, `格子编号必须在 0 到 ${size - 1} 之间`);
        return valid;
      };
      const direction = (dir, at) => {
        if (!Array.isArray(dir) || dir.length !== 2 || !dir.every(finite) || (dir[0] === 0 && dir[1] === 0)) fail(at, "方向必须是非零二维有限数值向量");
      };
      tileIndex(value.startTile, `${path}.startTile`);
      if (value.bossTile != null) { tileIndex(value.bossTile, `${path}.bossTile`); rule(value.bossMob || "boss", `${path}.bossMob`, "monsters"); }
      else if (value.bossMob !== undefined) rule(value.bossMob, `${path}.bossMob`, "monsters");
      if (value.initialDir !== undefined) direction(value.initialDir, `${path}.initialDir`);
      const coordinates = value.tiles.some(t => isObject(t) && (t.x !== undefined || t.y !== undefined));
      value.tiles.forEach((tile, i) => {
        const at = `${path}.tiles[${i}]`;
        if (!fields(tile, at, { t: "tileType" })) return;
        if (tile.t === "spawn" || tile.mob !== undefined) rule(tile.mob, `${at}.mob`, "monsters");
        if (coordinates) fields(tile, at, { x: "number", y: "number" });
      });
      const adjacency = Array.from({ length: size }, () => []), seenEdges = new Set();
      // 与引擎一致：省略或空 edges 使用默认单环。
      const edges = value.edges === undefined || (Array.isArray(value.edges) && !value.edges.length)
        ? Array.from({ length: size }, (_, i) => [i, (i + 1) % size]) : value.edges;
      if (list(edges, `${path}.edges`)) edges.forEach((edge, i) => {
        const at = `${path}.edges[${i}]`;
        if (!Array.isArray(edge) || edge.length !== 2) { fail(at, "连接必须包含两个格子编号"); return; }
        const validA = tileIndex(edge[0], `${at}[0]`), validB = tileIndex(edge[1], `${at}[1]`);
        if (!validA || !validB) return;
        const [a, b] = edge, key = [Math.min(a, b), Math.max(a, b)].join(":");
        if (a === b) fail(at, "不能连接格子自身");
        if (seenEdges.has(key) && value.edges?.length) fail(at, "重复的无向连接");
        seenEdges.add(key); adjacency[a].push(b); adjacency[b].push(a);
      });
      if (Number.isSafeInteger(value.startTile) && adjacency[value.startTile]) {
        const reached = new Set([value.startTile]), queue = [value.startTile];
        for (let i = 0; i < queue.length; i++) for (const next of adjacency[queue[i]]) if (!reached.has(next)) { reached.add(next); queue.push(next); }
        if (reached.size !== size) fail(`${path}.edges`, `从起点不可达的格子：${Array.from({ length: size }, (_, i) => i).filter(i => !reached.has(i)).join(", ")}`);
      }
      if (value.npcRoster !== undefined) rule(value.npcRoster, `${path}.npcRoster`, ["npcs"]);
      if (value.enemyRoster !== undefined) rule(value.enemyRoster, `${path}.enemyRoster`, ["monsters"]);
      const npcSpawns = (entries, at) => {
        if (list(entries, at)) entries.forEach((entry, i) => {
          if (fields(entry, `${at}[${i}]`, { npc: "npcs" })) tileIndex(entry.tile, `${at}[${i}].tile`);
          if (entry?.dir !== undefined) direction(entry.dir, `${at}[${i}].dir`);
        });
      };
      if (value.initialNpcs !== undefined) npcSpawns(value.initialNpcs, `${path}.initialNpcs`);
      const validateEvent = (event, at, scheduled) => {
        if (!fields(event, at, { ...(scheduled ? { round: "positiveInt" } : {}), "atk?": "nonnegative", "def?": "nonnegative", "allowMinionSpawns?": "boolean" })) return;
        if (scheduled && event.round > value.rounds) fail(`${at}.round`, "不能超过地图轮数上限");
        if (event.npcSpawns !== undefined) npcSpawns(event.npcSpawns, `${at}.npcSpawns`);
        if (event.effect !== undefined) enumeration(event.effect, `${at}.effect`, ["allMonstersStats", "allMonstersPlus1"]);
        if (event.spawns !== undefined && list(event.spawns, `${at}.spawns`)) event.spawns.forEach((spawn, j) => {
          const where = `${at}.spawns[${j}]`;
          if (!fields(spawn, where, { mob: "monsters", "count?": "positiveInt" })) return;
          if (value.eventMinionSpawns === false && event.allowMinionSpawns !== true && data.monsters?.[spawn.mob]?.category === "minion") fail(`${where}.mob`, "此地图禁止未显式允许的事件投放小怪");
          if (typeof spawn.tiles === "string") {
            rule(spawn.tiles, `${where}.tiles`, "tileType");
            if (!value.tiles.some(t => t?.t === spawn.tiles)) fail(`${where}.tiles`, "地图上没有此类型的刷怪落点");
          } else if (list(spawn.tiles, `${where}.tiles`, true)) spawn.tiles.forEach((tile, k) => tileIndex(tile, `${where}.tiles[${k}]`));
          if (spawn.dir !== undefined) direction(spawn.dir, `${where}.dir`);
        });
      };
      if (value.globalEvents !== undefined && list(value.globalEvents, `${path}.globalEvents`)) value.globalEvents.forEach((e, i) => validateEvent(e, `${path}.globalEvents[${i}]`, true));
      if (value.specialEvents !== undefined && object(value.specialEvents, `${path}.specialEvents`)) Object.entries(value.specialEvents).forEach(([id, e]) => validateEvent(e, `${path}.specialEvents.${id}`, false));
      if (value.quests !== undefined && list(value.quests, `${path}.quests`)) value.quests.forEach((quest, i) => {
        const at = `${path}.quests[${i}]`;
        if (!fields(quest, at, { need: "positiveInt" })) return;
        if (quest.condition !== undefined) enumeration(quest.condition, `${at}.condition`, ["hpAtMost"]);
        if (quest.condition === "hpAtMost") {
          rule(quest.hpRatio, `${at}.hpRatio`, "ratio");
          if (quest.victory !== true) fail(`${at}.victory`, "血量目标必须配置为胜利任务");
          if (quest.need !== 1) fail(`${at}.need`, "血量目标的次数必须为1");
        } else {
          enumeration(quest.rewardTier, `${at}.rewardTier`, [1, 2, 3]);
          if (quest.victory !== undefined) fail(`${at}.victory`, "胜利任务须配置血量条件");
        }
        if (quest.triggerEvent !== undefined && !own(value.specialEvents, quest.triggerEvent)) fail(`${at}.triggerEvent`, "特殊事件引用不存在");
        if (quest.targets !== undefined) rule(quest.targets, `${at}.targets`, ["monsters"]);
        if (quest.target !== undefined || quest.targets === undefined) rule(quest.target, `${at}.target`, "monsters");
        if (quest.extra !== undefined) enumeration(quest.extra, `${at}.extra`, ["roundProgressMinus1"]);
      });
    }
    registry("maps", map);
    // 调试与模拟允许选择注册表之外的配置副本，也必须先校验。
    if (!Object.values(data.characters || {}).includes(data.player) || data.player == null) character(data.player, "player");
    if (!Object.values(data.maps || {}).includes(data.map) || data.map == null) map(data.map, "map");

    registry("cards", (card, path) => {
      fields(card, path, { name: "string", "grant?": "cards" });
      enumeration(card.type, `${path}.type`, ["battle", "effect"]);
      if (card.type === "battle") {
        fields(card, path, { cost: "nonnegativeInt", min: "nonnegativeInt", max: "nonnegativeInt", "finalMult?": "positive" });
        enumeration(card.kind, `${path}.kind`, ["atk", "def"]);
        if (card.min > card.max) fail(`${path}.max`, "不能小于 min");
      } else if (card.type === "effect") {
        enumeration(card.kind, `${path}.kind`, ["damage", "moveMod", "buff", "heal"]);
        if (card.kind === "damage") fields(card, path, { range: "nonnegativeInt", dmg: "nonnegative", "aoe?": "nonnegativeInt" });
        if (card.kind === "heal") fields(card, path, { heal: "nonnegative" });
        if (card.kind === "buff") fields(card, path, { turns: "positiveInt", "hpCost?": "nonnegative", "atk?": "nonnegative", "dmgTaken?": "nonnegative", "heal?": "nonnegative" });
        if (card.kind === "moveMod") fields(card, path, { "doubleDice?": "boolean", "chooseDir?": "boolean", "fixedDice?": "boolean" });
      }
    });
    for (const [pool, type] of [["battlePool", "battle"], ["effectPool", "effect"]]) {
      if (list(data[pool], pool, true)) data[pool].forEach((id, i) => {
        rule(id, `${pool}[${i}]`, "cards");
        if (own(data.cards, id) && data.cards[id]?.type !== type) fail(`${pool}[${i}]`, `必须引用 ${type} 牌`);
      });
    }
    // 升星解锁由引擎固定加入 charge；不在初始池中，但必须存在。
    rule("charge", "cards.charge", "cards");
    registry("chips", (chip, path) => {
      fields(chip, path, { name: "string", school: "string" });
      enumeration(chip.rarity, `${path}.rarity`, ["blue", "purple", "gold"]);
      for (const [key, value] of Object.entries(chip)) {
        if (["name", "school", "rarity", "desc", "id"].includes(key)) continue;
        if (["sancai", "atkPerMark"].includes(key)) rule(value, `${path}.${key}`, "boolean");
        else if (key === "auraRange" && value === null) continue;
        else rule(value, `${path}.${key}`, key === "perWealthDiv" ? "positiveInt" : ["handLimit", "skillCooldownReduction", "effectCardMarks"].includes(key) ? "nonnegativeInt" : "nonnegative");
      }
    });
    return issues;
  }

  function assertValid(data, definitions) {
    const issues = validate(data, definitions);
    if (!issues.length) return;
    const error = new Error(`内容配置校验失败（${issues.length} 项）：\n` + issues.map(i => `- ${i.path}：${i.message}`).join("\n"));
    error.name = "ConfigValidationError";
    error.issues = issues;
    throw error;
  }
  const api = { validate, assertValid };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GameConfigValidation = api;
})();
