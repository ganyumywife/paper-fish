const fs=require('node:fs/promises');
function createStore(file,{io=fs,initial}={}){
  let tail=Promise.resolve(),last=initial;
  return {
    write(value){
      const text=typeof value==='string'?value:JSON.stringify(value,null,2);
      const result=tail.then(async()=>{
        if(text===last)return;
        const temp=file+'.tmp';await io.writeFile(temp,text,'utf8');
        try{await io.copyFile(file,file+'.bak');}catch(error){if(error.code!=='ENOENT')throw error;}
        await io.rename(temp,file);last=text;
      });
      tail=result.catch(()=>{});return result;
    },
    flush:()=>tail
  };
}
module.exports={createStore};
