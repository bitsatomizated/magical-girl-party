// 询问面板测试（node test/ask-panel-test.js）：
// 验证原生 confirm/prompt 已被非模态内置面板取代 —— 面板出现时信息栏/手牌仍可见，点击按钮才推进流程
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/", runScripts: "outside-only", pretendToBeVisual: true });
const doc = dom.window.document;

let pass = 0, fail = 0;
const check = (n, c) => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n));
const tick = () => new Promise((r) => setTimeout(r, 0));

// 刻意不设 window.__askAuto：本测试必须走真实的面板交互路径
for (const src of require("../tools/runtime-source.cjs").scriptPaths) {
  const code = fs.readFileSync(path.join(root, src), "utf8");
  dom.window.eval(code);
}
doc.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));

(async () => {
  // 开局：开始 → 开场剧情 → 推门而入
  doc.getElementById("btn-start").onclick();
  doc.getElementById("btn-intro-ok").onclick();
  await tick();

  const X = dom.window.Engine._test;
  console.log("[1] 面板渲染");
  let resolved = "未回答";
  X.ask("是否与【女仆精灵】交战？", [
    { label: "交战", value: true, cls: "primary" },
    { label: "避开", value: false },
  ], "HP 8/8　攻 2　防 0").then((v) => { resolved = v; });
  await tick();

  const panel = doc.getElementById("ask-panel");
  check("询问面板已显示", !panel.className.includes("hidden"));
  check(`问题文本正确（${doc.getElementById("ask-question").textContent}）`,
    doc.getElementById("ask-question").textContent === "是否与【女仆精灵】交战？");
  check(`详情文本正确（${doc.getElementById("ask-detail").textContent}）`,
    doc.getElementById("ask-detail").textContent.includes("HP 8/8"));
  const btns = doc.querySelectorAll("#ask-actions button");
  check(`按钮 2 个（实际 ${btns.length}）`, btns.length === 2);
  check("按钮文案与顺序正确",
    !!btns[0] && !!btns[1] && btns[0].textContent === "交战" && btns[1].textContent === "避开");

  console.log("[2] 非模态：面板出现时其余界面照常可见");
  check("信息栏未被隐藏（仍可滚动查看怪物/筹码）", !doc.getElementById("info").classList.contains("hidden"));
  check("手牌面板未被隐藏", !doc.getElementById("turn-panel").classList.contains("hidden"));

  console.log("[3] 点击按钮才推进流程");
  check("未点击时 Promise 尚未完成", resolved === "未回答");
  btns[1].onclick();
  await tick();
  check("点击后面板隐藏", panel.className.includes("hidden"));
  check(`Promise 以所选 value 完成（${resolved}）`, resolved === false);

  console.log("[4] 面板清空后不残留按钮");
  check(`按钮已清空（实际 ${doc.querySelectorAll("#ask-actions button").length}）`,
    doc.querySelectorAll("#ask-actions button").length === 0);

  console.log("[5] 遥控骰子：数值选项渲染为 1~6 按钮");
  const D = dom.window.GAME_DATA;
  const S = dom.window.Engine.state;
  S.player.hand = [D.cards.diceCtrl]; // 手牌放一张遥控骰子
  S.phase = "play";
  dom.window.UI.renderAll();
  dom.window.Engine.playCard(0); // async：等玩家在面板上选点数
  await tick();
  const diceBtns = Array.from(doc.querySelectorAll("#ask-actions button"));
  check(`渲染 6 个点数按钮（实际 ${diceBtns.length}）`, diceBtns.length === 6);
  check(`按钮文案为 1~6（${diceBtns.map(b => b.textContent).join(",")}）`,
    diceBtns.map(b => b.textContent).join(",") === "1,2,3,4,5,6");
  check("选点数期间手牌面板仍可见", !doc.getElementById("turn-panel").classList.contains("hidden"));
  const E = dom.window.Engine;
  const pendingDice = S.ask;
  const findAction = text => [...doc.querySelectorAll("#actions button")].find(b => b.textContent.includes(text));
  check("等待点数时结束出牌按钮禁用", findAction("结束出牌").disabled);
  check("等待点数时主动技能按钮禁用", findAction("主动技能").disabled);
  const cooldown = S.player.skillCd;
  E.finishPlayPhase(); E.rollAndMove(); E.useSkill();
  check("直接调用也无法越过询问开始移动", S.phase === "play" && !S.move);
  check("直接调用也无法在询问期间使用技能", S.player.skillCd === cooldown);
  check("原来的选点询问仍然保留", S.ask === pendingDice);
  E.answerAsk(99);
  check("无效答案不会消耗询问", S.ask === pendingDice);
  if (diceBtns[3]) diceBtns[3].onclick(); // 选 4
  await tick();
  check(`选择 4 后写入 nextFixed（实际 ${S.player.nextFixed}）`, S.player.nextFixed === 4);
  check("牌已从手牌移除", S.player.hand.length === 0);
  check("回答后恢复出牌操作", !findAction("结束出牌").disabled && E.canAct("play"));

  console.log("[6] 重叠询问排队，旧按钮不能误答下一问");
  const answers = [];
  const first = X.ask("第一问", [{ label: "确认第一问", value: true }]).then(v => answers.push([1, v]));
  const oldButton = doc.querySelector("#ask-actions button");
  const second = X.ask("第二问", [{ label: "确认第二问", value: true }]).then(v => answers.push([2, v]));
  check("后来的询问不覆盖第一问", S.ask.question === "第一问");
  oldButton.onclick();
  await tick();
  check("第一问完成后显示第二问", S.ask.question === "第二问" && answers.length === 1);
  oldButton.onclick();
  await tick();
  check("重复调用旧按钮不会回答第二问", S.ask.question === "第二问" && answers.length === 1);
  doc.querySelector("#ask-actions button").click();
  await Promise.all([first, second]);
  check("两次询问均按顺序完成", JSON.stringify(answers) === "[[1,true],[2,true]]" && !S.ask);

  console.log("[7] 选完点数后正常进入移动");
  findAction("结束出牌").click();
  check("可以结束出牌进入移动阶段", S.phase === "move");
  check("掷骰按钮恢复可用", !findAction("掷骰移动").disabled);

  console.log(`\n== 结果：通过 ${pass}，失败 ${fail} ==`);
  process.exit(fail ? 1 : 0);
})();
