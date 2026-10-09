(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RichText=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function normalize(runs,text='') {
    if(!Array.isArray(runs))return text?[{text}]:[];
    const out=[];
    for(const r of runs){if(!r||typeof r.text!=='string'||!r.text)continue;const n={text:r.text};if(typeof r.bold==='boolean')n.bold=r.bold;if(/^#[0-9a-f]{6}$/i.test(r.ink||''))n.ink=r.ink;if(Number.isFinite(r.size))n.size=Math.max(12,Math.min(40,r.size));const last=out[out.length-1];if(last&&last.bold===n.bold&&last.ink===n.ink&&last.size===n.size)last.text+=n.text;else out.push(n);}
    return out;
  }
  const text=runs=>runs.map(r=>r.text).join('');
  function slice(runs,start,end=Infinity){let offset=0;const out=[];for(const r of runs){const a=Math.max(0,start-offset),b=Math.min(r.text.length,end-offset);if(a<b)out.push({...r,text:r.text.slice(a,b)});offset+=r.text.length;}return normalize(out);}
  function replace(runs,start,end,insert){return normalize([...slice(runs,0,start),...insert,...slice(runs,end)]);}
  function format(runs,start,end,patch){return normalize([...slice(runs,0,start),...slice(runs,start,end).map(r=>({...r,...patch})),...slice(runs,end)]);}
  function render(element,runs){element.replaceChildren();for(const r of normalize(runs)){for(const piece of r.text.split(/([☐☑])/)){if(!piece)continue;const span=document.createElement('span');span.textContent=piece;if(r.bold!==undefined)span.style.fontWeight=r.bold?'700':'400';if(r.ink)span.style.color=r.ink;if(r.size)span.style.fontSize=r.size+'px';if(piece==='☐'||piece==='☑'){span.className='todo-check';span.contentEditable='false';span.setAttribute('role','checkbox');span.setAttribute('aria-checked',String(piece==='☑'));span.setAttribute('aria-label',piece==='☑'?'已完成待办':'未完成待办');span.tabIndex=element.isContentEditable?0:-1;if(!element.isContentEditable)span.setAttribute('aria-readonly','true');}element.append(span);}}}
  return {normalize,text,slice,replace,format,render};
});
