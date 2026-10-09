// Builds a fresh source-only copy. It never reads the app's user-data folder.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const files=['.gitignore','LICENSE','package.json','package-lock.json','README.md','使用说明.md','项目验收清单.md','性能与内存评估.md','桌面便签本项目需求说明.md','启动便签.cmd','assets/tray.png','scripts/build-portable.cjs','scripts/prepare-github.cjs'];
const textExtensions=new Set(['.cjs','.js','.json','.md','.html','.css','.ps1','.cmd']);
function collect(relative){
  const absolute=path.join(root,relative);
  for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
    const next=relative+'/'+entry.name;
    if(entry.isSymbolicLink())throw Error('Refusing symbolic link: '+next);
    if(entry.isDirectory())collect(next);
    else if(entry.isFile()){
      if(!textExtensions.has(path.extname(entry.name)))throw Error('Unexpected source file: '+next);
      files.push(next);
    }
  }
}
collect('src');collect('tests');
const detectors=[
  ['provider-token',/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/g],
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['literal-credential',/(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\s*[:=]\s*["']([^"'\n]{12,})["']/gi],
  ['bearer-literal',/Bearer\s+[A-Za-z0-9_.-]{20,}/gi],
  ['credential-url',/https?:\/\/[^\s/]+:[^\s/@]+@/g],
  ['personal-path',/[A-Za-z]:[\\/](?:Users[\\/]|developtools[\\/])/g]
];
const findings=[];
for(const relative of files){
  const absolute=path.join(root,relative),stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Not a regular source file: '+relative);
  if(relative!=='LICENSE'&&!textExtensions.has(path.extname(relative)))continue;
  const text=fs.readFileSync(absolute,'utf8');
  for(const [kind,pattern] of detectors){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern)){
      // Only this documented fake key is allowed, and only in the mock test.
      if(relative==='tests/desktop.e2e.cjs'&&match[1]==='local-test-key')continue;
      findings.push({file:relative,line:text.slice(0,match.index).split('\n').length,kind});
    }
  }
}
if(findings.length){
  // Report locations only; never emit potential secret values.
  process.stderr.write(JSON.stringify(findings,null,2)+'\n');
  throw Error('Potential sensitive content found; no upload copy created.');
}
const parent=path.join(root,'github-upload');
let output=path.join(parent,'paper-fish-v'+pkg.version);
if(fs.existsSync(output)){
  const stamp=new Date().toISOString().replace(/[-:.]/g,'');
  output+='-'+stamp;
}
if(!output.startsWith(parent+path.sep)||fs.existsSync(output))throw Error('Invalid or existing export destination');
fs.mkdirSync(output,{recursive:true});
for(const relative of files){
  const target=path.join(output,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(root,relative),target,fs.constants.COPYFILE_EXCL);
}
const readme=path.join(output,'README.md');
fs.writeFileSync(readme,fs.readFileSync(readme,'utf8').replace(
  /双击 `dist\/PaperDesk-[^`]+\/PaperDesk\.exe`。此便携目录包含运行时，无需 Node\.js；请保留完整目录。/,
  '源码仓库不包含 exe 和运行时。如作者已在仓库 Releases 发布 Windows x64 便携包，可下载、完整解压后运行 PaperDesk.exe。开发者可按下方步骤从源码运行或自行打包。'
));
const manifest=files.sort().map(relative=>{
  const content=fs.readFileSync(path.join(output,relative));
  return {file:relative,bytes:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')};
});
fs.writeFileSync(path.join(output,'SOURCE-MANIFEST.json'),JSON.stringify({version:pkg.version,files:manifest},null,2)+'\n');
const report={version:pkg.version,directory:path.relative(root,output),sourceFiles:manifest.length,totalBytes:manifest.reduce((n,f)=>n+f.bytes,0),findings,excluded:['user data','credentials','.env','.npmrc','node_modules','dist','test-results','video-promo','git history','other unlisted files'],license:pkg.license,remoteCreated:false,uploaded:false};
fs.writeFileSync(path.join(parent,'upload-check-'+path.basename(output)+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
