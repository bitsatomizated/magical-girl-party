// 可操作教程：独立练习检查点，复用引擎的移动、交战、商店、升星与筹码结算。
// 不修改正式内容库、不替换 Math.random、不使用 _test 或额外的定时器。
window.Tutorial = (() => {
  const D = window.GAME_DATA;
  const KEY = "maidparty_tutorial_v2";
  const lessons = [
    { id: "overview", title: "先认识游戏界面", goal: "先找到信息，再做决定。", hand: ["brick", "atk_s"], steps: 1,
      summary: "你已经认识状态栏、棋盘、地图日程与任务、手牌操作区、角色与怪物信息、日志。接下来动手练习；随时可以浏览这些信息，阅读不会推进轮次。" },
    { id: "move", title: "移动与拿牌", goal: "先结束出牌阶段，再掷骰移动。沿黄色箭头到达拿牌格。", hand: [], steps: 1,
      summary: "你完成了一轮：出牌 → 移动 → 地块结算 → 敌方行动。停在拿牌格会抽 2 张牌；普通移动不能掉头。" },
    { id: "route", title: "岔路与方向抉择", goal: "在岔路选择下方回血格，再使用方向抉择沿来路返回起点。", hand: ["dirChoose"], steps: 2,
      summary: "岔路出现多个高亮地块时，点击决定下一步。普通移动排除来路；方向抉择仅让下次移动的首步可以掉头，第二步起仍不能掉头。选路线前观察地块和怪物。" },
    { id: "combat", title: "效果牌与攻击", goal: "先用板砖削弱假人，再移动过去，使用攻击牌完成战斗。", hand: ["brick", "atk_s"], steps: 2,
      summary: "效果牌在移动前使用；战斗牌在战斗中消耗战斗点数。这次板砖造成 5 点伤害，攻击牌增加 2 攻击，近战再造成 5 点伤害。击倒怪物获得金币。" },
    { id: "defense", title: "防御与闪避", goal: "攻击反击假人，观察反击；先出防御牌，再选择防御或闪避。", hand: ["def_s"], steps: 1,
      summary: "带有「会反击」的敌人在存活时会还手。防御用防御力减伤（保底 1）；闪避只比较裸骰点，我方不小于敌方则无伤，失败按 0 防御结算。防御牌只帮助防御姿态。" },
    { id: "skill", title: "主动技能", goal: "使用像素喵喵的「像素化」，再移动并观察敌人经过你。", hand: [], steps: 1,
      summary: "像素化使本回合攻击 +4，并阻止怪物主动攻击，持续到下回合开始；它不能阻止反击。技能使用后进入冷却，每次自己的回合开始减少 1。" },
    { id: "observe", title: "观察敌人，再决定交战", goal: "阅读怪物主动技能、被动效果和反击标签，再主动避开一次危险交战。", hand: [], steps: 1,
      summary: "图鉴中的 CD 3 是技能冷却周期，棋盘上的 CD1 是这只怪物当前剩余冷却；在它行动时先减 1，再按技能时机触发。被动不依赖主动技能冷却。「不主动攻击」仍可能反击，避开也不等于免疫所有技能伤害。" },
    { id: "shop", title: "商店与金币", goal: "移动到商店，勾选蛋糕并购买，再离开商店。", hand: [], steps: 1,
      summary: "商店购买需要先勾选，再确认支付。本次蛋糕花费 3 金币；停在商店还会随机获得 1 张牌。手牌上限 8 张，满手时不能继续购买。" },
    { id: "growth", title: "升星与筹码", goal: "带着 15 金币到升级点，完成升星并任选一枚筹码。", hand: [], steps: 1,
      summary: "停在升级点且金币足够时会自动升星。首次升星花费 15 金币，像素喵喵攻击 +2、移速 +1，战斗点数上限变为 4，并获得筹码三选一。筹码是本局持续生效的被动效果。" },
    { id: "events", title: "地图事件、任务与奖励", goal: "观察第 2 轮事件刷出的假人，击倒它完成任务，再领取筹码奖励。", hand: ["shadow"], steps: 1,
      summary: "地图事件在指定轮次开始时触发，可能刷怪或改变规则；任务列出你要完成的条件。击倒目标后进度立即增加，任务在轮末判定并奖励筹码。任务完成不等于通关，正式地图仍要在轮数耗尽前击败 BOSS。" },
    { id: "final", title: "毕业战", goal: "观察岔路上的守卫，选择路线并击败训练版灾厄核心！建议用像素化和板砖削弱核心，再用暗影突袭进攻。", hand: ["brick", "shadow", "def_s", "cake"], steps: 3,
      summary: "教程完成！你已经实践了面板阅读、路线选择、敌情判断、移动、效果牌、战斗、防守、技能、购物、成长、事件与任务。正式地图需要在轮数耗尽前击败 BOSS；岔路口点击高亮地块选择方向。" },
  ];
  const overview = [
    { title: "目标与顶部状态栏", text: "在轮数耗尽前击败地图 BOSS 即获胜。顶部显示当前轮次、生命、星级、金币、攻防、技能冷却和操作阶段。阅读提示不耗时，完成一轮行动才会推进轮次。", focus: "#hud" },
    { title: "棋盘、方向与地图情报", text: "棋盘显示你和怪物的位置，黄箭头提示你的下一步方向，红／紫箭头提示敌人的方向。地图旁的事件日程告诉你哪轮会发生什么；任务栏显示目标、进度和筹码奖励。", focus: "#map-side" },
    { title: "手牌与操作区", text: "右侧蓝色卡片是移动前使用的效果牌，红色卡片是战斗牌。下方按钮决定使用技能、结束出牌或掷骰。按钮变灰通常表示阶段不对、正在等待其他选择或技能冷却。", focus: "#turn-panel" },
    { title: "我的技能与筹码", text: "右侧信息面板可以滚动：上方是角色主动、被动、当前效果和已持有的筹码。主动技能需要手动点击，被动按描述自动生效；把鼠标放在筹码名称上可查看效果。", focus: "#info" },
    { title: "怪物图鉴与个体状态", text: "继续看信息面板里的怪物图鉴：先读主动技能、被动和反击行为，再决定是否交战。同品种合并展示；棋盘上的每只怪物单独显示当前生命、标记与技能冷却。后面会专门练习判断敌情。", focus: "#info .info-mob" },
    { title: "日志：发生了什么", text: "右侧下方日志会记录抽牌、金币变化、技能触发和伤害计算。看不懂刚才为什么受伤，可以在这里回看。现在点击「完成导览」，然后进入移动练习。", focus: "#log" },
  ];
  function branchMap(map) {
    // 六格环道加中间捷径；1 号格从起点来时可选右方 2 或下方 4。
    map.tiles = [
      { t: "start", x: 0, y: 0 }, { t: "heal", x: 1, y: 0 }, { t: "damage", x: 2, y: 0 },
      { t: "heal", x: 2, y: 1 }, { t: "heal", x: 1, y: 1 }, { t: "heal", x: 0, y: 1 },
    ];
    map.edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]];
  }
  let session = null;
  const $ = id => document.getElementById(id);
  const active = S => !!session && S === session.state && D.map === session.map;
  function completed() { try { return localStorage.getItem(KEY) === "complete"; } catch (_) { return false; } }
  function renderEntry() {
    const b = $("btn-tutorial");
    if (b) { b.textContent = "新手教程"; b.title = completed() ? "已完成，可重新体验全部教学" : `${lessons.length} 节操作练习，先认识界面，再练习操作`; }
  }

  function start() {
    if (session) return;
    session = { saved: { player: D.player, map: D.map, diff: D.diff }, index: 0 };
    document.body.classList.add("tutorial-active");
    ["start-screen", "help-screen", "intro-screen"].forEach(id => $(id).classList.add("hidden"));
    loadLesson(0);
  }
  function loadLesson(index) {
    window.Engine.leaveGame();
    const lesson = lessons[index], id = lesson.id;
    session.index = index; session.review = false; session.savedCompletion = false;
    session.page = 0; session.inspected = false; session.feedback = ""; session.lastFocus = null;
    session.state = null;
    // 每节练习独立重置，复用练习环道的 20 格布局。未教学的随机事件暂用回血格替代。
    session.map = { ...D.maps.tutorial_ring, id: "guided_tutorial", name: `新手教程 · ${lesson.title}`,
      rounds: 12, bossTile: undefined, initialSpawn: false, globalEvents: [], quests: [],
      tiles: D.maps.tutorial_ring.tiles.map((_, i) => ({ t: i === 0 ? "start" : "heal" })),
      bossName: id === "final" ? "灾厄核心（训练版）" : "教学目标" };
    session.map.tiles[1] = { t: ({ move: "draw", shop: "shop", growth: "upgrade" })[id] || "heal" };
    if (id === "observe") session.map.tiles[8].t = "boss";
    if (["route", "final"].includes(id)) branchMap(session.map);
    if (id === "final") session.map.tiles[3].t = "boss";
    if (id === "overview") {
      session.map.globalEvents = [{ round: 3, name: "训练增援", desc: "训练假人在前方出现", spawns: [{ mob: "dummy", tiles: [4] }] }];
      session.map.quests = [{ desc: "击倒训练假人", target: "dummy", need: 1, rewardTier: 1 }];
    }
    if (id === "events") {
      session.map.globalEvents = [{ round: 2, name: "训练增援", desc: "训练假人出现在前方，击倒它完成任务", spawns: [{ mob: "dummy", tiles: [2] }] }];
      session.map.quests = [{ desc: "击倒训练假人", target: "dummy", need: 1, rewardTier: 1 }];
    }
    D.map = session.map; D.player = D.characters.char_pixel_meow; D.diff = "normal";
    $("log").innerHTML = "";
    window.Engine.newGame();
    $("tutorial-title").focus({ preventScroll: true });
  }
  function initialize(S, { makeMonster }) {
    if (!session || D.map !== session.map) return;
    session.state = S;
    const id = lessons[session.index].id, P = S.player;
    S.tutorial = { lesson: session.index, id, graduation: id === "final" };
    P.hand = lessons[session.index].hand.map(id => ({ ...D.cards[id] }));
    P.coins = id === "shop" ? 18 : id === "growth" ? 15 : 0;
    const enemy = (base, overrides, pos) => {
      const def = { ...D.monsters[base], diffStats: {}, skill: undefined, passives: [], ...overrides };
      const m = makeMonster(def, pos);
      S.monsters.push(m);
      return m;
    };
    const observer = pos => {
      const m = enemy("dummy", { id: "training_observer", name: "警戒守卫", category: "elite", hpMax: 20, attack: 7, defense: 2,
        move: { stationary: true }, tags: ["passive", "counter"],
        skill: { name: "重击准备", effect: "selfDicePlus", value: 2, cooldown: 3, desc: "攻击时若技能就绪，攻击骰点 +2" },
        passives: [{ name: "汲取", effect: "bloodDrain", ratio: 1, desc: "攻击造成伤害后，恢复等量生命" }],
      }, pos);
      m.skillCd = 1;
      return m;
    };
    if (id === "overview") { observer(4); P.coins = 12; P.chips = ["firm1"]; }
    if (id === "route") P.hp = 16;
    if (id === "observe") {
      observer(1); P.hp = 8;
      enemy("dummy", { name: "训练假人", move: { stationary: true } }, 4);
      enemy("boss", { name: "灾厄核心（观察样本）", move: { stationary: true }, tags: ["boss", "passive"] }, 8);
    }
    if (id === "combat") enemy("dummy", { name: "练习假人", hpMax: 8, attack: 2, defense: 0, move: { stationary: true }, tags: ["passive"] }, 2);
    if (id === "defense") enemy("dummy", { name: "反击假人", hpMax: 20, attack: 5, defense: 0, move: { stationary: true }, tags: ["passive", "counter"] }, 1);
    if (id === "skill") {
      const m = enemy("dummy", { name: "巡逻假人", hpMax: 12, attack: 2, defense: 0, move: { steps: 1 }, tags: ["aggressive"] }, 2);
      m.lastFrom = 3; m.queuedNext = 1;
    }
    if (id === "final") {
      observer(2);
      P.star = 1; P.atk = 5; P.speedBonus = 1; P.chips = ["sharp1"];
      enemy("boss", { name: "灾厄核心（训练版）", hpMax: 10, attack: 2, defense: 0,
        move: { stationary: true }, tags: ["boss", "passive", "counter"], defend: { rule: "always", stance: "defend" } }, 3);
    }
  }
  function update(S) {
    if (!active(S)) return;
    const id = lessons[session.index].id;
    // 只在面板首次创建时指定教学选项；渲染不反复覆盖玩家选择。
    if (id === "shop" && S.shop && !S.shop.tutorialPrepared) {
      S.shop.offers = [{ card: { ...D.cards.cake }, cost: 3, sold: false }];
      S.shop.tutorialPrepared = true;
    }
    if (["growth", "events"].includes(id) && S.chipChoice && !S.chipChoice.tutorialPrepared) {
      S.chipChoice.options = ["sharp1", "firm1", "lore1"];
      S.chipChoice.tutorialPrepared = true;
    }
    const done = id === "overview" ? session.page >= overview.length
      : id === "route" ? S.round >= 3 && S.player.pos === 0
      : id === "events" ? S.round >= 3 && S.quests[0].done && S.player.chips.length > 0 && !S.chipChoice
      : id === "final" ? S.over && S.win : S.round >= 2;
    if (done) session.review = true;
    if (id === "final" && done && !session.savedCompletion) {
      session.savedCompletion = true;
      try { localStorage.setItem(KEY, "complete"); } catch (_) { /* 无痕模式仍可完成 */ }
    }
  }
  function step(S) {
    if (session.review) return { title: lessons[session.index].id === "final" ? "毕业啦！" : "本节完成", text: lessons[session.index].summary, actions: [] };
    if (S.over) return { title: "再练习一次", text: "这次没有及时击败核心。点击「重试本节」，尝试先用技能与板砖，再出攻击牌。", actions: [] };
    const id = lessons[session.index].id;
    if (id === "overview") return { ...overview[session.page], actions: [], reading: true };
    if (id === "observe" && session.page === 0) return {
      title: "小怪、精英、BOSS 有什么区别？",
      text: "图鉴标签区分敌人类型：训练假人是小怪，通常用于积累金币和推进任务；警戒守卫是精英，需要重点检查特殊技能；灾厄核心是 BOSS，也是最终获胜目标。类型不代替数值与技能判断。击倒哪种敌人会直接使本局获胜？",
      actions: [], focus: "#info .info-mob", quiz: "category",
    };
    if (["observe", "final"].includes(id) && !session.inspected) return {
      title: id === "observe" ? "先读警戒守卫的信息" : "毕业判断：怎样接近核心？",
      text: id === "observe"
        ? "查看高亮图鉴中的主动「重击准备」、被动「汲取」和反击标签。图鉴 CD3 表示冷却周期，棋盘 CD1 表示当前还剩 1。你的生命只有 8：这只驻守、不主动攻击的怪物，是否适合现在近战？"
        : "右侧警戒守卫会反击并汲取生命，位于岔路右方掉血格。核心位于右下方。先观察图鉴和棋盘，再判断应该怎么走。",
      actions: [], focus: "#info .info-mob", quiz: "threat",
    };
    if (S.ask) {
      if (id === "observe") return { title: "应用判断：避开守卫", text: "我们生命不足，守卫会反击并在造成伤害后回血。点击「避开」，保留生命；拒绝主动交战不会触发它的反击。", actions: ["answerAsk"], focus: "#ask-actions" };
      if (id === "final") return { title: "根据敌情选择", text: S.ask.question.includes("交战") ? "判断这次遇到的是警戒守卫还是核心，再选择交战或避开。击败核心才算毕业。" : "这是途中停留询问，可继续前进。注意它与选择交战不同。", actions: ["answerAsk"], focus: "#ask-actions" };
      return { title: "确认交战", text: "点击「交战」。通常你也可以避开敌人；本节先实际完成一次战斗。", actions: ["answerAsk"], focus: "#ask-actions" };
    }
    if (S.move?.who === "player" && S.move.await) {
      const back = id === "route" && S.round === 2 && S.player.pos === 4;
      const returning = id === "route" && S.round === 2 && S.player.pos === 1;
      return { title: back ? "方向抉择：首步可以掉头" : returning ? "第二步恢复不能掉头" : "在岔路选择下一步",
        text: back ? "现在有三个高亮方向，包含来路。点击上方刚经过的岔路格，实际走一次回头路。"
          : returning ? "你已回到岔路。刚才的回血格不再可选，说明自由掉头只作用于首步。点击左方起点完成练习。"
          : id === "route" ? "右方是掉血格，下方是回血格。观察地块后点击下方高亮回血格。灰暗方向本节暂不练习；普通移动不能返回刚来的起点。"
          : "点击高亮地块继续。建议从下方回血格绕过右方的警戒守卫，再向右接近核心。",
        actions: ["pickMoveStep"], focus: "#board .move-choice" };
    }
    if (S.targeting) return { title: "选择板砖的目标", text: "点击棋盘上的红色编号，或右侧高亮的怪物条目。选中后才会消耗卡牌；也可以取消后重新选。", actions: ["chooseTarget", "cancelTargeting"], focus: "#board .target-hit, #info .pickable" };
    if (S.shop) {
      const bought = S.shop.offers.some(o => o.sold);
      return { title: bought ? "购买成功，离开商店" : "买一张蛋糕", text: bought ? "蛋糕已经加入手牌，金币减少 3。点击「离开商店」继续。" : "勾选蛋糕左侧的方框，再点击「购买勾选」。金币不足或手牌满 8 张时不能购买。", actions: bought ? ["closeShop"] : ["buyShop"], focus: bought ? "#shop-actions" : "#shop-offers, #shop-actions" };
    }
    if (S.chipChoice) return { title: id === "events" ? "任务完成，领取奖励" : "选择你的第一枚筹码", text: (id === "events" ? "任务在轮末完成判定，奖励已弹出；选择后才继续下一轮。" : "") + "任选一枚：锋利增加攻击，坚固增加防御，学识在每回合开始抽牌。", actions: ["pickChip"], focus: "#chip-options" };
    if (S.battle) {
      if (S.battle.mode === "monsterAttack") {
        if (id === "defense" && !S.battle.spentPoints) return { title: "敌人反击，先打防御牌", text: "点击「防御中」，消耗 1 战斗点数、增加 2 防御。本次点数已重新计算，攻击与防守分别计费。", actions: ["playBattleCard", "playerPlayBattleCard"], focus: "#battle-cards" };
        return { title: "选择防御或闪避", text: "建议点击「防御」观察减伤。也可以闪避：只比骰点，我方 ≥ 敌方时无伤；失败按 0 防御结算，刚才的防御牌也不会帮助闪避。", actions: ["playerChooseStance", "playBattleCard", "playerPlayBattleCard"], focus: "#battle-actions" };
      }
      if (["combat", "events"].includes(id) && !S.battle.spentPoints) return { title: "使用一张战斗牌", text: id === "events" ? "点击「暗影突袭」，花费 2 点、攻击 +3；之后结算攻击，击倒事件刷出的假人。留意任务进度由 0/1 变成 1/1。" : "点击「攻击中」：花费 1 点，攻击 +2。当前 0 星，每次战斗有 3 点。战斗牌不能在普通出牌阶段使用。", actions: ["playBattleCard", "playerPlayBattleCard"], focus: "#battle-cards" };
      return { title: id === "defense" ? "攻击会反击的假人" : "掷骰结算攻击", text: id === "defense" ? "点击攻击按钮。假人会存活并立刻反击，接下来需要你防守。" : "攻击伤害＝我方攻击＋我方骰－敌方防御－敌方骰，防御姿态下伤害保底 1。点击攻击按钮结算，详细数值显示在日志里。", actions: ["resolvePlayerAttack", "playBattleCard", "playerPlayBattleCard"], focus: "#battle-actions, #battle-cards" };
    }
    if (S.aiBusy || S.move || S.phase === "turnEnd") return { title: "观察结算", text: id === "skill" ? "敌人正在经过你。像素化会阻止它主动发起战斗；进入下一轮后技能效果结束。" : "移动、地块与敌方行动正在依次结算，请稍候。阅读提示不会消耗轮数。", actions: [] };
    if (S.phase === "move") return { title: "掷骰移动", text: `点击「掷骰移动」。本节固定路线通向教学目标；正式游戏的移动距离由骰子和移速共同决定。`, actions: ["rollAndMove"], focus: "#actions" };
    if (id === "route" && S.round === 2 && S.player.hand.some(c => c.id === "dirChoose")) return { title: "用方向抉择返回来路", text: "第一轮已走到安全的回血格。普通移动不能沿来路返回；现在点击「方向抉择」，让下次移动的第一步可以选择来路。", actions: ["playCard"], focus: "#hand .effect" };
    if (id === "combat" && S.player.hand.some(c => c.id === "brick")) return { title: "打出效果牌「板砖」", text: "点击蓝色的「板砖」。它可以对 3 格内一个敌人造成 5 点伤害，必须在移动前使用。", actions: ["playCard"], focus: "#hand .effect" };
    if (id === "skill" && S.player.skillCd === 0) return { title: "发动「像素化」", text: "点击「主动技能」。像素喵喵本回合攻击 +4，并且不会被怪物主动攻击。观察顶部攻击与冷却的变化。", actions: ["useSkill"], focus: "#actions" };
    if (id === "events") return { title: S.round === 1 ? "先看日程，再推进到第 2 轮" : "事件已触发，完成指定任务", text: S.round === 1 ? "地图旁写着：第 2 轮「训练增援」。现在场上没有敌人、任务为 0/1。结束出牌并移动，观察下一轮开始时的变化。" : "训练假人已按日程出现，事件标为本轮触发。任务要求击倒 1 只假人；结束出牌并移动过去交战。", actions: ["finishPlayPhase"], focus: "#map-side, #actions" };
    if (id === "final") return { title: "自己完成毕业战", text: lessons[session.index].goal, actions: ["playCard", "useSkill", "finishPlayPhase"], focus: "#hand, #actions" };
    return { title: id === "skill" ? "技能已生效，结束出牌" : "结束出牌，准备移动", text: id === "skill" ? "攻击已从 3 提高到 7。点击「结束出牌阶段」，再掷骰移动，观察技能如何保护你。" : lessons[session.index].goal + " 点击「结束出牌阶段」继续。", actions: ["finishPlayPhase"], focus: "#actions" };
  }
  function allow(name, args, S) {
    if (!active(S)) return true;
    const current = step(S);
    if (!current.actions.includes(name)) return false;
    const id = lessons[session.index].id;
    if (name === "answerAsk") return id === "final" || args[0] === (id !== "observe");
    if (name === "pickMoveStep" && id === "route") return args[0] === (S.round === 1 ? 4 : S.player.pos === 4 ? 1 : 0);
    if (name === "playCard" && id === "route") return S.player.hand[args[0]]?.id === "dirChoose";
    if (name === "playCard" && lessons[session.index].id === "combat") return S.player.hand[args[0]]?.id === "brick";
    return true;
  }
  function roll(kind) {
    if (!active(window.Engine?.state) || lessons[session.index].id === "final") return undefined;
    return kind === "battle" ? 3 : 1;
  }
  function cardValue(c) {
    if (!active(window.Engine?.state) || lessons[session.index].id === "final") return undefined;
    return Math.min(c.max, Math.max(c.min, 2));
  }
  function moveSteps(S) {
    if (!active(S)) return undefined;
    if (lessons[session.index].id === "final") return S.round === 1 ? 3 : 4;
    return lessons[session.index].steps;
  }

  function exit(destination) {
    if (!session) return;
    window.Engine.leaveGame();
    const saved = session.saved;
    session = null;
    D.player = saved.player; D.map = saved.map; D.diff = saved.diff;
    document.body.classList.remove("tutorial-active", "tutorial-reading-info", "tutorial-show-map-info");
    $("tutorial-panel").classList.add("hidden");
    document.querySelectorAll(".tutorial-focus").forEach(el => el.classList.remove("tutorial-focus"));
    $("start-screen").classList.remove("hidden");
    renderEntry();
    if (destination === "cafe") {
      window.__setup.char = "char_pixel_meow"; window.__setup.map = "maid_cafe"; window.__setup.diff = "normal";
      window.UI.startGame();
    } else $("btn-tutorial").focus();
  }

  function render(S) {
    if (!active(S)) return;
    const current = step(S), i = session.index, id = lessons[i].id;
    $("tutorial-panel").classList.remove("hidden");
    $("tutorial-progress").textContent = `新手教程 ${i + 1} / ${lessons.length} · ${lessons[i].title}`;
    $("tutorial-mode").textContent = id === "overview" ? `界面导览 ${Math.min(session.page + 1, overview.length)} / ${overview.length}` : id === "final" ? "训练 BOSS · 随机战斗" : "教学演示 · 固定骰点";
    $("tutorial-title").textContent = current.title;
    $("tutorial-text").textContent = current.text;
    $("tutorial-feedback").textContent = session.feedback || (session.review ? "每节练习独立重置手牌与场景。教学胜利不计入正式胜场。" : "高亮区域是当前操作位置。随时可重试本节或退出，阅读不计时。");
    document.body.classList.toggle("tutorial-reading-info", !!current.focus?.startsWith("#info"));
    document.body.classList.toggle("tutorial-show-map-info", ["overview", "events"].includes(id));
    const extra = $("tutorial-extra");
    extra.innerHTML = "";
    const expectedState = S, expectedPage = session.page;
    const currentPage = () => active(expectedState) && session.page === expectedPage && !session.review;
    const extraButton = (label, handler) => {
      const button = document.createElement("button"); button.textContent = label;
      button.onclick = () => { if (currentPage()) handler(); };
      extra.appendChild(button);
    };
    if (current.reading) {
      if (session.page > 0) extraButton("上一处", () => { session.page--; window.UI.renderAll(); });
      extraButton(session.page === overview.length - 1 ? "完成导览" : "看下一处", () => { session.page++; window.UI.renderAll(); });
    }
    if (current.quiz) {
      const answers = current.quiz === "category" ? ["击倒任意小怪", "击倒任意精英", "击败本地图 BOSS"]
        : id === "observe" ? ["不主动攻击，所以近战一定安全", "会反击并汲取生命，现在先避开"]
        : ["走右方掉血格，优先攻击守卫", "走下方回血格，绕开守卫接近核心"];
      answers.forEach((label, index) => extraButton(label, () => {
        if (session.inspected) return;
        if (index !== answers.length - 1) {
          session.feedback = current.quiz === "category" ? "小怪和精英通常提供金币、任务进度；击败地图 BOSS 才是通关条件。请再选一次。" : "再看反击与汲取说明：不主动攻击不代表不会反击；优先保留生命。请再选一次。";
        } else {
          session.feedback = "";
          if (current.quiz === "category") session.page++;
          else session.inspected = true;
        }
        window.UI.renderAll();
      }));
    }
    $("tutorial-next").classList.toggle("hidden", !session.review);
    $("tutorial-next").textContent = id === "final" ? "进入女仆咖啡厅" : "下一节";
    $("tutorial-next").onclick = () => {
      if (!session?.review) return;
      if (lessons[session.index].id === "final") exit("cafe"); else loadLesson(session.index + 1);
    };
    $("tutorial-retry").onclick = () => { if (session) loadLesson(session.index); };
    $("tutorial-exit").textContent = session.review && id === "final" ? "返回开始页" : "退出教程";
    $("tutorial-exit").onclick = () => exit();
    document.querySelectorAll(".tutorial-focus").forEach(el => el.classList.remove("tutorial-focus"));
    if (current.focus) document.querySelectorAll(current.focus).forEach(el => el.classList.add("tutorial-focus"));
    // 仅在教学关注区域改变时定位，普通战斗重绘不抢夺玩家滚动位置。
    const focusKey = `${id}:${session.page}:${current.title}`;
    if (session.lastFocus !== focusKey) {
      session.lastFocus = focusKey;
      const target = current.focus && document.querySelector(current.focus);
      if (target?.scrollIntoView) target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    // 只装饰本次重新渲染的控件；真实权限仍由引擎入口再次检查。
    const decorate = (selector, name, args = () => []) => {
      document.querySelectorAll(selector).forEach((el, index) => {
        const enabled = allow(name, args(el, index), S);
        if (el.tagName === "BUTTON") el.disabled = el.disabled || !enabled;
        else if (el.classList.contains("card")) {
          el.classList.toggle("tutorial-disabled", !enabled);
          el.setAttribute("aria-disabled", String(!enabled));
          if (!enabled) el.onclick = null;
          else if (el.onclick) {
            el.tabIndex = 0; el.setAttribute("role", "button");
            el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } };
          }
        }
        if (!enabled) el.title = "请先完成上方的当前教学操作";
      });
    };
    const buttonActions = [
      ["主动技能", "useSkill"], ["结束出牌", "finishPlayPhase"], ["掷骰移动", "rollAndMove"],
      ["取消", "cancelTargeting"], ["重新开始", "blocked"],
    ];
    document.querySelectorAll("#actions button").forEach(el => {
      const match = buttonActions.find(([label]) => el.textContent.includes(label));
      if (match && !allow(match[1], [], S)) { el.disabled = true; el.title = "请先完成当前教学操作"; }
    });
    decorate("#hand .card", "playCard", (_, index) => [index]);
    decorate("#battle-cards .card", "playBattleCard");
    decorate("#battle-actions button", S.battle?.mode === "monsterAttack" ? "playerChooseStance" : "resolvePlayerAttack");
    decorate("#ask-actions button", "answerAsk", (_, index) => [S.ask.options[index].value]);
    decorate("#shop-actions button:first-child", "buyShop");
    decorate("#shop-actions button:last-child", "closeShop");
    decorate("#chip-actions button", "refreshChips");
    decorate("#chip-options .card", "pickChip");
    document.querySelectorAll("#board .move-choice").forEach(el => {
      const enabled = allow("pickMoveStep", [+el.dataset.pos], S);
      el.classList.toggle("tutorial-disabled", !enabled);
      if (!enabled) el.onclick = null;
      else {
        el.setAttribute("tabindex", "0"); el.setAttribute("role", "button");
        el.setAttribute("aria-label", `选择第 ${+el.dataset.pos + 1} 格`);
        el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.Engine.pickMoveStep(+el.dataset.pos); } };
      }
    });
  }
  return { start, initialize, update, render, renderEntry, allow, roll, cardValue, moveSteps, exit,
    get progress() { return session ? { lesson: session.index, id: lessons[session.index].id, page: session.page, complete: session.review, count: lessons.length } : null; } };
})();
