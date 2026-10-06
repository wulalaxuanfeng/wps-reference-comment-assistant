(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
    else root.WraHost = factory(root.WraCore);
}(typeof window !== 'undefined' ? window : this, function (core) {
    'use strict';
    var LIMIT = 20000;

    function owned(comment) {
        if (core.isOwned(comment.Range.Text)) return true;
        try { return core.isOwned(comment.Range.Text, comment.Author, comment.Initial); }
        catch (ignore) { return false; }
    }

    function hasReplies(comment) {
        try { return Number(comment.Replies.Count) > 0; }
        catch (ignore) { return false; }
    }

    function readOwned(doc) {
        var list = [], comments = doc.Comments;
        for (var i = 1; i <= Number(comments.Count); i++) {
            var comment = comments.Item(i);
            if (owned(comment)) {
                var scope = comment.Scope;
                list.push({ comment: comment, start: Number(scope.Start), end: Number(scope.End),
                    text: String(comment.Range.Text), hasReplies: hasReplies(comment) });
            }
        }
        return list;
    }

    function findCitations(doc, start, end, references) {
        var result = [], missing = Object.create(null), cursor = start, total = 0, grouped = 0;
        while (cursor < end) {
            var range = doc.Range(cursor, end), find = range.Find;
            find.ClearFormatting();
            // WPS 原生 Find 返回文档坐标，避免把 JS 字符串偏移当作域/表格的 Range 坐标。
            var found = find.Execute('\\[[0-9,，–— \\-]@\\]', false, false, true, false, false, true, 0, false);
            if (!found) break;
            var rangeStart = Number(range.Start), rangeEnd = Number(range.End);
            if (rangeStart < cursor || rangeEnd <= rangeStart || rangeEnd > end) {
                throw new Error('WPS 返回的引用位置不在正文范围内，已停止运行。');
            }
            var citation = core.buildCitation(String(range.Text), references);
            // 保留 Find 返回的原生范围，不再用数值坐标重新构造锚点。
            // Duplicate 会随 WPS 文档中的批注引用标记变化一起更新。
            if (citation) {
                for (var m = 0; m < citation.missing.length; m++) missing[citation.missing[m]] = true;
                if (citation.text) {
                    result.push({ start: rangeStart, end: rangeEnd, range: range.Duplicate,
                        ids: citation.ids, reference: citation.text });
                    if (citation.ids.length > 1) grouped++;
                }
            }
            cursor = rangeEnd;
            if (++total > LIMIT) throw new Error('引用数量超过 20000 处，请缩小处理范围。');
        }
        return { citations: result, missing: Object.keys(missing), total: total, grouped: grouped };
    }

    function prepare(app) {
        if (Number(app.Documents.Count) < 1) throw new Error('请先打开论文文档。');
        var doc = app.ActiveDocument, selection = app.Selection.Range;
        if (Number(selection.StoryType) !== 1) throw new Error('请在正文中选择参考文献列表，不要选择页眉、脚注或批注。');
        var start = Number(selection.Start), end = Number(selection.End);
        if (!(end > start)) throw new Error('请先用鼠标选中：从第一条 [1] 开始，到最后一条文献末尾的完整列表，然后再次点击按钮。');
        if (doc.ReadOnly) throw new Error('当前文档只读，不能添加或删除批注。');
        var parsed = core.parseReferences(selection.Text);
        var scan = findCitations(doc, Number(doc.Content.Start), start, parsed.references);
        if (!scan.citations.length) throw new Error('选区之前的正文中没有找到能对应文献列表的引用。未修改原有批注。');
        return { doc: doc, start: start, end: end, ids: parsed.ids, scan: scan, old: readOwned(doc) };
    }

    function removeItems(items) {
        var removed = 0;
        // 使用稳定的 Comment 对象，逆序删除；不调用 DeleteAllComments。
        for (var i = items.length - 1; i >= 0; i--) {
            if (owned(items[i].comment) && !hasReplies(items[i].comment)) {
                items[i].comment.Delete();
                removed++;
            }
        }
        return removed;
    }

    function run(app, mode) {
        var plan = prepare(app), existing = Object.create(null), protectedKeys = Object.create(null), created = [], skipped = 0, retained = 0;
        for (var i = 0; i < plan.old.length; i++) {
            existing[core.rangeKey(plan.old[i].start, plan.old[i].end)] = true;
            if (plan.old[i].hasReplies) {
                protectedKeys[core.rangeKey(plan.old[i].start, plan.old[i].end)] = true;
                retained++;
            }
        }
        // 刷新先添加全部新批注；若添加失败，回滚本次新批注，保留旧批注。
        try {
            // WPS 批注引用标记可能改变后续文档坐标，从末尾向前处理避免锚点漂移。
            for (var j = plan.scan.citations.length - 1; j >= 0; j--) {
                var item = plan.scan.citations[j];
                if (mode !== 'refresh' && existing[core.rangeKey(item.start, item.end)]) { skipped++; continue; }
                if (mode === 'refresh' && protectedKeys[core.rangeKey(item.start, item.end)]) { skipped++; continue; }
                var range = item.range.Duplicate;
                var text = String(range.Text);
                var currentIds = core.parseCitation(text);
                if (!currentIds || currentIds.join(',') !== item.ids.join(',')) {
                    throw new Error('引用锚点校验失败：[' + item.ids.join(',') + ']，读取到“' + text.slice(0, 30) + '”。请确认正在使用 v' + core.version + '。');
                }
                var comment = plan.doc.Comments.Add(range, core.commentText(item.reference));
                created.push({ comment: comment });
                // 能可靠读回作者及缩写时，移除可见标识；不支持则保留内容标识。
                try {
                    comment.Author = core.author;
                    comment.Initial = core.initial;
                    if (comment.Author === core.author && comment.Initial === core.initial) {
                        comment.Range.Text = item.reference;
                    }
                } catch (ignore) {}
            }
        } catch (error) {
            try { removeItems(created); }
            catch (rollbackError) { throw new Error(error.message + '\n本次新批注未能全部回滚，可用“清除文献批注”清理。旧批注未删除。'); }
            throw new Error(error.message + '\n本次新批注已回滚，旧批注未删除。');
        }
        var removed = 0;
        if (mode === 'refresh') {
            try { removed = removeItems(plan.old); }
            catch (deleteError) { throw new Error('新批注已生成，但部分旧批注未能清理。可重新刷新。原因：' + deleteError.message); }
        }
        return { references: plan.ids.length, added: created.length, skipped: skipped,
            removed: removed, retained: retained, missing: plan.scan.missing, total: plan.scan.total,
            grouped: plan.scan.grouped };
    }

    function clear(app) {
        if (Number(app.Documents.Count) < 1) throw new Error('请先打开论文文档。');
        var doc = app.ActiveDocument;
        if (doc.ReadOnly) throw new Error('当前文档只读，不能清除批注。');
        var items = readOwned(doc), removed = removeItems(items);
        return { removed: removed, retained: items.length - removed };
    }

    return { run: run, clear: clear, prepare: prepare, readOwned: readOwned, findCitations: findCitations };
}));
