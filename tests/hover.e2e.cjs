const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
(async () => {
  const profile = path.resolve('test-results','hover-'+Date.now()); fs.mkdirSync(profile,{recursive:true});
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.PAPERDESK_TEST_EXE;
  const app=await electron.launch({executablePath,args:executablePath?['--user-data-dir='+profile]:['.','--user-data-dir='+profile],env});
  let p;
  try {
    app.context().setDefaultTimeout(12000);
    p=await app.firstWindow();await p.locator('#text').waitFor();
    await p.evaluate(()=>{window.pointerTrace=[];for(const name of ['pointerenter','pointerleave','pointermove'])document.addEventListener(name,e=>{if(['tools','side-menu'].includes(e.target.id)||e.target===document.body){window.pointerTrace.push({type:e.type,target:e.target.id||'body',x:e.clientX,y:e.clientY,time:Date.now()});if(window.pointerTrace.length>60)window.pointerTrace.shift();}},true);});
    await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),a=screen.getDisplayMatching(w.paperBounds).workArea;// Keep real desktop mouse motion from mixing with CDP test input.
    w.webContents.setBackgroundThrottling(false);if(process.env.PAPERDESK_CAPTURE_HOVER!=='1'){w.on('show',()=>w.hide());w.hide();}w.paperBounds.x=Math.round(a.x+(a.width-w.paperBounds.width)/2);const set=w.setBounds.bind(w),ignore=w.setIgnoreMouseEvents.bind(w);w.hoverBoundsCalls=0;w.setBounds=(...args)=>{w.hoverBoundsCalls++;return set(...args)};w.setIgnoreMouseEvents=(value,...args)=>{w.hoverIgnored=value;return ignore(value,...args)};});
    for(const side of ['left','right']) {
      console.log('Checking hover side: '+side);
      await p.evaluate(side=>window.desk.call('dock-preference',{side}),side);
      await p.locator('#text').hover({force:true});await p.waitForFunction(()=>!document.body.classList.contains('tools-open'),undefined,{polling:50});
      await p.waitForTimeout(50);
      const before=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');w.hoverBoundsCalls=0;return w.getBounds()});
      const button=await p.locator('#tools').boundingBox();
      await p.evaluate(()=>{window.hoverStates=[];let old=document.body.classList.contains('tools-open');window.hoverObserver?.disconnect();window.hoverObserver=new MutationObserver(()=>{const next=document.body.classList.contains('tools-open');if(next!==old){window.hoverStates.push(next);old=next}});window.hoverObserver.observe(document.body,{attributes:true,attributeFilter:['class']});});
      for(let round=0;round<3;round++) {
        await p.locator('#tools').hover({force:true});await p.locator('#side-menu').waitFor();
        const after=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').getBounds());
        assert.deepEqual(after,before,side+' hover must not resize or move native window');
        assert.deepEqual(await p.locator('#tools').boundingBox(),button,'button remains under stationary pointer');
        if(round===0&&process.env.PAPERDESK_CAPTURE_HOVER==='1')await p.screenshot({path:'test-results/hover-'+side+'-open.png',omitBackground:true});
        await p.waitForTimeout(750);assert(await p.locator('#side-menu').isVisible(),'stationary hover must not oscillate');
        await p.locator('#side-menu').hover({force:true});await p.waitForTimeout(700);assert(await p.locator('#side-menu').isVisible(),'crossing the gap must keep menu open');
        await p.locator('#text').hover({force:true});await p.waitForFunction(()=>!document.body.classList.contains('tools-open'),undefined,{polling:50});
      }
      assert.deepEqual(await p.evaluate(()=>window.hoverStates),[true,false,true,false,true,false]);
      assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').hoverBoundsCalls),0);
      // Hidden menu space must let clicks through, then return to interactive on paper.
      const blank=await p.evaluate(()=>({x:document.body.dataset.side==='left'?30:parseFloat(document.body.style.getPropertyValue('--paper-x'))+parseFloat(document.body.style.getPropertyValue('--paper-w'))+80,y:25}));
      await p.mouse.move(blank.x,blank.y);
      await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');for(let i=0;i<30&&!w.hoverIgnored;i++)await new Promise(r=>setTimeout(r,20));if(!w.hoverIgnored)throw Error('hidden menu did not become click-through')});
      await p.locator('#tools').hover({force:true});await p.locator('#side-menu').waitFor();
      assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').hoverIgnored),false);
      await p.locator('#tools').click({force:true});await p.locator('#text').hover({force:true});await p.waitForTimeout(750);assert(await p.locator('#side-menu').isVisible(),'click pins menu');
      await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.body.classList.contains('tools-open'),undefined,{polling:50});
      await p.locator('#tools').hover({force:true});await p.locator('#side-menu').waitFor();await p.locator('#side-menu').hover({force:true});await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.body.classList.contains('tools-open'),undefined,{polling:50});
      await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');for(let i=0;i<30&&!w.hoverIgnored;i++)await new Promise(r=>setTimeout(r,20));if(!w.hoverIgnored)throw Error('stationary mouse must become click-through when menu closes')});
    }
    console.log('PASS: left/right repeated hover, stable native bounds and button position, no oscillation, gap crossing, click-through, pinned menu and Escape');
  } catch(e) { if(p)console.error(JSON.stringify(await p.evaluate(()=>({events:window.pointerTrace,body:document.body.className,button:document.querySelector('#tools').getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]}))));throw e; } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
