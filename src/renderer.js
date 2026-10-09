const $ = s => document.querySelector(s);
const query = new URLSearchParams(location.search), kind = query.get('kind') || 'book', id = query.get('id');
let pendingEdits=0;
let targetId, state, selected, previewId, imageData, recognizing = false, busy = false, editQueue = Promise.resolve(), toastTimer;
const api = (action, p) => window.desk.call(action, p);
function toast(message) { $('#toast').textContent = String(message).replace(/^Error invoking remote method 'desk': Error: /, ''); $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5500); }
function run(fn) { return async (...args) => { try { await fn(...args); } catch (e) { toast(e.message); } }; }
const editor=new NoteEditor($('#text'),patch=>queueEdit(patch));
function current() { return state?.pages.find(p => p.id === (kind === 'pinned' ? id : selected)); }
let renderSignature;
function render() {
  const pages = state.pages.filter(p => p.status === 'book');
  if (!pages.some(p => p.id === selected)) selected = pages[0]?.id;
  const signature=JSON.stringify(kind==='shelf'?state.pages:kind==='ai'?[targetId,state.pages.find(p=>p.id===targetId),state.settings.base,state.settings.model,state.settings.hasKey]:[current(),kind==='pinned'?null:pages.map(p=>p.id),!pendingEdits&&!editor.composing]);if(signature===renderSignature)return;renderSignature=signature;
  if (kind === 'shelf') { renderShelf(); return; }
  if (kind === 'ai') { const p=state.pages.find(n=>n.id===targetId);$('#target-label').textContent=p&&['book','pinned'].includes(p.status)?'追加目标：'+(p.text.slice(0,20)||'空白页'):'追加目标已不可用';updateAIControls();return; }
  const p = current(); if (!p) return;
  api('selection',{id:p.id}).catch(()=>{});
  if (editor.id!==p.id || (!pendingEdits&&!editor.composing)) editor.load(p);
  $('#paper').style.backgroundColor = p.color; $('#paper').style.borderRadius = p.shape === 'square' ? '2px' : '3px 3px 18px 3px';
  $('#text').style.fontFamily = p.font === 'hand' ? 'KaiTi, STKaiti, cursive' : '"Microsoft YaHei UI", sans-serif';
  $('#text').style.fontSize = p.size + 'px';
  $('#text').style.fontWeight = p.bold ? '700' : '400'; $('#text').style.textAlign = p.align || 'left'; $('#text').style.color = p.ink || '#454536'; $('#bold').setAttribute('aria-pressed', String(!!p.bold)); $('#ink').value=p.ink||'#454536'; $('#align').value=p.align||'left';
  $('#text').dataset.texture=p.texture||'plain';$('#text').style.setProperty('--rule-step',(p.texture==='grid'?24:p.size*1.85)+'px');$('#texture').value=p.texture||'plain';
  for (const k of ['color','font','size','shape']) $('#' + k).value = p[k];
  updatePaperShape(p);syncFormatControls();
  $('#page-count').textContent = kind === 'pinned' ? '独立便签' : `${pages.findIndex(x => x.id === p.id) + 1} / ${pages.length}`;
  $('#pin').textContent = kind === 'pinned' ? '收回本子' : '钉到桌面';
  $('#page-label').textContent = kind === 'pinned' ? '重要的，就留在眼前' : '一本小小的思绪';
}
function syncFormatControls(){if(!state||kind==='ai'||kind==='shelf')return;const p=current();if(!p)return;const [a,b]=editor.selection(),first=a!==b?RichText.slice(editor.runs,a,b)[0]:null;$('#size').value=first?.size||p.size;$('#ink').value=first?.ink||p.ink||'#454536';$('#bold').setAttribute('aria-pressed',String(first?.bold??p.bold??false));$('#format-scope').textContent=a!==b?'选中文字':'整页';$('.appearance').title=a!==b?'格式应用于选中文字':'未选中文字，格式应用于整页';}
document.addEventListener('selectionchange',syncFormatControls);
function pageFormat(key,value){const rich=RichText.normalize(editor.runs.map(r=>{const copy={...r};delete copy[key];return copy;}));return queueEdit({[key]:value,rich});}
function queueEdit(patch) {
  const p = current(); if (!p) return;
  pendingEdits++;const pid = p.id; Object.assign(p, patch); $('#save-state').textContent = '保存中…';
  const snapshot = { id: pid, ackOnly:true,text: p.text, rich:structuredClone(p.rich||RichText.normalize(null,p.text)), color: p.color, font: p.font, size: p.size, shape: p.shape, texture:p.texture||'plain', bold:p.bold||false,align:p.align||'left',ink:p.ink||'#454536' };
  editQueue = editQueue.catch(() => {}).then(() => api('edit', snapshot)).then(() => { $('#save-state').textContent = '已保存'; }).catch(e => { $('#save-state').textContent = '保存失败'; toast(e.message); throw e; }).finally(()=>{pendingEdits--;if(!pendingEdits)render();});
  editQueue.catch(() => {}); return editQueue;
}
async function move(pid, status) { if (busy) return; await editQueue; await api('move', { id: pid, status }); }
const motionEnabled = () => state.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
let paperSurface, peelStart, peel = 0, peelSide = 'right', peelLift = 0;
function beginPaperMotion() {
  if (paperSurface) return paperSurface;
  const r = $('#sheet').getBoundingClientRect(), p = current(), styles = getComputedStyle($('#text'));
  const zoom=windowState.layout?.zoom||1;
  const image = PaperMotion.texture({ ...p, width: $('#sheet').clientWidth, height: $('#sheet').clientHeight, resolution:2*Math.max(1,zoom),scrollbar:$('#text').offsetWidth-$('#text').clientWidth,top: parseFloat(styles.paddingTop), padding: parseFloat(styles.paddingLeft), scroll: $('#text').scrollTop });
  $('#paper-motion').hidden = false;
  paperSurface = new PaperMotion.Surface($('#paper-motion'), image, { x: r.x, y: r.y, width: r.width, height: r.height,zoom,shape:p.shape,color:p.color });
  document.body.classList.add('paper-animating'); return paperSurface;
}
function finishPaperMotion() { if(paperSurface?.image instanceof HTMLCanvasElement){paperSurface.image.width=paperSurface.image.height=1;}paperSurface=null;$('#paper-motion').width=$('#paper-motion').height=1;$('#paper-motion').hidden=true; document.body.classList.remove('paper-animating', 'motion-busy', 'peeling'); peelStart = null; peel = 0; }
function drawPeel() { if (paperSurface) paperSurface.draw({ peel, side: peelSide, lift: peelLift }); }
async function cancelPeel() {
  if (busy || !paperSurface) { peelStart = null; return; }
  busy = true; const from = peel; peelStart = null;
  try { await PaperMotion.animate(motionEnabled() ? 240 : 1, t => { peel = from * (1 - t); drawPeel(); }); }
  finally { finishPaperMotion(); busy = false; }
}
async function tear() {
  if (busy) return; busy = true; const pid = current().id; peelStart = null; document.body.classList.add('motion-busy');
  try {
    await editQueue;await zoomQueue;
    await api('sound-effect',{type:'tear'});const surface = beginPaperMotion(), from = peel;
    const r = surface.rect, center = { x: r.x + r.width / 2, y: r.y + r.height * .56 };
    if (motionEnabled()) {
      document.body.dataset.paperPhase = 'detaching';
      await PaperMotion.animate(320, t => { peel = PaperMotion.mix(from, .95, t); drawPeel(); });
      await api('sound-effect',{type:'crumple'});document.body.dataset.paperPhase = 'crumpling';
      await PaperMotion.animate(800, t => surface.draw({ side: peelSide, peel: .95 * (1 - t), fold: t, cx: center.x, cy: center.y }));
    }
    surface.draw({ fold: 1, cx: center.x, cy: center.y });
    document.body.dataset.paperPhase = 'handoff';
    await api('move', { id: pid, status: 'ball', ballPoint: center, visual: { image: surface.image.toDataURL('image/png'), width: $('#sheet').clientWidth, height: $('#sheet').clientHeight } });
  } finally { finishPaperMotion(); delete document.body.dataset.paperPhase; busy = false; }
}
async function unfoldRestored(pid) {
  if (kind === 'shelf'||kind==='ai') return;
  selected = pid; $('#text').blur(); render();
  if (!motionEnabled()) return;
  busy = true; document.body.classList.add('motion-busy'); document.body.dataset.paperPhase = 'unfolding';
  try { const surface = beginPaperMotion(); await PaperMotion.animate(760, t => surface.draw({ fold: 1 - t })); }
  finally { finishPaperMotion(); delete document.body.dataset.paperPhase; busy = false; }
}
function renderShelf() {
  const scope=$('#search-scope').value, trash = scope==='trash', search = $('#search').value.toLowerCase();
  $('#trash-toggle').textContent = trash ? '返回纸团' : '回收站'; $('#drop-bin').hidden = trash;
  $('#trash-clear').hidden=!trash;
  const pages = state.pages.filter(p => (scope==='all'||p.status===scope) && p.text.toLowerCase().includes(search));
  $('#balls').replaceChildren();
  for (const p of pages) {
    const b = document.createElement('button'); b.className = p.status==='ball'||p.status==='trash' ? 'ball' : 'note-entry'; b.textContent = p.text.slice(0, 40) || '空白页'; b.title = ({book:'便签本',pinned:'钉贴',ball:'纸团',trash:'回收站'})[p.status]+' · 点击查看'; b.draggable = p.status==='ball';
    b.addEventListener('dragstart', e => e.dataTransfer.setData('application/x-paper-id', p.id));
    b.onclick = () => { previewId = p.id; RichText.render($('#preview-text'),RichText.normalize(p.rich,p.text||'（空白页）')); $('#preview-date').textContent = PageInfo.describe(p); $('#dispose').textContent = p.status==='trash' ? '永久删除' : '放入回收站'; $('#preview-dialog').showModal(); };
    $('#balls').append(b);
  }
  if (!pages.length) { const el = document.createElement('p'); el.className = 'empty'; el.textContent = trash ? '回收站为空' : '暂无便签'; $('#balls').append(el); }
}

