const {_electron:electron}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const profile=path.resolve('test-results','shapes-'+Date.now()),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const start=()=>electron.launch({...(process.env.PAPERDESK_TEST_EXE?{executablePath:process.env.PAPERDESK_TEST_EXE}:{}),args:[...(process.env.PAPERDESK_TEST_EXE?[]:['.']),'--user-data-dir='+profile],env});let app=await start();
  try{
    let book=await app.firstWindow();await book.locator('#text[contenteditable=true]').waitFor();const errors=[];book.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),original=w.setIgnoreMouseEvents.bind(w);w.setIgnoreMouseEvents=(ignore,...args)=>{w.testIgnore=ignore;return original(ignore,...args);};});
    const ids=[];
    for(const shape of ['circle','heart','torn']){
      await book.locator('#tools').click();if(ids.length)await book.locator('#new').click();await book.locator('#shape').selectOption(shape);
      const text=shape+' · 我的便签\n☑ 保留内容\n'+('写下今天的小事，长内容可以滚动查看。\n'.repeat(30))+'最后一行';
      await book.locator('#text').fill(text);await book.evaluate(()=>document.querySelector('#text').scrollTop=0);
      const p=(await book.evaluate(()=>window.desk.call('state'))).pages.find(p=>p.status==='book');ids.push(p.id);
      for(const texture of ['plain','lined','grid']){
        await book.locator('#texture').selectOption(texture);
        const alpha=await book.evaluate(()=>{const p=current(),r=document.querySelector('#sheet').getBoundingClientRect(),c=PaperMotion.texture({...p,width:r.width,height:r.height,top:12,padding:12});return [...c.getContext('2d').getImageData(2,2,1,1).data];});assert.equal(alpha[3],0,'轮廓外不能被纹理填满');
      }
      const safe=await book.evaluate(()=>{const f=document.querySelector('#text'),r=document.querySelector('#sheet').getBoundingClientRect(),b=f.getBoundingClientRect(),g=PaperShape.geometry(current().shape,r.width,r.height);return {inside:PaperShape.contains(g,b.x-r.x,b.y-r.y)&&PaperShape.contains(g,b.right-r.x,b.bottom-r.y),scroll:f.scrollHeight>f.clientHeight};});assert(safe.inside&&safe.scroll);
      await book.locator('#settings').click();await book.locator('#settings-dialog [data-close]').click();
      await book.evaluate(()=>{document.querySelector('#toast').hidden=true;closeSideTools();});
      await book.screenshot({path:`test-results/shape-${shape}.png`,omitBackground:true});
      await book.evaluate(()=>{const r=document.querySelector('#sheet').getBoundingClientRect();document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.right-2,clientY:r.y+r.height*.7}));});
      await book.waitForTimeout(80);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').testIgnore),true);
      await book.evaluate(()=>{const r=document.querySelector('#text').getBoundingClientRect();document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));});
      await book.waitForTimeout(80);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').testIgnore),false);
      const side=shape==='heart'?'left':'right',handle=book.locator(side==='left'?'#tear-left':'#tear-corner'),b=await handle.boundingBox(),paper=await book.locator('#paper').boundingBox(),sign=side==='left'?1:-1;
      await book.mouse.move(b.x+b.width/2,b.y+12);await book.mouse.down();await book.mouse.move(b.x+b.width/2+sign*paper.width*.25,b.y+32,{steps:8});await book.keyboard.press('Escape');await book.mouse.up();await book.waitForFunction(()=>!document.body.classList.contains('paper-animating'));
      assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages.find(n=>n.id===p.id).status,'book');
      // The unfolded mesh also keeps the transparent cutout; shading must not recreate a rectangle.
      const cutout=await book.evaluate(()=>{const surface=beginPaperMotion();surface.draw();const r=surface.rect,c=surface.canvas,d=surface.dpr,alpha=c.getContext('2d').getImageData(Math.round((r.x+2)*d),Math.round((r.y+2)*d),1,1).data[3];finishPaperMotion();return alpha;});assert.equal(cutout,0);
      const event=app.waitForEvent('window');const moving=book.evaluate(()=>tear());const ball=await event;await moving;await ball.locator('#ball-surface').waitFor();ball.on('pageerror',e=>errors.push(e.message));
      await app.evaluate(async({BrowserWindow})=>{for(let i=0;i<300;i++){if(BrowserWindow.getAllWindows().filter(w=>w.deskKind==='ball').every(w=>!w.fallTimer&&!w.finishHandoff))return;await new Promise(r=>setTimeout(r,20));}throw Error('纸团未停止');});
      await ball.evaluate(()=>openPreview());assert.equal(await ball.locator('#object-text').textContent(),text);
      const preview=await ball.evaluate(()=>{const el=document.querySelector('#object-preview'),f=document.querySelector('#object-text');return {shape:el.classList.contains('shaped-preview'),scroll:f.scrollHeight>f.clientHeight,clip:getComputedStyle(document.querySelector('#object-paper')).clipPath};});assert(preview.shape&&preview.scroll&&preview.clip.startsWith('polygon'));
      await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball'),original=w.setIgnoreMouseEvents.bind(w);w.setIgnoreMouseEvents=(ignore,...args)=>{w.testIgnore=ignore;return original(ignore,...args);};});
      await ball.evaluate(()=>{ignored=false;return window.desk.call('hit-test',{ignore:false});});
      await ball.evaluate(()=>{const r=document.querySelector('#object-paper').getBoundingClientRect();document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.right-1,clientY:r.y+r.height*.7}));});await ball.waitForTimeout(80);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball').testIgnore),true);
      await ball.evaluate(()=>{const r=document.querySelector('#object-text').getBoundingClientRect();document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));});await ball.waitForTimeout(80);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball').testIgnore),false);
      await ball.evaluate(()=>document.querySelector('#object-text').scrollTop=100000);assert(await ball.locator('#object-text').evaluate(e=>e.scrollTop>0));await ball.screenshot({path:`test-results/shape-${shape}-preview.png`,omitBackground:true});
      await ball.evaluate(()=>closePreview());await ball.evaluate(()=>openPreview());await ball.locator('#object-restore').click();await book.waitForFunction(id=>!document.body.classList.contains('paper-animating')&&current()?.id===id,p.id);
      const restored=(await book.evaluate(()=>window.desk.call('state'))).pages.find(n=>n.id===p.id);assert.equal(restored.text,text);assert.equal(restored.shape,shape);assert.equal(restored.texture,'grid');
    }
    // Defaults and pinned notes share the same shape, with no text copied into a new page.
    await book.evaluate(async()=>{await window.desk.call('default-style',{id:current().id});});const event=app.waitForEvent('window');await book.evaluate(()=>window.desk.call('new',{pinned:true,text:'异形独立便签'}));const pin=await event;await pin.locator('#text[contenteditable=true]').waitFor();assert(await pin.locator('body').evaluate(e=>e.classList.contains('shaped-paper')));
    assert.deepEqual(errors,[]);await app.close();app=await start();book=await app.firstWindow();await book.locator('#text[contenteditable=true]').waitFor();const s=await book.evaluate(()=>window.desk.call('state'));for(const [i,shape]of ['circle','heart','torn'].entries())assert.equal(s.pages.find(p=>p.id===ids[i]).shape,shape);assert.equal(s.settings.defaultStyle.shape,'torn');
    console.log('PASS: all shapes and textures, safe scrollable text, transparent cutouts and mouse passthrough, mirrored peel/cancel, mesh alpha, crumple/preview/restore, defaults, pinned notes, restart persistence');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

