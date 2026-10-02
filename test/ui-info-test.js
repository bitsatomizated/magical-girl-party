// 右上角信息面板：怪物主动/被动技能显示测试（node test/ui-info-test.js）
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  url: "http://127.0.0.1:8765/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const w = dom.window;
w.__FAST__ = true;
w.__askAuto = () => true;
w.prompt = () => "6";

const errors = [];
w.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));
for (const src of require("../tools/runtime-source.cjs").scriptPaths) {
  try { w.eval(fs.readFileSync(path.join(root, src), "utf8")); }
  catch (e) { errors.push(`[${src}] ${e.stack || e}`); }
}
w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));

let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.log("  ✗ " + name));
const infoHTML = () => w.document.getElementById("info").innerHTML;

function start(diff) {
  w.GAME_DATA.map = w.GAME_DATA.maps.maid_cafe;
  w.GAME_DATA.diff = diff;
  w.Engine.newGame();
  w.Engine.state.aiBusy = true;
  w.UI.renderAll();
  return w.Engine.state;
}
// 手工放入指定怪物（含技能字段），再渲染信息面板
function withMonster(S, id, uid, pos) {
  const def = w.GAME_DATA.monsters[id];
  S.monsters.push({ uid, def, name: def.name, pos, hp: def.hpMax, hpMax: def.hpMax,
    atk: def.attack, def_: def.defense, skillCd: 0, marks: 0, hunt: 0 });
  w.UI.renderAll();
}

console.log("[1] 被动技能显示（普通难度：难度限定的被动不显示）");
const S1 = start("normal");
const h1 = infoHTML();
check("图鉴移动展示为 1d10", h1.includes("每回合 1d10 格") && !h1.includes("每回合 1 格"));
check("不显示仅噩梦/疯狂生效的【女仆链接】", !h1.includes("女仆链接"));
check("显示【晕彩救援】被动及其效果", h1.includes("被动【晕彩救援】") && h1.includes("晕彩在升星点登场"));
check("不出现难度标注之类的冗余文案",
  !h1.includes("难度生效") && !h1.includes("当前难度未生效"));
check("小怪无技能时不显示技能行",
  !/女仆精灵1<\/b>[^]*?主动【/.test(h1.split("女仆精灵2")[0]) && !h1.includes("被动【—】"));

console.log("[2] 噩梦难度：难度限定的被动开始显示");
const S2 = start("nightmare");
const h2 = infoHTML();
check("显示【女仆链接】", h2.includes("被动【女仆链接】"));
check("显示其效果说明（无难度标注）",
  h2.includes("下次移动速度 +2") && !h2.includes("难度生效"));
check("噩梦数值同步（安若素生命上限 20）", h2.includes("女仆安若素") && /女仆安若素<\/b>[^]*?HP 上限 20/.test(h2));

console.log("[3] 主动技能显示名称、说明与冷却状态");
const S3 = start("normal");
const S3b = w.Engine.state;
withMonster(S3b, "maid_sutaoyao", 9001, 22);
const h3 = infoHTML();
check("显示主动【映霞】", h3.includes("主动【映霞】"));
check("显示技能说明与数值", h3.includes("远程射击") && h3.includes("造成 3 点伤害") && h3.includes("再 +1"));
check("显示冷却规则与当前状态", h3.includes("CD 3 轮") && h3.includes("就绪"));
withMonster(S3b, "maid_tina", 9002, 28);
const h3b = infoHTML();
check("显示缇娜的两条被动", h3b.includes("被动【鲜血汲取】") && h3b.includes("被动【公主关注】"));
withMonster(S3b, "maid_yuncai", 9003, 21);
const h3c = infoHTML();
check("显示 BOSS 主动【析光】", h3c.includes("主动【析光】") && h3c.includes("生成一个晕彩分身"));

console.log("[4] 技能冷却：图鉴保留品种级说明，当前冷却挂到棋盘条目");
S3b.monsters.find(m => m.uid === 9001).skillCd = 2;
w.UI.renderAll();
check("图鉴保留主动技能与 CD 说明", infoHTML().includes("主动【映霞】") && infoHTML().includes("CD 3 轮"));
check("棋盘条目显示该怪当前冷却（CD2）",
  w.document.querySelector("#board svg").innerHTML.includes("CD2"));
