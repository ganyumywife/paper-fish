(function(root){
  function describe(p){const lines=[];if(Number.isFinite(p.created))lines.push('创建 '+new Date(p.created).toLocaleString('zh-CN'));if(Number.isFinite(p.tornAt))lines.push('撕下 '+new Date(p.tornAt).toLocaleString('zh-CN'));return lines.join(' · ');}
  if(typeof module==='object'&&module.exports)module.exports={describe};else root.PageInfo={describe};
})(globalThis);
