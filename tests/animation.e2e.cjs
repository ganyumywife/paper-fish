const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const profile = path.resolve('test-results', 'animation-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + profile], env });
  try {
    const book = await app.firstWindow(); await book.locator('#text').waitFor();
    const errors = []; book.on('pageerror', e => errors.push(e.message));
    for (const side of ['left','right']) {
      await book.locator('#text').fill('今天的小事\n\n喝一杯热茶。\n把想到的记下来。\n\n纸上的字，会一直保留。');
      const handle = book.locator(side === 'left' ? '#tear-left' : '#tear-corner');
      const b = await handle.boundingBox(), paper = await book.locator('#paper').boundingBox(), sign = side === 'left' ? 1 : -1;
      const x = b.x + b.width/2, y = b.y + 12;
      await book.mouse.move(x,y); await book.mouse.down(); await book.mouse.move(x+sign*paper.width*.32,y+45,{steps:12});
      await book.screenshot({path:`test-results/peel-${side}.png`,omitBackground:true});
      await book.keyboard.press('Escape'); await book.mouse.up(); await book.waitForFunction(()=>!document.body.classList.contains('paper-animating'));
      assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages.filter(p=>p.status==='ball').length,0);
      const ballEvent = app.waitForEvent('window');
      await book.mouse.move(x,y); await book.mouse.down(); await book.mouse.move(x+sign*paper.width*.62,y+35,{steps:15}); await book.mouse.up();
      await book.waitForFunction(()=>document.body.dataset.paperPhase==='crumpling'); await book.waitForTimeout(350);
      await book.screenshot({path:`test-results/crumple-${side}.png`,omitBackground:true});
      const ball = await ballEvent; await ball.locator('#desktop-object').waitFor();
      await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball');while(w.finishHandoff||w.fallTimer)await new Promise(r=>setTimeout(r,30));});
      await ball.locator('#desktop-object').click(); await ball.waitForFunction(()=>document.body.dataset.objectPhase==='unfolding'); await ball.waitForTimeout(350);
      const visiblePixels=await ball.evaluate(() => { const c=document.querySelector('#object-motion'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])count++;return count; });assert(visiblePixels>1000,'展开中间帧必须存在可见纸面');
      await ball.screenshot({path:`test-results/unfold-${side}.png`,omitBackground:true});
      await ball.locator('#object-preview').waitFor(); assert.match(await ball.locator('#object-text').textContent(),/一直保留/);
      await ball.locator('#object-close').click(); await ball.waitForFunction(()=>document.body.dataset.objectPhase==='crumpling');
      await ball.locator('#desktop-object').waitFor(); await ball.locator('#desktop-object').click(); await ball.locator('#object-preview').waitFor();
      await ball.locator('#object-restore').click(); await book.waitForFunction(()=>document.body.dataset.paperPhase==='unfolding');
      await book.waitForFunction(()=>!document.body.classList.contains('paper-animating')); assert.match(await book.locator('#text').evaluate(e=>e.value),/一直保留/);
    }
    assert.deepEqual(errors,[]); console.log('PASS: both corners, mirrored curl, Escape recovery, mesh crumple/unfold/recrumple, restored content');
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
