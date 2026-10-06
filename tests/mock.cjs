'use strict';
function createApp(text, selectionStart, selectionEnd = text.length, initialComments = []) {
  const state = { source: text, comments: [], addCalls: 0, failAddAfter: Infinity, writes: 0 };
  function makeRange(start, end) {
    const range = { Start: start, End: end, StoryType: 1 };
    Object.defineProperty(range, 'Duplicate', { get() { return makeRange(range.Start, range.End); } });
    Object.defineProperty(range, 'Text', {
      get() { return state.source.slice(range.Start, range.End); },
      set() { state.writes++; throw new Error('禁止写入正文'); }
    });
    for (const property of ['Font', 'FormattedText', 'Bold', 'Style']) {
      Object.defineProperty(range, property, { set() { state.writes++; throw new Error('禁止修改正文格式'); } });
    }
    range.Find = {
      ClearFormatting() {},
      Execute(pattern, matchCase, whole, wildcard, sounds, allForms, forward, wrap, format) {
        if (pattern !== '\\[[0-9,，–— \\-]@\\]' || !wildcard || wrap !== 0 || format !== false) throw new Error('查找参数不正确');
        const match = /\[[0-9,，–— -]+\]/.exec(state.source.slice(range.Start, range.End));
        if (!match) return false;
        range.Start += match.index;
        range.End = range.Start + match[0].length;
        return true;
      }
    };
    return range;
  }
  function makeComment(start, end, text, author = '用户', initial = 'USER', replies = 0) {
    const comment = { Range: { Text: text }, Scope: makeRange(start, end), Author: author, Initial: initial,
      Replies: { Count: replies }, Delete() { if (comment.failDelete) throw new Error('删除失败'); state.comments.splice(state.comments.indexOf(comment), 1); } };
    state.comments.push(comment);
    return comment;
  }
  for (const comment of initialComments) makeComment(...comment);
  const doc = { ReadOnly: false, Content: makeRange(0, text.length), Range: makeRange,
    Comments: { get Count() { return state.comments.length; }, Item(index) { return state.comments[index - 1]; },
      Add(range, text) { if (state.addCalls++ >= state.failAddAfter) throw new Error('添加失败'); return makeComment(range.Start, range.End, text); } } };
  const app = { Documents: { Count: 1 }, ActiveDocument: doc, Selection: { Range: makeRange(selectionStart, selectionEnd) } };
  return { app, state, makeComment, doc, select(start, end = state.source.length) { app.Selection.Range = makeRange(start, end); } };
}
module.exports = { createApp };
