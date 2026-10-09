const PaperShape=require('./paper-shape.js');
const RichText = require('./rich-text.js');
const { randomUUID } = require('node:crypto');
const statuses = ['book', 'pinned', 'ball', 'trash'];
function paperStyle(value={}) {
  if(!value||typeof value!=='object')value={};
  return {color:/^#[0-9a-f]{6}$/i.test(value.color||'')?value.color:'#f7edc8',font:value.font==='hand'?'hand':'print',size:Number.isFinite(value.size)?Math.max(12,Math.min(40,value.size)):20,shape:PaperShape.normalize(value.shape),bold:value.bold===true,align:['left','center','right'].includes(value.align)?value.align:'left',ink:/^#[0-9a-f]{6}$/i.test(value.ink||'')?value.ink:'#454536',texture:['plain','lined','grid'].includes(value.texture)?value.texture:'plain'};
}
function page(text = '',defaults={}) { return { id: randomUUID(), text, status: 'book', ...paperStyle(defaults), created: Date.now(), updated: Date.now() }; }
function initial() { return { version: 1, pages: [page()], settings: { base: 'https://api.openai.com/v1', model: '', motion: true }, windows: {} }; }
function validate(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.pages) || !s.settings || !s.windows) throw Error('数据格式不正确');
  const ids = new Set();
  for (const p of s.pages) {
    if (!p.id || ids.has(p.id) || !statuses.includes(p.status) || typeof p.text !== 'string') throw Error('页面数据损坏');
    if(p.rich!==undefined&&(!Array.isArray(p.rich)||RichText.text(RichText.normalize(p.rich))!==p.text))throw Error('富文本与正文不一致');
    ids.add(p.id);
  }
  return s;
}
function change(s, id, status) {
  if (!statuses.includes(status)) throw Error('未知页面状态');
  const p = s.pages.find(p => p.id === id);
  if (!p) throw Error('页面不存在');
  if(status==='ball'&&p.status!=='ball')p.tornAt=Date.now();
  p.status = status; p.updated = Date.now();
  if (status === 'book') s.pages = [p, ...s.pages.filter(x => x.id !== id)];
  if (!s.pages.some(p => p.status === 'book')) s.pages.push(page('',s.settings.defaultStyle));
  return p;
}
module.exports = { page, initial, validate, change, paperStyle };
