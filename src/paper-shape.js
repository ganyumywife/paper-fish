(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PaperShape=api;})(globalThis,()=>{
  const shapes=['rounded','square','circle','heart','torn'];
  const normalize=value=>shapes.includes(value)?value:'rounded';
  const custom=value=>['circle','heart','torn'].includes(value);
  function geometry(value,width,height,zoom=1){
    if(Number.isFinite(zoom)&&zoom>0&&zoom!==1){
      const g=geometry(value,width/zoom,height/zoom),point=p=>({x:p.x*zoom,y:p.y*zoom});
      const points=g.points.map(point),text=Object.fromEntries(Object.entries(g.text).map(([k,v])=>[k,v*zoom]));
      return {...g,width,height,points,text,anchors:{left:point(g.anchors.left),right:point(g.anchors.right)},clip:custom(g.shape)?'polygon('+points.map(p=>`${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(',')+')':'none'};
    }
    const shape=normalize(value),w=Math.max(1,width),h=Math.max(1,height);let points=[],text={x:0,y:0,width:w,height:h};
    if(shape==='circle'){
      const r=Math.min(w,h)/2;
      for(let i=0;i<96;i++){const a=i*Math.PI/48;points.push({x:w/2+Math.cos(a)*r,y:r+Math.sin(a)*r});}
      const tw=r*1.44,th=r*1.36;text={x:(w-tw)/2,y:r-th/2,width:tw,height:th};
    }else if(shape==='heart'){
      const curves=[[[.5,.17],[.32,-.05],[.02,.01],[.02,.3]],[[.02,.3],[0,.60],[.12,.79],[.5,.99]],[[.5,.99],[.88,.79],[1,.60],[.98,.3]],[[.98,.3],[.98,.01],[.68,-.05],[.5,.17]]];
      for(const [a,b,c,d]of curves)for(let i=0;i<24;i++){const t=i/24,q=1-t;points.push({x:w*(q*q*q*a[0]+3*q*q*t*b[0]+3*q*t*t*c[0]+t*t*t*d[0]),y:h*(q*q*q*a[1]+3*q*q*t*b[1]+3*q*t*t*c[1]+t*t*t*d[1])});}
      const minY=Math.min(...points.map(p=>p.y));points=points.map(p=>({...p,y:p.y-minY}));text={x:w*.12,y:h*.19-minY,width:w*.76,height:h*.49};
    }else if(shape==='torn'){
      const inset=i=>3+Math.abs(Math.sin(i*7.13))*5;
      const n=28;
      for(let i=0;i<=n;i++)points.push({x:w*i/n,y:inset(i)});
      for(let i=1;i<=n;i++)points.push({x:w-inset(i+31),y:h*i/n});
      for(let i=n-1;i>=0;i--)points.push({x:w*i/n,y:h-inset(i+61)});
      for(let i=n-1;i>0;i--)points.push({x:inset(i+91),y:h*i/n});
      text={x:14,y:14,width:Math.max(1,w-28),height:Math.max(1,h-28)};
    }else points=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    const anchor=side=>points.reduce((a,b)=>((side==='left'?b.x:w-b.x)+.52*b.y)<((side==='left'?a.x:w-a.x)+.52*a.y)?b:a);
    return {shape,width:w,height:h,points,text,anchors:{left:anchor('left'),right:anchor('right')},clip:custom(shape)?'polygon('+points.map(p=>`${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(',')+')':'none'};
  }
  // Shared by the native shell and renderer: contour controls never require
  // compensating native moves when a note changes shape or switches sides.
  function edgesAt(g,y){
    const xs=[];for(let i=0,j=g.points.length-1;i<g.points.length;j=i++){
      const a=g.points[j],b=g.points[i];if((a.y>y)!==(b.y>y))xs.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));
    }
    return {left:Math.min(...xs),right:Math.max(...xs)};
  }
  function controls(g){
    const bottom=Math.max(...g.points.map(p=>p.y)),toolY=bottom*.43;
    const resizeY=bottom*(g.shape==='heart'?.72:g.shape==='circle'?.82:.97),edge=edgesAt(g,resizeY);
    const grip=(x,y,width=44,height=24)=>({x:x-width/2,y,width,height});
    const drag=g.shape==='heart'?[grip(g.width*.25,12),grip(g.width*.75,12)]:[g.shape==='circle'?grip(g.width/2,12):g.shape==='torn'?grip(g.width/2,8,44,16):grip(g.width/2,0,g.width-80)];
    return {tool:{...edgesAt(g,toolY),y:toolY},resize:{left:{x:edge.left+9,y:resizeY-5},right:{x:edge.right-9,y:resizeY-5}},drag};
  }
  function contains(g,x,y){let inside=false;for(let i=0,j=g.points.length-1;i<g.points.length;j=i++){const a=g.points[i],b=g.points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
  function trace(ctx,g,width,height){ctx.beginPath();if(!custom(g.shape)){ctx.roundRect(0,0,width,height,g.shape==='square'?2:[3,3,18,3]);return;}for(let i=0;i<g.points.length;i++){const p=g.points[i];i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.closePath();}
  return {shapes,normalize,custom,geometry,controls,contains,trace};
});
