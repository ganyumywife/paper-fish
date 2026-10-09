const {_electron:electron}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const profile=path.resolve('test-results','finishing-'+Date.now()),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const launch=()=>electron.launch({...(process.env.PAPERDESK_TEST_EXE?{executablePath:process.env.PAPERDESK_TEST_EXE}:{}),args:[...(process.env.PAPERDESK_TEST_EXE?[]:['.']),'--user-data-dir='+profile],env});
  const bookWindow=async()=>{await app.firstWindow();return app.windows().find(p=>p.url().includes('kind=book'));};
  let app=await launch();
  try{
    let book=await bookWindow();await book.locator('#text[contenteditable=true]').waitFor();
    await book.locator('#tools').click();await book.locator('#tool-options').evaluate(e=>e.open=true);
    await book.locator('#paper-size-preset').selectOption('large');assert.equal((await book.evaluate(()=>window.desk.call('state'))).windowInfo.layout.paper.width,520);
    await book.getByRole('button',{name:'薄荷纸色',exact:true}).click();assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages[0].color,'#deebd9');
    await book.evaluate(()=>window.desk.call('desktop-preferences',{sound:true,volume:0}));
    await book.evaluate(()=>{window.soundEvents=[];window.desk.onSound(data=>window.soundEvents.push(data));});
    await book.evaluate(()=>window.desk.call('sound-preview'));await book.waitForFunction(()=>window.soundEvents.length===1);assert.equal((await book.evaluate(()=>soundEvents[0])).volume,0);
    await assert.rejects(book.evaluate(()=>window.desk.call('desktop-preferences',{volume:2})),/无效/);
    await book.evaluate(()=>window.desk.call('desktop-preferences',{sound:false,volume:.25}));await book.evaluate(()=>window.desk.call('sound-preview'));assert.equal(await book.evaluate(()=>soundEvents.length),1);
    await book.screenshot({path:'test-results/presets-finishing.png',omitBackground:true});
    const area=await app.evaluate(({screen})=>screen.getPrimaryDisplay().workArea),floor=area.y+area.height-104;
    async function makeBall(text){
      const event=app.waitForEvent('window');await book.evaluate(async text=>{const s=await window.desk.call('state'),p=s.pages.find(p=>p.status==='book');await window.desk.call('edit',{id:p.id,text});await window.desk.call('move',{id:p.id,status:'ball'});},text);
      const ball=await event;await ball.locator('#ball-surface').waitFor();return ball;
    }
    async function drop(ball,x,y){const b=await ball.evaluate(()=>window.desk.call('state'));const native=await app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(w=>w.pageId===id&&w.deskKind==='ball').getBounds(),b.pages.find(p=>p.status==='ball'&&p.id===new URL(ball.url()).searchParams.get('id')).id);const start={x:native.x+46,y:native.y+48};for(const [phase,point]of [['start',start],['move',{x:x+46,y:y+48}],['end',{x:x+46,y:y+48}]])await ball.evaluate(({phase,point})=>window.desk.call('gesture',{phase,...point}),{phase,point});}
    const lower=await makeBall('底部纸团');await drop(lower,area.x+80,floor);
    const upper=await makeBall('上层纸团');await drop(upper,area.x+80,area.y+90);
    await app.evaluate(async({BrowserWindow})=>{for(let i=0;i<300;i++){if(BrowserWindow.getAllWindows().filter(w=>w.deskKind==='ball').every(w=>!w.fallTimer))return;await new Promise(r=>setTimeout(r,30));}throw Error('纸团没有停止');});
    let balls=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.deskKind==='ball').map(w=>({id:w.pageId,b:w.getBounds()})));assert.equal(balls.length,2);assert(Math.abs(balls[0].b.y-balls[1].b.y)>=95);
    await lower.evaluate(()=>openPreview());await lower.locator('#object-preview').waitFor({state:'visible'});assert((await lower.locator('#object-date').innerText()).includes('撕下'));
    await app.evaluate(async({BrowserWindow},y)=>{for(let i=0;i<250;i++){const b=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball'&&!w.previewBounds);if(b.getBounds().y===y&&!b.fallTimer)return;await new Promise(r=>setTimeout(r,30));}throw Error('移走支撑后未掉落');},floor);
    const binEvent=app.waitForEvent('window');await book.evaluate(()=>window.desk.call('bin'));const bin=await binEvent;await bin.locator('#bin-art').waitFor();
    const lowerId=new URL(lower.url()).searchParams.get('id');await lower.locator('#object-trash').click();
    await app.evaluate(async({BrowserWindow})=>{for(let i=0;i<60;i++){const b=BrowserWindow.getAllWindows().find(w=>w.recycling);if(b)return;await new Promise(r=>setTimeout(r,20));}throw Error('没有回收过渡');});
    assert((await book.evaluate(()=>window.desk.call('state'))).pages.some(p=>p.id===lowerId&&p.status==='ball'));
    const duplicate=book.evaluate(id=>window.desk.call('move',{id,status:'trash'}),lowerId);
    await book.waitForFunction(id=>state.pages.some(p=>p.id===id&&p.status==='trash'),lowerId);
    await duplicate;const p=(await book.evaluate(()=>window.desk.call('state'))).pages.find(p=>p.id===lowerId);assert.equal(p.text,'底部纸团');assert(Number.isFinite(p.tornAt));
    await book.evaluate(()=>window.desk.call('settings',{base:'https://api.openai.com/v1',model:'',motion:false}));
    const instant=await makeBall('关闭动效仍可堆积');await drop(instant,area.x+80,floor);
    await app.evaluate(async({BrowserWindow})=>{for(let i=0;i<60;i++){if(BrowserWindow.getAllWindows().filter(w=>w.deskKind==='ball').every(w=>!w.fallTimer))return;await new Promise(r=>setTimeout(r,10));}throw Error('关闭动效后应立即稳定');});
    const positions=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.deskKind==='ball').map(w=>w.getBounds()));const [a,b]=positions;assert(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1);
    await bin.screenshot({path:'test-results/bin-finishing.png',omitBackground:true});
    await app.close();app=await launch();book=await bookWindow();await book.locator('#text[contenteditable=true]').waitFor();const s=await book.evaluate(()=>window.desk.call('state'));assert.equal(s.settings.sound,false);assert.equal(s.settings.volume,.25);assert(s.pages.some(n=>n.id===lowerId&&n.tornAt===p.tornAt&&n.status==='trash'));assert.equal(s.windowInfo.layout.paper.width,520);
    console.log('PASS: presets, sound settings and single event, stable pile, support removal, timestamps, animated preview disposal, restart persistence');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
