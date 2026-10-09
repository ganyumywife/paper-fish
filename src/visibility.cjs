// Keep user intent separate from temporary fullscreen suppression.
function createVisibility({displayOf,onPause=()=>{},onResume=()=>{}}){
  const entries=new Map();let blocked=null,refreshing=false,pending=false;
  function reconcile(w,e){
    if(w.isDestroyed()){entries.delete(w);return;}
    const suppress=blocked&&displayOf(w)===blocked.displayId&&!e.override&&e.wanted;
    if(suppress){if(!e.suppressed){e.suppressed=true;onPause(w);}if(w.isVisible())e.hide();}
    else if(e.suppressed){e.suppressed=false;if(e.wanted){e.inactive();onResume(w);}}
  }
  return {
    attach(w){
      const e={wanted:w.isVisible(),suppressed:false,override:false,show:w.show.bind(w),inactive:w.showInactive.bind(w),hide:w.hide.bind(w)};entries.set(w,e);
      w.show=(...args)=>{e.wanted=true;if(blocked&&displayOf(w)===blocked.displayId&&!w.autoShow)e.override=true;reconcile(w,e);if(!e.suppressed){e.show(...args);onResume(w);}};
      w.showInactive=(...args)=>{e.wanted=true;reconcile(w,e);if(!e.suppressed){e.inactive(...args);onResume(w);}};
      w.hide=(...args)=>{e.wanted=false;e.suppressed=false;e.override=false;onPause(w);e.hide(...args);};
      w.once?.('closed',()=>entries.delete(w));
    },
    set(next){
      if((blocked?.token??null)!==(next?.token??null))for(const e of entries.values())e.override=false;
      blocked=next;this.refresh();
    },
    refresh(){if(refreshing){pending=true;return;}refreshing=true;try{do{pending=false;for(const [w,e]of entries)reconcile(w,e);}while(pending);}finally{refreshing=false;}},
    wanted:w=>entries.get(w)?.wanted??w.isVisible(),
    blocked:()=>blocked,
    count:()=>[...entries.values()].filter(e=>e.suppressed).length
  };
}
module.exports={createVisibility};
