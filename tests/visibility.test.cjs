const test=require('node:test'),assert=require('node:assert/strict');
const {createVisibility}=require('../src/visibility.cjs');
function window(display=1,shown=true){return {display,shown,isDestroyed:()=>false,isVisible(){return this.shown;},show(){this.shown=true;},showInactive(){this.shown=true;},hide(){this.shown=false;}};}
test('只避让目标屏幕，恢复自动隐藏的窗口且不恢复手动隐藏',()=>{
  const a=window(),b=window(2),hidden=window(1,false),v=createVisibility({displayOf:w=>w.display});
  for(const w of [a,b,hidden])v.attach(w);
  v.set({displayId:1,token:'full1'});assert(!a.shown);assert(b.shown);assert(!hidden.shown);
  a.hide();v.set(null);assert(!a.shown);assert(b.shown);assert(!hidden.shown);
  a.show();v.set({displayId:1,token:'full2'});assert(!a.shown);v.set(null);assert(a.shown);
});
test('手动显示可覆盖当前避让；跨屏移动与全屏目标改变重新判断',()=>{
  const a=window(),v=createVisibility({displayOf:w=>w.display});v.attach(a);
  v.set({displayId:1,token:'one'});a.show();assert(a.shown);v.set({displayId:1,token:'one'});assert(a.shown);
  v.set({displayId:1,token:'two'});assert(!a.shown);a.display=2;v.refresh();assert(a.shown);
  a.display=1;v.refresh();assert(!a.shown);v.set(null);assert(a.shown);
});
test('新窗口自动显示仍避让，暂停和恢复不重复执行',()=>{
  let paused=0,resumed=0;const a=window(1,false),v=createVisibility({displayOf:w=>w.display,onPause:()=>paused++,onResume:()=>resumed++});v.attach(a);
  v.set({displayId:1,token:'full'});a.autoShow=true;a.show();a.autoShow=false;
  assert(!a.shown);for(let i=0;i<10;i++)v.refresh();assert.equal(paused,1);
  v.set(null);assert(a.shown);assert.equal(resumed,1);
});
