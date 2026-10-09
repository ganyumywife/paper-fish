const {_electron:electron}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const executablePath=process.env.PAPERDESK_TEST_EXE;
  const app=await electron.launch({executablePath,args:[...(executablePath?[]:['.']),'--user-data-dir='+path.resolve('test-results','paper-drag-'+Date.now())],env});
  try{
    const book=await app.firstWindow();await book.locator('#text[contenteditable=true]').waitFor();const errors=[];book.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),a=screen.getDisplayMatching(w.paperBounds).workArea;w.paperBounds.x=Math.round(a.x+(a.width-w.paperBounds.width)/2);w.paperBounds.y=a.y+80;w.webContents.setBackgroundThrottling(false);w.hide();const ignore=w.setIgnoreMouseEvents.bind(w);w.setIgnoreMouseEvents=(value,...args)=>{w.lastIgnore=value;return ignore(value,...args);};});
    await book.evaluate(async()=>applyWindowInfo(await window.desk.call('dock-preference',{side:'auto'})));
    const bounds=()=>app.evaluate(({BrowserWindow})=>({...BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').paperBounds}));
    for(const shape of ['rounded','square','circle','heart','torn']){
      console.log('Checking paper drag: '+shape);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').hide());
      await book.evaluate(async shape=>{await queueEdit({shape});await window.desk.call('selection',{id:current().id});},shape);await book.waitForFunction(shape=>windowState.layout.shape===shape,shape);await book.locator('#text').fill('拖动便签，正文仍可选字。');
      assert.equal(await book.locator('.binding,.binding-tab').count(),0,'no decorative binding or connectors');
      assert.equal(await book.locator('header').evaluate(e=>getComputedStyle(e).webkitAppRegion),'no-drag');
      // Above the paper, only the individual buttons/navigation consume input.
      await book.evaluate(()=>{const r=document.querySelector('#sheet').getBoundingClientRect();document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+r.width/2,clientY:30}));});
      await book.waitForTimeout(80);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').lastIgnore),true);
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').showInactive());
      for(const grip of await book.locator('.paper-drag:visible').all()){
        const r=await grip.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2,before=await bounds();
        await book.evaluate(()=>{document.querySelector('#paper').addEventListener('pointerdown',e=>window.dragOrigin={x:e.screenX,y:e.screenY},{once:true});});
        await book.mouse.move(x,y);await book.mouse.down();await book.waitForFunction(()=>!!window.dragOrigin);
        // Native bounds change during a drag. Keep screen coordinates fixed,
        // rather than letting CDP recompute them relative to the moving window.
        await book.evaluate(({x,y})=>{const p=document.querySelector('#paper'),o=window.dragOrigin;for(const type of ['pointermove','pointerup'])p.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,button:0,buttons:type==='pointermove'?1:0,clientX:x+25,clientY:y+15,screenX:o.x+25,screenY:o.y+15}));delete window.dragOrigin;},{x,y});
        await book.mouse.up();await book.waitForFunction(before=>Math.abs(windowState.layout.paper.x-before.x-25)<=1&&Math.abs(windowState.layout.paper.y-before.y-15)<=1,before);
        const after=await bounds();assert(Math.abs(after.x-before.x-25)<=1&&Math.abs(after.y-before.y-15)<=1,shape+' grip must move native paper');
        assert.equal(await book.locator('#text').evaluate(e=>e.value),'拖动便签，正文仍可选字。');
      }
      const before=await bounds();await book.locator('#top').click();assert.deepEqual(await bounds(),before,'top action must not move the paper');
      await book.locator('.paper-drag').first().focus();await book.keyboard.press('ArrowRight');await book.waitForFunction(x=>Math.abs(windowState.layout.paper.x-x-10)<=1,before.x);
      await book.evaluate(()=>window.desk.call('window',{op:'lock'}));assert.equal(await book.locator('.paper-drag').first().isVisible(),false);await book.evaluate(()=>window.desk.call('window',{op:'lock'}));
      await book.evaluate(()=>{document.activeElement?.blur();document.querySelector('#toast').hidden=true;closeSideTools();});await book.mouse.move(10,10);await book.waitForTimeout(220);
      const idle=await book.locator('#top').evaluate(e=>Number(getComputedStyle(e).opacity));assert(idle<.5);
      const nativeBefore=await bounds(),button=await book.locator('#top').boundingBox();await book.locator('#top').hover();await book.waitForTimeout(220);
      assert.equal(await book.locator('#top').evaluate(e=>Number(getComputedStyle(e).opacity)),1);assert.deepEqual(await book.locator('#top').boundingBox(),button);assert.deepEqual(await bounds(),nativeBefore);
      if(shape==='heart'){
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').showInactive());
        await book.screenshot({path:'test-results/floating-actions-heart-hover.png',omitBackground:true});await book.mouse.move(10,10);await book.waitForTimeout(220);await book.screenshot({path:'test-results/floating-actions-heart.png',omitBackground:true});
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').hide());
      }
    }
    assert.deepEqual(errors,[]);console.log('PASS: all five shapes move by paper grips, both heart lobes, passthrough above paper, action click isolation, keyboard movement, lock, stable semi-hidden buttons');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
