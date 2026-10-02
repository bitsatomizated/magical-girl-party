// 开发工具与 VM 模拟从真实页面读取脚本顺序，避免维护第二份模块清单。
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptPaths = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(match => match[1]);

function readEngineSource() {
  return scriptPaths
    .filter(src => src !== "js/data.js" && src !== "js/ui.js" && src !== "js/main.js")
    .map(src => `// Source: ${src}\n${fs.readFileSync(path.join(root, src), "utf8")}`)
    .join("\n");
}

module.exports = { scriptPaths, readEngineSource };
