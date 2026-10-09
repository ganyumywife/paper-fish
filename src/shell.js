if(kind==='shelf'){
  const row=document.createElement('div');row.className='search-row';
  $('#search-scope').before(row);row.append($('#search-scope'),$('#search'));
}
// Tool visibility is local UI state; hovering never changes native window bounds.
if (kind === 'book' || kind === 'pinned') {
  const menu = $('#side-menu'), trigger = $('#tools'), orb = $('#orb');
  const ghost = orb.cloneNode(true); ghost.id = 'transition-orb'; ghost.removeAttribute('aria-label'); ghost.setAttribute('aria-hidden','true'); ghost.tabIndex=-1; document.body.append(ghost);
  document.body.append(trigger);
  $('#side-controls').append(...document.querySelector('.window-tools').children);
  $('header').append($('#side-controls'));
  menu.prepend($('#toolbar')); menu.insertBefore($('.appearance'), $('#tool-options'));
  menu.insertBefore($('footer'), $('#tool-options'));
  $('#side-controls').append($('#settings'));
  const defaults=document.createElement('div');defaults.className='default-actions';
  defaults.append($('#default-style'),$('#reset-default-style'));$('#tool-options').append(defaults);
  const presets=document.createElement('div');presets.className='paper-presets';presets.innerHTML='<label>尺寸<select id="paper-size-preset" aria-label="常用便签尺寸"><option value="">选择尺寸</option><option value="small">小号</option><option value="normal">标准</option><option value="large">大号</option></select></label><div id="paper-colors" role="group" aria-label="常用纸色"></div>';
  $('#tool-options').prepend(presets);
  const zoomControls=document.createElement('div');zoomControls.className='zoom-controls';zoomControls.setAttribute('role','group');zoomControls.setAttribute('aria-label','便签缩放');
  zoomControls.innerHTML='<button id="zoom-out" title="缩小便签" aria-label="缩小便签">−</button><button id="zoom-reset" title="恢复 100% · Ctrl+0" aria-label="恢复原始比例">100%</button><button id="zoom-in" title="放大便签" aria-label="放大便签">＋</button>';
  menu.insertBefore(zoomControls,$('#tool-options'));$('#zoom-out').onclick=()=>zoomNote({factor:1/1.1});$('#zoom-in').onclick=()=>zoomNote({factor:1.1});$('#zoom-reset').onclick=()=>zoomNote({reset:true});
  const fontSize=document.createElement('label');fontSize.textContent='字号';fontSize.append($('#size'));$('#tool-options').append(fontSize);
  for(const [label,color]of [['米黄','#f7edc8'],['奶白','#faf7ee'],['薄荷','#deebd9'],['浅蓝','#dce8f3'],['淡粉','#f4dfe2']]){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label+'纸色');b.style.backgroundColor=color;b.onclick=run(async()=>{await queueEdit({color});render();});$('#paper-colors').append(b);}
  $('#paper-size-preset').onchange=run(async()=>{const field=$('#paper-size-preset'),size=field.value;field.value='';if(size)applyWindowInfo(await api('paper-preset',{size}));});
  let pinned = false, opened = false, hoverTimer, leaveTimer, transitioning = false;
  function setTools(value) {
    if (transitioning || windowState.collapsed) return Promise.resolve();
    if(opened===value)return Promise.resolve();
    opened = value; document.body.classList.toggle('tools-open', value);
    trigger.setAttribute('aria-expanded', String(value));
    window.refreshDesktopHitTest?.();
    return Promise.resolve();
  }
  function unpin(){pinned=false;trigger.classList.remove('pinned');}
  function enter() { clearTimeout(leaveTimer); clearTimeout(hoverTimer); hoverTimer = setTimeout(() => setTools(true), 180); }
  window.closeSideTools = () => { unpin(); clearTimeout(hoverTimer); clearTimeout(leaveTimer); return setTools(false); };
  function leave() { clearTimeout(hoverTimer); clearTimeout(leaveTimer); leaveTimer = setTimeout(() => {
    if (!pinned && !menu.contains(document.activeElement) && !document.querySelector('dialog[open]')) setTools(false);
  }, 650); }
  for (const el of [trigger, menu]) { el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave); el.addEventListener('focusin', () => setTools(true)); }
  menu.addEventListener('focusout', leave);
  trigger.onclick = () => { clearTimeout(hoverTimer);clearTimeout(leaveTimer);pinned = !pinned; trigger.classList.toggle('pinned', pinned); setTools(pinned); };
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && e.target !== trigger && !e.target.closest('dialog')) { unpin(); leave(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { clearTimeout(hoverTimer);clearTimeout(leaveTimer);unpin(); trigger.blur(); setTools(false); } });
  $('#dock-side').onchange = run(async () => applyWindowInfo(await api('dock-preference', { side: $('#dock-side').value })));
  $('#orb-snap').onchange = run(async () => applyWindowInfo(await api('dock-preference', { snap: $('#orb-snap').checked })));
  async function toggleOrb() {
    if (transitioning || busy || peelStart) return;
    // Guard before any await: two fast clicks must never enqueue two toggles.
    transitioning = true; clearTimeout(hoverTimer); clearTimeout(leaveTimer);
    const expanding = !!windowState.collapsed, field = $('#text'), caret = [field.selectionStart, field.selectionEnd];
    unpin(); let animation, orbAnimation;
    const frame = () => new Promise(resolve=>requestAnimationFrame(resolve));
    try {
      await editQueue;await zoomQueue;
      if (!expanding) {opened=false;document.body.classList.remove('tools-open');trigger.setAttribute('aria-expanded','false');}
      document.body.classList.add('shell-transition');
      if(expanding)document.body.classList.add('shell-preparing');
      if (expanding) applyWindowInfo(await api('window', { op: 'collapse' }));
      // Native bounds and renderer viewport are asynchronous. Keep the sheet hidden
      // until the new viewport has painted; never expose an unanimated full sheet.
      for(let attempt=0;attempt<60;attempt++){await frame();const b=windowState.layout.bounds;if(Math.abs(innerWidth-b.width)<=1&&Math.abs(innerHeight-b.height)<=1)break;}
      await frame();
      const l = windowState.layout, paper = $('#workspace');
      const dx = l.buttonX + 18 - l.paperX - l.paper.width / 2, dy = l.buttonY + 18 - l.paper.height / 2;
      const full = { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '0' };
      const small = { transform: `translate(${dx}px,${dy}px) scale(.06)`, opacity: 0, borderRadius: '50%' };
      if (motionEnabled()) {
        animation=paper.animate(expanding ? [small, full] : [full, small], { duration: 320, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both' });
        orbAnimation=ghost.animate(expanding?[{opacity:1},{opacity:0,offset:.5},{opacity:0}]:[{opacity:0},{opacity:0,offset:.5},{opacity:1}],{duration:320,fill:'both'});
        document.body.classList.remove('shell-preparing');await animation.finished;
      }
      if (!expanding) applyWindowInfo(await api('window', { op: 'collapse' }));
      else { field.focus(); field.setSelectionRange(...caret); }
      await frame();
    } finally { animation?.cancel();orbAnimation?.cancel();document.body.classList.remove('shell-transition','shell-preparing');transitioning = false; }
  }
  $('#collapse').onclick = run(toggleOrb);
  window.expandNote=()=>windowState.collapsed?toggleOrb():Promise.resolve();
  attachDesktopDrag(orb, false, () => !transitioning);
  orb.addEventListener('desktop-click', run(toggleOrb));
  orb.oncontextmenu = run(e => { e.preventDefault(); return api('orb-menu'); });
  window.desk.onExpandRequest(run(toggleOrb));
}
