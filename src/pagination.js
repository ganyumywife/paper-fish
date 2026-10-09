(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Pagination=api;})(globalThis,()=>{
  function split(text,limit=320){
    if(typeof text!=='string')throw Error('拆页内容无效');
    if(!Number.isInteger(limit)||limit<80||limit>2000)throw Error('每页字数应为 80–2000');
    const chars=Array.from(text),pages=[];let start=0;
    while(start<chars.length){
      let end=Math.min(start+limit,chars.length);
      if(end<chars.length){
        // Prefer paragraphs, then complete lines. Keep every original character.
        const floor=start+Math.floor(limit/3);let paragraph=-1,line=-1;
        for(let i=floor;i<end;i++)if(chars[i]==='\n'){line=i+1;if(chars[i-1]==='\n')paragraph=i+1;}
        end=paragraph>floor?paragraph:line>floor?line:end;
        if(chars[end-1]==='\r'&&chars[end]==='\n')end--;
      }
      const chunk=chars.slice(start,end).join('');
      if(!chunk.trim()&&pages.length)pages[pages.length-1]+=chunk;else pages.push(chunk);
      start=end;
    }
    // Attach whitespace-only leading slices to the following content.
    while(pages.length>1&&!pages[0].trim())pages.splice(0,2,pages[0]+pages[1]);
    return pages;
  }
  return {split};
});
