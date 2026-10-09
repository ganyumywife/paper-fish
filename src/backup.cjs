const PaperShape=require('./paper-shape.js');
const RichText = require('./rich-text.js');
const { randomUUID } = require('node:crypto');
const { validate, initial } = require('./model.cjs');
function exportBackup(state) {
  return { format: 'paper-desk-backup', version: 1, exportedAt: new Date().toISOString(), pages: structuredClone(state.pages) };
}
function importBackup(state, backup) {
  if (backup?.format !== 'paper-desk-backup' || backup.version !== 1 || !Array.isArray(backup.pages) || backup.pages.length > 10000) throw Error('不是有效的纸想摸鱼备份文件');
  validate({ ...initial(), pages: backup.pages });
  const imported = backup.pages.map(p => ({
    id: randomUUID(), text: p.text, ...(p.rich?{rich:RichText.normalize(p.rich)}:{}), status: p.status, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#f7edc8',
    font: p.font === 'hand' ? 'hand' : 'print', size: Number.isFinite(p.size) ? Math.max(12,Math.min(40,p.size)) : 20,
    shape: PaperShape.normalize(p.shape), texture:['plain','lined','grid'].includes(p.texture)?p.texture:'plain', created: Number.isFinite(p.created) ? p.created : Date.now(), updated: Date.now(), ...(Number.isFinite(p.tornAt)?{tornAt:p.tornAt}:{}), ...(p.paperSize&&Number.isFinite(p.paperSize.width)&&Number.isFinite(p.paperSize.height)?{paperSize:{width:Math.max(100,Math.min(2000,p.paperSize.width)),height:Math.max(100,Math.min(2000,p.paperSize.height))}}:{}),
    bold: p.bold === true, align: ['left','center','right'].includes(p.align) ? p.align : 'left', ink: /^#[0-9a-f]{6}$/i.test(p.ink) ? p.ink : '#454536'
  }));
  return { ...state, pages: [...imported,...state.pages] };
}
module.exports = { exportBackup, importBackup };
