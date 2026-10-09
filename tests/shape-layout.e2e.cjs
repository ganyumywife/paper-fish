const {_electron:electron}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.PAPERDESK_TEST_EXE;
  const app=await electron.launch({executablePath,args:[...(executablePath?[]:['.']),'--user-data-dir='+path.resolve('test-results','shape-layout-'+Date.now())],env});
  try{
    const book=await app.firstWindow();await book.locator('#text[contenteditable=true]').waitFor();const errors=[];book.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book'),area=screen.getDisplayMatching(w.paperBounds).workArea;w.paperBounds.x=Math.round(area.x+(area.width-w.paperBounds.width)/2);w.webContents.setBackgroundThrottling(false);const set=w.setBounds.bind(w);w.layoutMoves=0;w.setBounds=(...a)=>{w.layoutMoves++;return set(...a);};});
    await book.evaluate(async()=>applyWindowInfo(await window.desk.call('dock-preference',{side:'auto'})));
    for(const shape of ['rounded','square','circle','heart','torn']){
      await book.evaluate(async shape=>{await queueEdit({shape,texture:'plain',size:20});await window.desk.call('selection',{id:current().id});},shape);
      await book.waitForFunction(shape=>windowState.layout.shape===shape,shape);
      for(const size of ['small','normal','large']){
        await book.evaluate(async size=>applyWindowInfo(await window.desk.call('paper-preset',{size})),size);
        await book.waitForFunction(()=>Math.abs(innerWidth-windowState.layout.bounds.width)<=1&&Math.abs(innerHeight-windowState.layout.bounds.height)<=1);
        const layout=await book.evaluate(()=>{
          const sheet=document.querySelector('#sheet').getBoundingClientRect(),text=document.querySelector('#text').getBoundingClientRect(),g=PaperShape.geometry(current().shape,sheet.width,sheet.height);
          const handles=['#resize-left','#resize-handle'].map(id=>{const r=document.querySelector(id).getBoundingClientRect();return {inside:PaperShape.contains(g,r.x+r.width/2-sheet.x,r.y+r.height/2-sheet.y),rect:r.toJSON()};});
          const nav=document.querySelector('.page-heading>div').getBoundingClientRect(),actions=document.querySelector('#side-controls').getBoundingClientRect();
          const button=document.querySelector('#tools').getBoundingClientRect(),edge=PaperShape.controls(g).tool,side=document.body.dataset.side;
          return {shape:current().shape,textWidth:text.width,sheetWidth:sheet.width,handles,overlap:nav.right>actions.x&&nav.bottom>actions.y&&nav.y<actions.bottom,toolGap:side==='left'?sheet.x+edge.left-button.right:button.x-sheet.x-edge.right};
        });
        assert(!layout.overlap,shape+' navigation must not overlap actions at '+size);
        if(['circle','heart','torn'].includes(shape)){
          assert(layout.handles.every(h=>h.inside),shape+' resize grip must be on the paper contour');assert(Math.abs(layout.toolGap-8)<1,shape+' toolbar must stay close to the contour');
          if(shape==='heart')assert(layout.textWidth/layout.sheetWidth>.7);
        }
      }
      await book.evaluate(async()=>applyWindowInfo(await window.desk.call('paper-preset',{size:'normal'})));
      await book.waitForFunction(()=>Math.abs(innerWidth-windowState.layout.bounds.width)<=1&&Math.abs(innerHeight-windowState.layout.bounds.height)<=1);
      await book.locator('#text').fill('看完一章，再做下一件事。\n☐ 复习今天的笔记\n☐ 留一点时间休息');
      if(shape==='heart')assert.equal(await book.locator('#text').evaluate(e=>e.scrollHeight>e.clientHeight),false,'short heart note should not require scrolling');
      await book.evaluate(()=>{closeSideTools();document.querySelector('#toast').hidden=true;document.querySelector('#text').blur();});
      await book.screenshot({path:`test-results/layout-${shape}.png`,omitBackground:true});
      const before=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');return {bounds:w.getBounds(),moves:w.layoutMoves};});
      for(const side of ['left','right','left']){
        await book.evaluate(async side=>applyWindowInfo(await window.desk.call('dock-preference',{side})),side);
        const button=await book.locator('#tools').boundingBox();await book.mouse.move(4,4);await book.locator('#tools').hover({force:true});await book.locator('#side-menu').waitFor();await book.waitForTimeout(700);
        assert.deepEqual(await book.locator('#tools').boundingBox(),button,'stationary hover must not move button');await book.keyboard.press('Escape');
      }
      const after=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.deskKind==='book');return {bounds:w.getBounds(),moves:w.layoutMoves};});assert.deepEqual(after,before,'shape side switch and hover must not move native window');
      // Collapse animation ends at the same contour button; reopening recovers position.
      const paper=await app.evaluate(({BrowserWindow})=>({...BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').paperBounds}));
      await book.locator('#collapse').click();await book.waitForFunction(()=>windowState.collapsed&&!document.body.classList.contains('shell-transition'));
      await book.locator('#orb').click();await book.waitForFunction(()=>!windowState.collapsed&&!document.body.classList.contains('shell-transition'));
      const restored=await app.evaluate(({BrowserWindow})=>({...BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').paperBounds}));
      for(const key of ['x','y','width','height'])assert(Math.abs(paper[key]-restored[key])<=1,shape+' collapse must preserve paper position');
      if(shape==='circle'){
        await book.evaluate(async()=>{await window.desk.call('gesture',{phase:'start',x:600,y:500,resize:'right'});await window.desk.call('gesture',{phase:'end',x:600,y:540,resize:'right'});});
        const larger=await app.evaluate(({BrowserWindow})=>({...BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').paperBounds}));assert(larger.width>restored.width,'vertical circle resize must change visible circle size');
        await book.evaluate(async()=>{await window.desk.call('gesture',{phase:'start',x:600,y:540,resize:'right'});await window.desk.call('gesture',{phase:'end',x:600,y:500,resize:'right'});});
        const smaller=await app.evaluate(({BrowserWindow})=>({...BrowserWindow.getAllWindows().find(w=>w.deskKind==='book').paperBounds}));assert(smaller.width<larger.width,'vertical circle resize must shrink the circle');
      }
    }
    await book.evaluate(async()=>{await queueEdit({shape:'heart',text:'',rich:[]});closeSideTools();document.querySelector('#toast').hidden=true;document.querySelector('#text').blur();});
    await book.screenshot({path:'test-results/layout-heart-empty.png',omitBackground:true});assert.deepEqual(errors,[]);
    console.log('PASS: all five shapes at three sizes, readable heart area, contour resize grips, header layout, stable side switches and hover, collapse position');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
