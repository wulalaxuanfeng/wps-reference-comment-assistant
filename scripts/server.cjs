'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = 38991;
function currentVersion() { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; }
const files = new Set(['/index.html', '/main.js', '/manifest.xml', '/ribbon.xml', '/js/core.js', '/js/host.js', '/js/ribbon.js']);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/report' && req.method === 'POST') {
    if (req.headers.origin !== 'http://127.0.0.1:38991') { res.writeHead(403); res.end(); return; }
    let body = '', tooLarge = false;
    req.on('data', chunk => { if (tooLarge) return; body += chunk; if (Buffer.byteLength(body) > 16384) { tooLarge = true; res.writeHead(413); res.end(); } });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const report = JSON.parse(body);
        if (typeof report.version !== 'string' || typeof report.event !== 'string') throw new Error('Invalid report');
        fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
        fs.appendFileSync(path.join(root, 'logs/wps-runtime.jsonl'), JSON.stringify({ time: new Date().toISOString(), version: report.version, event: report.event, data: report.data }) + '\n', 'utf8');
        res.writeHead(204); res.end();
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ name: 'WpsReferenceAssistant', version: currentVersion(), root }));
    return;
  }
  // 版本目录使 WPS 将新版视为新的入口地址，避免复用旧加载项缓存。
  pathname = pathname.replace(/^\/v[0-9]+\.[0-9]+\.[0-9]+\//, '/');
  if (pathname === '/') pathname = '/index.html';
  if (!files.has(pathname) || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(path.join(root, pathname.slice(1)), (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (types[path.extname(pathname)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
    console.log(new Date().toISOString(), req.method, pathname);
  });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log('WpsReferenceAssistant: http://127.0.0.1:' + port));
