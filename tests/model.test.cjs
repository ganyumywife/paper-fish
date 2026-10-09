const test = require('node:test');
const assert = require('node:assert/strict');
const { initial, page, change, validate } = require('../src/model.cjs');
test('撕下最后一页自动补空白，保留原页内容与身份', () => { const s = initial(), p = s.pages[0]; p.text = '重要记录'; change(s, p.id, 'ball'); assert.equal(s.pages.find(x => x.id === p.id).text, '重要记录'); assert.equal(s.pages.filter(x => x.status === 'book').length, 1); });
test('还原到顶部不覆盖当前页', () => { const s = initial(), old = s.pages[0]; old.text = '旧内容'; change(s, old.id, 'ball'); const next = s.pages.find(x => x.status === 'book'); next.text = '新内容'; change(s, old.id, 'book'); assert.equal(s.pages[0].id, old.id); assert.equal(s.pages.find(x => x.id === next.id).text, '新内容'); assert.equal(new Set(s.pages.map(x => x.id)).size, 2); });
test('钉出、揉团、回收和恢复保留外观', () => { const s = initial(), p = s.pages[0]; p.color = '#aabbcc'; p.font = 'hand'; for (const state of ['pinned', 'ball', 'trash', 'book']) change(s, p.id, state); assert.equal(s.pages[0].color, '#aabbcc'); assert.equal(s.pages[0].font, 'hand'); });
test('拒绝未知页面、状态与损坏数据', () => { const s = initial(); assert.throws(() => change(s, 'missing', 'book')); assert.throws(() => change(s, s.pages[0].id, 'invalid')); s.pages.push(s.pages[0]); assert.throws(() => validate(s)); });
test('保存往返保留中文、多行与全部状态', () => { const s = initial(); for (const status of ['book','pinned','ball','trash']) { const p = page('中文\n☐ 待办'); p.status = status; s.pages.push(p); } assert.deepEqual(validate(JSON.parse(JSON.stringify(s))), s); });
