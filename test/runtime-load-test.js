// 使用页面真实 script 标签加载资源，防止拆模块后只在 require / eval 测试中可用。
const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => errors.push(error.message));
  const dom = await JSDOM.fromFile(path.join(__dirname, "../index.html"), {
    resources: "usable", runScripts: "dangerously", virtualConsole,
    beforeParse(window) { window.__FAST__ = true; },
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("页面资源加载超时")), 5000);
      if (dom.window.document.readyState === "complete") resolve();
      else dom.window.addEventListener("load", resolve, { once: true });
    });
    const w = dom.window, doc = w.document;
    doc.getElementById("btn-start").click();
    doc.getElementById("btn-intro-ok").click();
    assert.deepEqual(errors, [], "页面脚本和本地资源应成功加载");
    assert.equal(w.Engine.state.phase, "play");
    assert.equal(doc.querySelectorAll("#board g.node").length, w.Engine.state.tiles.length);

    const previous = w.Engine.state;
    w.Engine._test.addChip("sharp1");
    assert.equal(w.Engine.derived().atk, previous.player.atk + 1);
    w.Engine.newGame();
    assert.notEqual(w.Engine.state, previous);
    assert.equal(w.Engine.derived().atk, w.Engine.state.player.atk, "重开后筹码子系统应读取新对局");
    assert.equal(w.Engine.canAct("play"), true);
    console.log("PASS 真实页面脚本加载、棋盘渲染与重开后的子系统状态");
  } finally {
    clearTimeout(timer);
    dom.window.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
