var WraBusy = false;
var WraLastResult = null;
function WraReport(event, data) {
    try {
        var request = new XMLHttpRequest();
        request.open('POST', 'http://127.0.0.1:38991/report', true);
        request.setRequestHeader('Content-Type', 'application/json');
        request.send(JSON.stringify({ version: WraCore.version, event: event, data: data }));
    } catch (ignore) {}
}
function OnAddinLoad(ribbon) {
    console.log('WPS 参考文献批注助手 v' + WraCore.version + ' 已加载');
    WraReport('loaded', {});
    return true;
}
function WraApplication() {
    if (typeof Application !== 'undefined') return Application;
    if (typeof wps !== 'undefined' && wps.ActiveDocument) return wps;
    if (typeof wps !== 'undefined' && typeof wps.WpsApplication === 'function') return wps.WpsApplication();
    if (typeof wps !== 'undefined' && wps.WpsApplication) return wps.WpsApplication;
    throw new Error('没有连接到 WPS 文字接口。请在 WPS 中使用功能区按钮。');
}
function WraExecute(mode) {
    if (WraBusy) return;
    WraBusy = true;
    try {
        var app = WraApplication();
        if (mode === 'clear') {
            var clearResult = WraHost.clear(app);
            WraLastResult = { mode: mode, removed: clearResult.removed, retained: clearResult.retained };
            alert('已清除 ' + clearResult.removed + ' 条本插件生成的文献批注。' +
                (clearResult.retained ? '\n另有 ' + clearResult.retained + ' 条批注含他人回复，已保留，请自行处理。' : ''));
        } else {
            var result = WraHost.run(app, mode);
            WraLastResult = result;
            var message = '参考文献助手 v' + WraCore.version + '\n读取文献：' + result.references + ' 条\n识别引用：' + result.total + ' 处\n新增批注：' + result.added + ' 条';
            if (result.grouped) message += '\n其中组合引用：' + result.grouped + ' 处（每组一条批注）';
            if (result.skipped) message += '\n已有批注，跳过：' + result.skipped + ' 处';
            if (mode === 'refresh') message += '\n清理旧批注：' + result.removed + ' 条';
            if (result.retained) message += '\n含他人回复的批注：' + result.retained + ' 条，已保留，未更新其内容';
            if (result.missing.length) message += '\n未找到对应文献的编号：' + result.missing.slice(0, 20).join('、');
            alert(message);
        }
        console.log('WRA_RESULT', WraLastResult);
        WraReport('result:' + mode, WraLastResult);
    } catch (error) {
        WraLastResult = { error: String(error.message || error) };
        console.error('WRA_ERROR', error.stack || error);
        WraReport('error:' + mode, { error: WraLastResult.error });
        alert('参考文献助手：\n' + WraLastResult.error);
    } finally { WraBusy = false; }
}
function OnGenerateComments() { WraExecute('generate'); }
function OnRefreshComments() { WraExecute('refresh'); }
function OnClearComments() { WraExecute('clear'); }
