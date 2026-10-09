const test=require('node:test'),assert=require('node:assert/strict');
const Shape=require('../src/paper-shape.js'),{initial,page,change}=require('../src/model.cjs'),{exportBackup,importBackup}=require('../src/backup.cjs');
test('整体缩放后的轮廓与文字区域按同一比例变化，撕边凹凸及揭纸点一致',()=>{
  for(const shape of Shape.shapes)for(const zoom of [.5,1.25,2.5]){
    const original=Shape.geometry(shape,346,392),scaled=Shape.geometry(shape,346*zoom,392*zoom,zoom);
    assert.deepEqual(scaled.points,original.points.map(p=>({x:p.x*zoom,y:p.y*zoom})));
    for(const side of ['left','right'])assert.deepEqual(scaled.anchors[side],{x:original.anchors[side].x*zoom,y:original.anchors[side].y*zoom});
    for(const k of ['x','y','width','height'])assert.equal(scaled.text[k],original.text[k]*zoom);
  }
});
test('异形纸的安全文字区域完全位于轮廓内，适配不同长宽',()=>{
  for(const shape of ['circle','heart','torn'])for(const [w,h]of [[296,282],[496,562],[296,700]]){
    const g=Shape.geometry(shape,w,h),b=g.text;
    for(let y=0;y<=10;y++)for(let x=0;x<=10;x++)assert(Shape.contains(g,b.x+b.width*x/10,b.y+b.height*y/10),`${shape}: 文字区域超出轮廓`);
    assert(g.points.every(p=>p.x>=0&&p.y>=0&&p.x<=w&&p.y<=h));
    assert(!Shape.contains(g,w-1,h-1));assert(Shape.contains(g,b.x+b.width/2,b.y+b.height/2));
  }
});
test('圆形保持正圆，撕边轮廓稳定，揭纸点在左右上缘',()=>{
  const g=Shape.geometry('circle',300,600);for(const p of g.points)assert(Math.abs(Math.hypot(p.x-150,p.y-150)-150)<.01);
  assert.deepEqual(Shape.geometry('torn',370,470),Shape.geometry('torn',370,470));
  for(const shape of ['circle','heart','torn']){const g=Shape.geometry(shape,300,400);assert(g.anchors.left.x<150);assert(g.anchors.right.x>150);assert(g.anchors.left.y<200&&g.anchors.right.y<200);}
});
test('异形纸的缩放手柄落在纸面内，宽窄尺寸下侧边工具都有有效锚点',()=>{
  for(const shape of ['circle','heart','torn'])for(const [w,h]of [[296,282],[496,562],[296,700],[700,282]]){
    const g=Shape.geometry(shape,w,h),c=Shape.controls(g);
    for(const p of Object.values(c.resize))assert(Shape.contains(g,p.x,p.y),shape+' 缩放入口应在纸面上');
    assert(Number.isFinite(c.tool.left)&&Number.isFinite(c.tool.right)&&c.tool.left<c.tool.right);
  }
});
test('五种纸张都有纸面移动入口，心形两个上圆弧均可移动',()=>{
  for(const shape of Shape.shapes)for(const [w,h]of [[296,282],[496,562],[296,700],[700,282]]){
    const g=Shape.geometry(shape,w,h),drag=Shape.controls(g).drag;
    assert.equal(drag.length,shape==='heart'?2:1);
    for(const p of drag)assert(Shape.contains(g,p.x+p.width/2,p.y+p.height/2),shape+' 移动入口应在纸面上');
  }
});
test('形状和纹理在默认新页、撕页恢复及备份中保留，兼容旧页',()=>{
  for(const shape of Shape.shapes){const s=initial(),p=s.pages[0];p.shape=shape;p.texture='grid';s.settings.defaultStyle={...p};change(s,p.id,'ball');change(s,p.id,'book');assert.equal(p.shape,shape);assert.equal(page('',s.settings.defaultStyle).shape,shape);const restored=importBackup(initial(),exportBackup(s)).pages[0];assert.equal(restored.shape,shape);assert.equal(restored.texture,'grid');}
  assert.equal(Shape.normalize('bad'),'rounded');assert.equal(page().shape,'rounded');
});
