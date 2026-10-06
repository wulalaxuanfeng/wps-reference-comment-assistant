'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'release', 'WpsReferenceAssistant');
const files = ['README.md', 'package.json', 'package-lock.json', 'ribbon.xml', 'manifest.xml', 'index.html', 'main.js',
  'js/core.js', 'js/host.js', 'js/ribbon.js', 'scripts/start.ps1', 'scripts/uninstall.ps1', 'scripts/server.cjs',
  'scripts/build.cjs', 'scripts/check-service.cjs', 'scripts/create-sample.cjs', 'scripts/reload-addon.cjs', 'scripts/wps-runtime-test.cjs', 'examples/测试论文.rtf', 'examples/组合引用测试.rtf',
  'tests/assistant.test.cjs', 'tests/mock.cjs', 'tests/live-wps.ps1', 'tests/live-host.js', '启动参考文献助手.cmd', '更新参考文献助手.cmd', '调试参考文献助手.cmd', '卸载参考文献助手.cmd'];
for (const name of files) {
  const target = path.join(stage, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, name), target);
}
const zip = path.join(root, 'release', 'WPS参考文献批注助手-v' + require('../package.json').version + '.zip');
const command = "Compress-Archive -LiteralPath '" + stage.replace(/'/g, "''") + "' -DestinationPath '" + zip.replace(/'/g, "''") + "' -Force";
execFileSync('powershell.exe', ['-NoProfile', '-Command', command]);
console.log(zip);
