// 读取页面真实脚本顺序，包含 engine 之后加载的自定义技能模块。
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readEngineSource } = require("./runtime-source.cjs");

function loadConfiguration() {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/data.js"), "utf8"), context);
  vm.runInContext(readEngineSource(), context);
  return context;
}

module.exports = { loadConfiguration };
if (require.main === module) {
  try {
    loadConfiguration().Engine.assertConfig();
    console.log("PASS 全部角色、怪物、召唤物、地图、卡牌与筹码配置校验");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
