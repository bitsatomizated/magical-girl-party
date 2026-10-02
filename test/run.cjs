// 每个脚本在独立进程中运行，隔离 window、随机数和计时器。
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const live = args.includes("--live");
const requested = args.filter(arg => arg !== "--live");
const available = fs.readdirSync(__dirname).filter(name => name.endsWith(".js")).sort();
const files = requested.length ? requested : live ? ["live-check.js"] : available.filter(name => name !== "live-check.js");
if (!files.length || files.some(name => !available.includes(name))) {
  console.error("请指定 test/ 下的测试文件名，例如 npm test -- ask-panel-test.js");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: root, encoding: "utf8", timeout: live ? 60000 : 30000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 0 && !result.error) {
    console.log(`PASS ${file}`);
  } else {
    failed++;
    console.error(`FAIL ${file}${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
    console.error(result.stdout || "");
    console.error(result.stderr || "");
  }
}
console.log(`\n${files.length - failed}/${files.length} 个脚本通过${live ? "（线上检查）" : "（本地检查）"}`);
process.exitCode = failed ? 1 : 0;
