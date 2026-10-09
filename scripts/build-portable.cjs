const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const output=path.join(root,'dist',`PaperDesk-${pkg.version}-win32-x64`);
if(!output.startsWith(root+path.sep+'dist'+path.sep))throw Error('打包路径超出项目目录');
if(!fs.existsSync(path.join(root,'node_modules/electron/dist/electron.exe')))throw Error('缺少 Electron 运行时，请先安装依赖');
fs.mkdirSync(path.join(root,'assets'),{recursive:true});
const size=32,raw=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4;
  let rgba=[0,0,0,0];
  if(x>=4&&x<=27&&y>=3&&y<=29)rgba=[243,231,189,255];
  if(x>=4&&x<=27&&y>=3&&y<=9)rgba=[92,113,78,255];
  if(x>=9&&x<=22&&[14,15,19,20,24].includes(y))rgba=[115,105,78,255];
  rgba.forEach((v,k)=>raw[i+k]=v);
}
const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
function chunk(type,data){const b=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(b));return Buffer.concat([len,b,sum]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
fs.writeFileSync(path.join(root,'assets','tray.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
fs.mkdirSync(output,{recursive:true});
function copyTree(source,target){fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source,{withFileTypes:true})){const from=path.join(source,entry.name),to=path.join(target,entry.name);if(entry.isSymbolicLink())throw Error('打包源包含不支持的符号链接');if(entry.isDirectory())copyTree(from,to);else fs.copyFileSync(from,to);}}
copyTree(path.join(root,'node_modules/electron/dist'),output);
const app=path.join(output,'resources','app');fs.mkdirSync(app,{recursive:true});
for(const dir of ['src','assets'])copyTree(path.join(root,dir),path.join(app,dir));
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,main:pkg.main},null,2));
fs.copyFileSync(path.join(root,'使用说明.md'),path.join(output,'使用说明.md'));
fs.renameSync(path.join(output,'electron.exe'),path.join(output,'PaperDesk.exe'));
console.log(output);