for (const key of ['color','font','size','shape','texture']) $('#' + key).onchange = run(async () => { if(key==='size'&&editor.format('size',Number($('#size').value)))return;if(key==='size')await pageFormat('size',Number($('#size').value));else await queueEdit({ [key]: $('#' + key).value }); render(); });
for(const key of ['ink','align'])$('#'+key).onchange=run(async()=>{if(key==='ink'&&editor.format('ink',$('#ink').value))return;if(key==='ink')await pageFormat('ink',$('#ink').value);else await queueEdit({[key]:$('#'+key).value});render();});
$('#bold').onclick=run(async()=>{if(editor.format('bold',!editor.allBold()))return;await pageFormat('bold',!current().bold);render();});
$('#todo').onclick=()=>editor.todo();
$('#lock').onclick=run(async()=>{$('#lock').textContent=await api('window',{op:'lock'})?'解锁':'锁定';});
$('#new').onclick = run(async () => { await editQueue; const s = await api('new'); selected = s.pages[0].id; state = s; render(); $('#text').focus(); });
for (const [selector, direction] of [['#prev', -1], ['#next', 1]]) $(selector).onclick = run(async () => { await editQueue; const pages = state.pages.filter(p => p.status === 'book'); selected = pages[(pages.findIndex(p => p.id === selected) + direction + pages.length) % pages.length].id; $('#text').blur(); render(); });
$('#pin').onclick = run(() => move(current().id, kind === 'pinned' ? 'book' : 'pinned'));
$('#tear').onclick = run(tear);
for (const [selector, side] of [['#tear-left', 'left'], ['#tear-corner', 'right']]) {
  const handle = $(selector);
  handle.onpointerdown = e => {
    if (busy || peelStart || e.button !== 0) return;
    peelSide = side; peel = 0; peelLift = 0; peelStart = { x: e.clientX, y: e.clientY };
    handle.setPointerCapture(e.pointerId); document.body.classList.add('peeling'); beginPaperMotion(); drawPeel(); e.preventDefault();
  };
  handle.onpointermove = e => {
    if (!peelStart) return;
    const inward = (e.clientX - peelStart.x) * (side === 'left' ? 1 : -1);
    peel = PaperMotion.clamp(inward / Math.max(110, $('#paper').clientWidth * .58));
    peelLift = PaperMotion.clamp(Math.abs(e.clientY - peelStart.y) / 130); drawPeel();
  };
  handle.onpointerup = run(async () => { if (!peelStart) return; if (peel >= .72) await tear(); else await cancelPeel(); });
  handle.onpointercancel = run(cancelPeel);
}
document.addEventListener('keydown', run(async e => { if (e.key === 'Escape' && peelStart) await cancelPeel(); }));

