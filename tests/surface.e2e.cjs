const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const directory = path.resolve('test-results', 'surface-' + Date.now()); fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + directory], env });
  try {
    app.context().setDefaultTimeout(15000);
    const book = await app.firstWindow(); await book.locator('#text').waitFor();
    await book.locator('#text').fill('这是一张直接放在桌面的纸。\n从顶部装订处揭起。');
    assert.equal(await book.locator('#toolbar').isVisible(), false);
    const paper = await book.locator('#paper').boundingBox(), corner = await book.locator('#tear-corner').boundingBox();
    assert(corner.y < paper.y + 60); assert(corner.y < paper.y + paper.height / 2);
    const peelX = corner.x + corner.width / 2, peelY = corner.y + 10;
    // Downward movement must not tear. A short sideways movement must spring back.
    for (const [dx, dy] of [[0, 100], [-25, 10]]) {
      await book.mouse.move(peelX, peelY); await book.mouse.down(); await book.mouse.move(peelX + dx, peelY + dy, { steps: 8 }); await book.mouse.up();
      await book.waitForFunction(() => !document.body.classList.contains('paper-animating'));
      assert.equal((await book.evaluate(() => window.desk.call('state'))).pages.filter(p => p.status === 'ball').length, 0);
    }
    await book.screenshot({ path: 'test-results/paper-transparent.png', omitBackground: true });
    const alpha = await app.evaluate(({ nativeImage }, file) => nativeImage.createFromPath(file).toBitmap()[3], path.resolve('test-results/paper-transparent.png'));
    assert.equal(alpha, 0, 'outer corner is transparent');
    // Swipe from the right end along the top binding.
    const ballEvent = app.waitForEvent('window');
    await book.mouse.move(peelX, peelY); await book.mouse.down(); await book.mouse.move(peelX - paper.width * .6, peelY + 15, { steps: 18 }); await book.mouse.up();
    let ball = await ballEvent; await ball.locator('#desktop-object').waitFor();
    await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.deskKind === 'ball'); while(w.finishHandoff||w.fallTimer) await new Promise(r => setTimeout(r, 30)); });
    const geometry = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows().find(w => w.deskKind === 'ball'); return { bounds: w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea, background: w.getBackgroundColor(), shelf: BrowserWindow.getAllWindows().some(w => w.deskKind === 'shelf') }; });
    assert(!geometry.shelf); assert(geometry.bounds.width < 100, JSON.stringify(geometry)); assert(Math.abs(geometry.bounds.y + geometry.bounds.height - (geometry.area.y + geometry.area.height - 8)) <= 2, JSON.stringify(geometry));
    await ball.screenshot({ path: 'test-results/desktop-ball.png', omitBackground: true });
    await ball.locator('#desktop-object').click(); await ball.locator('#object-preview').waitFor(); assert.match(await ball.locator('#object-text').textContent(), /顶部装订/);
    await ball.locator('#object-close').click(); await ball.locator('#desktop-object').waitFor();
    // Input events drive the same IPC path as native pointer dragging.
    async function dragBallTo(targetKind) {
      const coords = await app.evaluate(({ BrowserWindow }, targetKind) => { const ball = BrowserWindow.getAllWindows().find(w => w.deskKind === 'ball').getBounds(); const target = BrowserWindow.getAllWindows().find(w => w.deskKind === targetKind).getBounds(); return { x: ball.x + 40, y: ball.y + 40, tx: target.x + target.width / 2, ty: target.y + target.height / 2 }; }, targetKind);
      await ball.locator('#desktop-object').dispatchEvent('pointerdown', { pointerId: 1, button: 0, screenX: coords.x, screenY: coords.y });
      await ball.locator('#desktop-object').dispatchEvent('pointermove', { pointerId: 1, buttons: 1, screenX: coords.tx, screenY: coords.ty });
      await ball.locator('#desktop-object').dispatchEvent('pointerup', { pointerId: 1, button: 0, screenX: coords.tx, screenY: coords.ty });
    }
    await dragBallTo('book');
    await book.waitForFunction(() => document.querySelector('#text').value.includes('顶部装订'));
    await book.locator('#tools').click();
    const binEvent = app.waitForEvent('window'); await book.locator('#bin').click(); const bin = await binEvent; await bin.locator('#bin-art').waitFor();
    const secondBall = app.waitForEvent('window'); await book.locator('#tear').click(); ball = await secondBall; await ball.locator('#desktop-object').waitFor();
    await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.deskKind === 'ball'); while(w.finishHandoff||w.fallTimer) await new Promise(r => setTimeout(r, 30)); });
    await dragBallTo('bin');
    await book.waitForFunction(()=> state.pages.some(p => p.status === 'trash'));
    assert.equal((await book.evaluate(() => window.desk.call('state'))).pages.filter(p => p.status === 'ball').length, 0);
    await bin.screenshot({ path: 'test-results/desktop-bin.png', omitBackground: true });
    console.log('PASS: transparent pixels, tools hidden, top-edge tear + cancellation, desktop fall and stop, preview, drag restoration, desktop bin drop');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
