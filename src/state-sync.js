(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StateSync=api;})(globalThis,()=>{
  function channel(){
    let prior,versions=new Map(),settings,windows;
    return {next(value,signatures){
      const order=value.pages.map(p=>p.id),nextVersions=new Map(),changed=[];
      for(const p of value.pages){const key=signatures?.get(p.id)??JSON.stringify(p);nextVersions.set(p.id,key);if(versions.get(p.id)!==key)changed.push(p);}
      const removed=[...versions.keys()].filter(id=>!nextVersions.has(id)),s=JSON.stringify(value.settings),w=JSON.stringify(value.windows),reorder=!prior||JSON.stringify(prior)!==JSON.stringify(order);
      const first=!prior,delta={delta:true,pages:changed,removed};
      if(reorder)delta.order=order;if(s!==settings)delta.settings=value.settings;if(w!==windows)delta.windows=value.windows;
      prior=order;versions=nextVersions;settings=s;windows=w;
      if(first)return value;
      return changed.length||removed.length||reorder||delta.settings||delta.windows?delta:null;
    }};
  }
  function apply(state,update){
    if(!update.delta)return update;
    const pages=new Map((state?.pages||[]).map(p=>[p.id,p]));for(const id of update.removed)pages.delete(id);for(const p of update.pages)pages.set(p.id,p);
    const order=update.order||(state?.pages||update.pages).map(p=>p.id);
    return {...state,pages:order.filter(id=>pages.has(id)).map(id=>pages.get(id)),...(update.settings?{settings:update.settings}:{}),...(update.windows?{windows:update.windows}:{})};
  }
  return {channel,apply};
});
