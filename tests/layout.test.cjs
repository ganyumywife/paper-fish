const test=require('node:test'),assert=require('node:assert/strict');const{noteLayout,panelLayout,resizePaper,zoomPaper}=require('../src/layout.cjs');
const area={x:-1600,y:0,width:1600,height:1000};
test('侧边工具按屏幕余量换边，纸张尺寸保持不变',()=>{for(const [x,side] of [[-1600,'right'],[-400,'left']]){const paper={x,y:40,width:370,height:470};const closed=noteLayout(paper,area),open=noteLayout(paper,area,{open:true});assert.equal(closed.side,side);assert.equal(open.paper.width,370);assert.equal(open.paper.height,470);visibleWithin(open,area);}});
test('左下角固定右上角，Shift 保持比例且受屏幕约束',()=>{const start={x:-900,y:100,width:370,height:470};const r=resizePaper(start,-70,70,'left',true,area);assert.equal(r.x+r.width,start.x+start.width);assert.equal(r.y,start.y);assert(Math.abs(r.width/r.height-start.width/start.height)<.004);const limited=resizePaper(start,3000,3000,'right',true,area);assert(limited.y+limited.height<=1000);assert(limited.x+limited.width<=0);});
test('图片侧窗位于纸张外侧且适配负坐标显示器',()=>{const p={x:-650,y:100,width:370,height:470},r=panelLayout(p,area);assert(r.x+r.width<=p.x);assert(r.x>=area.x);assert(r.y+r.height<=1000);});
test('菜单显隐不改变窗口与按钮位置，覆盖窄屏及屏幕两端',()=>{
  for(const width of [640,960,1600])for(const side of ['auto','left','right'])for(const ratio of [0,.5,1]){
    const a={x:-width,y:0,width,height:900},p={x:Math.round(-width+(width-370)*ratio),y:70,width:370,height:470};
    const closed=noteLayout(p,a,{side,open:false}),opened=noteLayout(p,a,{side,open:true});
    assert.deepEqual(closed,opened);assert(opened.gutter>=200);visibleWithin(opened,a);
  }
});

function visibleWithin(l,a){const left=l.paper.x-(l.side==='left'?l.gutter:0),right=l.paper.x+l.paper.width+(l.side==='right'?l.gutter:0);assert(left>=a.x);assert(right<=a.x+a.width);assert.equal(l.bounds.x+l.paperX,l.paper.x);}
test('左右换边不改变原生窗口与纸面偏移，跨中线拖动只平移拖动距离',()=>{
  const p={x:-1000,y:70,width:370,height:470};
  const left=noteLayout(p,area,{side:'left'}),right=noteLayout(p,area,{side:'right'});
  assert.deepEqual(left.bounds,right.bounds);assert.equal(left.paperX,right.paperX);assert.deepEqual(left.paper,right.paper);
  let last;
  for(let x=-1200;x<=-700;x+=5){const l=noteLayout({...p,x},area);if(last){assert.equal(l.bounds.x-last.bounds.x,5);assert.equal(l.paperX,last.paperX);assert.equal(l.bounds.width,last.bounds.width);}last=l;}
});
test('异形纸工具跟随轮廓，换边不改变原生边界，比例缩放支持单轴缩小',()=>{
  const p={x:-1000,y:70,width:370,height:470};
  for(const shape of ['circle','heart','torn']){
    const left=noteLayout(p,area,{side:'left',shape}),right=noteLayout(p,area,{side:'right',shape});
    assert.deepEqual(left.bounds,right.bounds);assert.equal(left.paperX,right.paperX);assert.equal(left.buttonY,right.buttonY);
  }
  const smaller=resizePaper(p,0,-40,'right',true,area);
  assert(smaller.width<p.width&&smaller.height<p.height);assert(Math.abs(smaller.width/smaller.height-p.width/p.height)<.004);
});
test('整体缩放保留逻辑纸面，左下角固定右缘，反复恢复不会积累舍入误差',()=>{
  const start={x:-1000,y:80,width:370,height:470},base={width:346,height:392};
  const scaled=zoomPaper(start,base,1.35,area,'left');
  assert.equal(scaled.paper.x+scaled.paper.width,start.x+start.width);
  assert(Math.abs(scaled.paper.width-24-base.width*scaled.zoom)<.51);
  assert(Math.abs(scaled.paper.height-78-base.height*scaled.zoom)<.51);
  let bounds=start;
  for(let i=0;i<100;i++){bounds=zoomPaper(bounds,base,1.35,area).paper;bounds=zoomPaper(bounds,base,1,area).paper;}
  assert.deepEqual(bounds,start);
});
test('缩放受工作区与操作入口最小尺寸限制，支持负坐标副屏',()=>{
  for(const a of [area,{x:-640,y:-900,width:640,height:900}]){
    const start={x:a.x+100,y:a.y+100,width:370,height:470},base={width:346,height:392};
    for(const requested of [.0001,100]){
      const r=zoomPaper(start,base,requested,a),l=noteLayout(r.paper,a,{zoom:r.zoom,base});
      visibleWithin(l,a);assert(r.paper.height<=a.height);assert(r.paper.width>=196);assert(r.zoom>0);assert(l.paper.y>=a.y);
      assert.equal(l.base,base);
    }
  }
});
