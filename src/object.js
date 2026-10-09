const query = new URLSearchParams(location.search), kind = query.get('kind'), id = query.get('id');
const object = document.querySelector('#desktop-object'), overlay = document.querySelector('#object-motion'), preview = document.querySelector('#object-preview');
let moving=false;
let binPose={tipped:false,direction:1,angle:0},binAnimation,binWobble,flightAnimation,recoilToken=0,recoiling=false;
const thumbs=new Map();
let state, image, expandedFrom, animating = false, loadedId, aiming = false, pull = { dx: 0, dy: 0 };
const motionEnabled = () => state.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
async function call(action, payload) { return window.desk.call(action, payload); }
function report(error) { document.querySelector('#object-date').textContent = error.message; }
function page() { return state.pages.find(p => p.id === id); }
let renderSignature,foldedImage,foldedDpr,textureData,ballDrawing=false;
function render() {
  document.body.classList.toggle('toy-still',!motionEnabled());
  if(kind==='bin'){drawBinFill();return;}if(kind==='sling'){drawLoadedPaper();return;}
  const p = page(); if (!p) return;
  const signature=JSON.stringify(p);if(signature===renderSignature)return;renderSignature=signature;
  RichText.render(document.querySelector('#object-text'),RichText.normalize(p.rich,p.text||'（空白页）'));for(const box of document.querySelectorAll('#object-text .todo-check')){box.tabIndex=-1;box.removeAttribute('role');} document.querySelector('#object-date').textContent = PageInfo.describe(p);
  preview.style.backgroundColor = p.color;const textField=document.querySelector('#object-text');textField.dataset.texture=p.texture||'plain';textField.style.color=p.ink||'#454536';textField.style.fontWeight=p.bold?'700':'400';textField.style.textAlign=p.align||'left';textField.style.setProperty('--rule-step',(p.texture==='grid'?24:p.size*1.85)+'px'); document.querySelector('#object-text').style.fontSize = p.size + 'px'; document.querySelector('#object-text').style.fontFamily = p.font === 'hand' ? 'KaiTi, STKaiti, serif' : '"Microsoft YaHei UI", sans-serif';applyPreviewShape();
}
const ballCanvas = document.createElement('canvas'); ballCanvas.id = 'ball-surface'; object.append(ballCanvas);
async function drawBall(){
  if(kind!=='ball'||!preview.hidden||ballDrawing)return;const w=ballCanvas.clientWidth,h=ballCanvas.clientHeight;if(!w||!h)return;
  const d=Math.min(devicePixelRatio||1,2);if(foldedImage&&foldedDpr===d){ballCanvas.width=foldedImage.width;ballCanvas.height=foldedImage.height;ballCanvas.getContext('2d').drawImage(foldedImage,0,0);return;}
  ballDrawing=true;try{
    if(!image&&textureData){image=new Image();image.src=textureData;await image.decode();}
    if(!image)return;
    const surface=new PaperMotion.Surface(ballCanvas,image,{x:0,y:0,width:w,height:h,shape:page().shape,color:page().color});surface.draw({fold:1,cx:w/2,cy:h/2,radius:36});
    foldedImage??=document.createElement('canvas');foldedImage.width=ballCanvas.width;foldedImage.height=ballCanvas.height;foldedImage.getContext('2d').drawImage(ballCanvas,0,0);foldedDpr=d;
    textureData??=image instanceof HTMLCanvasElement?image.toDataURL('image/png'):image.src;
    if(image instanceof HTMLCanvasElement)image.width=image.height=1;else image.src='';image=null;
  }finally{ballDrawing=false;}
}
function releaseOverlay(surface){if(surface?.image instanceof HTMLCanvasElement)surface.image.width=surface.image.height=1;overlay.hidden=true;overlay.width=overlay.height=1;}
function expandedSurface() {
  overlay.hidden = false;
  const r = { x: 10, y: 10, width: innerWidth - 20, height: innerHeight - 24 - (PaperShape.custom(page().shape)?70:0),shape:page().shape,color:page().color };
  const texture = PaperMotion.texture({ ...page(), ...r,scroll:document.querySelector('#object-text').scrollTop, top: PaperShape.custom(page().shape)?12:22, padding: PaperShape.custom(page().shape)?12:22 });
  return new PaperMotion.Surface(overlay, texture, r);
}
async function openPreview() {
  if (animating) return; animating = true; document.body.dataset.objectPhase = 'unfolding';let surface;
  try {
    object.style.visibility = 'hidden';
    const result = await call('object-preview', { open: true }); expandedFrom = result.from;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    surface = expandedSurface();
    const r = surface.rect;
    await PaperMotion.animate(motionEnabled() ? 850 : 1, t => surface.draw({ fold: 1 - t, cx: PaperMotion.mix(expandedFrom.x, r.x+r.width/2,t), cy: PaperMotion.mix(expandedFrom.y, r.y+r.height/2,t) }));
    preview.hidden = false; object.hidden = true;applyPreviewShape();
  } finally { releaseOverlay(surface);object.style.visibility = ''; animating = false; delete document.body.dataset.objectPhase; }
}
async function closePreview() {
  if (animating) return; animating = true; document.body.dataset.objectPhase = 'crumpling';let surface;
  try {
    await call('sound-effect',{type:'crumple'});surface = expandedSurface();const r=surface.rect;preview.hidden = true;
    await PaperMotion.animate(motionEnabled() ? 700 : 1, t => surface.draw({ fold: t, cx: PaperMotion.mix(r.x+r.width/2,expandedFrom.x,t), cy: PaperMotion.mix(r.y+r.height/2,expandedFrom.y,t) }));
    await call('object-preview', { open: false });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    object.hidden=false;await drawBall();
  } finally { releaseOverlay(surface);animating=false; delete document.body.dataset.objectPhase; }
}
function localPoint(e){const r=object.getBoundingClientRect();return {x:(e.clientX-r.x)*DesktopToys.SLING.width/r.width,y:(e.clientY-r.y)*DesktopToys.SLING.height/r.height};}
function paintBand(dx=0,dy=0){
  const x=DesktopToys.SLING.x+dx,y=DesktopToys.SLING.y+dy,stretch=Math.hypot(dx,dy)/DesktopToys.SLING.maxPull;
  document.querySelector('#sling-bands').setAttribute('d',`M88 102 Q${(88+x)/2} ${105+(y-120)*.5} ${x} ${y+6} Q${(172+x)/2} ${105+(y-120)*.5} 172 102`);
  document.querySelector('#sling-front-band').setAttribute('d',`M88 110 L${x} ${y+14} L172 110`);
  for(const node of document.querySelectorAll('#sling-bands,#sling-front-band'))node.style.strokeWidth=(6.5-stretch*2.1)+'px';
  document.querySelector('#pouch').setAttribute('transform',`translate(${x} ${y})`);
}
function resetBand(){
  if(kind!=='sling')return;recoilToken++;recoiling=false;pull={dx:0,dy:0};aiming=false;document.body.classList.remove('aiming');paintBand();call('sling-aim',{cancel:true}).catch(report);
}
function recoil(shot){
  const token=++recoilToken;recoiling=true;if(!motionEnabled()){paintBand();recoiling=false;return;}
  PaperMotion.animate(460,t=>{if(token!==recoilToken)return;const f=Math.exp(-t*7)*Math.cos(t*Math.PI*5);paintBand(shot.dx*f,shot.dy*f);}).then(()=>{if(token===recoilToken){paintBand();recoiling=false;}});
  const frame=document.querySelector('#sling-frame');frame.animate([{transform:'rotate(0deg)'},{transform:`rotate(${shot.dx>0?2:-2}deg)`,offset:.2},{transform:'rotate(0deg)'}],{duration:300,easing:'ease-out'});
}
function foldedThumb(p){
  const key=p.id+':'+p.updated+':'+p.color;if(thumbs.has(key))return thumbs.get(key);
  const texture=PaperMotion.texture({...p,width:p.paperSize?.width||346,height:p.paperSize?.height||392}),canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;
  const surface=new PaperMotion.Surface(canvas,texture,{x:0,y:0,width:72,height:72,shape:p.shape,color:p.color});canvas.width=72;canvas.height=72;surface.dpr=1;surface.draw({fold:1,cx:36,cy:36,radius:25});
  const data=canvas.toDataURL();texture.width=texture.height=canvas.width=canvas.height=1;thumbs.set(key,data);if(thumbs.size>12)thumbs.delete(thumbs.keys().next().value);return data;
}
function drawLoadedPaper(){const p=state?.pages.find(p=>p.id===loadedId);if(p)document.querySelector('#loaded-paper').setAttribute('href',foldedThumb(p));}
function loaded(value){
  const changed=value&&value!==loadedId;loadedId=value;document.body.classList.toggle('loaded',!!value);document.querySelector('#unload').hidden=!value;if(value||!recoiling)resetBand();drawLoadedPaper();
  if(changed&&motionEnabled()){const token=recoilToken;PaperMotion.animate(240,t=>{if(token===recoilToken&&!aiming)paintBand(0,Math.sin(t*Math.PI)*5*(1-t));});}
  object.title=value?'拖动纸团瞄准 · 拖动底座移动 · Esc 取消':'拖入纸团装填 · 拖动底座移动';
}
function drawBinFill(){
  const papers=state.pages.filter(p=>p.status==='trash'),fill=document.querySelector('#bin-fill'),shown=papers.slice(-3),signature=shown.map(p=>p.id+':'+p.updated+':'+p.color).join('|');
  if(fill.dataset.signature===signature)return;fill.dataset.signature=signature;fill.replaceChildren();
  shown.forEach((p,i)=>{const image=document.createElementNS('http://www.w3.org/2000/svg','image'),count=Math.min(3,papers.length),x=150+(i-(shown.length-1)/2)*23,y=123-(count-1)*10+(i%2?5:0);for(const [k,v]of Object.entries({href:foldedThumb(p),x:x-27,y:y-27,width:54,height:54}))image.setAttribute(k,String(v));fill.append(image);});
}
function paintBin(data,initial=false){
  const basket=document.querySelector('#basket'),from=data.from??(binAnimation?Number(document.body.dataset.binAngle)||binPose.angle:binPose.angle);
  binWobble?.cancel();binAnimation?.cancel();binPose=data;document.body.classList.toggle('tipped',data.tipped);basket.style.transformOrigin=(data.direction<0?115:185)+'px 202px';basket.style.transform=`rotate(${data.angle}deg)`;document.body.dataset.binAngle=data.angle;
  if(!initial&&motionEnabled())binAnimation=basket.animate([{transform:`rotate(${from}deg)`},{transform:`rotate(${data.angle}deg)`}],{duration:data.duration||650,easing:'cubic-bezier(.333333,1,.666667,1)'});
  const shadow=document.querySelector('#bin-shadow');shadow.setAttribute('cx',data.tipped?(data.direction>0?234:66):150);shadow.setAttribute('rx',data.tipped?51:43);object.title=data.tipped?'点击扶正 · 右键回收管理 · 拖动移动':'拖入纸团回收 · 点击回收管理 · 右键菜单';
}
if(kind==='sling'){
  document.body.classList.add('sling-window');document.querySelector('#ball-art').setAttribute('hidden','');ballCanvas.hidden=true;
  object.insertAdjacentHTML('beforeend','<svg id="sling-art" viewBox="0 0 260 310" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sling-wood" x1="0" x2="1"><stop stop-color="#79543b"/><stop offset=".45" stop-color="#c29765"/><stop offset="1" stop-color="#89613f"/></linearGradient></defs><ellipse cx="130" cy="304" rx="26" ry="3" fill="#51412d" opacity=".14"/><g id="sling-frame"><path d="M88 104Q94 151 117 185Q129 197 127 223L126 288Q130 300 137 288L136 223Q134 200 146 185Q168 151 172 104" fill="none" stroke="#6b4c34" stroke-width="21" stroke-linecap="round"/><path d="M88 104Q94 151 117 185Q129 197 127 223L126 288M136 288 136 223Q134 200 146 185Q168 151 172 104" fill="none" stroke="url(#sling-wood)" stroke-width="16" stroke-linecap="round"/><path d="M91 111Q100 155 119 181M134 225v50" fill="none" stroke="#e2bd8b" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/><path d="M120 260h23m-24 6h25m-24 6h24" stroke="#70563e" stroke-width="3" stroke-linecap="round"/><path d="M83 105h12m71 0h12" stroke="#72513a" stroke-width="12" stroke-linecap="round"/></g><path id="sling-bands" stroke="#9f754d" stroke-width="6.5"/><g id="pouch" transform="translate(130 120)"><image id="loaded-paper" x="-25" y="-25" width="50" height="50"/><path d="M-22 10Q0 22 22 10L17 18Q0 26-17 18Z" fill="#775438" stroke="#513923" stroke-width="1"/><path d="M-16 16Q0 23 16 16" stroke="#bc9261" stroke-width="1" fill="none"/></g><path id="sling-front-band" stroke="#c0955b" stroke-width="6.5"/></svg>');
  document.querySelector('#sling-frame').style.transformOrigin='130px 296px';paintBand();object.setAttribute('aria-label','弹弓，拖入纸团装填，拖纸团瞄准，拖底座移动');
  object.addEventListener('pointerdown',e=>{if(!loadedId||e.button!==0||recoiling)return;const p=localPoint(e);if(Math.hypot(p.x-DesktopToys.SLING.x,p.y-DesktopToys.SLING.y)>30)return;aiming=true;document.body.classList.add('aiming');object.setPointerCapture(e.pointerId);e.preventDefault();});
  object.addEventListener('pointermove',e=>{if(!aiming)return;const p=localPoint(e);pull=DesktopToys.pull(p.x-DesktopToys.SLING.x,p.y-DesktopToys.SLING.y);paintBand(pull.dx,pull.dy);call('sling-aim',pull).catch(report);});
  object.addEventListener('pointerup',async()=>{if(!aiming)return;const shot={...pull};aiming=false;pull={dx:0,dy:0};document.body.classList.remove('aiming');if(Math.hypot(shot.dx,shot.dy)<8){resetBand();return;}recoil(shot);try{await call('sling-shot',shot);}catch(e){resetBand();report(e);}});
  object.addEventListener('pointercancel',resetBand);document.addEventListener('keydown',e=>{if(e.key==='Escape')resetBand();});document.querySelector('#unload').onclick=()=>call('sling-unload').catch(report);window.desk.onLoaded(loaded);
  window.toyContainsPoint=(x,y)=>{const p=localPoint({clientX:x,clientY:y});return DesktopToys.slingContains(p.x,p.y,!!loadedId,pull.dx,pull.dy);};
}else if(kind==='bin'){
  document.body.classList.add('bin-window');document.querySelector('#ball-art').setAttribute('hidden','');document.querySelector('#bin-art').removeAttribute('hidden');ballCanvas.hidden=true;object.setAttribute('aria-label','垃圾桶，点击管理，击倒后点击扶正');
  object.oncontextmenu=e=>{e.preventDefault();call('bin-menu').catch(report);};
  window.toyContainsPoint=(x,y)=>{const matrix=document.querySelector('#basket').getScreenCTM();if(!matrix)return false;const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return DesktopToys.binContains(DesktopToys.geometry({x:0,y:0,width:300,height:210}),p);};
}else document.querySelector('#ball-art').setAttribute('hidden','');
attachDesktopDrag(object,false,()=>!animating&&!aiming&&!document.body.dataset.objectPhase);
object.addEventListener('desktop-click', () => { if (kind !== 'sling') (kind === 'bin' ? call(binPose.tipped?'bin-upright':'shelf') : openPreview()).catch(report); });
document.querySelector('#object-close').onclick = () => closePreview().catch(report);
for (const [selector, status] of [['#object-restore','book'],['#object-pin','pinned'],['#object-trash','trash']]) document.querySelector(selector).onclick = async () => {
  if (animating||moving) return; moving = true;
  try { await call('move', { id, status }); } catch (e) { report(e); } finally { moving = false; }
};
window.desk.onToy(data=>{
  if(data.type==='flight'&&kind==='ball'){
    const frozen=getComputedStyle(object).transform;flightAnimation?.cancel();flightAnimation=null;
    if(data.active&&motionEnabled()){object.style.transform='';const angle=data.vx<0?-360:360;flightAnimation=object.animate([{transform:'rotate(0deg)'},{transform:`rotate(${angle}deg)`}],{duration:Math.max(700,1700-Math.abs(data.vx)*.4),iterations:Infinity});}else object.style.transform=frozen==='none'?'':frozen;
  }
  if(kind!=='bin')return;
  if(data.type==='bin-state')paintBin(data);
  if(data.type==='bin-aim')document.body.classList.toggle('aim-target',data.active);
  if((data.type==='bin-bump'||data.type==='bin-catch')&&motionEnabled()&&!binPose.tipped){binWobble?.cancel();const amount=data.type==='bin-catch'?3:2+4*data.strength;binWobble=document.querySelector('#basket').animate([{transform:'rotate(0deg)'},{transform:`rotate(${(data.direction||1)*amount}deg)`,offset:.2},{transform:`rotate(${-(data.direction||1)*amount*.5}deg)`,offset:.55},{transform:'rotate(0deg)'}],{duration:430,easing:'ease-out'});}
  if(data.type==='bin-catch'&&motionEnabled())document.querySelector('#bin-fill').animate([{transform:'translateY(0)'},{transform:'translateY(-5px)',offset:.35},{transform:'translateY(0)'}],{duration:300});
});
window.desk.onChange(s=>{state=StateSync.apply(state,s);render();});
window.desk.onHint(active => document.body.classList.toggle('drop-ready', active));
window.desk.onNotice(message => { const el=document.querySelector('#object-notice');el.textContent=message;el.hidden=false;document.body.classList.add('hit');setTimeout(()=>{el.hidden=true;document.body.classList.remove('hit');},2400); });
window.addEventListener('resize',()=>{drawBall();applyPreviewShape();});
(async () => {
  state=await call('object-state');render();if(kind==='bin')paintBin(state.windowInfo.toy,true);
  if (kind === 'sling') loaded(state.loadedBallId);
  if (kind === 'ball') {
    if (state.visual?.image) { image = new Image(); image.src = state.visual.image; await image.decode(); }
    else image = PaperMotion.texture({ ...page(), width: page().paperSize?.width || 346, height: page().paperSize?.height || 392 });
    await drawBall();delete state.visual;
  }
  await call('object-ready');
})().catch(report);

