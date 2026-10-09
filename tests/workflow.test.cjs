const test=require('node:test'),assert=require('node:assert/strict');
const {split}=require('../src/pagination.js'),Shortcuts=require('../src/shortcuts.cjs');
test('拆页按段落优先且不丢字符、不拆开表情',()=>{
  for(const text of ['标题\n\n'+('中文与表情😀👨‍👩‍👧‍👦\r\n'.repeat(60)),' '.repeat(180)+'正文'+('\n'.repeat(170)),('连续长文😀'.repeat(300))]){
    const pages=split(text,160);assert.equal(pages.join(''),text);assert(pages.every(p=>p.trim()));
    for(const p of pages)assert(!/[\uD800-\uDBFF]$/.test(p));
  }
  const text='第一段'.repeat(12)+'\n\n'+'第二段'.repeat(100);assert(split(text,80)[0].endsWith('\n\n'));
});
test('快捷键校验统一别名，拒绝重复和无修饰键',()=>{
  assert.equal(Shortcuts.normalize('ctrl+alt+shift+n'),'CommandOrControl+Alt+Shift+N');
  assert.throws(()=>Shortcuts.normalize('Shift+A'));
  assert.throws(()=>Shortcuts.settings({toggle:'Ctrl+N',new:'Control+n'}),/重复/);
});
test('快捷键占用或保存失败恢复原注册，允许交换和停用',()=>{
  const occupied=new Map([['CommandOrControl+Alt+X',()=>{}]]),callbacks={toggle:()=>{},new:()=>{},search:()=>{}};
  const registry={register:(key,cb)=>{if(occupied.has(key))return false;occupied.set(key,cb);return true;},unregister:key=>occupied.delete(key)};
  const manager=Shortcuts.createManager(registry,callbacks);
  const before={toggle:'Ctrl+Alt+T',new:'Ctrl+Alt+N',search:''};manager.apply(before);
  assert.throws(()=>manager.apply({...before,new:'Ctrl+Alt+X'}),/占用/);
  assert.equal(occupied.get('CommandOrControl+Alt+T'),callbacks.toggle);assert.equal(occupied.get('CommandOrControl+Alt+N'),callbacks.new);
  assert.throws(()=>manager.apply({...before,new:'Ctrl+Alt+P'},()=>{throw Error('disk failed')}),/disk failed/);
  assert(!occupied.has('CommandOrControl+Alt+P'));assert.equal(occupied.get('CommandOrControl+Alt+N'),callbacks.new);
  manager.apply({toggle:'Ctrl+Alt+N',new:'Ctrl+Alt+T',search:''});assert.equal(occupied.get('CommandOrControl+Alt+N'),callbacks.toggle);
  manager.apply({toggle:'',new:'',search:''});assert.equal(occupied.size,1);
});
