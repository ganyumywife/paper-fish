const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.PAPERDESK_TEST_EXE,profile='--user-data-dir='+path.resolve('test-results','workflow-'+Date.now());let app;
  const start=async()=>{app=await electron.launch({executablePath,args:executablePath?[profile]:['.',profile],env});app.context().setDefaultTimeout(12000);const p=await app.firstWindow();await p.locator('#text[contenteditable=true]').waitFor();return p;};
  try{
    let book=await start();await book.locator('#text').fill('原页不能覆盖');await book.locator('#tools').click();
    const event=app.waitForEvent('window');await book.locator('#ai').click();const ai=await event;await ai.locator('#ai-result').waitFor();
    const text='第一段\n'+('☐ 记录内容😀\n'.repeat(65));await ai.locator('#ai-result').fill(text);await ai.locator('#split-toggle').click();
    let pages=await ai.evaluate(()=>window.splitPages());assert.equal(pages.join(''),text);assert(pages.length>1);
    const initial=pages[0];await ai.locator('#split-text').fill('已校对：'+initial);
    await ai.locator('#split-text').evaluate(e=>e.setSelectionRange(5,5));await ai.locator('#split-at-caret').click();await ai.locator('#split-merge').click();
    pages=await ai.evaluate(()=>window.splitPages());assert.equal(pages[0],'已校对：'+initial);assert.equal(pages.join(''),'已校对：'+text);
    await ai.locator('#split-next').click();assert.equal(await ai.locator('#split-text').inputValue(),pages[1]);
    await ai.locator('#ai-settings').click();await ai.locator('#settings-dialog').waitFor();
    await ai.locator('#settings-dialog [data-close]').click();
    assert.deepEqual(await ai.evaluate(()=>window.splitPages()),pages);
    assert.equal(await ai.locator('#split-text').inputValue(),pages[1]);
    await ai.locator('#ai-dialog [data-close]').click();await book.locator('#tools').dispatchEvent('focusin');await book.locator('#new').click();await book.locator('#text').fill('新当前页');
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#ai').click();assert.deepEqual(await ai.evaluate(()=>window.splitPages()),pages);
    await ai.screenshot({path:'test-results/split-preview.png',omitBackground:true});
    await ai.locator('#import').click();let state=await book.evaluate(()=>window.desk.call('state'));
    assert.deepEqual(state.pages.slice(0,pages.length).map(p=>p.text),pages);assert(state.pages.some(p=>p.text==='原页不能覆盖'));
    assert.equal(await book.locator('#text').evaluate(e=>e.value),pages[0]);assert.equal(await ai.locator('#ai-result').inputValue(),'');
    // Batch validation and idempotent IPC protect all-or-nothing import.
    const count=state.pages.length;
    assert.match(await ai.evaluate(async()=>{try{await window.desk.call('ai-import',{target:'new',pages:['有效','']});return '';}catch(e){return e.message;}}),/检查录入/);
    assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages.length,count);
    await ai.evaluate(async()=>{const p={target:'new',pages:['幂等第一页','幂等第二页'],requestId:'same-confirmation'};await window.desk.call('ai-import',p);await window.desk.call('ai-import',p);});
    state=await book.evaluate(()=>window.desk.call('state'));assert.equal(state.pages.filter(p=>p.text==='幂等第一页').length,1);
    await ai.locator('#ai-result').fill('保留合并内容');await ai.locator('#split-toggle').click();await ai.locator('#split-toggle').click();assert.equal(await ai.locator('#ai-result').inputValue(),'保留合并内容');
    await ai.locator('#ai-dialog [data-close]').click();await book.locator('#tools').dispatchEvent('focusin');await book.locator('#settings').click();await book.locator('#shortcut-options summary').click();
    // Capture real key events. Defaults of the live user app are left untouched.
    for(const [action,key]of [['toggle','T'],['new','N'],['search','F']]){await book.locator('#shortcut-'+action).focus();await book.keyboard.press('Control+Alt+Shift+'+key);}
    await book.locator('#shortcut-new').focus();await book.keyboard.press('Control+Alt+Shift+T');await book.locator('#shortcut-save').click();await book.getByText(/与其他快捷键重复/).waitFor();
    await book.locator('#shortcut-new').focus();await book.keyboard.press('Control+Alt+Shift+N');
    await app.evaluate(({globalShortcut})=>{const original=globalShortcut.register.bind(globalShortcut);globalShortcut.register=(key,cb)=>{const ok=original(key,cb);if(ok){globalThis.testShortcuts??={};globalThis.testShortcuts[key]=cb;}return ok;};});
    await book.locator('#shortcut-save').click();await book.locator('#shortcut-status').getByText('已保存',{exact:true}).waitFor();
    assert.equal((await book.evaluate(()=>window.desk.call('state'))).settings.shortcuts.new,'CommandOrControl+Alt+Shift+N');
    await book.screenshot({path:'test-results/shortcut-settings.png',omitBackground:true});
    await book.locator('#settings-dialog [data-close]').click();await app.evaluate(()=>globalThis.testShortcuts['CommandOrControl+Alt+Shift+N']());
    await book.waitForFunction(()=>document.querySelector('#text').value==='');
    state=await book.evaluate(()=>window.desk.call('state'));assert(state.pages[0].text==='');
    await app.evaluate(()=>globalThis.testShortcuts['CommandOrControl+Alt+Shift+T']());assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
    await app.evaluate(()=>globalThis.testShortcuts['CommandOrControl+Alt+Shift+T']());assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').isVisible()),true);
    const shelfEvent=app.waitForEvent('window');await app.evaluate(()=>globalThis.testShortcuts['CommandOrControl+Alt+Shift+F']());const shelf=await shelfEvent;await shelf.locator('#search').waitFor();await shelf.waitForFunction(()=>document.activeElement.id==='search');assert.equal(await shelf.locator('#search-scope').inputValue(),'all');
    // A mocked external reservation must leave saved settings and old keys intact.
    await book.locator('#tools').click();await book.locator('#settings').click();
    await app.evaluate(({globalShortcut})=>{const register=globalShortcut.register.bind(globalShortcut);globalShortcut.register=(key,cb)=>key==='CommandOrControl+Alt+Shift+X'?false:register(key,cb);});
    await book.locator('#shortcut-new').focus();await book.keyboard.press('Control+Alt+Shift+X');await book.locator('#shortcut-save').click();await book.locator('#shortcut-status').filter({hasText:/快捷键已被占用/}).waitFor();
    assert.equal((await book.evaluate(()=>window.desk.call('state'))).settings.shortcuts.new,'CommandOrControl+Alt+Shift+N');
    await book.locator('#settings-dialog [data-close]').click();
    await book.locator('#tools').dispatchEvent('focusin');await book.locator('#collapse').click();await book.locator('#orb').waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').webContents.send('settings-request'));
    await book.locator('#settings-dialog').waitFor();assert.equal(await book.evaluate(()=>document.body.classList.contains('collapsed')),false);
    await app.close();book=await start();state=await book.evaluate(()=>window.desk.call('state'));
    assert.equal(state.settings.shortcuts.new,'CommandOrControl+Alt+Shift+N');assert(pages.every(t=>state.pages.some(p=>p.text===t)));
    assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('CommandOrControl+Alt+Shift+N')),true);
    console.log('PASS: preview/edit/split/merge, hidden draft, ordered atomic import, duplicate protection, recorded shortcuts, action callbacks, conflict rollback, restart registration and content');
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