$('#gather').onclick=run(async()=>{const count=await api('gather');toast(count?'已聚拢 '+count+' 个纸团':'暂无可聚拢的纸团');});
$('#default-style').onclick=run(async()=>{await editQueue;await api('default-style',{id:current().id});toast('已设为新页默认外观，已有便签不变');});
$('#reset-default-style').onclick=run(async()=>{await api('default-style',{reset:true});toast('新页默认外观已重置');});
$('#bin').onclick = run(() => api('bin'));
$('#sling').onclick = run(() => api('sling'));
const canResizeNote=()=>!busy&&!peelStart&&!windowState.locked&&!windowState.collapsed&&!document.body.classList.contains('shell-transition');
attachDesktopDrag($('#resize-handle'), 'right',canResizeNote);
attachDesktopDrag($('#resize-left'), 'left',canResizeNote);
function setTopState(top){$('#top').setAttribute('aria-pressed',String(top));$('#top').title=top?'取消置顶':'置顶便签';$('#top').setAttribute('aria-label',$('#top').title);}
$('#top').onclick = run(async () => setTopState(await api('window', { op: 'top' })));

$('#hide').onclick = run(() => api('window', { op: 'hide' }));
$('#shelf').onclick = run(() => api('shelf'));
$('#trash-toggle').onclick = () => { $('#search-scope').value=$('#search-scope').value==='trash'?'ball':'trash';renderShelf(); };
$('#search-scope').onchange=renderShelf;
$('#trash-clear').onclick=run(()=>api('trash-clear'));
$('#search').oninput = renderShelf;
$('#restore').onclick = run(async () => { await move(previewId, 'book'); $('#preview-dialog').close(); });
$('#restore-pin').onclick = run(async () => { await move(previewId, 'pinned'); $('#preview-dialog').close(); });
$('#dispose').onclick = run(async () => { const p = state.pages.find(p => p.id === previewId); if (p.status === 'trash') await api('delete', { id: p.id }); else await move(p.id, 'trash'); $('#preview-dialog').close(); });
for (const [selector, target] of [['#drop-bin', 'trash'], ['#paper', 'book']]) {
  $(selector).ondragover = e => { e.preventDefault(); $(selector).classList.add('over'); };
  $(selector).ondragleave = () => $(selector).classList.remove('over');
  $(selector).ondrop = run(async e => { e.preventDefault(); $(selector).classList.remove('over'); const pid = e.dataTransfer.getData('application/x-paper-id'); if (pid) await move(pid, target); });
}
function aiConfigured(){return !!(state?.settings.hasKey && state.settings.model?.trim() && state.settings.base?.trim());}
function updateAIControls(){
  const ready=aiConfigured();
  $('#destination').textContent=ready?'AI 已配置 · '+state.settings.model:'AI 未配置';
  $('#destination').title=ready?'发送至：'+state.settings.base:'填写 API 地址、视觉模型和 API Key 后即可识别';
  $('#recognize').disabled=recognizing;
  $('#recognize').textContent=recognizing?'正在识别…':ready?'开始识别':'配置 AI';
  $('#recognize').title=ready?'将图片发送到所配置的 AI 服务，可能产生 API 费用':'配置图片识别服务';
  $('#ai-settings').disabled=recognizing;
}
function openSettings(){
  $('#api-base').value = state.settings.base; $('#api-model').value = state.settings.model; $('#api-key').value = ''; $('#clear-key').checked = false;
  $('#api-key').placeholder=state.settings.hasKey?'留空保留已保存的密钥':'输入 API Key';
  $('#api-key').required=kind==='ai'&&!state.settings.hasKey;
  $('#motion').checked = state.settings.motion;$('#fullscreen-avoid').checked=state.settings.fullscreenAvoid===true;
  $('#key-status').textContent = state.settings.hasKey ? '密钥已保存' : '未设置密钥';
  $('#settings-title').textContent=kind==='ai'?'AI 设置':'设置';
  window.loadDesktopSettings?.();window.loadShortcutSettings?.();
  if(!$('#settings-dialog').open)$('#settings-dialog').showModal();
  if(kind==='ai')(!state.settings.model?.trim()?$('#api-model'):!state.settings.hasKey?$('#api-key'):$('#api-base')).focus();
}
async function saveAISettings(){
  const saved=await api('settings', { base: $('#api-base').value.trim(), model: $('#api-model').value, apiKey: $('#api-key').value.trim(), clearKey: $('#clear-key').checked, motion: $('#motion').checked });
  state=StateSync.apply(state,saved);$('#api-key').value='';$('#api-key').required=kind==='ai'&&!state.settings.hasKey;$('#clear-key').checked=false;
  render();
}
$('#settings').onclick=openSettings;
$('#ai-settings').onclick=openSettings;
$('#settings-dialog').addEventListener('close',()=>{$('#api-key').value='';if(kind==='ai')$('#recognize').focus();});
$('#settings-form').onsubmit = run(async e => { e.preventDefault(); await saveAISettings(); $('#settings-dialog').close(); toast('配置已保存'); });
$('#ai').onclick = run(async () => {await editQueue;await window.closeSideTools?.();await api('ai-open',{id:current().id});});
$('#retarget').onclick=run(async()=>{targetId=await api('ai-retarget');render();});
async function loadImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw Error('请选择不超过 10 MB 的 PNG、JPG 或 WebP 图片');
  imageData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  await ImageEditor.load(imageData);imageData=ImageEditor.data();$('#image-preview').hidden=true;window.resetSplit?.(); $('#ai-result').value = '';
}
for(const [selector,method]of [['#rotate-image','rotate'],['#crop-image','crop'],['#reset-image','reset']])$(selector).onclick=run(()=>{ImageEditor[method]();imageData=ImageEditor.data();});
$('#backup-export').onclick=run(async()=>{if(await api('backup-export'))toast('备份已导出，不含 API Key');});
$('#backup-import').onclick=run(async()=>{if(await api('backup-import'))toast('备份已合并，原内容完整保留');});
$('#test-ai').onclick=run(async()=>{
  $('#test-ai').disabled=true;
  try{
    if(!$('#settings-form').reportValidity())return;
    await saveAISettings();
    const c=document.createElement('canvas');c.width=120;c.height=50;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,120,50);ctx.fillStyle='black';ctx.font='24px sans-serif';ctx.fillText('TEST',20,34);
    $('#key-status').textContent='正在发送测试图片，可能产生少量 API 费用…';await api('recognize',{image:c.toDataURL('image/png'),mode:'literal'});$('#key-status').textContent='连接成功';
  }catch(e){$('#key-status').textContent='测试未通过：'+e.message;throw e;}finally{$('#test-ai').disabled=false;}
});
$('#image-file').onchange = run(e => loadImage(e.target.files[0]));
$('#upload-zone').ondragover = e => e.preventDefault();
$('#upload-zone').ondrop = run(async e => { e.preventDefault(); await loadImage(e.dataTransfer.files[0]); });
document.addEventListener('paste', run(async e => { if (!$('#ai-dialog').open) return; const file = [...e.clipboardData.items].find(x => x.type.startsWith('image/'))?.getAsFile(); if (file) { e.preventDefault(); await loadImage(file); } }));
$('#recognize').onclick = run(async () => {
  if(!aiConfigured()){openSettings();return;}
  if (!imageData) throw Error('请先选择图片'); recognizing=true;updateAIControls();
  try { const text=await api('recognize', { image: imageData, mode: $('#ai-mode').value });window.resetSplit?.();$('#ai-result').value=text; toast('识别完成，请校对后录入'); }
  finally { recognizing=false;updateAIControls(); }
});
$('#cancel-ai').onclick = run(() => api('cancel'));
$('#import').onclick = run(async () => {
  const pages=window.splitPages?.(),text=$('#ai-result').value;
  if(pages?pages.some(t=>!t.trim()):!text.trim())throw Error(pages?'有空白拆页，请填写或合并':'还没有可录入的内容');
  if(pages&&$('#import-target').value==='append')throw Error('拆页请选择新建一页或钉到桌面');
  $('#import').disabled = true;
  try { const target = $('#import-target').value;
    state=await api('ai-import',{target,text,pages,requestId:crypto.randomUUID()});window.resetSplit?.();$('#ai-result').value='';render();toast(pages?'已录入 '+pages.length+' 页':'已录入便签');
  } finally { $('#import').disabled = false; }
});
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => {const dialog=b.closest('dialog');if(kind==='ai'&&dialog.id==='ai-dialog')return api('window',{op:'hide'});dialog.close();});
window.desk.onChange(s=>{state=StateSync.apply(state,s);render();});
window.desk.onRestored(run(unfoldRestored));
window.desk.onHint(active => $('#paper').classList.toggle('drop-ready', active));
window.desk.onNotice(toast);
let windowState={};
function applyWindowInfo(info){
 if(!info)return;windowState=info;if(info.targetId)targetId=info.targetId;
 document.body.classList.toggle('collapsed',!!info.collapsed);document.body.classList.toggle('locked',!!info.locked);
 $('#lock').textContent=info.locked?'解锁':'锁定';setTopState(info.top);
 if(info.layout){const l=info.layout,s=document.body.style;for(const [k,v]of Object.entries({'paper-x':l.paperX,'paper-w':l.paper.width,'paper-h':l.paper.height,'sheet-w':l.base.width,'sheet-h':l.base.height,'button-x':l.buttonX,'button-y':l.buttonY,'gutter':l.gutter}))s.setProperty('--'+k,v+'px');s.setProperty('--paper-zoom',l.zoom);s.setProperty('--scrollbar-size','6px');document.body.dataset.side=l.side;document.body.classList.toggle('compact-paper',l.paper.width<260);if($('#zoom-reset'))$('#zoom-reset').textContent=Math.round(l.zoom*100)+'%';}
 if(state&&current())updatePaperShape(current());
 $('#dock-side').value=info.sidePref||'auto';$('#orb-snap').checked=info.snap!==false;
 if(kind==='ai'&&state)render();
}
window.desk.onSelectPage(pid=>{selected=pid;$('#text').blur();render();});
window.desk.onWindowState(applyWindowInfo);
window.desk.onSettingsRequest(run(async()=>{if(windowState.collapsed)await window.expandNote?.();$('#settings').click();}));
window.desk.onSearchRequest(run(async()=>{while(!state)await new Promise(r=>setTimeout(r,20));$('#search-scope').value='all';renderShelf();$('#search').focus();}));
run(async () => { state = await api('state'); $('#text').contentEditable='true'; applyWindowInfo(state.windowInfo); document.body.classList.add(kind); $('#editor-area').hidden = kind === 'shelf'; $('#shelf-area').hidden = kind !== 'shelf'; $('#toolbar').hidden = kind === 'shelf'; if (kind === 'pinned') { $('#prev').hidden = true; $('#next').hidden = true; $('#new').hidden = true; } if(kind==='ai')$('#ai-dialog').show();render(); })();


