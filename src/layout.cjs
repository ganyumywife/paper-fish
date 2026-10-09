const { clampBounds } = require('./desktop.cjs');
const PaperShape = require('./paper-shape.js');
function chooseSide(paper, area, preference='auto') {
  const left=paper.x-area.x,right=area.x+area.width-paper.x-paper.width;
  if(preference==='left'&&left>=44)return 'left';
  if(preference==='right'&&right>=44)return 'right';
  return left>=right?'left':'right';
}
function noteLayout(paper, area, { side='auto',shape='rounded',zoom=1,base }={}) {
  let p=clampBounds({...paper,width:Math.min(paper.width,Math.max(320,area.width-44))},area);
  // Reserve both rails: switching sides must not move the native origin and
  // then compensate in the renderer (those updates cannot be atomic).
  // Unused transparent space may extend offscreen; constrain visible content.
  const chosen=chooseSide(p,area,side),gutter=Math.min(252,Math.max(44,area.width-320));
  p.width=Math.min(p.width,area.width-gutter);
  if(chosen==='left')p.x=Math.max(area.x+gutter,p.x);else p.x=Math.min(area.x+area.width-p.width-gutter,p.x);
  const bounds={x:p.x-gutter,y:p.y,width:p.width+gutter*2,height:p.height};
  const paperX=gutter;
  let buttonX=paperX+(chosen==='left'?-38:p.width+4),buttonY=Math.max(42,Math.min(p.height-76,p.height*.44));
  if(PaperShape.custom(shape)){
    const {tool}=PaperShape.controls(PaperShape.geometry(shape,p.width-24,p.height-78,zoom));
    buttonX=paperX+12+tool[chosen]+(chosen==='left'?-44:8);buttonY=56+tool.y-18;
  }
  return {paper:p,bounds,side:chosen,paperX,gutter,buttonX,buttonY,shape:PaperShape.normalize(shape),zoom,base:base||{width:p.width-24,height:p.height-78}};
}
function panelLayout(paper,area){
  const gap=10,width=Math.min(410,area.width),height=Math.min(660,area.height-16);
  const left=paper.x-area.x,right=area.x+area.width-paper.x-paper.width;
  if(Math.max(left,right)>=300+gap){const side=left>=right?'left':'right',w=Math.min(width,(side==='left'?left:right)-gap);return clampBounds({x:side==='left'?paper.x-gap-w:paper.x+paper.width+gap,y:paper.y,width:w,height},area);}
  const above=paper.y-area.y,below=area.y+area.height-paper.y-paper.height;
  if(Math.max(above,below)>=300+gap){const h=Math.min(height,Math.max(above,below)-gap);return clampBounds({x:paper.x,y:above>=below?paper.y-gap-h:paper.y+paper.height+gap,width,height:h},area);}
  return clampBounds({x:left>=right?paper.x-width-gap:paper.x+paper.width+gap,y:paper.y,width,height},area);
}
function resizePaper(start,dx,dy,side,keepRatio,area,dockSide=chooseSide(start,area)){
  const right=start.x+start.width;
  let width=Math.max(320,start.width+(side==='left'?-dx:dx)),height=Math.max(360,start.height+dy);
  if(keepRatio){const dw=(side==='left'?-dx:dx)/start.width,dh=dy/start.height,factor=Math.max(1+(Math.abs(dw)>Math.abs(dh)?dw:dh),320/start.width,360/start.height);width=start.width*factor;height=start.height*factor;}
  const gutter=Math.min(252,Math.max(44,area.width-320));
  const maxWidth=Math.min(area.width-gutter,side==='left'?right-area.x-(dockSide==='left'?gutter:0):area.x+area.width-start.x-(dockSide==='right'?gutter:0)),maxHeight=area.y+area.height-start.y;
  if(keepRatio){const scale=Math.min(1,maxWidth/width,maxHeight/height);width*=scale;height*=scale;}else{width=Math.min(width,maxWidth);height=Math.min(height,maxHeight);}
  return {x:Math.round(side==='left'?right-width:start.x),y:start.y,width:Math.round(width),height:Math.round(height)};
}
// The logical sheet is stable while its desktop footprint changes. Keeping it
// separate from rounded native bounds prevents wrapping drift after many zooms.
function zoomPaper(start,base,requested,area,side='right'){
  const gutter=Math.min(252,Math.max(44,area.width-320));
  const minimum=Math.max(.5,(196-24)/base.width,(180-78)/base.height);
  const maximum=Math.min(2.5,(area.width-gutter-24)/base.width,(area.height-78)/base.height);
  const zoom=Math.max(.01,Math.min(maximum,Math.max(minimum,requested)));
  const width=Math.round(24+base.width*zoom),height=Math.round(78+base.height*zoom);
  return {zoom,paper:clampBounds({x:side==='left'?start.x+start.width-width:start.x,y:start.y,width,height},area)};
}
module.exports={chooseSide,noteLayout,panelLayout,resizePaper,zoomPaper};
