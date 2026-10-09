const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict'), path = require('node:path');
(async () => {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.PAPERDESK_TEST_EXE;
  const profile = '--user-data-dir=' + path.resolve('test-results', 'side-switch-' + Date.now());
  const app = await electron.launch({executablePath, args: executablePath ? [profile] : ['.', profile], env});
  try {
    const p = await app.firstWindow(); await p.locator('#text').waitFor();
    const area = await app.evaluate(({BrowserWindow, screen}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.deskKind === 'book');
      w.webContents.setBackgroundThrottling(false); w.hide();
      const a = screen.getDisplayMatching(w.paperBounds).workArea;
      w.paperBounds.x = Math.round(a.x + (a.width-w.paperBounds.width)/2);
      const set = w.setBounds.bind(w); w.boundsCalls = [];
      w.setBounds = b => { w.boundsCalls.push(b); return set(b); };
      return a;
    });
    const snapshot = () => app.evaluate(({BrowserWindow}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.deskKind === 'book');
      return {bounds:w.getBounds(), layout:w.noteLayout, calls:w.boundsCalls.length,trace:w.boundsCalls};
    });
    await p.evaluate(() => window.desk.call('dock-preference',{side:'left'}));
    const initial = await snapshot();
    for (const side of ['right','left','right','left']) {
      await p.evaluate(side => window.desk.call('dock-preference',{side}), side);
      await p.waitForFunction(side => document.body.dataset.side === side, side, {polling:50});
      const next = await snapshot();
      assert.deepEqual(next.bounds,initial.bounds); assert.equal(next.calls,initial.calls,JSON.stringify({initial,next}));
      assert.equal(next.layout.paperX,initial.layout.paperX);
      assert.equal(await p.locator('#workspace').evaluate(e=>e.offsetLeft),initial.layout.paperX);
    }
    await p.evaluate(()=>window.desk.call('dock-preference',{side:'auto'}));
    // Exercise the native title-bar move callback, not only the gesture IPC.
    for (const delta of [-100,100,-100,100]) {
      const target = Math.round(area.x+(area.width-initial.layout.paper.width)/2+delta);
      const result = await app.evaluate(({BrowserWindow},x) => {
        const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');
        w.layoutUntil=Date.now()+1000;
        w.setBounds({...w.noteLayout.bounds,x:x-w.noteLayout.paperX});
        const before=w.boundsCalls.length;
        w.layoutUntil=0;w.emit('moved');
        return {extraCalls:w.boundsCalls.length-before,paper:w.paperBounds,layout:w.noteLayout,bounds:w.getBounds()};
      },target);
      assert.equal(result.extraCalls,0,'side switch must not compensate with a second native move');
      assert.equal(result.paper.x,target);
      assert.equal(result.bounds.x+result.layout.paperX,target);
      const side=delta<0?'right':'left';assert.equal(result.layout.side,side);
      await p.waitForFunction(side=>document.body.dataset.side===side,side,{polling:50});
      assert.equal(await p.locator('#workspace').evaluate(e=>e.offsetLeft),initial.layout.paperX);
    }
    // The unused rail can cross a screen edge, but actual paper and tools cannot.
    for (const x of [area.x,area.x+area.width-initial.layout.paper.width]) {
      await app.evaluate(({BrowserWindow},x)=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');w.paperBounds.x=x;},x);
      await p.evaluate(()=>window.desk.call('dock-preference',{side:'auto'}));
      const s=await snapshot();for(const k of ['x','y','width','height'])assert(Math.abs(s.bounds[k]-s.layout.bounds[k])<=1,'Windows must preserve offscreen transparent margins');
      assert.equal(s.layout.paper.x,x);
      const button=s.bounds.x+s.layout.buttonX;assert(button>=area.x&&button+36<=area.x+area.width);
    }
    console.log('PASS: repeated side changes have zero native moves; native drag across midpoint preserves paper origin; both screen edges retain visible content');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


