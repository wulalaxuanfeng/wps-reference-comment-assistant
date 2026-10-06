'use strict';
const fs = require('node:fs');
const path = require('node:path');
function rtf(text) {
  let result = '';
  for (const character of text.split('')) {
    const n = character.charCodeAt(0);
    if (n > 127) result += '\\u' + (n > 32767 ? n - 65536 : n) + '?';
    else if ('\\{}'.includes(character)) result += '\\' + character;
    else result += character;
  }
  return result;
}
const lines = [
  rtf('参考文献助手测试文档') + '\\par',
  rtf('这份文档用于测试生成、重复生成、刷新和清除。') + '\\par',
  rtf('已有研究采用该方法') + '{\\super [1]}' + rtf('。另一个结果见') + '{\\super [12]}' + rtf('。再次引用') + '{\\super [1]}' + rtf('。') + '\\par',
  rtf('未知编号') + '{\\super [999]}' + rtf('应跳过；组合引用') + '{\\super [1,12]}' + rtf('会生成一条包含两篇文献的批注。') + '\\par',
  rtf('你可以先在这段文字上手动添加一条“导师批注”，再验证清除后它仍然保留。') + '\\par',
  rtf('参考文献') + '\\par',
  rtf('[1] 张三, 李四. 参考文献助手示例研究[J]. 示例期刊, 2026, 1(1): 1-10.') + '\\par',
  rtf('[12] Wang X, Li Y. A long reference title that continues') + '\\line ' + rtf('on a manually wrapped line[J]. Example Journal, 2026, 2(1): 20-30.') + '\\par',
  rtf('附录（不要选中这一段）') + '\\par',
  rtf('这里的 [1] 不应添加批注，因为它位于选中文献区域之后。') + '\\par'
];
const target = path.resolve(__dirname, '../examples/测试论文.rtf');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, '{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0 Arial;}}\\uc1\\f0\\fs24\n' + lines.join('\n') + '\n}', 'ascii');
console.log(target);
const groups = ['[23,26]', '[27-29]', '[38,42-44]', '[45,46]'];
const groupLines = [rtf('组合引用测试文档') + '\\par'];
for (const group of groups) groupLines.push(rtf('研究结果见') + '{\\super ' + group + '}' + rtf('。') + '\\par');
groupLines.push(rtf('参考文献') + '\\par');
for (let id = 1; id <= 50; id++) groupLines.push(rtf('['+id+'] 作者'+id+'. 文献'+id+'的完整题名[J]. 示例期刊, 2026.') + '\\par');
const groupTarget = path.resolve(__dirname, '../examples/组合引用测试.rtf');
fs.writeFileSync(groupTarget, '{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0 Arial;}}\\uc1\\f0\\fs24\n' + groupLines.join('\n') + '\n}', 'ascii');
console.log(groupTarget);
