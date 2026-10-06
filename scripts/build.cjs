'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist');
const files = ['index.html', 'main.js', 'manifest.xml', 'ribbon.xml', 'js/core.js', 'js/host.js', 'js/ribbon.js'];
for (const name of files) {
  const destination = path.join(target, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, name), destination);
}
console.log('已生成 dist/，包含 ' + files.length + ' 个加载项文件。');
