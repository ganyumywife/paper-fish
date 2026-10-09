const test=require('node:test'),assert=require('node:assert/strict');
const {stepPile}=require('../src/physics.cjs');
const area={x:-1000,y:40,width:1000,height:700};
const ball=(x,y,vx=0,vy=0)=>({x,y,width:92,height:96,vx,vy,rest:false});
function settle(bodies){for(let i=0;i<900;i++)stepPile(bodies,area,1/60);assert(bodies.every(b=>b.rest),'应停止运动');}
test('纸团堆叠，移走底部后上层继续掉落',()=>{
  const bodies=[ball(-550,100),ball(-550,250),ball(-550,500)];settle(bodies);
  bodies.sort((a,b)=>a.y-b.y);for(let i=1;i<3;i++)assert(bodies[i].y-bodies[i-1].y>=95);
  assert.equal(bodies[2].y,636);bodies.pop();settle(bodies);assert.equal(Math.max(...bodies.map(b=>b.y)),636);
});
test('发射纸团碰撞后留在工作区且不会穿过其他纸团',()=>{
  const bodies=[ball(-550,636),ball(-950,480,720,100)];settle(bodies);
  for(const b of bodies){assert(b.x>=area.x&&b.x+b.width<=0);assert(b.y+b.height<=732);}
  const [a,b]=bodies;assert(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1);
});
test('静止堆积不会持续移动',()=>{const bodies=[ball(-300,120),ball(-300,636)];settle(bodies);const positions=bodies.map(b=>[b.x,b.y]);for(let i=0;i<300;i++)stepPile(bodies,area,.04);assert.deepEqual(bodies.map(b=>[b.x,b.y]),positions);});
