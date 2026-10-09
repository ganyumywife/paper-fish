const test=require('node:test'),assert=require('node:assert/strict'),Toys=require('../src/toy-physics.js'),{stepPile}=require('../src/physics.cjs');
const bin={x:800,y:450,width:300,height:210},g=Toys.geometry(bin),ball=(x,y,vx=0,vy=0)=>({x:x-46,y:y-48,width:92,height:96,vx,vy,rest:false});
test('发射力度增加且拉伸受范围限制，纸团始终留在弹弓画布内',()=>{
  const v=Toys.launch(-999,999);assert(Math.hypot(v.dx,v.dy)<=Toys.SLING.maxPull+.001);assert(Math.hypot(v.vx,v.vy)>72*11*2);
  for(const dx of [-999,0,999])for(const dy of [-999,0,999]){const p=Toys.pull(dx,dy);assert(p.dx+Toys.SLING.x>=26);assert(p.dx+Toys.SLING.x<=Toys.SLING.width-26);assert(p.dy+Toys.SLING.y>=26);}
});
test('高速跨过桶口仍捕获，侧面撞击反弹，不以窗口空白命中',()=>{
  const entry=Toys.collision(ball(950,500),ball(950,630,0,1800),g);assert.equal(entry.type,'capture');
  const side=ball(960,620,1800,0),hit=Toys.collision(ball(810,620),side,g);assert.equal(hit.type,'bounce');Toys.bounce(side,hit);assert(side.vx<0);assert(!Toys.binContains(g,{x:805,y:455}));assert(Toys.binContains(g,{x:950,y:600}));
});
test('轻碰撞晃动、较强上部侧撞倾倒，回收内容越多越稳定',()=>{
  const hit={point:{x:890,y:560}};assert(!Toys.shouldTip(300,0,hit,g));assert(Toys.shouldTip(1700,0,hit,g));assert(!Toys.shouldTip(1100,0,hit,g,5));assert(!Toys.shouldTip(2000,0,hit,Toys.geometry(bin,75,1)));
});
test('正倒两种桶的世界轮廓落在透明窗口内，倾倒后开口和还原使用同一几何',()=>{
  for(const direction of [-1,1]){const shape=Toys.geometry(bin,direction*75,direction);for(const p of shape.body){assert(p.x>=bin.x&&p.x<=bin.x+bin.width);assert(p.y>=bin.y&&p.y<=bin.y+bin.height);}const center=shape.inside;assert(Toys.binContains(shape,center));}
});
test('瞄准计算与实际积分一致，纸团不会穿过屏幕上边界',()=>{
  const area={x:-1800,y:0,width:1800,height:1000},start={x:-1650,y:740},v=Toys.launch(-80,80),pred=Toys.predict(start,v,area);
  const b=ball(start.x,start.y,v.vx,v.vy);stepPile([b],area,1/120);assert(Math.abs(pred.points[1].x-(b.x+46))<.001);assert(Math.abs(pred.points[1].y-(b.y+48))<.001);assert(pred.points.some(p=>p.x-start.x>700));
  const high=ball(-1500,50,0,-2000);stepPile([high],area,.04);assert(high.y>=area.y);assert(high.vy>0);
});
test('物理子步中捕获后不参与地面或堆积碰撞',()=>{
  const area={x:0,y:0,width:1600,height:1000},b=ball(950,510,0,1900);let caught=0;
  stepPile([b],area,.04,{onMove:(body,before)=>{if(Toys.collision(before,body,g)?.type==='capture'){body.captured=true;body.rest=true;caught++;}}});assert.equal(caught,1);assert(b.captured);const y=b.y;stepPile([b],area,.04);assert.equal(b.y,y);
});
