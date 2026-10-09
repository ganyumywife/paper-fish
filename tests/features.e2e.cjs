const { _electron:electron }=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const profile=path.resolve('test-results','features-'+Date.now());fs.mkdirSync(profile,{recursive:true});const backup=path.join(profile,'backup.json');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;
  const launch=async()=>{app=await electron.launch({args:['.','--user-data-dir='+profile],env});return app.firstWindow();};
  try{
    let book=await launch();await book.locator('#text').waitFor();await book.locator('#tools').click();await book.locator('#text').fill('备份与全局查找验证');
    await book.locator('#bold').click();await book.locator('#align').selectOption('center');assert.equal(await book.locator('#text').evaluate(e=>getComputedStyle(e).fontWeight),'700');
    await book.locator('#lock').click();const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').getBounds());
    await book.evaluate(async()=>{await window.desk.call('gesture',{phase:'start',x:100,y:100,resize:true});await window.desk.call('gesture',{phase:'end',x:300,y:300,resize:true});});
    assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').getBounds()),before);
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#settings').click();await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},backup);
    await book.locator('#backup-export').click();await book.getByText('备份已导出，不含 API Key',{exact:true}).waitFor();assert.equal(JSON.parse(fs.readFileSync(backup,'utf8')).pages[0].text,'备份与全局查找验证');
    await book.locator('#backup-import').click();await book.getByText('备份已合并，原内容完整保留',{exact:true}).waitFor();assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages.filter(p=>p.text==='备份与全局查找验证').length,2);await book.locator('#settings-dialog [data-close]').click();
    const shelfEvent=app.waitForEvent('window');await book.locator('#shelf').click();const shelf=await shelfEvent;await shelf.locator('#search-scope').selectOption('all');await shelf.locator('#search').fill('全局查找');assert.equal(await shelf.locator('.note-entry').count(),2);
    const aiEvent=app.waitForEvent('window');await book.locator('#tools').dispatchEvent('focusin');await book.locator('#ai').click();const ai=await aiEvent;ai.on('pageerror',e=>console.error('AI pageerror:',e.message));await ai.waitForFunction(()=>typeof state!=='undefined'&&state&&document.querySelector('#ai-dialog').open);const image=await book.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=80;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,160,80);x.fillStyle='black';x.font='20px sans-serif';x.fillText('NOTE',25,40);return c.toDataURL('image/png');});
    await ai.locator('#image-file').setInputFiles({name:'note.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});await ai.waitForFunction(()=>document.querySelector('#crop-canvas').width===160);
    await ai.locator('#rotate-image').click();assert.equal(await ai.locator('#crop-canvas').evaluate(c=>c.width),80);await ai.locator('#reset-image').click();
    await ai.locator('#crop-canvas').scrollIntoViewIfNeeded();const b=await ai.locator('#crop-canvas').boundingBox();await ai.mouse.move(b.x+b.width*.2,b.y+b.height*.2);await ai.mouse.down();await ai.mouse.move(b.x+b.width*.8,b.y+b.height*.8,{steps:5});await ai.mouse.up();await ai.locator('#crop-image').click();assert((await ai.locator('#crop-canvas').evaluate(c=>c.width))<160);await ai.locator('#ai-dialog [data-close]').click();
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#collapse').click();await book.locator('#orb').waitFor();await app.close();book=await launch();await book.locator('#orb').waitFor();await book.waitForFunction(()=>document.body.classList.contains('collapsed'));await book.locator('#orb').click();await book.locator('#tools').click();assert.equal(await book.locator('#lock').textContent(),'解锁');assert.match(await book.locator('#text').evaluate(e=>e.value),/全局查找/);
    console.log('PASS: style, position lock, backup export + merge, global search, image rotate/crop/reset, collapsed and locked state across restart');
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

