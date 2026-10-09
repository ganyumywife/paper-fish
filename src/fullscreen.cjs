const {spawn}=require('node:child_process'),path=require('node:path');
function createWatcher({onSample,onError,ownerPid=process.pid}){
  let child=null,buffer='',stopped=true,last='',count=0;
  return {
    start(){
      if(child||process.platform!=='win32')return;
      stopped=false;buffer='';last='';count=0;
      child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fullscreen-watch.ps1'),'-OwnerPid',String(ownerPid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      const processHandle=child;
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
        if(stopped||child!==processHandle)return;
        buffer+=chunk;if(buffer.length>16384){buffer='';return;}
        let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);try{const sample=JSON.parse(line);if(typeof sample.fullscreen!=='boolean')continue;const key=JSON.stringify([sample.fullscreen,sample.pid,sample.handle,sample.x,sample.y,sample.width,sample.height]);count=key===last?count+1:1;last=key;if(count>=2)onSample(sample);}catch{}}
      });
      let failure=false;
      const fail=()=>{if(!stopped&&child===processHandle&&!failure){failure=true;onSample({fullscreen:false});onError('全屏检测不可用，可在设置中关闭后重新开启');}};
      child.on('error',fail);child.stderr.on('data',()=>{});
      child.on('exit',()=>{fail();if(child===processHandle)child=null;});
    },
    stop(){stopped=true;const old=child;child=null;old?.kill();onSample({fullscreen:false});}
  };
}
module.exports={createWatcher};
