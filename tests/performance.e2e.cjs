const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const profile=path.resolve('test-results','performance-regression-'+Date.now());let app;
  const start=async()=>{const executablePath=process.env.PAPERDESK_TEST_EXE;app=await electron.launch({executablePath,args:[...(executablePath?[]:['.']),'--user-data-dir='+profile],env});await app.firstWindow();const book=app.windows().find(p=>p.url().includes('kind=book'));await book.locator('#text').waitFor();return book;};
  try{
    let book=await start();
    const legacy=fs.readFileSync(path.resolve('tests/paper-motion-baseline.js'),'utf8');
    const pixels=await book.evaluate(legacy=>{
      const current=PaperMotion;eval(legacy);const previous=PaperMotion;window.PaperMotion=current;
      const canvases=[0,1].map(()=>{const c=document.createElement('canvas');c.style.cssText='position:fixed;left:-1000px;top:0;width:420px;height:480px';document.body.append(c);return c;});let frames=0;
      try{for(const shape of PaperShape.shapes){
        const image=current.texture({text:'视觉保持一致\n☐ 保留纹理和字迹',width:320,height:360,shape,color:'#f7edc8',size:20,font:'print',texture:'grid'}),r={x:45,y:30,width:320,height:360,shape},a=new previous.Surface(canvases[0],image,r),b=new current.Surface(canvases[1],image,r);
        for(const options of [{},{peel:.2,side:'left',lift:.5},{peel:.8,side:'right',lift:.8},{fold:.2},{fold:.7},{fold:1},{fold:0}]){a.draw(options);b.draw(options);const x=a.ctx.getImageData(0,0,a.canvas.width,a.canvas.height).data,y=b.ctx.getImageData(0,0,b.canvas.width,b.canvas.height).data;for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error(shape+' changed at pixel byte '+i);frames++;}image.width=image.height=1;
      }return frames;}finally{canvases.forEach(c=>c.remove());window.PaperMotion=current;}
    },legacy);assert.equal(pixels,35);
    const ids=await book.evaluate(async()=>{const a=await window.desk.call('state'),first=a.pages[0].id,b=await window.desk.call('new'),second=b.pages[0].id;await Promise.all(Array.from({length:12},(_,i)=>window.desk.call('edit',{id:i%2?first:second,text:'并行保存 '+i})));return [first,second];});
    let saved=JSON.parse(fs.readFileSync(path.join(profile,'notes.json'),'utf8'));assert.equal(saved.pages.find(p=>p.id===ids[0]).text,'并行保存 11');assert.equal(saved.pages.find(p=>p.id===ids[1]).text,'并行保存 10');
    // Fail one actual asynchronous write. The rejected edit must not become visible or corrupt disk.
    await app.evaluate(()=>{const io=process.mainModule.require('node:fs/promises'),original=io.writeFile;io.writeFile=async function(file,...args){if(String(file).endsWith('notes.json.tmp')){io.writeFile=original;throw Error('isolated save failure');}return original.call(this,file,...args);};});
    await assert.rejects(book.evaluate(id=>window.desk.call('edit',{id,text:'未保存内容'}),ids[0]),/isolated save failure/);
    assert.equal((await book.evaluate(()=>window.desk.call('state'))).pages.find(p=>p.id===ids[0]).text,'并行保存 11');assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'notes.json'),'utf8')).pages.find(p=>p.id===ids[0]).text,'并行保存 11');
    await book.evaluate(id=>window.desk.call('edit',{id,text:'失败后可继续保存'}),ids[0]);
    const ballEvent=app.waitForEvent('window');await book.evaluate(id=>window.desk.call('move',{id,status:'ball'}),ids[1]);const ball=await ballEvent;await ball.waitForFunction(()=>foldedImage&&image===null);
    assert.equal((await ball.evaluate(()=>state.pages.length)),1);assert(await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='ball');return !w.motionOrigin&&!w.motionVisual;}));
    await ball.evaluate(()=>openPreview());await ball.evaluate(()=>closePreview());assert.deepEqual(await ball.evaluate(()=>[overlay.width,overlay.height,image===null]),[1,1,true]);
    await book.evaluate(()=>{const s=beginPaperMotion();s.draw({fold:.5});finishPaperMotion();});assert.deepEqual(await book.locator('#paper-motion').evaluate(c=>[c.width,c.height]),[1,1]);
    await app.evaluate(()=>{const io=process.mainModule.require('node:fs/promises'),original=io.writeFile;globalThis.slowWriteStarted=false;io.writeFile=async function(file,...args){if(String(file).endsWith('notes.json.tmp')){io.writeFile=original;slowWriteStarted=true;await new Promise(r=>setTimeout(r,250));}return original.call(this,file,...args);};});
    const pending=book.evaluate(()=>window.desk.call('edit',{id:current().id,text:'退出前最后一次保存',ackOnly:true})).catch(()=>{});
    await app.evaluate(async()=>{for(let i=0;i<100;i++){if(slowWriteStarted)return;await new Promise(r=>setTimeout(r,5));}throw Error('save did not start');});
    await app.close();await pending;book=await start();assert((await book.evaluate(()=>window.desk.call('state'))).pages.some(p=>p.text==='退出前最后一次保存'));
    console.log('PASS: 35 baseline-identical animation frames, concurrent ordered saves, disk failure rollback and recovery, scoped object state, released canvases/textures, restart persistence');
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
