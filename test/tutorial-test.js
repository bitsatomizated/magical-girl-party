const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
async function setup() {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.__FAST__ = true;
  for (const src of require("../tools/runtime-source.cjs").scriptPaths) w.eval(fs.readFileSync(path.join(root, src), "utf8"));
  await pause();
  w.UI.renderSetup();
  return dom;
}
function button(doc, selector, text) {
  const el = [...doc.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert.ok(el, `缺少按钮 ${selector}: ${text}`);
  assert.equal(el.disabled, false, `${text} 应可点击`);
  el.click();
}
function card(doc, selector, text) {
  const el = [...doc.querySelectorAll(selector)].find(el => el.textContent.includes(text));
  assert.ok(el?.onclick, `${text} 应可出牌`);
  el.click();
}
async function until(check, label) {
  for (let i = 0; i < 200; i++) { if (check()) return; await pause(); }
  assert.fail(`等待超时：${label}`);
}
async function runLesson(w, { stance = "defend", chip = 0 } = {}) {
  const doc = w.document, E = w.Engine, T = w.Tutorial;
  const lesson = T.progress.id;
  let iterations = 0;
  while (!T.progress.complete && iterations++ < 120) {
    const S = E.state;
    assert.equal(S.over, false, `第 ${lesson + 1} 节不应失败`);
    const extra = [...doc.querySelectorAll('#tutorial-extra button')];
    if (extra.length) extra[extra.length - 1].click();
    else if (S.ask) button(doc, "#ask-actions button", lesson === 'observe' ? '避开' : '交战');
    else if (S.move?.await) {
      if (lesson === 'route') {
        if (S.round === 1) {
          assert.equal(S.move.await.includes(0), false, '普通移动不能选择来路');
          const position = S.player.pos;
          E.pickMoveStep(2); assert.equal(S.player.pos, position, '教学第一条安全路线不能被直接入口跳过');
        } else if (S.player.pos === 4) assert.ok(S.move.await.includes(1), '方向抉择允许首步沿来路返回');
        else assert.equal(S.move.await.includes(4), false, '第二步再次禁止掉头');
      }
      const next = lesson === 'route' ? (S.round === 1 ? 4 : S.player.pos === 4 ? 1 : 0) : (S.player.pos === 1 ? 4 : 3);
      const el = doc.querySelector('#board .move-choice[data-pos="'+next+'"]');
      assert.ok(el?.onclick, '正确路线应可点击'); el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    }
    else if (S.targeting) {
      const boss = S.monsters.find(m=>m.def.category === 'boss');
      const target = lesson === 'final' ? doc.querySelector('#board .target-hit[data-uid="'+boss.uid+'"]') : doc.querySelector("#board .target-hit");
      assert.ok(target, "应显示可点击的真实地图目标"); target.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    } else if (S.shop) {
      if (!S.shop.offers[0].sold) {
        doc.querySelector("#shop-offers input").click();
        button(doc, "#shop-actions button", "购买");
      } else button(doc, "#shop-actions button", "离开");
    } else if (S.chipChoice) doc.querySelectorAll("#chip-options .card")[chip].click();
    else if (S.battle) {
      if (S.battle.mode === "monsterAttack") {
        if (lesson === "defense" && !S.battle.spentPoints) card(doc, "#battle-cards .card", "防御中");
        else button(doc, "#battle-actions button", stance === "defend" ? "防御" : "闪避");
      } else if (lesson === "combat" && !S.battle.spentPoints) card(doc, "#battle-cards .card", "攻击中");
      else if (["final", "events"].includes(lesson) && S.player.hand.some(c => c.id === "shadow")) card(doc, "#battle-cards .card", "暗影突袭");
      else {
        const b = [...doc.querySelectorAll("#battle-actions button")].find(el => !el.disabled);
        assert.ok(b, "攻击结算按钮应可用"); b.click();
      }
    } else if (!S.aiBusy && !S.move && S.phase === "play") {
      if ((lesson === "skill" || lesson === "final") && S.player.skillCd === 0) button(doc, "#actions button", "主动技能");
      else if ((lesson === "combat" || lesson === "final") && S.player.hand.some(c => c.id === "brick")) card(doc, "#hand .card", "板砖");
      else if (lesson === 'route' && S.round === 2 && S.player.hand.some(c=>c.id==='dirChoose')) card(doc, '#hand .card', '方向抉择');
      else button(doc, "#actions button", "结束出牌");
    } else if (!S.move && S.phase === "move") button(doc, "#actions button", "掷骰移动");
    await pause();
  }
  assert.ok(T.progress.complete, `第 ${lesson + 1} 节应完成：${doc.getElementById("tutorial-title").textContent}`);
  assert.equal(doc.getElementById("tutorial-next").classList.contains("hidden"), false);
  if (lesson === 'overview') { assert.equal(E.state.round, 1); assert.equal(E.state.player.pos, 0, '导览不推进对局'); }
  if (lesson === 'route') { assert.equal(E.state.player.pos, 0); assert.equal(E.state.round, 3); }
  if (lesson === 'observe') {
    assert.equal(E.state.player.hp, 10, '避战不受反击，停在回血格按真实规则回复 2 点');
    assert.equal(E.state.monsters.length, 3, '避战不会击倒精英，也不应提前通关');
    assert.equal(E.state.monsters[0].skillCd, 0, '当前 CD1 在敌方行动后变为就绪');
    assert.equal(E.state.win, undefined);
  }
  if (lesson === 'events') {
    assert.equal(E.state.firedRounds[2], true, '第 2 轮事件真实触发');
    assert.equal(E.state.quests[0].progress, 1); assert.equal(E.state.quests[0].done, true);
    assert.equal(E.state.player.chips.length, 1, '任务奖励来自真实筹码选择');
    assert.equal(E.state.win, undefined, '完成任务不是通关');
  }
}

async function advanceTo(w, id) {
  while (w.Tutorial.progress.id !== id) { await runLesson(w); w.document.getElementById('tutorial-next').click(); }
}

(async () => {
  const dom = await setup(), w = dom.window, doc = w.document;
  try {
    const D = w.GAME_DATA, E = w.Engine, T = w.Tutorial;
    const original = { map: D.map, player: D.player, diff: D.diff, maps: JSON.stringify(D.maps), monsters: JSON.stringify(D.monsters) };
    w.localStorage.setItem("maidparty_wins", "9");
    assert.equal(doc.getElementById("btn-help").parentNode, doc.getElementById("btn-tutorial").parentNode, "开始页入口应并排");
    assert.ok(!doc.getElementById('map-list').textContent.includes('练习环道'), '开始页隐藏重复的教学地图');
    // 三次完整走通，覆盖两种防守、三个筹码选项与极端随机值。
    for (let pass = 0; pass < 3; pass++) {
      w.Math.random = () => [0, 0.99999, 0.5][pass];
      doc.getElementById("btn-tutorial").click();
      assert.equal(D.player.id, "char_pixel_meow");
      assert.equal(doc.getElementById("start-screen").classList.contains("hidden"), true);
      // 未按流程不能提前用技能或越过教学打牌。
      const cd = E.state.player.skillCd;
      E.useSkill(); assert.equal(E.state.player.skillCd, cd);
      for (let i = 0; i < T.progress.count; i++) {
        assert.equal(T.progress.lesson, i);
        if (T.progress.id === 'observe' || T.progress.id === 'final') {
          const originalPage = T.progress.page;
          const oldWrong = doc.querySelector('#tutorial-extra button');
          oldWrong.click();
          assert.equal(T.progress.page, originalPage, '答错保留当前判断步骤');
          assert.ok(doc.getElementById('tutorial-feedback').textContent.includes('再选一次'));
          E.finishPlayPhase(); assert.equal(E.state.phase, 'play', '未完成观察判断不能开始移动');
          assert.ok(doc.getElementById('info').textContent.includes('汲取'));
          assert.ok(doc.getElementById('info').textContent.includes('CD 3'));
          if (T.progress.id === 'observe') {
            assert.ok(doc.getElementById('info').textContent.includes('小怪'));
            assert.ok(doc.getElementById('info').textContent.includes('精英'));
            assert.ok(doc.getElementById('info').textContent.includes('BOSS'));
          }
        }
        if (T.progress.id === "combat") {
          E.finishPlayPhase(); assert.equal(E.state.phase, "play", "不能跳过效果牌教学");
          card(doc, "#hand .card", "板砖");
          button(doc, "#actions button", "取消");
          assert.equal(E.state.player.hand.length, 2, "取消瞄准不消耗牌");
        }
        await runLesson(w, { stance: pass === 1 ? "dodge" : "defend", chip: pass });
        if (T.progress.id === "skill") {
          assert.equal(E.state.player.hp, E.state.player.hpMax, "像素化期间经过的敌人不能造成伤害");
          assert.ok(doc.getElementById("log").textContent.includes("像素"), "技能效果应有可观察反馈");
        }
        assert.equal(w.localStorage.getItem("maidparty_wins"), "9", "教学不计正式胜场");
        if (i < T.progress.count - 1) doc.getElementById("tutorial-next").click();
      }
      assert.equal(w.localStorage.getItem("maidparty_tutorial_v2"), "complete");
      if (pass === 2) {
        doc.getElementById("tutorial-next").click();
        assert.equal(T.progress, null);
        assert.equal(D.map.id, "maid_cafe");
        doc.getElementById("btn-intro-ok").click();
        assert.equal(E.state.tutorial, undefined, "正式新局没有教程标记");
        assert.equal(T.moveSteps(E.state), undefined, "正式局恢复正常骰点");
        assert.equal(T.roll("battle"), undefined);
      } else {
        doc.getElementById("tutorial-exit").click();
        assert.equal(D.map, original.map); assert.equal(D.player, original.player); assert.equal(D.diff, original.diff);
      }
    }
    assert.equal(JSON.stringify(D.maps), original.maps, "不修改正式地图数据");
    assert.equal(JSON.stringify(D.monsters), original.monsters, "不修改正式敌人数值");
    E.leaveGame();
    console.log("PASS 全部 11 节真实 DOM 操作、三种筹码、两种防守、毕业和正式对局隔离");
  } finally { dom.window.close(); }

  const lifecycle = await setup();
  try {
    const w = lifecycle.window, doc = w.document, E = w.Engine, T = w.Tutorial;
    doc.getElementById("btn-tutorial").click();
    await advanceTo(w, "combat");
    card(doc, "#hand .card", "板砖");
    const old = E.state;
    doc.getElementById("tutorial-retry").click();
    assert.notEqual(E.state, old); assert.ok(old.over);
    assert.equal(E.state.targeting, undefined);
    assert.equal(E.state.player.hand.length, 2);
    card(doc, "#hand .card", "板砖");
    doc.querySelector("#board .target-hit").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    button(doc, "#actions button", "结束出牌"); button(doc, "#actions button", "掷骰移动");
    await until(() => E.state.ask, "交战询问");
    const oldAnswer = doc.querySelector("#ask-actions button");
    doc.getElementById("tutorial-exit").click();
    assert.equal(T.progress, null);
    doc.getElementById("btn-start").click(); doc.getElementById("btn-intro-ok").click();
    const formal = E.state;
    oldAnswer.click(); await pause();
    assert.equal(E.state, formal); assert.equal(formal.battle, null, "退出前的按钮不能影响新局");
    E.leaveGame();
    console.log("PASS 瞄准中重试、询问中退出、旧按钮与新局隔离");
    // 商店和筹码均有挂起的 Promise，切换检查点后不能重复扣款或推进旧局。
    doc.getElementById("btn-tutorial").click();
    await advanceTo(w, "shop");
    button(doc, "#actions button", "结束出牌"); button(doc, "#actions button", "掷骰移动");
    await until(() => E.state.shop, "教学商店");
    const oldClose = doc.querySelector("#shop-actions button:last-child");
    const shopping = E.state;
    doc.getElementById("tutorial-retry").click(); oldClose.click(); await pause();
    assert.ok(shopping.over); assert.equal(E.state.player.coins, 18);
    assert.equal(E.state.round, 1); assert.equal(E.state.shop, undefined);
    await runLesson(w); doc.getElementById("tutorial-next").click();
    button(doc, "#actions button", "结束出牌"); button(doc, "#actions button", "掷骰移动");
    await until(() => E.state.chipChoice, "教学筹码");
    const oldChip = doc.querySelector("#chip-options .card");
    doc.getElementById("tutorial-exit").click(); oldChip.click();
    doc.getElementById("btn-start").click(); doc.getElementById("btn-intro-ok").click();
    assert.equal(E.state.player.chips.length, 0); assert.equal(E.state.player.star, 0);
    E.leaveGame();
    // 无法使用 localStorage 时仍可以完整毕业。
    Object.defineProperty(w, "localStorage", { get() { throw new Error("storage unavailable"); }, configurable: true });
    doc.getElementById("btn-tutorial").click();
    for (let i = 0; i < T.progress.count; i++) { await runLesson(w); if (i < T.progress.count - 1) doc.getElementById("tutorial-next").click(); }
    doc.getElementById("tutorial-exit").click();
    assert.equal(T.progress, null);
    console.log("PASS 商店重试、筹码中退出及存储不可用时完整毕业");
  } finally { lifecycle.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
