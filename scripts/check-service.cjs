'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async function () {
  const root = path.resolve(__dirname, '..');
  const base = 'http://127.0.0.1:38991';
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.name, 'WpsReferenceAssistant');
  assert.equal(health.version, require('../package.json').version);
  assert.equal(health.root, root);
  for (const file of ['index.html', 'main.js', 'manifest.xml', 'ribbon.xml', 'js/core.js', 'js/host.js', 'js/ribbon.js']) {
    const response = await fetch(base + '/' + file);
    assert.equal(response.status, 200, file);
    assert.equal(await response.text(), fs.readFileSync(path.join(root, file), 'utf8'), file);
    const versioned = await fetch(base + '/v' + health.version + '/' + file);
    assert.equal(versioned.status, 200, 'versioned ' + file);
    assert.equal(await versioned.text(), fs.readFileSync(path.join(root, file), 'utf8'));
  }
  assert.equal((await fetch(base + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  for (const forbidden of ['/package.json', '/README.md', '/scripts/start.ps1', '/examples/测试论文.rtf', '/logs/server.log']) {
    assert.equal((await fetch(base + forbidden)).status, 404, forbidden);
  }
  console.log('PASS: 本地服务、7 个加载项资源、非公开文件访问限制');
})().catch(error => { console.error(error); process.exitCode = 1; });
