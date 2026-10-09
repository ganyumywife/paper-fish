// Drafts live in the AI side window and survive hiding or changing the book page.
let splitDraft=null,splitIndex=0,previousTarget;
function drawSplit(){
  const active=!!splitDraft;$('#split-preview').hidden=!active;$('#ai-result').hidden=active;
  $('#split-toggle').textContent=active?'取消拆页':'拆页';
  $('#import').textContent=active?`录入 ${splitDraft.length} 页`:'录入';
  $('#import-target option[value="new"]').textContent=active?`新建 ${splitDraft.length} 页`:'新建一页';
  $('#import-target option[value="pinned"]').textContent=active?`钉出 ${splitDraft.length} 页`:'钉到桌面';
  $('#import-target option[value="append"]').disabled=active;
  if(!active)return;
  $('#split-count').textContent=`${splitIndex+1} / ${splitDraft.length}`;
  $('#split-text').value=splitDraft[splitIndex];
  $('#split-prev').disabled=splitIndex===0;$('#split-next').disabled=splitIndex===splitDraft.length-1;
  $('#split-merge').disabled=splitIndex===splitDraft.length-1;
  $('#import').title=`确认录入 ${splitDraft.length} 页`;
}
window.resetSplit=()=>{
  if(splitDraft){$('#ai-result').value=splitDraft.join('');if(previousTarget)$('#import-target').value=previousTarget;}
  splitDraft=null;splitIndex=0;previousTarget=null;$('#import').title='';drawSplit();
};
window.splitPages=()=>splitDraft?[...splitDraft]:undefined;
function rebuildSplit(){
  const text=splitDraft?splitDraft.join(''):$('#ai-result').value;
  if(!text.trim())throw Error('请先识别或填写内容');
  const pages=Pagination.split(text,Number($('#split-size').value));
  if(pages.length>100)throw Error('超过 100 页，请增大每页字数或分次录入');
  if(!splitDraft){previousTarget=$('#import-target').value;if(previousTarget==='append')$('#import-target').value='new';}
  splitDraft=pages;splitIndex=0;drawSplit();
}
$('#split-toggle').onclick=run(()=>splitDraft?window.resetSplit():rebuildSplit());
$('#split-rebuild').onclick=run(rebuildSplit);
$('#split-text').oninput=()=>{splitDraft[splitIndex]=$('#split-text').value;};
$('#split-prev').onclick=()=>{if(splitIndex>0){splitIndex--;drawSplit();}};
$('#split-next').onclick=()=>{if(splitIndex<splitDraft.length-1){splitIndex++;drawSplit();}};
$('#split-at-caret').onclick=run(()=>{
  const field=$('#split-text'),text=field.value,pos=field.selectionStart;
  if(!text.slice(0,pos).trim()||!text.slice(pos).trim())throw Error('请把光标放在内容中间');
  if(splitDraft.length>=100)throw Error('最多拆成 100 页');
  splitDraft.splice(splitIndex,1,text.slice(0,pos),text.slice(pos));drawSplit();
});
$('#split-merge').onclick=()=>{if(splitIndex<splitDraft.length-1){splitDraft.splice(splitIndex,2,splitDraft[splitIndex]+splitDraft[splitIndex+1]);drawSplit();}};
const shortcutDefaults={toggle:'CommandOrControl+Shift+Space',new:'',search:''};
function displayShortcut(input,value){input.dataset.accelerator=value;input.value=value.replace('CommandOrControl','Ctrl').replace('Super','Win');}
function shortcutStatus(message){$('#shortcut-status').textContent=message;$('#shortcut-status').hidden=!message;}
window.loadShortcutSettings=()=>{
  const prefs={...shortcutDefaults,...state.settings.shortcuts};
  for(const action of Object.keys(shortcutDefaults))displayShortcut($('#shortcut-'+action),prefs[action]);
  shortcutStatus('');
};
for(const action of Object.keys(shortcutDefaults)){
  const input=$('#shortcut-'+action);
  input.onkeydown=e=>{
    if(e.key==='Tab')return;e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){displayShortcut(input,state.settings.shortcuts?.[action]??shortcutDefaults[action]);shortcutStatus('');return;}
    if(['Backspace','Delete'].includes(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){displayShortcut(input,'');shortcutStatus('');return;}
    if(['Control','Alt','Shift','Meta'].includes(e.key))return;
    const key=/^Key[A-Z]$/.test(e.code)?e.code.slice(3):/^Digit[0-9]$/.test(e.code)?e.code.slice(5):/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)?e.code:({Space:'Space',Enter:'Enter',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown'})[e.code];
    if(!key||(!e.ctrlKey&&!e.altKey&&!e.metaKey)){shortcutStatus('请按 Ctrl、Alt 或 Win 加一个按键');return;}
    displayShortcut(input,[e.ctrlKey?'CommandOrControl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Super':'',key].filter(Boolean).join('+'));shortcutStatus('');
  };
}
for(const b of document.querySelectorAll('[data-shortcut-clear]'))b.onclick=()=>{displayShortcut($('#shortcut-'+b.dataset.shortcutClear),'');shortcutStatus('');};
$('#shortcut-reset').onclick=()=>{for(const [action,key]of Object.entries(shortcutDefaults))displayShortcut($('#shortcut-'+action),key);shortcutStatus('点击保存后生效');};
$('#shortcut-save').onclick=async()=>{
  $('#shortcut-save').disabled=true;
  try{const shortcuts=Object.fromEntries(Object.keys(shortcutDefaults).map(action=>[action,$('#shortcut-'+action).dataset.accelerator||'']));state=await api('shortcuts',{shortcuts});window.loadShortcutSettings();shortcutStatus('已保存');}
  catch(err){shortcutStatus(err.message.replace(/^Error invoking remote method 'desk': Error: /,''));}
  finally{$('#shortcut-save').disabled=false;}
};
$('#fullscreen-avoid').onchange=async()=>{
  const field=$('#fullscreen-avoid');field.disabled=true;
  try{state=await api('desktop-preferences',{fullscreenAvoid:field.checked});toast('桌面设置已保存');}
  catch(err){field.checked=state.settings.fullscreenAvoid===true;toast(err.message);}
  finally{field.disabled=false;}
};

window.loadDesktopSettings=()=>{$('#paper-sound').checked=state.settings.sound===true;$('#sound-volume').value=Math.round((state.settings.volume??.35)*100);};
async function saveSound(){
  try{state=await api('desktop-preferences',{sound:$('#paper-sound').checked,volume:Number($('#sound-volume').value)/100});}
  catch(err){window.loadDesktopSettings();toast(err.message);}
}
$('#paper-sound').onchange=saveSound;$('#sound-volume').onchange=saveSound;
$('#sound-test').onclick=run(async()=>{await saveSound();if(state.settings.sound)await api('sound-preview');else toast('请先启用交互音效');});
