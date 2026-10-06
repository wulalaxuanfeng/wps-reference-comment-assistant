(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WraCore = api;
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var MARKER = '[REF_COMMENT:WPS_REFERENCE_ASSISTANT_V1]';
    var AUTHOR = '参考文献助手';
    var INITIAL = 'WRA-V1-74F0';
    var VERSION = '0.1.2';

    function parseCitation(text) {
        var match = /^\[\s*([0-9]+(?:\s*[-\u2013\u2014]\s*[0-9]+)?(?:\s*[,\uFF0C]\s*[0-9]+(?:\s*[-\u2013\u2014]\s*[0-9]+)?)*)\s*\]$/.exec(String(text));
        if (!match) return null;
        var parts = match[1].split(/[,\uFF0C]/), ids = [], seen = Object.create(null);
        for (var i = 0; i < parts.length; i++) {
            var bounds = parts[i].split(/[-\u2013\u2014]/);
            var start = Number(bounds[0]), end = bounds.length > 1 ? Number(bounds[1]) : start;
            if (start < 1 || end < start || end > 999999 || end - start > 999) return null;
            for (var id = start; id <= end; id++) {
                if (!seen[id]) { ids.push(id); seen[id] = true; }
                if (ids.length > 1000) return null;
            }
        }
        return ids;
    }

    function buildCitation(text, references) {
        var ids = parseCitation(text);
        if (!ids) return null;
        var found = [], missing = [];
        for (var i = 0; i < ids.length; i++) {
            if (references[ids[i]]) found.push(references[ids[i]]);
            else missing.push(ids[i]);
        }
        var content = found.join('\n\n');
        if (found.length && missing.length) content += '\n\n未找到对应文献：[' + missing.join(',') + ']';
        return { ids: ids, text: content, missing: missing };
    }

    function clean(text) {
        return String(text).replace(/\r\n?/g, '\n').replace(/[\v\u0007]/g, '\n')
            .replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
    }

    function parseReferences(text) {
        var source = clean(text), starts = [], match;
        // 条目必须从段落/手动换行的开头开始，文献内的 [数字] 不切分条目。
        var pattern = /^[ \t\u3000]*\[([0-9]+)\][ \t\u3000]*/gm;
        while ((match = pattern.exec(source))) {
            var id = Number(match[1]);
            if (!isFinite(id) || id < 1 || Math.floor(id) !== id || id > 999999) {
                throw new Error('参考文献编号无效：' + match[0]);
            }
            starts.push({ id: id, start: match.index, content: pattern.lastIndex });
        }
        if (!starts.length) throw new Error('选区中没有找到以 [数字] 开头的参考文献。请从第一条文献开始选中完整列表。');
        var prefix = clean(source.slice(0, starts[0].start));
        if (prefix && !/^(参考文献|references)$/i.test(prefix)) {
            throw new Error('第一条文献之前还选中了其他文字。请仅选择参考文献列表，可以包含“参考文献”标题。');
        }
        var references = Object.create(null), ids = [];
        for (var i = 0; i < starts.length; i++) {
            var item = starts[i];
            if (references[item.id]) throw new Error('选区内有重复的文献编号 [' + item.id + ']，未修改任何批注。');
            var end = i + 1 < starts.length ? starts[i + 1].start : source.length;
            var content = clean(source.slice(item.content, end));
            if (!content) throw new Error('参考文献 [' + item.id + '] 没有内容，请重新选择完整列表。');
            references[item.id] = '[' + item.id + '] ' + content;
            ids.push(item.id);
        }
        return { references: references, ids: ids };
    }

    function isOwned(text, author, initial) {
        var value = String(text || '').replace(/\r\n?/g, '\n');
        return value.indexOf(MARKER + '\n') === 0 || (author === AUTHOR && initial === INITIAL);
    }

    function commentText(reference) { return MARKER + '\n' + reference; }
    function rangeKey(start, end) { return String(start) + ':' + String(end); }

    return { parseReferences: parseReferences, parseCitation: parseCitation, buildCitation: buildCitation,
        version: VERSION, clean: clean, marker: MARKER,
        isOwned: isOwned, commentText: commentText, rangeKey: rangeKey, author: AUTHOR, initial: INITIAL };
}));
