const canvas=document.querySelector('#trajectory'),ctx=canvas.getContext('2d');
function resize(){const d=devicePixelRatio||1;canvas.width=innerWidth*d;canvas.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0);}resize();addEventListener('resize',resize);
let current,frame;
function draw(data){
  cancelAnimationFrame(frame);current=data;ctx.clearRect(0,0,innerWidth,innerHeight);
  if(data.mode==='aim'){
    ctx.shadowColor='#20302355';ctx.shadowBlur=3;
    data.points.slice(1).forEach((p,i)=>{const t=i/Math.max(1,data.points.length-2);ctx.beginPath();ctx.arc(p.x,p.y,4.2-t*2.6,0,Math.PI*2);ctx.fillStyle=data.target==='capture'?`rgba(219,244,194,${.9-t*.65})`:`rgba(255,250,224,${.9-t*.65})`;ctx.fill();});
    ctx.shadowBlur=0;
  }else if(data.mode==='trail'){
    const start=performance.now();const trail=now=>{const fade=Math.max(0,1-(now-start)/350);ctx.clearRect(0,0,innerWidth,innerHeight);data.points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,1.5+2*i/data.points.length,0,Math.PI*2);ctx.fillStyle=`rgba(255,249,224,${(.12+.5*i/data.points.length)*fade})`;ctx.fill();});if(fade>0)frame=requestAnimationFrame(trail);};trail(start);
  }else if(data.mode==='hit'){
    cancelAnimationFrame(frame);const start=performance.now();
    const burst=now=>{const t=Math.min(1,(now-start)/650);ctx.clearRect(0,0,innerWidth,innerHeight);for(let i=0;i<14;i++){const a=i*Math.PI*2/14,r=18+t*65;ctx.fillStyle=`rgba(244,222,148,${1-t})`;ctx.beginPath();ctx.arc(data.x+Math.cos(a)*r,data.y+Math.sin(a)*r+t*t*25,2.5*(1-t)+.5,0,Math.PI*2);ctx.fill();}if(t<1)frame=requestAnimationFrame(burst);};frame=requestAnimationFrame(burst);
  }
}
window.desk.onAim(draw);