function updatePaperShape(p){
  const sheet=$('#sheet'),field=$('#text'),outline=$('#paper-outline'),custom=PaperShape.custom(p.shape);
  document.body.classList.toggle('shaped-paper',custom);$('#paper').dataset.shape=PaperShape.normalize(p.shape);
  $('#paper').style.backgroundColor='transparent';sheet.style.backgroundColor=custom?'transparent':p.color;
  const curved=['circle','heart'].includes(p.shape);document.body.classList.toggle('curved-paper',curved);
  $('#paper').style.setProperty('--paper-color',p.color);
  if(!sheet.clientWidth||!sheet.clientHeight)return;
  const g=PaperShape.geometry(p.shape,sheet.clientWidth,sheet.clientHeight),box=g.text,zoom=windowState.layout?.zoom||1;
  sheet.style.clipPath=custom?g.clip:'none';
  outline.style.backgroundColor=p.color;outline.style.clipPath=g.clip;outline.dataset.texture=p.texture||'plain';outline.style.setProperty('--rule-step',(p.texture==='grid'?24:p.size*1.85)+'px');
  for(const layer of document.querySelectorAll('.paper-stack')){layer.style.backgroundColor=p.color;layer.style.clipPath=g.clip;}
  for(const [key,value]of Object.entries({left:box.x,top:box.y,width:box.width,height:box.height}))field.style[key]=custom?value+'px':'';
  field.style.backgroundImage=custom?'none':'';
  for(const side of ['left','right']){const handle=$(side==='left'?'#tear-left':'#tear-corner'),a=g.anchors[side];handle.style.left=custom?(a.x*zoom-17)+'px':'';handle.style.right=custom?'auto':'';handle.style.top=custom?(44+a.y*zoom-12)+'px':'';handle.title=custom?(side==='left'?'从左侧边缘揭起撕页':'从右侧边缘揭起撕页'):(side==='left'?'从左上角向内揭起撕页':'从右上角向内揭起撕页');}
  const controls=PaperShape.controls(g),paperX=windowState.layout?.paperX||0;
  document.querySelectorAll('.paper-drag').forEach((handle,i)=>{const a=controls.drag[i];handle.hidden=!a;if(a)for(const [k,v]of Object.entries({left:a.x,top:a.y,width:a.width,height:a.height}))handle.style[k]=v+'px';});
  for(const side of ['left','right']){
    const handle=$(side==='left'?'#resize-left':'#resize-handle'),a=controls.resize[side];
    handle.style.left=custom?(paperX+12+a.x*zoom-13)+'px':'';handle.style.top=custom?(56+a.y*zoom-13)+'px':'';
  }
  syncShapeRuling();
}
function syncShapeRuling(){if(!document.body.classList.contains('shaped-paper'))return;const g=PaperShape.geometry(current().shape,$('#sheet').clientWidth,$('#sheet').clientHeight);$('#paper-outline').style.backgroundPosition='0 '+(g.text.y+12-$('#text').scrollTop)+'px';}
$('#text').addEventListener('scroll',syncShapeRuling);

