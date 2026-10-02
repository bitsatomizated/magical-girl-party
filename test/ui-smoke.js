// UI 层冒烟：用最小 DOM 桩加载真实 ui.js + main.js 流程，复现浏览器初始化错误
function makeEl() {
  return {
    innerHTML: "", textContent: "", scrollTop: 0, scrollHeight: 0, disabled: false,
    className: "", style: {}, _attrs: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : !!force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
      contains(c) { return this._set.has(c); },
    },
    getAttribute(k) { return this._attrs[k] ?? null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    querySelectorAll() { return []; },
    appendChild() {}, onclick: null,
  };
}
const els = {};
global.window = global;
global.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl()),
  createElement: () => makeEl(),
};
global.__askAuto = () => true;

try {
  require("../js/data.js");
  require("../js/ui.js");
  require("../js/engine.js");
  // 模拟 main.js
  window.UI.renderAll();
  window.Engine.newGame();
  const S = window.Engine.state;
  console.log("初始化 OK：round=" + S.round + " phase=" + S.phase + " tiles=" + S.tiles.length + " monsters=" + S.monsters.length);
  // 渲染一遍真实 UI 层
  window.UI.renderAll();
  console.log("renderAll OK");
} catch (e) {
  console.error("初始化失败：", e && e.stack || e);
  process.exit(1);
}
