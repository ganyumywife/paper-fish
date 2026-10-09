(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.DesktopToys=api;})(globalThis,()=>{
  const GRAVITY=1800,SLING={width:260,height:310,x:130,y:120,maxPull:112,power:18},BIN={width:300,height:210,angle:75};
  const dot=(a,b)=>a.x*b.x+a.y*b.y,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),length=p=>Math.hypot(p.x,p.y);
  function pull(dx,dy){const f=Math.min(1,SLING.maxPull/Math.max(1,Math.hypot(dx,dy)));return {dx:Math.max(-104,Math.min(104,dx*f)),dy:Math.max(-94,dy*f)};}
  function launch(dx,dy){const p=pull(dx,dy);return {vx:-p.dx*SLING.power,vy:-p.dy*SLING.power,...p};}
  function advance(b,dt){b.vy+=GRAVITY*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;}
  function geometry(bounds,angle=0,direction=1){
    const pivot={x:direction<0?115:185,y:202},a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    const world=p=>({x:bounds.x+(pivot.x+(p.x-pivot.x)*c-(p.y-pivot.y)*s)*bounds.width/BIN.width,y:bounds.y+(pivot.y+(p.x-pivot.x)*s+(p.y-pivot.y)*c)*bounds.height/BIN.height});
    const body=[{x:90,y:105},{x:210,y:105},{x:185,y:202},{x:115,y:202}].map(world),mouth={a:body[0],b:body[1],center:world({x:150,y:105})},edge=sub(mouth.b,mouth.a),n={x:edge.y/length(edge),y:-edge.x/length(edge)};
    return {body,mouth,normal:n,inside:world({x:150,y:157}),pivot:world(pivot),angle,direction,bounds};
  }
  function contains(points,p){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
  function binContains(g,p){const e=sub(g.mouth.b,g.mouth.a),q=sub(p,g.mouth.center),along=dot(q,e)/length(e),across=dot(q,g.normal);return contains(g.body,p)||(along/(length(e)/2))**2+(across/(14*g.bounds.height/BIN.height))**2<=1;}
  function projection(p,a,b){const e=sub(b,a);return dot(sub(p,a),e)/dot(e,e);}
  // Sweep the paper's circle through every edge, so fast shots cannot tunnel
  // through the lip or basket between frames. The opening admits inward travel.
  function collision(previous,body,g){
    const r=30,from={x:previous.x+46,y:previous.y+48},to={x:body.x+46,y:body.y+48},travel=sub(to,from),normal=g.normal;
    const d0=dot(sub(from,g.mouth.a),normal),d1=dot(sub(to,g.mouth.a),normal);
    if(d0>=0&&d1<0){const t=d0/(d0-d1),p={x:from.x+travel.x*t,y:from.y+travel.y*t},u=projection(p,g.mouth.a,g.mouth.b);if(u>.22&&u<.78)return {type:'capture',point:p};}
    let best;
    const keep=(t,n,p)=>{if(t>=0&&t<=1&&dot(travel,n)<0&&(!best||t<best.t))best={type:'bounce',t,normal:n,point:p};};
    for(let i=0;i<4;i++){
      const a=g.body[i],b=g.body[(i+1)%4],e=sub(b,a),len=length(e),n={x:e.y/len,y:-e.x/len},start=dot(sub(from,a),n),speed=dot(travel,n);
      if(speed<0){const t=(r-start)/speed,p={x:from.x+travel.x*t,y:from.y+travel.y*t},u=projection(p,a,b);
        if(u>=0&&u<=1&&!(i===0&&u>.22&&u<.78&&d0>=0))keep(t,n,p);
      }
      const q=sub(from,a),A=dot(travel,travel),B=2*dot(q,travel),C=dot(q,q)-r*r,D=B*B-4*A*C;
      if(A>0&&D>=0){const t=(-B-Math.sqrt(D))/(2*A),p={x:from.x+travel.x*t,y:from.y+travel.y*t},v=sub(p,a),l=length(v);if(l)keep(t,{x:v.x/l,y:v.y/l},p);}
    }
    return best;
  }
  function bounce(body,hit){const vn=body.vx*hit.normal.x+body.vy*hit.normal.y;body.x=hit.point.x+hit.normal.x*1.5-46;body.y=hit.point.y+hit.normal.y*1.5-48;if(vn<0){body.vx=(body.vx-1.38*vn*hit.normal.x)*.94;body.vy=(body.vy-1.38*vn*hit.normal.y)*.94;}body.rest=false;}
  function shouldTip(vx,vy,hit,g,count=0){const leverage=Math.max(.25,Math.min(1,(g.pivot.y-hit.point.y)/Math.max(1,97*g.bounds.height/BIN.height)));return !g.angle&&Math.abs(vx)*leverage>850+Math.min(5,count)*65;}
  function predict(start,velocity,area,bin){
    const b={x:start.x-46,y:start.y-48,width:92,height:96,vx:velocity.vx,vy:velocity.vy},points=[start];let target=null,impactVelocity=null;
    for(let i=0;i<720;i++){
      const before={...b};advance(b,1/120);const hit=bin&&collision(before,b,bin);
      if(hit){points.push(hit.point);target=hit.type;impactVelocity={vx:b.vx,vy:b.vy};break;}
      if(b.x<area.x||b.x>area.x+area.width-92){b.x=Math.max(area.x,Math.min(area.x+area.width-92,b.x));b.vx*= -.35;}
      if(b.y<area.y){b.y=area.y;b.vy=Math.abs(b.vy)*.3;}
      if(b.y>=area.y+area.height-104){points.push({x:b.x+46,y:area.y+area.height-56});break;}
      if(i%3===0)points.push({x:b.x+46,y:b.y+48});
    }
    return {points,target,impactVelocity};
  }
  function slingContains(x,y,loaded,dx=0,dy=0){
    if(loaded&&Math.hypot(x-SLING.x-dx,y-SLING.y-dy)<27)return true;
    if(x>=108&&x<=152&&y>=194&&y<=305)return true;
    for(const [a,b]of [[{x:88,y:104},{x:130,y:202}],[{x:172,y:104},{x:130,y:202}],[{x:88,y:104},{x:SLING.x+dx,y:SLING.y+dy+10}],[{x:172,y:104},{x:SLING.x+dx,y:SLING.y+dy+10}]]){const t=Math.max(0,Math.min(1,projection({x,y},a,b)));if(Math.hypot(x-a.x-(b.x-a.x)*t,y-a.y-(b.y-a.y)*t)<13)return true;}
    return false;
  }
  return {GRAVITY,SLING,BIN,pull,launch,advance,geometry,contains,binContains,collision,bounce,shouldTip,predict,slingContains};
});
