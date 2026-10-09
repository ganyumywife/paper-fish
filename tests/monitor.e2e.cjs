const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.PAPERDESK_TEST_EXE,profile='--user-data-dir='+path.resolve('test-results','monitor-'+Date.now());let app;
  const start=async()=>{app=await electron.launch({executablePath,args:executablePath?[profile]:['.',profile],env});app.context().setDefaultTimeout(15000);const p=await app.firstWindow();await p.locator('#text[contenteditable=true]').waitFor();return p;};
  try{
    let book=await start();await book.locator('#text').fill('多屏恢复不能丢失内容');await book.locator('#tools').click();
    const aiEvent=app.waitForEvent('window');await book.locator('#ai').click();const ai=await aiEvent;await ai.locator('#ai-result').fill('保留侧窗草稿');
    // Inject display work areas, leaving the real monitor configuration untouched.
    const check=await app.evaluate(({BrowserWindow,screen,app})=>{
      const main=process.mainModule.require(app.getAppPath()+'/src/main.cjs');
      const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),panel=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ai');
      const get=screen.getDisplayMatching.bind(screen),display=screen.getPrimaryDisplay();
      const a={x:-960,y:0,width:960,height:720};screen.getDisplayMatching=()=>({...display,workArea:a});
      w.paperBounds={x:-1500,y:800,width:500,height:550};w.layoutUntil=Date.now()+1000;
      main.reflowDesktop();const first={paper:{...w.paperBounds},layout:w.noteLayout,bounds:w.getBounds(),panel:panel.getBounds()};
      const smaller={x:0,y:0,width:640,height:600};screen.getDisplayMatching=()=>({...display,workArea:smaller,scaleFactor:1.5});
      // Dispatch the same event used for real resolution / scaling changes below.
      globalThis.testDisplayOriginal=get;globalThis.testDisplayArea=smaller;
      screen.emit('display-metrics-changed',{},display,['scaleFactor','workArea']);
      return {first,area:a};
    });
    const within=(b,a)=>assert(b.x>=a.x-1&&b.y>=a.y-1&&b.x+b.width<=a.x+a.width+1&&b.y+b.height<=a.y+a.height+1,JSON.stringify({b,a}));
    within(check.first.paper,check.area);within(check.first.panel,check.area);assert.equal(check.first.bounds.x+check.first.layout.paperX,check.first.paper.x);
    await book.waitForTimeout(350);
    const compact=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');return {paper:w.paperBounds,ai:BrowserWindow.getAllWindows().find(w=>w.deskKind==='ai').getBounds(),area:globalThis.testDisplayArea};});
    within(compact.paper,compact.area);within(compact.ai,compact.area);assert.equal(await ai.locator('#ai-result').inputValue(),'保留侧窗草稿');
    await app.evaluate(({screen})=>{screen.getDisplayMatching=globalThis.testDisplayOriginal;delete globalThis.testDisplayOriginal;});
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#collapse').click();await book.locator('#orb').waitFor();
    const orb=await app.evaluate(({BrowserWindow,screen,app})=>{
      const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');w.layoutUntil=Date.now()+1000;w.setBounds({x:-8000,y:-8000,width:64,height:64});
      process.mainModule.require(app.getAppPath()+'/src/main.cjs').reflowDesktop();return {bounds:w.getBounds(),area:screen.getDisplayMatching(w.getBounds()).workArea,paper:w.paperBounds};
    });within(orb.bounds,orb.area);within(orb.paper,orb.area);
    await book.locator('#orb').click();await book.waitForFunction(()=>!document.body.classList.contains('shell-transition'));await book.locator('#tools').click();await book.locator('#settings').click();
    await book.locator('#fullscreen-avoid').check();await book.waitForFunction(()=> state.settings.fullscreenAvoid===true);
    await book.evaluate(async()=>{const s=await window.desk.call('new',{text:'暂停中的纸团'});await window.desk.call('move',{id:s.pages[0].id,status:'ball'});});
    const policy=await app.evaluate(({BrowserWindow,screen,app})=>{
      const main=process.mainModule.require(app.getAppPath()+'/src/main.cjs'),w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),panel=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ai');
      const r=screen.dipToScreenRect(null,screen.getDisplayMatching(w.paperBounds).bounds),full={fullscreen:true,pid:process.pid+10000,handle:'synthetic',...r};
      const ball=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball');
      panel.hide();main.applyFullscreenSample(full);const hidden=!w.isVisible()&&!panel.isVisible();const paused=!ball.fallTimer&&!ball.isVisible();
      main.applyFullscreenSample({fullscreen:false});const restore=w.isVisible()&&!panel.isVisible();const resumed=!!ball.fallTimer&&ball.isVisible();
      main.applyFullscreenSample(full);w.hide();main.applyFullscreenSample({fullscreen:false});const manual=!w.isVisible();
      w.show();main.applyFullscreenSample(full);w.show();main.applyFullscreenSample(full);const override=w.isVisible();
      main.applyFullscreenSample({fullscreen:false});return {hidden,restore,manual,override,paused,resumed};
    });assert.deepEqual(policy,{hidden:true,restore:true,manual:true,override:true,paused:true,resumed:true});
    await book.locator('#fullscreen-avoid').uncheck();await book.waitForFunction(()=>!state.settings.fullscreenAvoid);
    await book.locator('#settings-dialog [data-close]').click();
    await app.close();book=await start();const state=await book.evaluate(()=>window.desk.call('state'));
    assert(state.pages.some(p=>p.text==='多屏恢复不能丢失内容'));assert.equal(state.settings.fullscreenAvoid,false);
    console.log('PASS: negative display recovery, metrics debounce, smaller work area, AI draft/following, collapsed orb recovery, scoped fullscreen suppression, manual visibility priority, restart persistence');
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
