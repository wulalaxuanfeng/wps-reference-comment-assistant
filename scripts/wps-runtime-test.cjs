'use strict';
// Uses the documented WPS RPC transport from wpsjs-rpc-sdk-new.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const mode = process.argv[2] || 'diagnostic';
let code;
if (mode === 'reload') {
  code = `(function () { window.location.replace('http://127.0.0.1:38991/v${version}/index.html'); return true; })`;
} else if (mode === 'diagnostic') {
  code = `(function () {
    var source = typeof WraHost !== 'undefined' ? String(WraHost.run) : '';
    var report = { version: '${version}', event: 'runtime-diagnostic', data: {
      coreVersion: typeof WraCore !== 'undefined' ? WraCore.version : null,
      onLoad: typeof OnAddinLoad !== 'undefined' ? String(OnAddinLoad).slice(0, 260) : '',
      reverse: source.indexOf('j--') >= 0,
      nativeRange: source.indexOf('item.range.Duplicate') >= 0
    }};
    var xhr = new XMLHttpRequest(); xhr.open('POST', 'http://127.0.0.1:38991/report', true);
    xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send(JSON.stringify(report)); return true;
  })`;
} else if (mode === 'audit') {
  code = `(function () {
    var report={version:'${version}',event:'citation-audit',data:{}};
    try {
      var app=WraApplication(), doc=app.ActiveDocument, selection=app.Selection.Range;
      var parsed=null,text=null,singleCount=0;
      try{parsed=WraCore.parseReferences(selection.Text);}catch(ignore){}
      if(parsed&&parsed.ids.length===150){
        var scan=WraHost.findCitations(doc,Number(doc.Content.Start),Number(selection.Start),parsed.references);
        singleCount=scan.citations.length-scan.grouped;
        text=String(doc.Range(Number(doc.Content.Start),Number(selection.Start)).Text);
      }else{
        // 仅用于只读诊断：选区已取消时，从段落开头的 [1] 候选中找恰好150条的列表。
        var full=String(doc.Content.Text).replace(/\\r\\n?/g,'\\n');
        var starts=[],begin,starter=/^[ \\t]*\\[1\\][ \\t]*/gm;
        while((begin=starter.exec(full)))starts.push(begin.index);
        for(var candidate=starts.length-1;candidate>=0;candidate--){
          try{var found=WraCore.parseReferences(full.slice(starts[candidate]));
            if(found.ids.length===150){parsed=found;text=full.slice(0,starts[candidate]);break;}
          }catch(ignore){}
        }
        if(text===null)throw new Error('Could not identify the 150-reference list without changing the selection');
      }
      var expression=/\\[([0-9]+(?:\\s*[,，\\-–—]\\s*[0-9]+)*)\\]/g, match;
      var complex=0, examples=[], covered={}, singles={}, unsupportedNumbers={};
      while((match=expression.exec(text))) {
        var inner=match[1];
        if(/^[0-9]+$/.test(inner)&&parsed.references[Number(inner)]) {singles[Number(inner)]=true;}
        if(!/^[0-9]+$/.test(inner)) {complex++;if(examples.length<8)examples.push(match[0]);}
        var parts=inner.split(/[,，]/);
        for(var j=0;j<parts.length;j++) {
          var range=parts[j].split(/[-–—]/), a=Number(range[0]), b=range.length>1?Number(range[1]):a;
          if(b<a||b-a>1000)continue;
          for(var n=a;n<=b;n++) if(parsed.references[n]) {covered[n]=true;if(!/^[0-9]+$/.test(inner))unsupportedNumbers[n]=true;}
        }
      }
      var notSeen=[],complexOnly=[];
      for(var k=0;k<parsed.ids.length;k++) {
        var id=parsed.ids[k];
        if(!covered[id])notSeen.push(id);
        if(unsupportedNumbers[id]&&!singles[id])complexOnly.push(id);
      }
      if(!singleCount){var singleMatches=text.match(/\\[[0-9]+\\]/g)||[];singleCount=singleMatches.length;}
      var nativeStats=null,firstRef=doc.Content.Duplicate;
      firstRef.Find.ClearFormatting();
      if(firstRef.Find.Execute('[1]',false,false,false,false,false,false,0,false)){
        try{
          var nativeRefs=WraCore.parseReferences(doc.Range(firstRef.Start,doc.Content.End).Text);
          if(nativeRefs.ids.length===150){
            var nativeScan=WraHost.findCitations(doc,doc.Content.Start,firstRef.Start,nativeRefs.references);
            nativeStats={matched:nativeScan.citations.length,grouped:nativeScan.grouped,existingOwned:WraHost.readOwned(doc).length};
          }
        }catch(ignore){}
      }
      report.data={references:parsed.ids.length,singleOccurrences:singleCount,nativeStats:nativeStats,
        singleDistinct:Object.keys(singles).length,complexOccurrences:complex,
        combinedExamples:examples,complexOnlyReferences:complexOnly,notSeenInBody:notSeen};
    }catch(error){report.data={error:String(error.message||error)};}
    var xhr=new XMLHttpRequest();xhr.open('POST','http://127.0.0.1:38991/report',true);
    xhr.setRequestHeader('Content-Type','application/json');xhr.send(JSON.stringify(report));return true;
  })`;
} else if (mode === 'smoke' || mode === 'groupsmoke') {
  const fixture = path.join(root, 'logs', 'wps-runtime-' + Date.now() + '.rtf');
  const grouped = mode === 'groupsmoke';
  fs.copyFileSync(path.join(root, 'examples', grouped ? '组合引用测试.rtf' : '测试论文.rtf'), fixture);
  code = `(function () {
    var report = { version: '${version}', event: '${grouped ? 'runtime-group-smoke' : 'runtime-smoke'}', data: {} }, doc = null, previous = null, parsedRefs=null;
    function selectRefs() {
      var a = doc.Content.Duplicate, b = doc.Content.Duplicate;
      a.Find.ClearFormatting(); b.Find.ClearFormatting();
      if (!a.Find.Execute('[1] ',false,false,false,false,false,true,0,false)) throw new Error('Reference start missing');
      ${grouped ? '' : "if (!b.Find.Execute('20-30.',false,false,false,false,false,false,0,false)) throw new Error('Reference end missing');"}
      doc.Range(a.Start,${grouped ? 'doc.Content.End' : 'b.End'}).Select();
    }
    try {
      var app = WraApplication();
      if(app.Documents.Count) previous=app.ActiveDocument;
      doc=app.Documents.Open(${JSON.stringify(fixture)}); doc.Activate();
      if(String(doc.FullName).toLowerCase() !== ${JSON.stringify(fixture.toLowerCase())}) throw new Error('Test file identity mismatch');
      var before=String(doc.Content.Text);
      doc.Comments.Add(doc.Range(0,5),'Mentor: retain this comment');
      selectRefs(); parsedRefs=WraCore.parseReferences(app.Selection.Range.Text);report.data.generate=WraHost.run(app,'generate');
      selectRefs(); report.data.repeat=WraHost.run(app,'generate');
      selectRefs(); report.data.refresh=WraHost.run(app,'refresh');
      var anchors=[];
      for(var i=1;i<=doc.Comments.Count;i++) {
        var c=doc.Comments.Item(i);
        if(WraCore.isOwned(c.Range.Text,c.Author,c.Initial)) {
          var expected=WraCore.buildCitation(String(c.Scope.Text),parsedRefs.references);
          anchors.push({text:String(c.Scope.Text),super:Number(c.Scope.Font.Superscript),contentCorrect:!!expected&&WraCore.clean(c.Range.Text)===WraCore.clean(expected.text)});
        }
      }
      report.data.anchors=anchors;
      report.data.clear=WraHost.clear(app);
      report.data.remaining=Number(doc.Comments.Count);
      report.data.bodyUnchanged=String(doc.Content.Text)===before;
      report.data.passed=report.data.generate.added===4 && report.data.generate.grouped===${grouped ? 4 : 1} && report.data.repeat.skipped===4 && report.data.refresh.added===4 && report.data.refresh.removed===4 && report.data.clear.removed===4 && report.data.remaining===1 && report.data.bodyUnchanged;
      for(var j=0;j<anchors.length;j++) if(!WraCore.parseCitation(anchors[j].text)||anchors[j].super!==-1||!anchors[j].contentCorrect) report.data.passed=false;
    } catch(error) { report.data.error=String(error.message||error); report.data.passed=false; }
    finally { if(doc) doc.Close(0); if(previous) {try{previous.Activate();}catch(ignore){}} }
    var xhr=new XMLHttpRequest();xhr.open('POST','http://127.0.0.1:38991/report',true);
    xhr.setRequestHeader('Content-Type','application/json');xhr.send(JSON.stringify(report));return report.data.passed;
  })`;
} else throw new Error('Expected reload, diagnostic, audit, smoke or groupsmoke');
(async () => {
  const startInfo = { name: 'WpsReferenceAssistant', function: code, info: {}, showToFront: false, jsPluginsXml: '' };
  const transport = 'ksowebstartupwps://' + Buffer.from(JSON.stringify(startInfo), 'utf8').toString('base64');
  const response = await fetch('http://127.0.0.1:58890/wps/runParams', {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'http://127.0.0.1:38991' },
    body: transport, signal: AbortSignal.timeout(15000)
  });
  console.log('WPS_RPC', response.status, (await response.text()).slice(0, 1000));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
