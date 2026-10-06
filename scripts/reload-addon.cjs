'use strict';
const version = require('../package.json').version;
(async () => {
  const code = `(function () { window.location.replace('http://127.0.0.1:38991/v${version}/index.html'); return true; })`;
  const data = { name: 'WpsReferenceAssistant', function: code, info: {}, showToFront: false, jsPluginsXml: '' };
  const response = await fetch('http://127.0.0.1:58890/wps/runParams', {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'http://127.0.0.1:38991' },
    body: 'ksowebstartupwps://' + Buffer.from(JSON.stringify(data)).toString('base64'), signal: AbortSignal.timeout(6000)
  });
  if (!response.ok || (await response.text()).trim() !== 'OK') throw new Error('Reload was not accepted');
  console.log('已请求 WPS 重新加载插件。运行结果弹窗会显示 v' + version + '。');
})().catch(() => {
  console.log('本地更新已完成。请保存文档，完全退出 WPS 后重新打开，以加载新版插件。');
});
