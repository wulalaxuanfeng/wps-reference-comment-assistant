// Windows cscript harness: executes the actual plugin sources against native WPS.
// Only opens the generated test document. It never edits the user's paper.
var window = this;
if (!Object.create) Object.create = function () { return {}; };
if (!Object.keys) Object.keys = function (object) {
    var keys = [];
    for (var key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
    return keys;
};
var fs = new ActiveXObject('Scripting.FileSystemObject');
var projectRoot = fs.GetParentFolderName(fs.GetParentFolderName(WScript.ScriptFullName));
function readUtf8(path) {
    var stream = new ActiveXObject('ADODB.Stream');
    stream.Type = 2; stream.Charset = 'utf-8'; stream.Open(); stream.LoadFromFile(path);
    var text = stream.ReadText(); stream.Close(); return text;
}
eval(readUtf8(fs.BuildPath(projectRoot, 'js/core.js')));
eval(readUtf8(fs.BuildPath(projectRoot, 'js/host.js')));
var app = null, testDoc = null, previous = null, exitCode = 0;
function check(condition, message) { if (!condition) throw new Error(message); WScript.Echo('PASS: ' + message); }
function selectReferences() {
    var first = testDoc.Content.Duplicate;
    first.Find.ClearFormatting();
    if (!first.Find.Execute('[1] ', false, false, false, false, false, true, 0, false)) throw new Error('Cannot locate reference list');
    var last = testDoc.Content.Duplicate;
    last.Find.ClearFormatting();
    if (!last.Find.Execute('20-30.', false, false, false, false, false, false, 0, false)) throw new Error('Cannot locate reference end');
    testDoc.Range(first.Start, last.End).Select();
}
try {
    app = new ActiveXObject('KWPS.Application');
    if (app.Documents.Count) previous = app.ActiveDocument;
    var samplePath = fs.BuildPath(projectRoot, 'examples/' + String.fromCharCode(0x6d4b, 0x8bd5, 0x8bba, 0x6587) + '.rtf');
    var testPath = fs.BuildPath(projectRoot, 'logs/live-host-' + new Date().getTime() + '.rtf');
    fs.CopyFile(samplePath, testPath);
    testDoc = app.Documents.Open(testPath);
    testDoc.Activate();
    WScript.Echo('DOC_READONLY=' + testDoc.ReadOnly + '; TYPE=' + typeof testDoc.ReadOnly);
    WScript.Echo('ACTIVE_IS_TEST=' + (String(app.ActiveDocument.FullName) === String(testDoc.FullName)));
    var before = String(testDoc.Content.Text);
    testDoc.Comments.Add(testDoc.Range(0, 5), 'Mentor: retain this comment');
    selectReferences();
    var result = WraHost.run(app, 'generate');
    check(result.added === 4, 'actual host.js generates 4 comments including a group');
    selectReferences();
    result = WraHost.run(app, 'generate');
    check(result.added === 0 && result.skipped === 4, 'actual host.js avoids duplicate comments');
    selectReferences();
    result = WraHost.run(app, 'refresh');
    check(result.added === 4 && result.removed === 4, 'actual host.js refreshes 4 comments');
    for (var i = 1; i <= testDoc.Comments.Count; i++) {
        var comment = testDoc.Comments.Item(i);
        if (WraCore.isOwned(comment.Range.Text, comment.Author, comment.Initial)) {
            check(/^\[(1|12|1,12)\]$/.test(String(comment.Scope.Text)), 'comment anchors complete citation');
            check(Number(comment.Scope.Font.Superscript) === -1, 'superscript remains intact');
        }
    }
    result = WraHost.clear(app);
    check(result.removed === 4 && testDoc.Comments.Count === 1, 'actual host.js clears own comments and keeps mentor comment');
    check(String(testDoc.Content.Text) === before, 'body text remains intact');
    WScript.Echo('LIVE_HOST_PASSED');
} catch (error) {
    WScript.Echo('LIVE_HOST_FAILED: ' + (error.message || error.description || error));
    exitCode = 1;
} finally {
    if (testDoc) testDoc.Close(0);
    if (previous) { try { previous.Activate(); } catch (ignore) {} }
}
WScript.Quit(exitCode);
