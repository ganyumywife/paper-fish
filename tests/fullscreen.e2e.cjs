const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.PAPERDESK_TEST_EXE,profile='--user-data-dir='+path.resolve('test-results','fullscreen-'+Date.now());let app,target;
  try{
    app=await electron.launch({executablePath,args:executablePath?[profile]:['.',profile],env});app.context().setDefaultTimeout(15000);
    const book=await app.firstWindow();await book.locator('#text[contenteditable=true]').waitFor();await book.locator('#text').fill('全屏退出后仍然存在');
    await book.locator('#tools').click();await book.locator('#settings').click();await book.locator('#fullscreen-avoid').check();
    await book.waitForFunction(()=> state.settings.fullscreenAvoid===true);await book.locator('#settings-dialog [data-close]').click();
    target=await electron.launch({args:[path.resolve('tests/fullscreen-target.cjs'),'--user-data-dir='+path.resolve('test-results','fullscreen-target-'+Date.now())],env});await target.firstWindow();
    await target.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.maximize();w.focus();});
    await book.waitForTimeout(2500);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').isVisible()),true,'ordinary maximization must not hide notes');
    await target.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(true);w.focus();});
    // Native visibility checked from the main process; the renderer can be throttled while hidden.
    async function visible(expected){for(let i=0;i<60;i++){if(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').isVisible())===expected)return;await new Promise(r=>setTimeout(r,200));}throw Error('fullscreen visibility did not become '+expected);}
    await visible(false);
    await target.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setFullScreen(false));await visible(true);
    assert.equal(await book.locator('#text').evaluate(e=>e.value),'全屏退出后仍然存在');
    await target.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(true);w.focus();});await visible(false);
    await book.evaluate(()=>window.desk.call('window',{op:'hide'}));
    await target.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setFullScreen(false));await book.waitForTimeout(1500);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').isVisible()),false,'manual hiding must remain after fullscreen exit');
    await target.close();target=null;
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').show());
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#settings').click();await book.locator('#fullscreen-avoid').uncheck();
    await book.waitForFunction(()=>!state.settings.fullscreenAvoid);
    console.log('PASS: native Windows foreground detection, ordinary maximized window excluded, external fullscreen hides/restores notes, manual hiding preserved, preference disabled');
  }finally{if(target)await target.close();if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
