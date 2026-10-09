const {_electron:electron}=require('@playwright/test'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const profile=path.resolve('test-results','zoom-'+Date.now()),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(profile,{recursive:true});const seed=require('../src/model.cjs').initial();seed.settings.base='https://example.invalid/v1';seed.settings.model='configured-vision';
  fs.writeFileSync(path.join(profile,'notes.json'),JSON.stringify(seed));const keyMarker=Buffer.from('isolated-key-preservation-fixture');fs.writeFileSync(path.join(profile,'api-key.enc'),keyMarker);
  let app;const errors=[];
  const start=async()=>{
    const executablePath=process.env.PAPERDESK_TEST_EXE;app=await electron.launch({executablePath,args:[...(executablePath?[]:['.']),'--user-data-dir='+profile],env});app.context().setDefaultTimeout(15000);
    const book=await app.firstWindow();book.on('pageerror',e=>errors.push(e.message));await book.locator('#text[contenteditable=true]').waitFor();
    await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),a=screen.getDisplayMatching(w.paperBounds).workArea;w.webContents.setBackgroundThrottling(false);w.paperBounds.x=Math.round(a.x+(a.width-w.paperBounds.width)/2);w.paperBounds.y=a.y+50;});
    await book.evaluate(async()=>applyWindowInfo(await window.desk.call('dock-preference',{side:'auto'})));return book;
  };
  const layout=book=>book.evaluate(()=>{const s=document.querySelector('#sheet'),t=document.querySelector('#text'),r=s.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(t);return {base:[s.clientWidth,s.clientHeight],field:[t.clientWidth,t.clientHeight,t.scrollHeight],wrapRects:range.getClientRects().length,zoom:windowState.layout.zoom,physical:[r.width,r.height],paper:windowState.layout.paper,scroll:t.scrollTop,rich:JSON.stringify(current().rich),size:current().size,selection:editor.selection()};});
  try{
    let book=await start();
    for(const shape of ['rounded','square','circle','heart','torn']){
      console.log('Checking zoom: '+shape);
      await book.evaluate(async shape=>{applyWindowInfo(await window.desk.call('paper-preset',{size:'normal'}));await queueEdit({shape,font:'print',size:20,texture:'grid',text:'重点\n'+('111111111111111111111111\n'.repeat(25)),rich:[{text:'重点',size:28,bold:true},{text:'\n'+('111111111111111111111111\n'.repeat(25))}]});await window.desk.call('selection',{id:current().id});document.querySelector('#text').scrollTop=90;editor.select(0,2);},shape);
      const before=await layout(book);
      await book.evaluate(()=>zoomNote({factor:1.25}));const enlarged=await layout(book);
      assert.deepEqual(enlarged.base,before.base);assert.deepEqual(enlarged.field.slice(0,2),before.field.slice(0,2),'zoom must preserve page capacity');assert.equal(enlarged.wrapRects,before.wrapRects,'zoom must preserve text wrapping');assert(Math.abs(enlarged.field[2]-before.field[2])<=3,'fractional DPI scrollHeight: '+JSON.stringify({before:before.field,after:enlarged.field}));assert.equal(enlarged.rich,before.rich);assert.equal(enlarged.size,before.size);assert.equal(enlarged.scroll,before.scroll);assert.deepEqual(enlarged.selection,before.selection);
      assert.equal(enlarged.zoom,1.25);assert(Math.abs(enlarged.physical[0]/before.physical[0]-1.25)<.001);
      assert(await book.evaluate(()=>{const s=document.querySelector('#sheet').getBoundingClientRect(),g=PaperShape.geometry(current().shape,s.width,s.height,windowState.layout.zoom);return ['#resize-left','#resize-handle'].every(id=>{const r=document.querySelector(id).getBoundingClientRect();return PaperShape.contains(g,r.x+r.width/2-s.x,r.y+r.height/2-s.y);});}),'scaled resize grips must remain on visible paper');
      const style=await book.locator('#text').evaluate(e=>{const css=p=>getComputedStyle(e,p);return {track:css('::-webkit-scrollbar-track').backgroundColor,thumb:css('::-webkit-scrollbar-thumb').backgroundColor,button:css('::-webkit-scrollbar-button').display,width:parseFloat(css('::-webkit-scrollbar').width)};});
      assert.equal(style.track,'rgba(0, 0, 0, 0)');assert(style.thumb.startsWith('rgba('));assert.equal(style.button,'none');assert.equal(style.width,6);
      const right=enlarged.paper.x+enlarged.paper.width;
      await book.evaluate(async()=>{await window.desk.call('gesture',{phase:'start',x:500,y:500,resize:'left'});await window.desk.call('gesture',{phase:'end',x:460,y:520,resize:'left'});});
      const corner=await layout(book);assert(corner.zoom>enlarged.zoom);assert.deepEqual(corner.base,before.base);assert.equal(corner.paper.x+corner.paper.width,right);
      await book.evaluate(async()=>{const original=windowState.layout.zoom;await window.desk.call('gesture',{phase:'start',x:500,y:500,resize:'right'});await window.desk.call('gesture',{phase:'move',x:540,y:540,resize:'right'});await window.desk.call('gesture',{phase:'cancel',x:540,y:540,resize:'right'});if(windowState.layout.zoom!==original)throw Error('cancel did not restore zoom');});
      await book.evaluate(()=>zoomNote({reset:true}));assert.deepEqual((await layout(book)).base,before.base);assert.equal((await layout(book)).zoom,1);
      await book.evaluate(()=>zoomNote({factor:.01}));assert.equal(await book.evaluate(()=>{const nav=document.querySelector('.page-heading>div').getBoundingClientRect(),actions=document.querySelector('#side-controls').getBoundingClientRect();return nav.right>actions.x&&nav.bottom>actions.y&&nav.y<actions.bottom;}),false,'small zoom must not overlap navigation and actions');await book.evaluate(()=>zoomNote({reset:true}));
    }
    // Real wheel input and resize pointer capture use the same paths as desktop use.
    await book.evaluate(async()=>{await queueEdit({shape:'rounded'});await window.desk.call('selection',{id:current().id});document.querySelector('#text').scrollTop=0;});
    await book.locator('#text').hover();await book.keyboard.down('Control');await book.mouse.wheel(0,-120);await book.keyboard.up('Control');await book.waitForFunction(()=>windowState.layout.zoom>1);
    const beforePointer=await layout(book),grip=await book.locator('#resize-handle').boundingBox();
    await book.evaluate(()=>document.querySelector('#resize-handle').addEventListener('pointerdown',e=>window.zoomOrigin={x:e.screenX,y:e.screenY},{once:true}));
    await book.mouse.move(grip.x+13,grip.y+13);await book.mouse.down();await book.waitForFunction(()=>!!window.zoomOrigin);
    await book.evaluate(()=>{const grip=document.querySelector('#resize-handle'),o=window.zoomOrigin;for(const type of ['pointermove','pointerup'])grip.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,button:0,buttons:type==='pointermove'?1:0,screenX:o.x+30,screenY:o.y+30}));});await book.mouse.up();
    await book.waitForFunction(z=>windowState.layout.zoom>z,beforePointer.zoom);assert.deepEqual((await layout(book)).base,beforePointer.base);
    await book.keyboard.press('Control+0');await book.waitForFunction(()=>windowState.layout.zoom===1);
    await book.evaluate(async()=>{await window.desk.call('gesture',{phase:'start',x:500,y:500,resize:'right',shift:true});await window.desk.call('gesture',{phase:'end',x:530,y:540,resize:'right',shift:true});});
    const resized=await layout(book);assert.equal(resized.zoom,1);assert(resized.base[0]>beforePointer.base[0]);
    await book.evaluate(()=>zoomNote({factor:1.2}));const saved=await layout(book);
    await book.locator('#tools').click();assert.equal(await book.locator('#size').isVisible(),false);await book.locator('#tool-options summary').click();assert.equal(await book.locator('#size').isVisible(),true);
    await book.evaluate(()=>closeSideTools());await book.locator('#collapse').click();await book.waitForFunction(()=>windowState.collapsed&&!document.body.classList.contains('shell-transition'));await book.locator('#orb').click();await book.waitForFunction(()=>!windowState.collapsed&&!document.body.classList.contains('shell-transition'));assert.equal((await layout(book)).zoom,saved.zoom);assert.deepEqual((await layout(book)).base,saved.base);
    await book.evaluate(()=>{closeSideTools();document.querySelector('#text').blur();getSelection().removeAllRanges();document.querySelector('#toast').hidden=true;document.querySelector('#text').scrollTop=0;});await book.mouse.move(10,10);await book.waitForTimeout(220);await book.screenshot({path:'test-results/note-zoom-scrollbar.png',omitBackground:true});
    await book.evaluate(()=>window.desk.call('window',{op:'lock'}));await assert.rejects(()=>book.evaluate(()=>window.desk.call('paper-zoom',{factor:1.1})));await book.evaluate(()=>window.desk.call('window',{op:'lock'}));
    await app.close();book=await start();const restored=await layout(book);assert.equal(restored.zoom,saved.zoom);assert.deepEqual(restored.base,saved.base);assert.equal(restored.rich,saved.rich);
    const settings=await book.evaluate(async()=>{const s=await window.desk.call('state');return {base:s.settings.base,model:s.settings.model,hasKey:s.settings.hasKey};});assert.deepEqual(settings,{base:seed.settings.base,model:seed.settings.model,hasKey:true});assert.deepEqual(fs.readFileSync(path.join(profile,'api-key.enc')),keyMarker);
    const pinEvent=app.waitForEvent('window');await book.evaluate(()=>window.desk.call('move',{id:current().id,status:'pinned'}));const pinned=await pinEvent;await pinned.locator('#text[contenteditable=true]').waitFor();await pinned.evaluate(()=>zoomNote({factor:1.1}));assert.equal((await layout(pinned)).zoom,1.1);assert.equal((await layout(book)).zoom,saved.zoom);const pinnedId=await pinned.evaluate(()=>current().id);await book.evaluate(id=>window.desk.call('move',{id,status:'book'}),pinnedId);await book.waitForFunction(id=>current()?.id===id&&!document.body.classList.contains('motion-busy'),pinnedId);
    await book.evaluate(async()=>{await window.desk.call('settings',{base:'https://example.invalid/v1',model:'configured-vision',motion:false});});
    const pid=await book.evaluate(()=>current().id),rich=restored.rich;await book.evaluate(()=>tear());const ball=app.windows().find(w=>w.url().includes('kind=ball'));assert(ball);await ball.locator('#desktop-object').waitFor();await ball.evaluate(()=>openPreview());await ball.waitForFunction(()=>!preview.hidden&&!animating);await ball.evaluate(()=>closePreview());await book.evaluate(id=>window.desk.call('move',{id,status:'book'}),pid);await book.waitForFunction(id=>current().id===id,pid);assert.equal((await layout(book)).rich,rich);assert.equal((await layout(book)).zoom,saved.zoom);
    assert.deepEqual(errors,[]);console.log('PASS: five shapes, stable logical layout/rich text/caret/scroll, transparent scrollbars, native wheel and corner zoom, resize modifier, cancel/reset/lock/collapse/restart, API configuration preservation, tear and restore');
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
