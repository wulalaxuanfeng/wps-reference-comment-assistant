'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const host = require('../js/host.js');
const { createApp } = require('./mock.cjs');
const body = '研究[1]；再次[1]；域\u0013CITATION DATA\u0014[12]\u0015；未知[999]；无效[1,,12]。\r参考文献\r';
const bibliography = '[1] 张三. 测试[J]. 2026.\r[12] Wang. Long title\vcontinued[J]. 2026.\r';
function fixture() { return createApp(body + bibliography, body.length); }

test('跨段落和手动换行完整读取文献，条目内部编号不截断', () => {
  const result = core.parseReferences('参考文献\r\n[1] 文献内容中有[25]。\r续段内容\r[12] 第二条\v最后一行。');
  assert.equal(result.references[1], '[1] 文献内容中有[25]。\n续段内容');
  assert.equal(result.references[12], '[12] 第二条\n最后一行。');
});
test('重复编号、空条目、错误选择均拒绝', () => {
  for (const text of ['[1] A\r[1] B', '[1]\r[2] B', '正文引用[1]\r[1] A', '没有文献']) assert.throws(() => core.parseReferences(text));
});
test('每处单编号都生成，上标/域无需写入，忽略无效编号和未知编号', () => {
  const f = fixture(), before = f.state.source;
  const result = host.run(f.app, 'generate');
  assert.equal(result.added, 3);
  assert.deepEqual(result.missing, ['999']);
  assert.equal(f.state.comments.filter(c => c.Range.Text.startsWith('[1]')).length, 2);
  assert.equal(f.state.comments.find(c => c.Range.Text.startsWith('[12]')).Range.Text, '[12] Wang. Long title\ncontinued[J]. 2026.');
  assert.equal(f.state.source, before);
  assert.equal(f.state.writes, 0);
  assert.ok(f.state.comments.every(c => c.Scope.End <= body.length));
});
test('组合、连续、混合、空格和常见分隔符均正确展开，重复编号去重', () => {
  for (const [text, ids] of [
    ['[23,26]', [23,26]], ['[27-29]', [27,28,29]], ['[38,42-44]', [38,42,43,44]],
    ['[45,46]', [45,46]], ['[ 1, 3–5 ]', [1,3,4,5]], ['[1，2—3]', [1,2,3]],
    ['[1,1-3,2]', [1,2,3]]
  ]) assert.deepEqual(core.parseCitation(text), ids, text);
  for (const invalid of ['[3-1]', '[0]', '[1,,2]', '[1-100000]', '[J]', '[1,]', '[1--3]']) {
    assert.equal(core.parseCitation(invalid), null, invalid);
  }
});
test('整组只添加一条批注，每条对应文献都完整列出；刷新和清除兼容', () => {
  const source = 'A[23,26]B[27-29]C[38,42-44]D[45,46]\r';
  const refs = Array.from({length:50}, (_,i) => '['+(i+1)+'] 文献'+(i+1)).join('\r');
  const f = createApp(source + refs, source.length);
  const result = host.run(f.app, 'generate');
  assert.equal(result.added, 4); assert.equal(result.grouped, 4);
  for (const comment of f.state.comments) {
    const ids = core.parseCitation(comment.Scope.Text);
    assert.ok(ids.length > 1);
    assert.equal(comment.Range.Text, ids.map(id => '['+id+'] 文献'+id).join('\n\n'));
  }
  assert.equal(host.run(f.app, 'generate').skipped, 4);
  assert.equal(host.run(f.app, 'refresh').removed, 4);
  assert.equal(host.clear(f.app).removed, 4);
  assert.equal(f.state.writes, 0);
});
test('组合引用中部分编号不存在时列出已知文献并明确提示缺失编号', () => {
  const source = '研究[1,999]。\r';
  const f = createApp(source + '[1] 文献一', source.length);
  const result = host.run(f.app, 'generate');
  assert.equal(result.added, 1); assert.deepEqual(result.missing, ['999']);
  assert.equal(f.state.comments[0].Range.Text, '[1] 文献一\n\n未找到对应文献：[999]');
});
test('重复生成不重复添加，导师同位置批注保留', () => {
  const f = fixture(), mentor = f.makeComment(2, 5, '导师：请补充说明');
  host.run(f.app, 'generate');
  const again = host.run(f.app, 'generate');
  assert.equal(again.added, 0); assert.equal(again.skipped, 3);
  assert.equal(f.state.comments.length, 4); assert.ok(f.state.comments.includes(mentor));
});
test('刷新替换插件批注，保留用户批注和所有正文', () => {
  const f = fixture(), mentor = f.makeComment(0, 2, '导师批注');
  host.run(f.app, 'generate');
  const old = f.state.comments.filter(c => c !== mentor);
  f.state.source = body + bibliography.replace('测试', '更新');
  const result = host.run(f.app, 'refresh');
  assert.equal(result.added, 3); assert.equal(result.removed, 3);
  assert.ok(f.state.comments.includes(mentor));
  assert.ok(old.every(c => !f.state.comments.includes(c)));
  assert.equal(f.state.comments.find(c => c.Range.Text.startsWith('[1]')).Range.Text, '[1] 张三. 更新[J]. 2026.');
  assert.equal(f.state.writes, 0);
});
test('读取失败时刷新不删除旧批注', () => {
  const f = fixture(); host.run(f.app, 'generate');
  const old = f.state.comments.slice(); f.select(0, 0);
  assert.throws(() => host.run(f.app, 'refresh'), /先用鼠标选中/);
  assert.deepEqual(f.state.comments, old);
});
test('刷新添加到一半失败，回滚新批注，所有旧批注保留', () => {
  const f = fixture(); host.run(f.app, 'generate');
  const old = f.state.comments.slice(); f.state.failAddAfter = f.state.addCalls + 1;
  assert.throws(() => host.run(f.app, 'refresh'), /已回滚/);
  assert.deepEqual(f.state.comments, old);
});
test('保存重开后的持久化作者与缩写可以识别，只清除插件批注', () => {
  const f = fixture(); host.run(f.app, 'generate');
  const saved = f.state.comments.map(c => [c.Scope.Start, c.Scope.End, c.Range.Text, c.Author, c.Initial]);
  saved.push([0, 2, '普通批注提到了 ' + core.marker]);
  const reopened = createApp(f.state.source, 0, 0, saved);
  assert.equal(host.clear(reopened.app).removed, 3);
  assert.equal(reopened.state.comments.length, 1);
});
test('不能设置元数据的宿主保留内容标识，仍然能清除', () => {
  const f = fixture(), original = f.doc.Comments.Add;
  f.doc.Comments.Add = (range, text) => {
    const comment = original(range, text);
    Object.defineProperty(comment, 'Author', { get() { return '用户'; }, set() { throw new Error('不支持作者'); } });
    return comment;
  };
  host.run(f.app, 'generate');
  assert.ok(f.state.comments.every(c => core.isOwned(c.Range.Text)));
  assert.equal(host.clear(f.app).removed, 3);
});
test('带导师回复的插件批注保留，刷新不删除回复', () => {
  const f = fixture(); host.run(f.app, 'generate');
  const replied = f.state.comments[0]; replied.Replies.Count = 1;
  const refreshed = host.run(f.app, 'refresh');
  assert.equal(refreshed.retained, 1); assert.equal(refreshed.added, 2);
  const cleared = host.clear(f.app);
  assert.equal(cleared.removed, 2); assert.equal(cleared.retained, 1);
  assert.equal(f.state.comments[0], replied);
});
test('只读、页眉选区和不存在匹配引用时不修改文档', () => {
  const f = fixture(); f.doc.ReadOnly = true;
  assert.throws(() => host.run(f.app, 'generate'), /只读/);
  f.doc.ReadOnly = false; f.app.Selection.Range.StoryType = 5;
  assert.throws(() => host.run(f.app, 'generate'), /正文中选择/);
  const noCitations = createApp('正文\r[1] 文献', 3);
  assert.throws(() => host.run(noCitations.app, 'refresh'), /没有找到/);
  assert.equal(f.state.comments.length, 0);
});
test('查找越界或循环时终止，不添加任何批注', () => {
  const f = fixture(), original = f.doc.Range;
  f.doc.Range = (start, end) => {
    const range = original(start, end);
    range.Find.Execute = () => { range.Start = 0; range.End = 0; return true; };
    return range;
  };
  assert.throws(() => host.run(f.app, 'generate'), /不在正文范围内/);
  assert.equal(f.state.comments.length, 0);
});
test('WPS 添加批注导致后续坐标移动时，每个锚点仍是完整编号', () => {
  const f = fixture(), originalRange = f.doc.Range, originalAdd = f.doc.Comments.Add;
  const insertions = [];
  f.doc.Range = (start, end) => new Proxy(originalRange(start, end), {
    get(target, property) {
      if (property !== 'Text') return target[property];
      const shift = insertions.filter(position => position < target.Start).length;
      return f.state.source.slice(target.Start - shift, target.End - shift);
    }
  });
  f.doc.Comments.Add = (range, text) => {
    assert.match(range.Text, /^\[(1|12)\]$/);
    const comment = originalAdd(range, text);
    insertions.push(range.Start);
    return comment;
  };
  assert.equal(host.run(f.app, 'generate').added, 3);
});
test('Find 返回的原生 Range 可用而按数值重建失真时，直接使用原生锚点', () => {
  const f = fixture(), originalRange = f.doc.Range;
  f.doc.Range = (start, end) => {
    const range = originalRange(start, end);
    // 整段扫描正常；宿主对短范围重建返回错位文本，禁止依赖短 Range 的数值重建。
    if (end - start <= 4) return new Proxy(range, { get(target, property) {
      return property === 'Text' ? '错位文本' : target[property];
    } });
    return range;
  };
  assert.equal(host.run(f.app, 'generate').added, 3);
  assert.equal(host.run(f.app, 'generate').skipped, 3);
});