window.desk.onRecycle(async data=>{
  if(data.phase==='prepare'){
    try{if(!preview.hidden){while(animating)await new Promise(r=>setTimeout(r,25));await closePreview();}}finally{document.body.dataset.objectPhase='recycling';await call('recycle-ready');}
  }else if(data.phase==='fly'){
    object.animate([{transform:'scale(1) rotate(0)',opacity:1},{transform:data.captured?'scale(.5) rotate(35deg)':'scale(.15) rotate(120deg)',opacity:0}],{duration:data.duration,fill:'forwards',easing:'ease-in'});
  }else{for(const a of object.getAnimations())a.cancel();delete document.body.dataset.objectPhase;}
});

function applyPreviewShape(){
  const p=page();if(!p)return;const custom=PaperShape.custom(p.shape),paper=document.querySelector('#object-paper'),field=document.querySelector('#object-text');
  preview.dataset.shape=PaperShape.normalize(p.shape);preview.classList.toggle('shaped-preview',custom);preview.style.backgroundColor=custom?'transparent':p.color;
  if(!custom){for(const k of ['left','top','width','height','backgroundImage'])field.style[k]='';return;}
  if(!preview.clientWidth)return;
  const g=PaperShape.geometry(p.shape,preview.clientWidth,preview.clientHeight-70),box=g.text;
  paper.style.backgroundColor=p.color;paper.style.clipPath=g.clip;paper.dataset.texture=p.texture||'plain';paper.style.setProperty('--rule-step',(p.texture==='grid'?24:p.size*1.85)+'px');
  for(const [key,value]of Object.entries({left:box.x,top:box.y,width:box.width,height:box.height}))field.style[key]=value+'px';field.style.backgroundImage='none';paper.style.backgroundPosition='0 '+(box.y+12-field.scrollTop)+'px';
}
document.querySelector('#object-text').addEventListener('scroll',applyPreviewShape);
