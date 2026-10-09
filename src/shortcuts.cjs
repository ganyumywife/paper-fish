const defaults={toggle:'CommandOrControl+Shift+Space',new:'',search:''};
const labels={toggle:'显示 / 隐藏',new:'新建便签',search:'查找便签'};
function normalize(value){
  if(value==='')return '';
  if(typeof value!=='string'||value.length>100)throw Error('快捷键格式无效');
  const parts=value.split('+'),key=parts.pop();
  const aliases={ctrl:'CommandOrControl',control:'CommandOrControl',commandorcontrol:'CommandOrControl',cmdorctrl:'CommandOrControl',alt:'Alt',shift:'Shift',super:'Super',meta:'Super'};
  const mods=parts.map(x=>aliases[x.toLowerCase()]);
  if(mods.some(x=>!x)||new Set(mods).size!==mods.length||!mods.some(x=>['CommandOrControl','Alt','Super'].includes(x)))throw Error('快捷键需包含 Ctrl、Alt 或 Win');
  const k=key?.toLowerCase(),named={space:'Space',enter:'Enter',tab:'Tab',up:'Up',down:'Down',left:'Left',right:'Right',home:'Home',end:'End',pageup:'PageUp',pagedown:'PageDown'};
  const normalized=named[k]||(/^[a-z0-9]$/i.test(key)?key.toUpperCase():/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)?key.toUpperCase():null);
  if(!normalized)throw Error('不支持此按键，请使用字母、数字、方向键或功能键');
  return [...['CommandOrControl','Alt','Shift','Super'].filter(x=>mods.includes(x)),normalized].join('+');
}
function settings(value=defaults){
  const out={};for(const action of Object.keys(defaults))out[action]=normalize(value[action]??defaults[action]);
  const used=new Set();for(const [action,key]of Object.entries(out)){if(key&&used.has(key))throw Error(labels[action]+'与其他快捷键重复');if(key)used.add(key);}return out;
}
function createManager(registry,callbacks){
  let active={};
  function restore(previous){for(const [action,key]of Object.entries(previous))if(key&&!registry.register(key,callbacks[action]))throw Error('原快捷键恢复失败：'+labels[action]);active={...previous};}
  return {
    current:()=>({...active}),
    apply(value,persist=()=>{}){
      const next=settings(value),previous={...active};
      if(JSON.stringify(next)===JSON.stringify(previous)){persist(next);return next;}
      for(const key of Object.values(previous))if(key)registry.unregister(key);
      const added=[];
      try{
        for(const [action,key]of Object.entries(next))if(key){if(!registry.register(key,callbacks[action]))throw Error(labels[action]+'快捷键已被占用，请换一个组合');added.push(key);}
        persist(next);active={...next};return next;
      }catch(err){for(const key of added)registry.unregister(key);restore(previous);throw err;}
    }
  };
}
module.exports={defaults,labels,normalize,settings,createManager};