// Paper movement uses the same pointer-capture path as the orb and resize grips.
// Transparent title regions on Windows are no longer needed to start a drag.
attachDesktopDrag($('#paper'),false,event=>{
  if(busy||peelStart||windowState.locked||windowState.collapsed||document.body.classList.contains('shell-transition')||event.target.closest('#text,.tear-handle'))return false;
  const r=$('#sheet').getBoundingClientRect(),g=PaperShape.geometry(current()?.shape,r.width,r.height,windowState.layout?.zoom||1);
  return PaperShape.contains(g,event.clientX-r.x,event.clientY-r.y);
});
for(const grip of document.querySelectorAll('.paper-drag'))grip.addEventListener('keydown',run(async e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||busy||peelStart||windowState.locked)return;e.preventDefault();
  const step=e.shiftKey?1:10,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
  await api('gesture',{phase:'start',x:0,y:0});await api('gesture',{phase:'end',x:dx,y:dy});
}));

let zoomQueue=Promise.resolve(),wheelDelta=0,wheelFrame;
function zoomNote(payload){
  if(!['book','pinned'].includes(kind)||busy||peelStart||windowState.locked||windowState.collapsed||document.body.classList.contains('shell-transition'))return Promise.resolve();
  zoomQueue=zoomQueue.catch(()=>{}).then(async()=>applyWindowInfo(await api('paper-zoom',payload))).catch(e=>toast(e.message));return zoomQueue;
}
$('#paper').addEventListener('wheel',event=>{
  if(!event.ctrlKey)return;event.preventDefault();event.stopPropagation();
  wheelDelta+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{wheelFrame=null;const delta=wheelDelta;wheelDelta=0;zoomNote({factor:Math.exp(-Math.max(-500,Math.min(500,delta))*.0015)});});
},{passive:false});
document.addEventListener('keydown',event=>{
  if(!['book','pinned'].includes(kind)||!event.ctrlKey||event.altKey||document.querySelector('dialog[open]'))return;
  if(['0','+','=','-'].includes(event.key)){event.preventDefault();zoomNote(event.key==='0'?{reset:true}:{factor:event.key==='-'?1/1.1:1.1});}
});
