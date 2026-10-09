const PaperShape=require('./paper-shape.js');
const Toys=require('./toy-physics.js');
const StateSync=require('./state-sync.js');
const {createStore}=require('./persistence.cjs');
let store,mutationTail=Promise.resolve(),windowSaveTask,windowRevision=0,quitReady=false;
const RichText = require('./rich-text.js');
const AIPrompts = require('./ai-prompts.cjs');
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, safeStorage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { page, initial, validate, change, paperStyle } = require('./model.cjs');
const { clampBounds, inside, gatherSlots } = require('./desktop.cjs');
const { exportBackup, importBackup } = require('./backup.cjs');
const { noteLayout, panelLayout, resizePaper, zoomPaper } = require('./layout.cjs');
const Shortcuts = require('./shortcuts.cjs');
const {createVisibility}=require('./visibility.cjs');
const {createWatcher}=require('./fullscreen.cjs');
let shortcutManager;
let fullscreenWatcher,reflowTimer;
let state, dataFile, keyFile, tray, quitting = false, request, loadedBallId, aimWindow, aimHideTimer;
const {stepPile}=require('./physics.cjs');
let pileTimer,pileLast;
const windows = new Map();
const isNote=w=>w.deskKind==='book'||w.deskKind==='pinned';
const noteShape=w=>state.pages.find(p=>p.id===(w.activePage||w.pageId))?.shape||state.pages.find(p=>p.status==='book')?.shape||'rounded';
const visibleBounds=w=>isNote(w)&&!w.collapsed?w.paperBounds:w.getBounds();
const visibility=createVisibility({displayOf:w=>screen.getDisplayMatching(visibleBounds(w)).id,onPause:pauseWindowMotion,onResume:resumeWindowMotion});
function pauseWindowMotion(w){if(w.fallTimer){w.resumeFall=true;w.pausedVelocity={x:w.motionBody?.vx||0,y:w.motionBody?.vy||0};w.pausedShot=w.motionShot;}stopMotion(w);}
function resumeWindowMotion(w){if(w.resumeFall){w.resumeFall=false;const velocity=w.pausedVelocity,shot=w.pausedShot===true;w.pausedVelocity=null;w.pausedShot=false;if(w.deskKind==='ball'&&!w.previewBounds)fall(w,null,velocity,shot);}}
function setNativeBounds(w,b){const current=w.getBounds();if(current.x!==b.x||current.y!==b.y||Math.abs(current.width-b.width)>1||Math.abs(current.height-b.height)>1)w.setBounds(b);}
function binAngle(w){const m=w.binMotion;if(!m)return w.binTipped?(w.binDirection||1)*Toys.BIN.angle:0;const t=Math.min(1,(Date.now()-m.started)/m.duration);return m.from+(m.to-m.from)*(1-(1-t)**3);}
function binGeometry(w){return Toys.geometry(w.getBounds(),binAngle(w),w.binDirection||1);}
function binInfo(w){return {type:'bin-state',tipped:!!w.binTipped,direction:w.binDirection||1,angle:w.binTipped?(w.binDirection||1)*Toys.BIN.angle:0,count:state.pages.filter(p=>p.status==='trash').length};}
function setBinPose(w,tipped,direction=w.binDirection||1){const from=binAngle(w);w.binTipped=tipped;w.binDirection=direction;const duration=state.settings.motion?650:1;w.binMotion={from,to:tipped?direction*Toys.BIN.angle:0,started:Date.now(),duration};w.webContents.send('toy',{...binInfo(w),from,duration});rememberWindow(w);}
function windowInfo(w){return {collapsed:w.collapsed,locked:!!w.locked,top:w.isAlwaysOnTop(),layout:w.noteLayout,sidePref:w.sidePref||'auto',snap:w.snapOrb!==false,targetId:w.targetId,toy:w.deskKind==='bin'?binInfo(w):undefined};}
function persistNote(w){state.windows[w.deskKey]={bounds:w.paperBounds,zoom:w.paperZoom,base:w.paperBase,orbBounds:w.collapsed?w.getBounds():w.orbBounds,top:w.isAlwaysOnTop(),locked:!!w.locked,collapsed:w.collapsed,sidePref:w.sidePref||'auto',snap:w.snapOrb!==false};return saveWindows();}
function positionAI(owner){const ai=windows.get('ai:'+owner.deskKey);if(!ai||ai.isDestroyed())return;if(owner.collapsed||!visibility.wanted(owner)){ai.hide();return;}const b={...(owner.paperBounds||owner.getBounds())};if(owner.noteLayout?.side==='left')b.x-=44;b.width+=44;const target=panelLayout(b,screen.getDisplayMatching(b).workArea);ai.setMinimumSize(Math.min(240,target.width),Math.min(280,target.height));setNativeBounds(ai,target);}
function layoutNote(w,rechoose=true){
  if(!isNote(w)||w.collapsed)return;
  const b=w.paperBounds||w.getBounds(),area=screen.getDisplayMatching(b).workArea;
  const fitted=zoomPaper(b,w.paperBase,w.paperZoom,area);w.paperZoom=fitted.zoom;
  const layout=noteLayout(fitted.paper,area,{side:rechoose?w.sidePref:(w.noteLayout?.side||w.sidePref),shape:noteShape(w),zoom:w.paperZoom,base:w.paperBase});
  w.paperBounds=layout.paper;w.noteLayout=layout;w.layoutUntil=Date.now()+100;
  // Fractional Windows scaling can round the returned size by one DIP. Do not
  // resize an otherwise unchanged window each time its tools switch sides.
  w.setMinimumSize(Math.min(320,layout.bounds.width),Math.min(360,layout.bounds.height));setNativeBounds(w,layout.bounds);
  w.lastNative=w.getBounds();w.webContents.send('window-state',windowInfo(w));positionAI(w);
  visibility.refresh();
}
function reflowDesktop(){
  hideAim();
  for(const w of windows.values()){
    if(w.isDestroyed())continue;
    w.gesture=null;w.layoutUntil=Date.now()+250;pauseWindowMotion(w);
    if(isNote(w)){
      if(w.collapsed){const area=screen.getDisplayMatching(w.paperBounds).workArea,fitted=zoomPaper(w.paperBounds,w.paperBase,w.paperZoom,area);w.paperZoom=fitted.zoom;w.noteLayout=noteLayout(fitted.paper,area,{side:w.sidePref,shape:noteShape(w),zoom:w.paperZoom,base:w.paperBase});w.paperBounds=w.noteLayout.paper;w.orbBounds=clampBounds({...w.getBounds(),width:64,height:64},screen.getDisplayMatching(w.getBounds()).workArea);setNativeBounds(w,w.orbBounds);w.lastNative=w.getBounds();w.webContents.send('window-state',windowInfo(w));}
      else layoutNote(w);
      state.windows[w.deskKey]={...state.windows[w.deskKey],bounds:w.paperBounds,zoom:w.paperZoom,base:w.paperBase,orbBounds:w.orbBounds,top:w.isAlwaysOnTop(),locked:!!w.locked,collapsed:w.collapsed,sidePref:w.sidePref||'auto',snap:w.snapOrb!==false};
    }else if(w.deskKind!=='ai'){
      if(w.previewBounds)w.previewBounds=clampBounds(w.previewBounds,screen.getDisplayMatching(w.previewBounds).workArea);
      const target=clampBounds(w.getBounds(),screen.getDisplayMatching(w.getBounds()).workArea);w.setMinimumSize(Math.min(80,target.width),Math.min(80,target.height));setNativeBounds(w,target);
      state.windows[w.deskKey]={bounds:w.previewBounds||w.getBounds(),top:w.isAlwaysOnTop(),locked:!!w.locked,collapsed:false,...(w.deskKind==='bin'?{tipped:!!w.binTipped,direction:w.binDirection||1}:{})};
    }
  }
  for(const ai of windows.values())if(ai.deskKind==='ai'){
    const owner=windows.get(ai.ownerKey);if(owner)positionAI(owner);else setNativeBounds(ai,clampBounds(ai.getBounds(),screen.getDisplayMatching(ai.getBounds()).workArea));
  }
  visibility.refresh();for(const w of windows.values())if(w.isVisible())resumeWindowMotion(w);return saveWindows();
}
function queueReflow(){clearTimeout(reflowTimer);reflowTimer=setTimeout(()=>{try{reflowDesktop();}catch(err){windows.get('book')?.webContents.send('notice','桌面布局恢复失败：'+err.message);}},150);}
function applyFullscreenSample(sample){
  if(quitting)return;
  if(!state?.settings.fullscreenAvoid||!sample.fullscreen||sample.pid===process.pid){visibility.set(null);return;}
  if(!['x','y','width','height'].every(k=>Number.isFinite(sample[k]))||sample.width<=0||sample.height<=0)return;
  const center=screen.screenToDipPoint({x:Math.round(sample.x+sample.width/2),y:Math.round(sample.y+sample.height/2)}),display=screen.getDisplayNearestPoint(center);
  visibility.set({displayId:display.id,token:display.id+':'+sample.pid+':'+sample.handle});hideAim();
}
function configureFullscreen(enabled){if(enabled)fullscreenWatcher.start();else fullscreenWatcher.stop();}
function hideOwnedAI(w){const ai=windows.get('ai:'+w.deskKey);if(ai){w.aiWasVisible=visibility.wanted(ai);ai.hide();}}
function aimSend(data, area) {
  clearTimeout(aimHideTimer);
  if(!aimWindow||aimWindow.isDestroyed()){
    aimWindow=new BrowserWindow({...area,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
    aimWindow.setIgnoreMouseEvents(true);aimWindow.loadFile(path.join(__dirname,'aim.html'));
    aimWindow.pendingData=data;aimWindow.once('ready-to-show',()=>{if(!aimWindow?.isDestroyed()&&aimWindow.pendingData){aimWindow.showInactive();aimWindow.webContents.send('aim',aimWindow.pendingData);}});
  }else{aimWindow.setBounds(area);aimWindow.pendingData=data;aimWindow.showInactive();aimWindow.webContents.send('aim',data);}
}
function hideAim(delay=0){clearTimeout(aimHideTimer);const hide=()=>{if(aimWindow&&!aimWindow.isDestroyed()){aimWindow.pendingData=null;aimWindow.hide();}windows.get('bin')?.webContents.send('toy',{type:'bin-aim',active:false});};if(delay)aimHideTimer=setTimeout(hide,delay);else hide();}
function stopMotion(w) { if(w.motionShot&&!w.isDestroyed())w.webContents.send('toy',{type:'flight',active:false});w.fallTimer=null;w.motionBody=null;w.pileBody=null;if(w.deskKind==='ball')wakePile(); }
function playSound(type){if(state?.settings.sound!==true)return;const receiver=windows.get('book')||[...windows.values()].find(w=>!w.isDestroyed());if(receiver&&!receiver.isDestroyed())receiver.webContents.send('sound',{type,volume:state.settings.volume??.35});}
function wakePile(){if(quitting||!state||pileTimer)return;pileLast=performance.now();pileTimer=setInterval(tickPile,16);}
function tickPile(){
  const now=performance.now(),dt=Math.min(.04,(now-pileLast)/1000);pileLast=now;
  const groups=new Map();
  for(const w of windows.values()){
    if(w.isDestroyed()||w.deskKind!=='ball'||!w.isVisible()||w.previewBounds||w.gesture||w.recycling||w.pageId===loadedBallId||w.finishHandoff)continue;
    const bounds=w.getBounds(),display=screen.getDisplayMatching(bounds),body=w.pileBody||{...bounds,width:92,height:96,vx:0,vy:0,rest:true};
    if(!w.fallTimer&&(Math.abs(body.x-bounds.x)>1||Math.abs(body.y-bounds.y)>1))Object.assign(body,bounds,{width:92,height:96,rest:true,vx:0,vy:0});
    w.pileBody=body;const group=groups.get(display.id)||{area:display.workArea,entries:[]};group.entries.push({w,body});groups.set(display.id,group);
  }
  let active=false,impact=false;
  for(const {area,entries}of groups.values()){
    const bodies=entries.map(e=>e.body),bin=windows.get('bin'),binVisible=bin?.isVisible()&&screen.getDisplayMatching(bin.getBounds()).id===screen.getDisplayMatching(area).id;
    let bucketGeometry;const trashCount=state.pages.filter(p=>p.status==='trash').length;
    const hits=stepPile(bodies,area,dt,{onStep:()=>{bucketGeometry=binVisible&&!bin.gesture?binGeometry(bin):null;},onMove:(body,before)=>{
      if(!bucketGeometry)return;const g=bucketGeometry,hit=Toys.collision(before,body,g);if(!hit)return;
      if(hit.type==='capture'){body.captured=true;body.capturePoint=hit.point;body.rest=true;body.vx=body.vy=0;return;}
      const vx=body.vx,vy=body.vy;Toys.bounce(body,hit);
      if(now-(body.binHitAt||-1000)>140){body.binHitAt=now;playSound('land');if(!bin.binTipped&&Toys.shouldTip(vx,vy,hit,g,trashCount))setBinPose(bin,true,Math.sign(vx)||1);else bin.webContents.send('toy',{type:'bin-bump',direction:Math.sign(vx)||1,strength:Math.min(1,Math.hypot(vx,vy)/1500)});}
    }});impact||=hits.size>0;
    if(!state.settings.motion&&!entries.some(e=>e.w.motionShot)){for(let i=0;i<600&&bodies.some(b=>!b.rest);i++)stepPile(bodies,area,1/60);}
    for(const {w,body}of entries){
      const shot=w.motionShot===true;
      if(body.captured){
        setNativeBounds(w,{x:Math.round(body.capturePoint.x-46),y:Math.round(body.capturePoint.y-48),width:92,height:96});
        if(shot){aimSend({mode:'hit',x:body.capturePoint.x-area.x,y:body.capturePoint.y-area.y},area);hideAim(700);}
        recycleBall(w,true).catch(err=>w.isDestroyed()?null:w.webContents.send('notice',err.message));continue;
      }
      if(!body.rest){w.fallTimer=true;w.motionBody=body;active=true;}
      setNativeBounds(w,{x:Math.round(body.x),y:Math.round(body.y),width:92,height:96});
      if(shot&&w.fallTimer){const trail=w.motionTrail||[];trail.push({x:body.x+46-area.x,y:body.y+48-area.y});if(trail.length>22)trail.shift();w.motionTrail=trail;aimSend({mode:'trail',points:trail},area);}
      if(body.rest&&w.fallTimer){w.fallTimer=null;w.motionBody=null;w.motionShot=false;w.webContents.send('toy',{type:'flight',active:false});rememberWindow(w);if(shot)hideAim(400);}
    }
  }
  if(impact&&now-(tickPile.lastSound||0)>120){playSound('land');tickPile.lastSound=now;}
  if(!active){clearInterval(pileTimer);pileTimer=null;}
}
async function recycleBall(w,captured=false){
  if(w.isDestroyed()||w.deskKind!=='ball')return;
  if(w.recyclePromise)return w.recyclePromise;
  w.recycling=true;stopMotion(w);
  w.recyclePromise=(async()=>{
    try{
      if(w.isVisible()&&state.settings.motion){
        await new Promise(resolve=>{w.recycleReady=resolve;w.webContents.send('recycle',{phase:'prepare'});w.recycleTimeout=setTimeout(resolve,1400);});
        clearTimeout(w.recycleTimeout);w.recycleReady=null;
        if(!w.isDestroyed()&&w.isVisible()){
          const b=w.getBounds(),bin=windows.get('bin'),target=bin?.isVisible()?binGeometry(bin):null,duration=target?(captured?260:420):240;
          const end=target?{x:target.inside.x-46,y:target.inside.y-48}: {x:b.x,y:b.y+35};
          if(target)bin.moveTop();w.webContents.send('recycle',{phase:'fly',duration,captured});
          await new Promise(resolve=>{const start=performance.now();const timer=setInterval(()=>{if(w.isDestroyed()||!w.isVisible()){clearInterval(timer);resolve();return;}const t=Math.min(1,(performance.now()-start)/duration);setNativeBounds(w,{x:Math.round(b.x+(end.x-b.x)*t),y:Math.round(b.y+(end.y-b.y)*t-Math.sin(t*Math.PI)*(captured?0:55)),width:92,height:96});if(t===1){clearInterval(timer);resolve();}},16);});
        }
      }
      if(state.pages.some(p=>p.id===w.pageId&&p.status==='ball')){await commit(s=>{if(s.pages.some(p=>p.id===w.pageId&&p.status==='ball'))change(s,w.pageId,'trash');});syncWindows();broadcast();playSound('bin');windows.get('bin')?.webContents.send('toy',{type:'bin-catch',strong:!!w.motionShot});}
    }finally{clearTimeout(w.recycleTimeout);w.recycleReady=null;w.recycling=false;if(!w.isDestroyed()){w.recyclePromise=null;w.webContents.send('recycle',{phase:'cancel'});fall(w);}}
  })();return w.recyclePromise;
}
function rememberWindow(w) {
  if(quitting)return;
  if(isNote(w)){
    if(w.isDestroyed()||w.layoutUntil>Date.now()||w.gesture)return;
    const now=w.getBounds(),previous=w.lastNative;w.lastNative=now;
    if(w.collapsed){w.orbBounds=now;}else{if(previous){w.paperBounds.x+=now.x-previous.x;w.paperBounds.y+=now.y-previous.y;}layoutNote(w);}
    try{persistNote(w);}catch(err){w.webContents.send('notice','窗口位置保存失败：'+err.message);}return;
  }
  if (w.isDestroyed() || w.collapsed || w.previewBounds || w.gesture || w.fallTimer || w.recycling || w.layoutUntil>Date.now()) return;
  state.windows[w.deskKey] = { bounds: w.getBounds(), top: w.isAlwaysOnTop(), locked: !!w.locked, collapsed: false,...(w.deskKind==='bin'?{tipped:!!w.binTipped,direction:w.binDirection||1}:{}) };
  return saveWindows();
}
function fall(w, origin, velocity, shot=!!velocity) {
  if(w.isDestroyed()||w.recycling)return;
  stopMotion(w);const area=screen.getDisplayMatching(origin||w.getBounds()).workArea,b={...w.getBounds(),width:92,height:96};
  const body={...b,...(origin?{x:origin.x+(origin.ballPoint?.x??origin.width/2)-46,y:origin.y+(origin.ballPoint?.y??55)-48}:{}),vx:origin?(Math.random()-.5)*130:0,vy:0,rest:false};
  Object.assign(body,clampBounds(body,area));if(velocity){body.vx=velocity.x;body.vy=velocity.y;}
  w.motionShot=shot;w.motionTrail=[];
  w.webContents.send('toy',{type:'flight',active:shot,vx:body.vx,vy:body.vy});
  if(!state.settings.motion&&!shot){body.y=area.y+area.height-body.height-8;body.vx=body.vy=0;body.rest=true;}
  setNativeBounds(w,{x:Math.round(body.x),y:Math.round(body.y),width:92,height:96});visibility.refresh();
  if(!w.isVisible()){w.resumeFall=true;w.pausedVelocity={x:body.vx,y:body.vy};w.pausedShot=shot;return;}
  w.pileBody=body;w.motionBody=body;w.fallTimer=true;wakePile();
}
function dropTarget(point) {
  const bin = windows.get('bin'), book = windows.get('book'), sling = windows.get('sling');
  if (bin?.isVisible() && Toys.binContains(binGeometry(bin),point)) return 'trash';
  if (sling?.isVisible() && inside(point, sling.getBounds(), 20)) return 'sling';
  if (book?.isVisible() && !book.collapsed && inside(point, book.paperBounds||book.getBounds(), 12)){
    const p=state.pages.find(p=>p.id===book.activePage),b=book.paperBounds||book.getBounds();
    if(PaperShape.contains(PaperShape.geometry(p?.shape,b.width-24,b.height-78,book.paperZoom),point.x-b.x-12,point.y-b.y-56))return 'book';
  }
  return null;
}
function hintTarget(target) {
  for (const key of ['book', 'bin', 'sling']) { const win = windows.get(key); if (win && !win.isDestroyed()) win.webContents.send('drop-hint', target === (key === 'bin' ? 'trash' : key)); }
}
function unloadSling(velocity,pull={dx:0,dy:0}) {
  hideAim();
  const sling = windows.get('sling'), ball = windows.get('ball:' + loadedBallId); loadedBallId = null;
  sling?.webContents.send('loaded', null);
  if (ball && !ball.isDestroyed()) {
    const origin = sling?.getBounds() || ball.getBounds();
    origin.ballPoint = { x:(Toys.SLING.x+pull.dx)*origin.width/Toys.SLING.width,y:(Toys.SLING.y+pull.dy)*origin.height/Toys.SLING.height }; ball.showInactive(); fall(ball, origin, velocity);
  }
}
function serializeMutation(task){const result=mutationTail.then(task);mutationTail=result.catch(()=>{});return result;}
function save(value=state){return store.write(value);}
function commit(update){return serializeMutation(async()=>{const candidate=structuredClone(state),result=await update(candidate);await save(candidate);candidate.windows=state.windows;state=candidate;return result;});}
function saveWindows(){
  windowRevision++;if(windowSaveTask)return windowSaveTask;
  windowSaveTask=serializeMutation(async()=>{let revision;do{revision=windowRevision;await save();}while(revision!==windowRevision);}).finally(()=>windowSaveTask=null);
  windowSaveTask.catch(err=>windows.get('book')?.webContents.send('notice','窗口位置保存失败：'+err.message));return windowSaveTask;
}
function publicState(){return {...state,settings:{...state.settings,hasKey:fs.existsSync(keyFile)}};}
function windowStateView(w,full=publicState()){
  if(w.deskKind==='ball')return {...full,pages:full.pages.filter(p=>p.id===w.pageId),windows:{}};
  if(w.deskKind==='bin')return {...full,pages:full.pages.filter(p=>p.status==='trash').slice(-3),windows:{}};
  if(w.deskKind==='sling')return {...full,pages:full.pages.filter(p=>p.status==='ball'),windows:{}};
  return full;
}
function broadcast(){const full=publicState(),signatures=new Map(full.pages.map(p=>[p.id,JSON.stringify(p)]));for(const w of windows.values())if(!w.isDestroyed()){w.stateChannel??=StateSync.channel();const delta=w.stateChannel.next(windowStateView(w,full),signatures);if(delta)w.webContents.send('state',delta);}}
function boundsWithin(bounds, fallback) {
  const b = { ...fallback, ...bounds };
  const a = screen.getDisplayMatching(b).workArea;
  b.width = Math.min(Math.max(320, b.width), a.width); b.height = Math.min(Math.max(360, b.height), a.height);
  b.x = Math.max(a.x, Math.min(b.x, a.x + a.width - b.width));
  b.y = Math.max(a.y, Math.min(b.y, a.y + a.height - b.height)); return b;
}
function open(kind, id = '', origin) {
  const key = kind === 'ball' ? 'ball:' + id : id || kind;
  if (windows.has(key)) { windows.get(key).show(); return windows.get(key); }
  const a = screen.getPrimaryDisplay().workArea;
  const object = ['ball','bin','sling'].includes(kind);
  const fallback = object ? { x: a.x + 70 + state.pages.filter(p => p.status === 'ball').findIndex(p => p.id === id) * 76 % Math.max(100, a.width - 240), y: a.y + a.height - 104, width: 92, height: 96 } : kind === 'shelf' ? { x: a.x + 80, y: a.y + a.height - 420, width: 460, height: 400 } : { x: a.x + a.width - 410, y: a.y + 70, width: 370, height: 470 };
  if (kind === 'bin') { fallback.x = a.x + a.width - Toys.BIN.width-24; fallback.width = Toys.BIN.width; fallback.height = Toys.BIN.height; fallback.y = a.y + a.height - fallback.height-8; }
  if (kind === 'sling') { fallback.x = a.x + a.width - 620; fallback.width = Toys.SLING.width; fallback.height = Toys.SLING.height; fallback.y = a.y + a.height - fallback.height-8; }
  const saved = state.windows[key];
  const objectBounds={...fallback,...saved?.bounds};if(['bin','sling'].includes(kind)){
    // Native bounds may round by one DIP on scaled Windows displays.
    if(saved?.bounds&&(Math.abs(saved.bounds.width-fallback.width)>1||Math.abs(saved.bounds.height-fallback.height)>1)){objectBounds.x+=(saved.bounds.width-fallback.width)/2;objectBounds.y+=saved.bounds.height-fallback.height;}
    objectBounds.width=fallback.width;objectBounds.height=fallback.height;
  }
  const bounds = object ? clampBounds(objectBounds, screen.getDisplayMatching(saved?.bounds || fallback).workArea) : boundsWithin(saved?.bounds, fallback);
  const w = new BrowserWindow({ ...bounds, minWidth: object ? 80 : 320, minHeight: object ? 80 : 360, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, roundedCorners: false, resizable: false, maximizable: false, skipTaskbar: kind !== 'shelf', show: false, alwaysOnTop: saved?.top ?? true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy:'no-user-gesture-required' } });
  windows.set(key, w); w.deskKey = key; w.deskKind = kind; w.pageId = id; w.collapsed = false;
  if(kind==='bin'){w.binTipped=saved?.tipped===true;w.binDirection=saved?.direction===-1?-1:1;}
  visibility.attach(w);
  if(isNote(w)){w.paperZoom=Number.isFinite(saved?.zoom)?Math.max(.5,Math.min(2.5,saved.zoom)):1;w.paperBase=saved?.base&&['width','height'].every(k=>Number.isFinite(saved.base[k])&&saved.base[k]>0&&saved.base[k]<=4000)?saved.base:{width:bounds.width-24,height:bounds.height-78};w.paperBounds=saved?.base?clampBounds({...bounds,...saved.bounds},screen.getDisplayMatching(bounds).workArea):bounds;w.sidePref=saved?.sidePref||'auto';w.snapOrb=saved?.snap!==false;w.orbBounds=saved?.orbBounds;w.toolsOpen=false;layoutNote(w);}
  w.locked = saved?.locked === true; w.setMovable(!w.locked);
  w.motionVisual = origin?.visual; w.motionOrigin = origin;
  if (kind === 'ball' && origin) w.handoff = new Promise(resolve => { w.finishHandoff = resolve; });
  w.loadFile(path.join(__dirname, object ? 'object.html' : 'index.html'), { query: { kind, id } });
  w.once('ready-to-show', () => {
    if (saved?.collapsed && isNote(w)) {w.collapsed=true;w.setMinimumSize(64,64);const l=w.noteLayout;w.orbBounds=clampBounds({...w.orbBounds,width:64,height:64,x:w.orbBounds?.x??(l.bounds.x+l.buttonX-14),y:w.orbBounds?.y??(l.bounds.y+l.buttonY-14)},screen.getDisplayMatching(w.paperBounds).workArea);w.layoutUntil=Date.now()+100;w.setBounds(w.orbBounds);w.lastNative=w.getBounds();}
    if(isNote(w))w.webContents.send('window-state',windowInfo(w));
    if (kind === 'ball' && origin) return;w.autoShow=true;object ? w.showInactive() : w.show();w.autoShow=false;if(kind==='ball')wakePile();
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  const remember = () => rememberWindow(w);
  w.on('moved', remember); w.on('resized', remember);
  w.on('close', e => { if (!quitting) { e.preventDefault();hideOwnedAI(w); w.hide(); } });
  w.on('closed', () => { stopMotion(w); w.finishHandoff?.(); windows.delete(key); }); return w;
}
function syncWindows(origin) {
  if (loadedBallId && !state.pages.some(p => p.id === loadedBallId && p.status === 'ball')) { loadedBallId = null; windows.get('sling')?.webContents.send('loaded', null); }
  for (const p of state.pages) if (p.status === 'pinned' && !windows.has(p.id)) open('pinned', p.id);
  for (const p of state.pages) if (p.status === 'ball' && !windows.has('ball:' + p.id)) open('ball', p.id, origin);
  for (const [key, w] of windows) {
    if (w.deskKind === 'pinned' && !state.pages.some(p => p.id === w.pageId && p.status === 'pinned')) {const panel=windows.get('ai:'+w.deskKey);if(panel){panel.ownerKey=null;panel.orphan=true;}w.destroy();}
    if (w.deskKind === 'ball' && !state.pages.some(p => p.id === w.pageId && p.status === 'ball')) w.destroy();
  }
}
async function encrypt(value) {
  if (safeStorage.encryptStringAsync) return safeStorage.encryptStringAsync(value);
  if (!safeStorage.isEncryptionAvailable()) throw Error('系统密钥加密不可用');
  return safeStorage.encryptString(value);
}
async function decrypt(value) {
  if (!safeStorage.decryptStringAsync) return safeStorage.decryptString(value);
  const decoded = await safeStorage.decryptStringAsync(value);
  if (decoded.shouldReEncrypt) fs.writeFileSync(keyFile, await encrypt(decoded.result));
  return decoded.result;
}
function endpoint(base) {
  const u = new URL(base);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw Error('远程服务必须使用 HTTPS');
  if (u.username || u.password || u.search || u.hash) throw Error('API 地址不能包含密码、参数或片段');
  return u.href.replace(/\/$/, '') + '/chat/completions';
}
function toggleAll(){hideAim();const visible=[...windows.values()].some(w=>w.isVisible());for(const w of windows.values())if(w.pageId!==loadedBallId)visible?w.hide():w.show();}
function newFromShortcut(){commit(s=>{const n=page('',s.settings.defaultStyle);s.pages.unshift(n);return n.id;}).then(id=>{broadcast();const book=open('book');book.webContents.send('select-page',id);if(book.collapsed)book.webContents.send('expand-request');book.focus();}).catch(err=>windows.get('book')?.webContents.send('notice',err.message));}
function showSettings(){const book=open('book');book.webContents.send('settings-request');}
function searchFromShortcut(){const shelf=open('shelf'),send=()=>shelf.webContents.send('search-request');if(shelf.webContents.isLoading())shelf.webContents.once('did-finish-load',send);else send();shelf.focus();}
ipcMain.handle('desk', async (e, action, p = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || ![...windows.values()].includes(w)) throw Error('无效窗口');
  if(action==='state'||action==='object-state'){const value=action==='object-state'?windowStateView(w):publicState();w.stateChannel??=StateSync.channel();w.stateChannel.next(windowStateView(w));return {...value,visual:w.motionVisual,loadedBallId,windowInfo:windowInfo(w)};}
  if(action==='shortcuts'){
    let previous;
    try{await commit(s=>{previous=shortcutManager.current();const next=shortcutManager.apply(p.shortcuts);s.settings={...s.settings,shortcuts:next};});}catch(err){if(previous)shortcutManager.apply(previous);throw err;}
    broadcast();return publicState();
  }
  if(action==='desktop-preferences'){
    if(!Object.keys(p).length||Object.keys(p).some(k=>!['fullscreenAvoid','sound','volume'].includes(k))||['fullscreenAvoid','sound'].some(k=>k in p&&typeof p[k]!=='boolean')||('volume'in p&&(!Number.isFinite(p.volume)||p.volume<0||p.volume>1)))throw Error('无效桌面设置');
    await commit(s=>{s.settings={...s.settings,...p};});
    configureFullscreen(state.settings.fullscreenAvoid===true);broadcast();return publicState();
  }
  if(action==='selection'){if(isNote(w)&&state.pages.some(n=>n.id===p.id)){w.activePage=p.id;if(w.noteLayout?.shape!==noteShape(w))layoutNote(w);}return;}
  if(action==='tools-layout'){if(!isNote(w)||w.collapsed)return windowInfo(w);w.toolsOpen=p.open===true;return windowInfo(w);}
  if(action==='dock-preference'){if(!isNote(w))return;if(['auto','left','right'].includes(p.side))w.sidePref=p.side;if(typeof p.snap==='boolean')w.snapOrb=p.snap;layoutNote(w);persistNote(w);return windowInfo(w);}
  if(action==='orb-menu'){if(!isNote(w)||!w.collapsed)return;Menu.buildFromTemplate([{label:'展开便签',click:()=>w.webContents.send('expand-request')},{label:'始终置顶',type:'checkbox',checked:w.isAlwaysOnTop(),click:item=>{w.setAlwaysOnTop(item.checked);persistNote(w);w.webContents.send('window-state',windowInfo(w));}},{label:'隐藏',click:()=>w.hide()}]).popup({window:w});return;}
  if(action==='ai-open'){
    if(!isNote(w))return;const key='ai:'+w.deskKey;let panel=windows.get(key);
    if(!panel){panel=[...windows.values()].find(n=>n.deskKind==='ai'&&n.orphan);if(panel){windows.delete(panel.deskKey);panel.deskKey=key;panel.ownerKey=w.deskKey;panel.orphan=false;windows.set(key,panel);}}
    if(panel)panel.ownerKey=w.deskKey;
    if(!panel){panel=open('ai',key);panel.ownerKey=w.deskKey;panel.targetId=p.id;panel.webContents.once('did-finish-load',()=>panel.webContents.send('window-state',windowInfo(panel)));}
    panel.setAlwaysOnTop(w.isAlwaysOnTop());positionAI(w);panel.show();return;
  }
  if(action==='ai-retarget'){if(w.deskKind!=='ai')return;const owner=windows.get(w.ownerKey);const id=owner?.activePage||owner?.pageId||state.pages.find(n=>n.status==='book')?.id;w.targetId=id;return id;}
  if(action==='ai-import'){
    const texts=p.pages??[p.text];
    if(w.deskKind!=='ai'||!['new','append','pinned'].includes(p.target)||!Array.isArray(texts)||!texts.length||texts.length>100||texts.some(t=>typeof t!=='string'||!t.trim())||texts.reduce((n,t)=>n+t.length,0)>500000)throw Error('请检查录入内容（最多 100 页）');
    if(p.target==='append'&&texts.length!==1)throw Error('拆页内容请选择新建一页或钉到桌面');
    if(p.requestId!==undefined&&(typeof p.requestId!=='string'||p.requestId.length>64))throw Error('无效录入标识');
    const fingerprint=JSON.stringify([p.target,texts,w.targetId]);
    const cached=w.imports?.get(p.requestId);
    if(cached){if(cached.fingerprint!==fingerprint)throw Error('录入内容已变化，请重新确认');return {...publicState(),importedIds:cached.ids};}
    w.importQueue??=Promise.resolve();const importing=w.importQueue.then(async()=>{
      const cached=w.imports?.get(p.requestId);if(cached){if(cached.fingerprint!==fingerprint)throw Error('录入内容已变化，请重新确认');return cached.ids;}
      const ids=await commit(candidate=>{const ids=[];
        if(p.target==='append'){const n=candidate.pages.find(n=>n.id===w.targetId&&['book','pinned'].includes(n.status));if(!n)throw Error('原目标页已撕下或移走，请明确改用当前页再追加');n.rich=RichText.normalize([...RichText.normalize(n.rich,n.text),{text:(n.text?'\n':'')+texts[0]}]);n.text=RichText.text(n.rich);n.updated=Date.now();ids.push(n.id);}
        else{const created=texts.map(text=>{const n=page(text,candidate.settings.defaultStyle);if(p.target==='pinned')n.status='pinned';ids.push(n.id);return n;});candidate.pages.unshift(...created);}return ids;
      });
      if(p.requestId){w.imports??=new Map();w.imports.set(p.requestId,{fingerprint,ids});if(w.imports.size>20)w.imports.delete(w.imports.keys().next().value);}return ids;
    });w.importQueue=importing.catch(()=>{});const ids=await importing;
    syncWindows();broadcast();const owner=windows.get(w.ownerKey);if(p.target==='new')windows.get('book')?.webContents.send('select-page',ids[0]);else if(p.target==='append')owner?.webContents.send('select-page',ids[0]);return {...publicState(),importedIds:ids};
  }
  if (action === 'backup-export') {
    const result = await dialog.showSaveDialog(w,{title:'导出便签备份（不含 API Key）',defaultPath:'纸想摸鱼备份.json',filters:[{name:'纸想摸鱼备份',extensions:['json']}]});
    if(result.canceled)return false;
    await fs.promises.writeFile(result.filePath,JSON.stringify(exportBackup(state),null,2),'utf8');return true;
  }
  if (action === 'backup-import') {
    const result=await dialog.showOpenDialog(w,{title:'导入备份，合并并保留现有内容',properties:['openFile'],filters:[{name:'纸想摸鱼备份',extensions:['json']}]});
    if(result.canceled)return false;
    if(fs.statSync(result.filePaths[0]).size>25*1024*1024)throw Error('备份文件超过 25 MB');
    const backup=JSON.parse(await fs.promises.readFile(result.filePaths[0],'utf8'));
    await commit(s=>Object.assign(s,importBackup(s,backup)));syncWindows();broadcast();return true;
  }
  if (action === 'trash-clear') {
    const count=state.pages.filter(p=>p.status==='trash').length;if(!count)return;
    const answer=await dialog.showMessageBox(w,{type:'warning',message:`永久删除回收站中的 ${count} 张便签？此操作不可恢复。`,buttons:['取消','清空回收站'],defaultId:0,cancelId:0});
    if(answer.response!==1)return;await commit(s=>{s.pages=s.pages.filter(p=>p.status!=='trash');});broadcast();return;
  }
  if(action==='recycle-ready'){w.recycleReady?.();return;}
  if(action==='sound-preview'){playSound('tear');return;}
  if(action==='sound-effect'){if(['tear','crumple','unfold'].includes(p.type))playSound(p.type);return;}
  if(action==='paper-preset'){if(!isNote(w)||w.collapsed||w.locked)throw Error('请先展开并解锁便签');const presets={small:[320,360],normal:[370,470],large:[520,640]};if(!presets[p.size])throw Error('无效尺寸');const [width,height]=presets[p.size];w.paperZoom=1;w.paperBase={width:width-24,height:height-78};w.paperBounds={...w.paperBounds,width,height};layoutNote(w);persistNote(w);return windowInfo(w);}
  if(action==='paper-zoom'){
    if(!isNote(w)||w.collapsed||w.locked||w.gesture)throw Error('请先展开并解锁便签');
    if(p.reset!==true&&(!Number.isFinite(p.factor)||p.factor<=0))throw Error('无效缩放比例');
    const result=zoomPaper(w.paperBounds,w.paperBase,p.reset?1:w.paperZoom*p.factor,screen.getDisplayMatching(w.paperBounds).workArea);
    w.paperZoom=result.zoom;w.paperBounds=result.paper;layoutNote(w,false);persistNote(w);return windowInfo(w);
  }
  if (action === 'object-ready') {
    if(w.deskKind==='ball'){const origin=w.motionOrigin;if(w.finishHandoff){w.showInactive();fall(w,origin);w.finishHandoff();w.finishHandoff=null;}w.motionVisual=null;w.motionOrigin=null;}
    return;
  }
  if (action === 'hit-test') { if (!w.gesture) w.setIgnoreMouseEvents(p.ignore === true, { forward: true }); return; }
  if (action === 'bin') { const bin = windows.get('bin'); if (bin?.isVisible()) bin.hide(); else open('bin'); return; }
  if (action === 'sling') { const sling = windows.get('sling'); if (sling?.isVisible()) { unloadSling(); sling.hide(); } else open('sling'); return; }
  if (action === 'sling-unload') { unloadSling(); return; }
  if(action==='bin-upright'){if(w.deskKind==='bin')setBinPose(w,false);return;}
  if(action==='bin-menu'){if(w.deskKind!=='bin')return;Menu.buildFromTemplate([{label:'扶正垃圾桶',enabled:!!w.binTipped,click:()=>setBinPose(w,false)},{label:'打开回收管理',click:()=>open('shelf')},{label:'收起垃圾桶',click:()=>w.hide()}]).popup({window:w});return;}
  if (action === 'sling-aim') {
    if(w.deskKind!=='sling')return;
    if(p.cancel||!loadedBallId){hideAim();return;}
    if(!Number.isFinite(p.dx)||!Number.isFinite(p.dy))return;
    const b=w.getBounds(),area=screen.getDisplayMatching(b).workArea,v=Toys.launch(p.dx,p.dy),start={x:b.x+(Toys.SLING.x+v.dx)*b.width/Toys.SLING.width,y:b.y+(Toys.SLING.y+v.dy)*b.height/Toys.SLING.height},bin=windows.get('bin');
    const sameDisplay=bin?.isVisible()&&screen.getDisplayMatching(bin.getBounds()).id===screen.getDisplayMatching(b).id;
    const prediction=Toys.predict(start,v,area,sameDisplay?binGeometry(bin):null);bin?.webContents.send('toy',{type:'bin-aim',active:prediction.target==='capture'});
    aimSend({mode:'aim',points:prediction.points.map(p=>({x:p.x-area.x,y:p.y-area.y})),target:prediction.target},area);return;
  }
  if (action === 'sling-shot') {
    if (w.deskKind !== 'sling' || !loadedBallId) throw Error('请先将纸团拖到弹弓上');
    if (!Number.isFinite(p.dx) || !Number.isFinite(p.dy)) throw Error('无效发射方向');
    const length = Math.hypot(p.dx, p.dy),velocity=Toys.launch(p.dx,p.dy);
    if (length < 8) return;
    playSound('launch');unloadSling({ x:velocity.vx,y:velocity.vy },velocity); return;
  }
  if (action === 'object-preview') {
    if (w.deskKind !== 'ball') return;
    stopMotion(w);
    if (p.open && !w.previewBounds) { w.previewBounds = w.getBounds(); const old = w.previewBounds; w.setBounds(boundsWithin({ x: old.x + old.width / 2 - 195, y: old.y + old.height / 2 - 205, width: 390, height: 410 }, old)); w.focus(); }
    const expanded = w.getBounds(), small = w.previewBounds;
    const from = small ? { x: small.x + small.width / 2 - expanded.x, y: small.y + small.height / 2 - expanded.y } : null;
    if (!p.open && w.previewBounds) { const original = w.previewBounds; w.setBounds(original); w.previewBounds = null; if(!w.recycling)fall(w); }
    if(p.open)playSound('unfold');
    return { from };
  }
  if (action === 'gesture') {
    if(w.recycling||(w.locked&&!w.collapsed))return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw Error('无效拖动坐标');
    if (p.phase === 'start') {
      stopMotion(w); w.setIgnoreMouseEvents(false); w.gesture = { x: p.x, y: p.y, bounds: isNote(w)&&!w.collapsed?w.paperBounds:w.getBounds(), zoom:w.paperZoom,base:w.paperBase,resize: p.resize === true||p.resize==='left'||p.resize==='right',sheetResize:p.shift===true,side:p.resize==='left'?'left':'right',paperBefore:w.paperBounds?{...w.paperBounds}:null }; return;
    }
    const g = w.gesture; if (!g) return;
    if (p.phase === 'cancel') { w.gesture = null;if(isNote(w)&&!w.collapsed){w.paperBounds=g.bounds;w.paperZoom=g.zoom;w.paperBase=g.base;layoutNote(w);}else if(!["x","y","width","height"].every(k=>w.getBounds()[k]===g.bounds[k]))w.setBounds(g.bounds); hintTarget(null); return; }
    const dx = p.x - g.x, dy = p.y - g.y;
    if (g.resize) {
      const area = screen.getDisplayMatching(g.bounds).workArea;
      if(isNote(w)){
        if(g.sheetResize){w.paperZoom=g.zoom;w.paperBounds=resizePaper(g.bounds,dx,dy,g.side,noteShape(w)==='circle',area,w.noteLayout?.side);w.paperBase={width:(w.paperBounds.width-24)/g.zoom,height:(w.paperBounds.height-78)/g.zoom};}
        else{const dw=(g.side==='left'?-dx:dx)/(g.bounds.width-24),dh=dy/(g.bounds.height-78),result=zoomPaper(g.bounds,g.base,g.zoom*(1+(Math.abs(dw)>Math.abs(dh)?dw:dh)),area,g.side);w.paperZoom=result.zoom;w.paperBounds=result.paper;}
        layoutNote(w,false);
      }
      else w.setBounds(clampBounds({ ...g.bounds, width: Math.max(320, g.bounds.width + dx), height: Math.max(360, g.bounds.height + dy) }, area));
    } else {
      const next = { ...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy };
      if(isNote(w)&&!w.collapsed){w.paperBounds=clampBounds(next,screen.getDisplayMatching(next).workArea);layoutNote(w,false);}else w.setBounds(clampBounds(next, screen.getDisplayMatching(next).workArea));
    }
    const target = w.deskKind === 'ball' ? dropTarget({ x: p.x, y: p.y }) : null;
    if (w.deskKind === 'ball') hintTarget(target);
    if (p.phase === 'end') {
      w.gesture = null; hintTarget(null);
      if(isNote(w)){
        if(w.collapsed){const b=w.getBounds(),a=screen.getDisplayMatching(b).workArea;if(w.snapOrb!==false){if(b.x-a.x<40)b.x=a.x+6;else if(a.x+a.width-b.x-b.width<40)b.x=a.x+a.width-b.width-6;w.setBounds(b);}w.orbBounds=w.getBounds();}
        else layoutNote(w);w.lastNative=w.getBounds();persistNote(w);return;
      }
      if (target === 'sling') { if (loadedBallId) unloadSling(); loadedBallId = w.pageId; stopMotion(w); w.hide(); windows.get('sling').webContents.send('loaded', loadedBallId); return target; }
      if(target==='trash'){await recycleBall(w);return target;}
      if (target) { await commit(s=>change(s,w.pageId,target));syncWindows();broadcast(); if (target === 'book'){playSound('unfold');windows.get('book')?.webContents.send('restored', w.pageId);} return target; }
      if (w.deskKind === 'ball') fall(w); else rememberWindow(w);
    }
    return;
  }
  if (action === 'window') {
    if (p.op === 'lock') { w.locked=!w.locked;w.setMovable(!w.locked);isNote(w)?persistNote(w):rememberWindow(w);w.webContents.send('window-state',windowInfo(w));return w.locked; }
    if (p.op === 'hide') {hideOwnedAI(w);w.hide();}
    if (p.op === 'top') { w.setAlwaysOnTop(!w.isAlwaysOnTop());windows.get('ai:'+w.deskKey)?.setAlwaysOnTop(w.isAlwaysOnTop());isNote(w)?persistNote(w):rememberWindow(w); }
    if (p.op === 'collapse') {
      if(!isNote(w))return windowInfo(w);w.layoutUntil=Date.now()+100;
      if(!w.collapsed){hideOwnedAI(w);const l=w.noteLayout;w.collapsed=true;w.toolsOpen=false;w.setMinimumSize(64,64);w.orbBounds=clampBounds({x:l.bounds.x+l.buttonX-14,y:l.bounds.y+l.buttonY-14,width:64,height:64},screen.getDisplayMatching(w.paperBounds).workArea);w.setBounds(w.orbBounds);}
      else{const b=w.getBounds(),l=w.noteLayout;w.collapsed=false;w.setMinimumSize(320,360);w.paperBounds={...w.paperBounds,x:Math.round(b.x+14-(l.buttonX-l.paperX)),y:Math.round(b.y+14-l.buttonY)};layoutNote(w);if(w.aiWasVisible){positionAI(w);windows.get('ai:'+w.deskKey)?.show();}}
      w.lastNative=w.getBounds();persistNote(w);return windowInfo(w);
    }
    return w.isAlwaysOnTop();
  }
  if (action === 'shelf') { open('shelf'); return; }
  if(action==='gather') {
    const area=screen.getDisplayMatching(w.paperBounds||w.getBounds()).workArea;
    const balls=[...windows.values()].filter(n=>n.deskKind==='ball'&&n.pageId!==loadedBallId&&!n.previewBounds&&!n.gesture&&!n.finishHandoff);
    const obstacles=['bin','sling'].map(k=>windows.get(k)).filter(n=>n?.isVisible()).map(n=>n.getBounds());
    const slots=gatherSlots(area,balls.length,obstacles);hideAim();
    for(let i=0;i<slots.length;i++){const ball=balls[i];stopMotion(ball);ball.setBounds(slots[i]);ball.showInactive();rememberWindow(ball);}
    return slots.length;
  }
  if (action === 'cancel') { request?.abort(); return; }
  if (action === 'recognize') {
    if (request) throw Error('已有识别任务正在进行');
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(p.image || '') || p.image.length > 14e6) throw Error('请选择不超过 10 MB 的 PNG、JPG 或 WebP 图片');
    if (!state.settings.model || !fs.existsSync(keyFile)) throw Error('请先配置视觉模型与 API Key');
    const url = endpoint(state.settings.base);
    const token = await decrypt(fs.readFileSync(keyFile));
    request = new AbortController(); const timer = setTimeout(() => request?.abort(), 90000);
    try {
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: request.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model: state.settings.model, messages: AIPrompts.messages(p.image, p.mode) }) });
      if (!response.ok) throw Error(({401:'密钥无效',403:'服务拒绝访问',429:'额度不足或请求过于频繁',400:'请求不兼容，请检查模型是否支持图片'})[response.status] || `服务错误（${response.status}）`);
      const json = await response.json(); const text = json.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw Error('模型未返回可用文字'); return text;
    } catch (err) { if (err.name === 'AbortError') throw Error('识别已取消或超时'); throw err; }
    finally { clearTimeout(timer); request = null; }
  }
  if(action==='move'&&p.status==='trash'){const ball=windows.get('ball:'+p.id);if(ball){await recycleBall(ball);return publicState();}}
  if(action==='delete'){if(!state.pages.some(n=>n.id===p.id&&n.status==='trash'))throw Error('只能永久删除回收站中的页面');const result=await dialog.showMessageBox(w,{type:'warning',message:'永久删除这张便签？此操作不可恢复。',buttons:['取消','永久删除'],defaultId:0,cancelId:0});if(result.response!==1)return publicState();}
  await commit(async state=>{
  if (action === 'settings') {
    endpoint(p.base);
    if (typeof p.model !== 'string') throw Error('请输入模型名称');
    if (p.apiKey) fs.writeFileSync(keyFile, await encrypt(p.apiKey));
    if (p.clearKey && fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
    state.settings = { ...state.settings, base: p.base, model: p.model.trim(), motion: p.motion !== false };
  } else if(action==='default-style') {const source=state.pages.find(n=>n.id===p.id);if(!p.reset&&!source)throw Error('页面不存在');state.settings.defaultStyle=paperStyle(p.reset?{}:source);}
  else if (action === 'new') { const n = page(p.text || '',state.settings.defaultStyle); if (p.pinned) n.status = 'pinned'; state.pages.unshift(n); }
  else if (action === 'edit') {
    const n = state.pages.find(x => x.id === p.id); if (!n) throw Error('页面不存在');
    if(Array.isArray(p.rich)){n.rich=RichText.normalize(p.rich);n.text=RichText.text(n.rich);}else if(typeof p.text==='string'&&p.text!==n.text){n.text=p.text;delete n.rich;}
    if (/^#[0-9a-f]{6}$/i.test(p.color || '')) n.color = p.color;
    if (['print','hand'].includes(p.font)) n.font = p.font;
    if (PaperShape.shapes.includes(p.shape)) n.shape = p.shape;
    if (['plain','lined','grid'].includes(p.texture)) n.texture = p.texture;
    if (Number.isFinite(p.size)) n.size = Math.max(12, Math.min(40, p.size));
    if (typeof p.bold==='boolean') n.bold=p.bold;
    if (['left','center','right'].includes(p.align)) n.align=p.align;
    if (/^#[0-9a-f]{6}$/i.test(p.ink||'')) n.ink=p.ink;
    n.updated = Date.now();
  } else if (action === 'move') { if(p.status==='book')playSound('unfold');const changed = change(state, p.id, p.status); if (p.visual && Number.isFinite(p.visual.width) && Number.isFinite(p.visual.height)) changed.paperSize = { width: Math.max(100, Math.min(2000, p.visual.width)), height: Math.max(100, Math.min(2000, p.visual.height)) }; }
  else if (action === 'delete') {
    const n = state.pages.find(x => x.id === p.id && x.status === 'trash'); if (!n) throw Error('只能永久删除回收站中的页面');
    state.pages = state.pages.filter(x => x.id !== p.id);
  } else throw Error('未知操作');
  });
  const origin = action === 'move' && p.status === 'ball' ? { ...w.getBounds() } : null;
  if (origin && p.visual?.image?.startsWith('data:image/png;base64,') && p.visual.image.length < 8e6) origin.visual = p.visual;
  if (origin && Number.isFinite(p.ballPoint?.x) && Number.isFinite(p.ballPoint?.y)) origin.ballPoint = { x: Math.max(0, Math.min(origin.width, p.ballPoint.x)), y: Math.max(0, Math.min(origin.height, p.ballPoint.y)) };
  syncWindows(origin);broadcast();
  if (origin) { const ball = windows.get('ball:' + p.id); if (ball?.handoff) await Promise.race([ball.handoff, new Promise(resolve => setTimeout(resolve, 5000))]); }
  if (action === 'move' && p.status === 'book') windows.get('book')?.webContents.send('restored', p.id);
  if(action==='edit'&&p.ackOnly===true)return {saved:true};
  return publicState();
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => open('book'));
  app.whenReady().then(() => {
    dataFile = path.join(app.getPath('userData'), 'notes.json'); keyFile = path.join(app.getPath('userData'), 'api-key.enc');
    try { state = fs.existsSync(dataFile) ? validate(JSON.parse(fs.readFileSync(dataFile, 'utf8'))) : initial(); }
    catch { dialog.showErrorBox('无法读取便签数据', `原文件已保留，请检查 ${dataFile} 及 .bak 备份。应用不会覆盖损坏的数据。`); app.quit(); return; }
    store=createStore(dataFile);open('book');syncWindows();
    const iconPath=path.join(__dirname,'..','assets','tray.png');
    const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
    tray = new Tray(icon); tray.setToolTip('纸想摸鱼 · 桌面便签本');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开便签本', click: () => open('book') }, {label:'新建便签',click:newFromShortcut}, { label: '便签管理', click: () => open('shelf') },{label:'设置',click:showSettings}, { label: '显示全部', click: () => { for (const w of windows.values()) w.show(); } }, { label: '隐藏全部', click: () => { for (const w of windows.values()) w.hide(); } }, { type: 'separator' }, { label: '退出', click: () => app.quit() }]));
    tray.on('double-click', () => open('book'));
    shortcutManager=Shortcuts.createManager(globalShortcut,{toggle:toggleAll,new:newFromShortcut,search:searchFromShortcut});
    try{shortcutManager.apply(state.settings.shortcuts||Shortcuts.defaults);}catch(err){windows.get('book').webContents.once('did-finish-load',()=>windows.get('book')?.webContents.send('notice',err.message));}
    fullscreenWatcher=createWatcher({onSample:applyFullscreenSample,onError:message=>windows.get('book')?.webContents.send('notice',message)});
    configureFullscreen(state.settings.fullscreenAvoid===true);
    screen.on('display-removed',queueReflow);screen.on('display-added',queueReflow);
    screen.on('display-metrics-changed',(_event,_display,metrics)=>{if(metrics.some(k=>['bounds','workArea','scaleFactor','rotation'].includes(k)))queueReflow();});
  });
  app.on('before-quit',e=>{
    if(quitReady)return;e.preventDefault();if(quitting)return;quitting=true;clearTimeout(reflowTimer);clearInterval(pileTimer);pileTimer=null;fullscreenWatcher?.stop();hideAim();globalShortcut.unregisterAll();
    mutationTail.then(()=>store?.flush()).then(()=>{quitReady=true;app.quit();}).catch(err=>{quitting=false;windows.get('book')?.webContents.send('notice','保存尚未完成：'+err.message);});
  });
}
module.exports={reflowDesktop,applyFullscreenSample};