S3b.monsters.find(m => m.uid === 9001).skillCd = 0;

console.log("[5] 精英带编号怪也显示技能（晕彩分身）");
withMonster(S3b, "maid_yuncai_clone", 9004, 21);
check("分身条目存在且无技能行", infoHTML().includes("晕彩分身") && !infoHTML().includes("被动【未定义】"));

console.log("[6] 右侧栏字号与布局约束（调大但不会溢出）");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const block = (sel) => {
  const i = css.indexOf(sel + " {");
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};
const px = (sel, prop) => {
  const m = block(sel).match(new RegExp(prop + ":\\s*([\\d.]+)px"));
  return m ? parseFloat(m[1]) : 0;
};
const infoSize = px("#info", "font-size"), logSize = px("#log", "font-size");
const cardSize = px(".card", "font-size");
check(`信息面板字号 ${infoSize}px（≥13px）`, infoSize >= 13);
check(`日志字号 ${logSize}px（≥13px）`, logSize >= 13);
check(`手牌字号 ${cardSize}px（≥12px）`, cardSize >= 12);
check("信息面板高度用 clamp 自适应、保持可滚动",
  /max-height:\s*clamp\(/.test(block("#info")) && /overflow-y:\s*auto/.test(block("#info")));
check("日志保留最小高度，避免被挤压到不可见", /min-height:\s*\d+px/.test(block("#log")));
check("右栏整体可滚动，极端窗口下不裁切", /overflow-y:\s*auto/.test(block("#side")));
check("卡片加宽以容纳更大字号（≥104px）", px(".card", "width") >= 104);

console.log("[7] 开场选择界面字号（选角色 / 选关卡 / 难度）");
check(`小节标题字号 ${px("#start-screen h2", "font-size")}px（≥17px）`, px("#start-screen h2", "font-size") >= 17);
check(`角色/地图卡标题 ${px(".setup-card b", "font-size")}px（≥17px）`, px(".setup-card b", "font-size") >= 17);
check(`卡片说明文字 ${px(".setup-card .setup-stat", "font-size")}px（≥13px）`, px(".setup-card .setup-stat", "font-size") >= 13);
check(`卡片技能说明 ${px(".setup-card .setup-skill", "font-size")}px（≥13px）`, px(".setup-card .setup-skill", "font-size") >= 13);
check(`难度按钮 ${px(".diff-btn", "font-size")}px（≥16px）`, px(".diff-btn", "font-size") >= 16);
check(`开始按钮 ${px("#btn-start", "font-size")}px（≥18px）`, px("#btn-start", "font-size") >= 18);
check(`卡片宽度 ${px(".setup-card", "width")}px（≥232px，随字号加宽）`, px(".setup-card", "width") >= 232);
check("开场界面可纵向滚动，小窗口不裁切", /overflow-y:\s*auto/.test(block("#start-screen")));
check(`玩法介绍正文 ${px(".help-sec p", "font-size")}px（≥14px）`, px(".help-sec p", "font-size") >= 14);

console.log("[8] 选关列表只展示正式关卡（测试地图隐藏但保留数据）");
const mapListEl = w.document.getElementById("map-list");
const mapCards = [...mapListEl.children];
const visibleMaps = Object.values(w.GAME_DATA.maps).filter(m => !m.hidden);
check(`列表渲染全部非 hidden 地图（实际 ${mapCards.length} 张 / 数据 ${visibleMaps.length} 张）`,
  mapCards.length === visibleMaps.length && visibleMaps.length >= 2);
check(`列表按注册顺序展示：${visibleMaps.map(m => m.name).join("、")}`,
  mapCards.length === visibleMaps.length && mapCards.every((el, i) => el.innerHTML.includes(visibleMaps[i].name)));
check("教学图与正式图都在列表中（练习环道 / 女仆咖啡厅 / 卡牌实验室）",
  mapCards.some(el => el.innerHTML.includes("练习环道")) && mapCards.some(el => el.innerHTML.includes("女仆咖啡厅")) &&
  mapCards.some(el => el.innerHTML.includes("卡牌实验室")));
check("hidden 的测试地图不出现在列表（环心捷径）",
  !mapListEl.innerHTML.includes("环心捷径"));
check(`默认选中第一张非 hidden 地图（${visibleMaps[0].name}）`,
  w.__setup.map === visibleMaps[0].id && w.__setup.map === "tutorial_ring");
check("默认选中的卡片恰好一张且带 selected 标记",
  !!mapCards[0] && mapCards.filter(el => el.classList.contains("selected")).length === 1 &&
  mapCards[0].classList.contains("selected"));
check("测试地图仍保留在数据中且标记 hidden",
  !!w.GAME_DATA.maps.ring_chord && w.GAME_DATA.maps.ring_chord.hidden === true
  && visibleMaps.every(m => m.id !== "ring_chord"));
check("默认关卡为女仆咖啡厅", w.GAME_DATA.map.id === "maid_cafe");

console.log("[9] 事件日程与地图任务移到棋盘左侧栏");
const evHTML = w.document.getElementById("event-list").innerHTML;
const qHTML = w.document.getElementById("quest-list").innerHTML;
check("地图区存在左侧栏容器", !!w.document.getElementById("map-side"));
check("事件日程渲染在左侧栏", evHTML.includes("事件日程") && evHTML.includes("咖啡厅开业") && evHTML.includes("最终扫除"));
check("第 1 轮事件标记为「本轮触发」", evHTML.includes("本轮触发"));
check("地图任务渲染在左侧栏", qHTML.includes("地图任务") && qHTML.includes("击败女仆精灵 4 只"));
check("任务显示进度与奖励档位", qHTML.includes("0/4") && qHTML.includes("1 级概率筹码"));
check("信息面板中不再包含事件与任务",
  !infoHTML().includes("事件日程") && !infoHTML().includes("地图任务"));
check("窄屏下事件栏转到棋盘下方（媒体查询存在）",
  /@media \(max-width: 1440px\)/.test(css) && /#map-side \{ width: 100%/.test(css));

console.log("[10] 移动方向显示：箭头与真实走向一致（不误导）");
{
  const S = start("normal");
  const svgOf = () => w.document.querySelector("#board svg").innerHTML;
  const pOptsAt = (pos, lastFrom) => { S.player.pos = pos; S.player.lastFrom = lastFrom; w.UI.renderAll(); return w.Engine.peekPlayerOptions(); };
  // 出牌阶段（未起步）：方向应继承上回合来路，而非回落到初始方向
  const home = 19, from = S.adj[19][0];
  const opts = pOptsAt(home, from);
  check(`出牌阶段预览方向继承上回合来路（不含来路 ${from}）`, opts.length >= 1 && !opts.includes(from));
  check(`未起步时只画一枚实线玩家箭头（无虚线候选）`,
    svgOf().includes("arr-p") && !svgOf().includes("arr-choice"));
  // 无来路（新局）：走地图初始方向
  const optsNew = pOptsAt(0, null);
  check(`无来路时按初始方向只给 1 个候选（实际 ${optsNew.length}）`, optsNew.length === 1);
  // 岔路待选：给出全部候选 + 虚线箭头 + 剩余步数提示
  const [a, b, c] = S.adj[15];
  S.player.pos = 15;
  S.player.lastFrom = a;
  S.move = { who: "player", steps: 3, prev: a, forcedNext: null, await: [b, c] };
  S.phase = "move";
  w.UI.renderAll();
  const svg3 = svgOf();
  check("岔路待选时列出全部候选方向", w.Engine.peekPlayerOptions().length === 2);
  check("岔路候选画成虚线箭头（数量 2）", (svg3.match(/arr-choice/g) || []).length === 2);
  check("方向提示写明剩余步数",
    w.document.getElementById("actions").textContent.includes("剩余 3 步"));
  check("方向提示写明不能掉头",
    w.document.getElementById("actions").textContent.includes("不能掉头"));
  S.move = null;
}
{
  // 怪物箭头：方向未知不画，确定才画，BOSS 用专属颜色
  const S = start("normal");
  S.monsters = [];
  const def = w.GAME_DATA.monsters.dummy; // 被动怪：方向随机，无法预告
  const mRandom = { uid: 91, def, name: "训练假人1", pos: 5, hp: 6, hpMax: 6, atk: 0, def_: 0, skillCd: 0, marks: 0, hunt: 0, lastFrom: null, initRandom: true };
  S.monsters.push(mRandom);
  w.UI.renderAll();
  check("登场方向随机的怪不预告箭头（peekNext 为 null）", w.Engine.peekNext(mRandom) === null);
  check("棋盘上不画该怪的方向箭头", !w.document.querySelector("#board svg").innerHTML.includes("arr-m"));
  check("不再逐个报告怪物方向（「方向未定」改由棋盘箭头表达）", !infoHTML().includes("方向未定"));
  check("图鉴给出品种级移速说明", infoHTML().includes("移速："));
  mRandom.initRandom = false; mRandom.lastFrom = S.adj[5][0];
  mRandom.queuedNext = 6; // 已预掷的下一步（引擎内在每步落地时由 rollNextStep 写入）
  w.UI.renderAll();
  check("来路确定后画出怪物箭头", w.document.querySelector("#board svg").innerHTML.includes("arr-m"));
  const agg = { uid: 94, def: w.GAME_DATA.monsters.maid_sprite, name: "女仆精灵9", pos: 5, hp: 8, hpMax: 8,
    atk: 2, def_: 0, skillCd: 0, marks: 0, hunt: 0, lastFrom: null, initRandom: true };
  S.monsters = [agg];
  w.UI.renderAll();
  check("主动怪无预掷首步方向时不预告（不误导）", w.Engine.peekNext(agg) === null);
  agg.queuedNext = S.adj[5][0]; // 刷出时预掷的首步方向（引擎内由 rollNextStep(m, true) 写入）
  w.UI.renderAll();
  check("主动怪登场预告预掷首步方向（与实际走向一致）", w.Engine.peekNext(agg) === agg.queuedNext
    && w.document.querySelector("#board svg").innerHTML.includes("arr-m"));
  const boss = { uid: 92, def: w.GAME_DATA.monsters.maid_yuncai, name: "女仆晕彩", pos: 20,
    hp: 111, hpMax: 111, atk: 7, def_: 4, skillCd: 0, marks: 0, hunt: 0, lastFrom: 19, queuedNext: 21, initRandom: false }; // 直路 19→20→21，已预掷下一步
  S.monsters = [boss];
  w.UI.renderAll();
  const svgB = w.document.querySelector("#board svg").innerHTML;
  check("BOSS 方向也用箭头标出（专属颜色 arr-boss）", svgB.includes("arr-boss") && w.Engine.peekNext(boss) === 21);
}

console.log("[11] 选择防御/闪避前告知双方数值");
{
  const S = start("normal");
  S.monsters = [];
  const def = w.GAME_DATA.monsters.maid_sutaoyao;
  const mob = { uid: 93, def, name: "苏桃夭", pos: S.player.pos, hp: 18, hpMax: 18, atk: 4, def_: 3,
    skillCd: 0, marks: 0, hunt: 0, lastFrom: null, initRandom: false, nextBattleAtk: 0 };
  S.monsters.push(mob);
  S.phase = "battle";
  S.battle = { mode: "monsterAttack", target: mob, by: "monster", counter: false, spentPoints: 0, defBonus: 0 };
  w.UI.renderAll();
  const bi = w.document.getElementById("battle-info").textContent;
  const dpv = w.Engine.defensePreview(mob);
  check(`面板显示我方防御数值（${dpv.myDef}）`, bi.includes("我方") && bi.includes(String(dpv.myDef)));
  check(`面板显示敌方攻击数值（${dpv.enemyAtk}）`, bi.includes("敌方") && bi.includes(String(dpv.enemyAtk)));
  check("面板写明两种姿态的结算方式", bi.includes("防御") && bi.includes("闪避") && bi.includes("保底"));
  check("面板提示可先打防御牌", bi.includes("防御牌"));
  // 技能骰点加成与攻击加成要如实预告
  mob.nextBattleAtk = 3;
  mob.skillCd = 0;
  const dpv2 = w.Engine.defensePreview(mob);
  check(`敌方攻击加成计入预告（${dpv2.enemyAtk} = ${dpv2.enemyBaseAtk}+${dpv2.enemyAtkBonus}）`,
    dpv2.enemyAtk === dpv2.enemyBaseAtk + dpv2.enemyAtkBonus && dpv2.enemyAtkBonus === 3);
  // 玩家攻击面板也要给出敌方姿态
  S.battle = { mode: "playerAttack", target: mob, by: "player", spentPoints: 0, cardBonus: 0 };
  w.UI.renderAll();
  const bi2 = w.document.getElementById("battle-info").textContent;
  check("攻击面板告知敌方防御/姿态数值", bi2.includes("姿态") && bi2.includes(String(mob.def_)));
  check("攻击面板给出我方攻击合计", bi2.includes("我方") && bi2.includes(String(w.Engine.attackPreview(mob).total)));
}

console.log("[12] 事件栏显示当前全局强化");
{
  const S = start("normal");
  S.globalBonus.atk = 3; S.globalBonus.def = 3;
  S.round = 11;
  w.UI.renderAll();
  const evHTML = w.document.getElementById("event-list").innerHTML;
  check("事件栏显示全局强化数值", evHTML.includes("当前全局强化") && evHTML.includes("攻 +3") && evHTML.includes("防 +3"));
  check("写明此后刷出的敌人同样生效", evHTML.includes("含此后刷出的敌人"));
  S.globalBonus.atk = 0; S.globalBonus.def = 0;
  w.UI.renderAll();
  check("无强化时不显示该行",
    !w.document.getElementById("event-list").innerHTML.includes("当前全局强化"));
  check("事件说明文案标明此后出现的敌人同样生效",
    w.GAME_DATA.maps.maid_cafe.globalEvents.some(e => /此后出现的敌人同样生效/.test(e.desc)));
}

console.log("[13] 卡牌实验室怪物：主动/被动都带名称，面板不出现 undefined");
{
  const S = start("normal");
  S.monsters = [];
  ["lab_wander", "lab_thunderbird", "lab_cerberus", "lab_chimera", "lab_variant"]
    .forEach((id, i) => withMonster(S, id, 9100 + i, i));
  const h = infoHTML();
  check("信息面板不出现 undefined", !h.includes("undefined"));
  check("游荡魔物：被动【吸收进化】带说明",
    h.includes("被动【吸收进化】") && h.includes("随机进化成卡牌·雷鸟或卡牌·三头犬"));
  check("卡牌·雷鸟：被动【掠影】带说明",
    h.includes("被动【掠影】") && h.includes("造成等同于自身攻击力的伤害"));
  check("奇美拉：主动【魔物增生】与被动【万魔之王】同时显示",
    h.includes("主动【魔物增生】") && h.includes("被动【万魔之王】"));
  check("变彩：主动【卡牌融合】与被动【卡牌守护】同时显示",
    h.includes("主动【卡牌融合】") && h.includes("被动【卡牌守护】"));
  check("无被动的怪物不渲染空的被动行", !h.includes("被动【】") && !h.includes("被动【未知】"));
  // 数据契约：信息面板直接读 p.name / sk.name，因此全库的主动与被动都必须带 name
  const missing = [];
  Object.values(w.GAME_DATA.monsters).forEach(d => {
    if (d.skill && !d.skill.name) missing.push(d.id + ".skill");
    (d.passives || []).forEach((p, i) => { if (!p.name) missing.push(`${d.id}.passives[${i}]`); });
  });
  check("全库怪物定义：主动与被动均带 name" + (missing.length ? "（缺：" + missing.join("、") + "）" : ""),
    missing.length === 0);
  check("卡牌实验室的地图描述已更新（含【九幽】与卡牌魔物融合）",
    /【九幽】/.test(w.GAME_DATA.maps.card_lab.intro) && w.GAME_DATA.maps.card_lab.intro.includes("卡牌魔物融合"));
}

console.log("[14] 图鉴归并：同品种一条，个体数值挂到棋盘与战斗面板");
{
  const S = start("normal");
  S.monsters = [];
  const sp = w.GAME_DATA.monsters.maid_sprite;
  [101, 102, 103].forEach((uid, i) => S.monsters.push({
    uid, def: sp, name: "女仆精灵" + (i + 1), pos: 5, hp: 8 - i, hpMax: 8,
    atk: 2, def_: 0, skillCd: 0, marks: 0, hunt: 0,
  }));
  withMonster(S, "maid_tina", 104, 7);
  const h = infoHTML();
  check("同品种 3 只合并为 1 条图鉴", (h.match(/女仆精灵<\/b>/g) || []).length === 1);
  check("图鉴标出场上数量", h.includes("场上 3 只"));
  check("图鉴不列逐只生命（棋盘上已有，避免冗长）",
    !h.includes("HP 8/8") && !/HP \d+\/\d+、/.test(h));
  check("默认防御的怪不显示「守方倾向」", !h.includes("守方倾向"));
  check("异种另有独立条目", h.includes("女仆缇娜</b>") && h.includes("场上 1 只"));
  check("图鉴给出品种级移速说明", h.includes("移速："));

  const boardHTML = () => w.document.querySelector("#board svg").innerHTML;
  check("棋盘按只列出（不归并）",
    ["女仆精灵1", "女仆精灵2", "女仆精灵3"].every(n => boardHTML().includes(n)));
  check("棋盘不重复显示攻防（攻防与品种绑定、同种一致）",
    !boardHTML().includes("攻2防0") && /女仆精灵1 8\/8</.test(boardHTML()));

  S.monsters[0].marks = 3;
  S.monsters[1].hunt = 2;
  S.monsters[2].skillCd = 1; // 女仆精灵无主动技：不应出现 CD 标记
  w.UI.renderAll();
  check("棋盘显示标记层数（▮3）", boardHTML().includes("▮3"));
  check("棋盘显示追猎层数（追2）", boardHTML().includes("追2"));
  check("无主动技能的怪不显示 CD 标记", !/女仆精灵3 6\/8<tspan[^>]*>[^<]*CD/.test(boardHTML()));

  S.battle = { mode: "monsterAttack", target: S.monsters[0], by: "monster", counter: false, spentPoints: 0, defBonus: 0 };
  S.player.buffs = [{ name: "暴走", atk: 2, turns: 1 }];
  w.UI.renderAll();
  const bi = w.document.getElementById("battle-info").textContent;
  check("战斗面板显示双方状态行", bi.includes("状态") && bi.includes("我方") && bi.includes("敌方"));
  check("战斗面板列出我方 buff 与加成", bi.includes("暴走") && bi.includes("攻+2"));
  check("战斗面板列出敌方标记层数", bi.includes("标记 3 层"));
  S.battle = null;
  S.player.buffs = [];
  w.UI.renderAll();

  // 同种个体数值不同时（例如奇美拉吃了小怪），图鉴用范围表达差异。
  // 放在本段最后：start() 会重建 state，之前的 S 引用随之失效。
  const S2 = start("normal");
  S2.monsters = [];
  const ch = w.GAME_DATA.monsters.lab_chimera;
  [201, 202].forEach((uid, i) => S2.monsters.push({
    uid, def: ch, name: "奇美拉" + (i + 1), pos: 5, hp: 38, hpMax: 38,
    atk: 2 + i * 3, def_: 4, skillCd: 0, marks: 0, hunt: 0,
  }));
  w.UI.renderAll();
  check("同品种个体攻击不同时，图鉴以范围表达（攻 2~5）", infoHTML().includes("攻 2~5"));
  check("同品种个体防御相同则显示单值（防 4）", infoHTML().includes("防 4"));
  check("图鉴仍只列一条", (infoHTML().match(/奇美拉<\/b>/g) || []).length === 1);

  // 只有会进入闪避姿态的怪才值得标出守方倾向
  const oldDefend = ch.defend;
  ch.defend = { rule: "hpThreshold", threshold: 0.4, above: "dodge", belowOrEqual: "defend" };
  w.UI.renderAll();
  check("按血量闪避的怪标出守方倾向",
    infoHTML().includes("守方倾向：按血量切换") && infoHTML().includes("高于 40% 时 闪避"));
  ch.defend = { rule: "always", stance: "dodge" };
  w.UI.renderAll();
  check("恒定闪避的怪标出「守方倾向：闪避」", infoHTML().includes("守方倾向：闪避"));
  ch.defend = oldDefend;
  w.UI.renderAll();
  check("还原为默认防御后不再显示守方倾向", !infoHTML().includes("守方倾向"));
}

if (errors.length) { console.log("捕获异常:"); errors.forEach(e => console.log("  " + e.split("\n")[0])); fail++; }
console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
process.exit(fail ? 1 : 0);
