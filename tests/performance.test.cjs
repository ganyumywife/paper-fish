const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../src/persistence.cjs'),Sync=require('../src/state-sync.js');
function memoryIO(){
  const files=new Map(),operations=[];let fail;
  return {files,operations,set fail(value){fail=value;},
    async writeFile(file,text){operations.push(['write',file,text]);await new Promise(resolve=>setImmediate(resolve));if(fail==='write'){fail=null;throw Error('write failure');}files.set(file,text);},
    async copyFile(from,to){operations.push(['copy',from,to]);if(!files.has(from))throw Object.assign(Error('missing'),{code:'ENOENT'});if(fail==='copy'){fail=null;throw Error('copy failure');}files.set(to,files.get(from));},
    async rename(from,to){operations.push(['rename',from,to]);if(fail==='rename'){fail=null;throw Error('rename failure');}files.set(to,files.get(from));files.delete(from);}
  };
}
test('queued saves capture each snapshot, keep order and retain the previous backup',async()=>{
  const io=memoryIO(),store=createStore('notes',{io}),s={text:'first'};
  const first=store.write(s);s.text='second';const second=store.write(s);s.text='unsubmitted';
  await Promise.all([first,second]);await store.flush();
  assert.equal(JSON.parse(io.files.get('notes')).text,'second');assert.equal(JSON.parse(io.files.get('notes.bak')).text,'first');
  assert.deepEqual(io.operations.map(op=>op[0]),['write','copy','rename','write','copy','rename']);
  const count=io.operations.length;await store.write({text:'second'});assert.equal(io.operations.length,count);
});
for(const stage of ['write','copy','rename'])test(`a ${stage} failure preserves the saved file and allows the next save`,async()=>{
  const io=memoryIO(),store=createStore('notes',{io});await store.write({text:'saved'});io.fail=stage;
  await assert.rejects(store.write({text:'failed'}),/failure/);assert.equal(JSON.parse(io.files.get('notes')).text,'saved');
  await store.write({text:'recovered'});await store.flush();assert.equal(JSON.parse(io.files.get('notes')).text,'recovered');assert.equal(JSON.parse(io.files.get('notes.bak')).text,'saved');
});
test('incremental synchronization round trips edits, insertions, removals and reorder without replacing unrelated pages',()=>{
  const a={id:'a',text:'A'},b={id:'b',text:'B'},settings={motion:true},windows={book:{x:1}},channel=Sync.channel();
  let state=Sync.apply(undefined,channel.next({pages:[a,b],settings,windows}));assert.equal(channel.next(state),null);
  const changed={...b,text:'edited'},delta=channel.next({pages:[a,changed],settings,windows});
  assert.deepEqual(delta,{delta:true,pages:[changed],removed:[]});state=Sync.apply(state,delta);assert.equal(state.pages[0],a);
  const c={id:'c',text:'C'},next={pages:[c,changed],settings:{motion:false},windows:{book:{x:2}}};
  const update=channel.next(next);assert.deepEqual(update.removed,['a']);assert.deepEqual(update.order,['c','b']);assert.deepEqual(Sync.apply(state,update),next);
});
test('scoped channels do not send updates for pages belonging to another window',()=>{
  const channel=Sync.channel(),own={id:'ball',text:'own'},scope={pages:[own],settings:{motion:true},windows:{}};
  channel.next(scope,new Map([[own.id,JSON.stringify(own)]]));assert.equal(channel.next(scope,new Map([[own.id,JSON.stringify(own)],['other','changed']])),null);
  assert.deepEqual(Sync.apply(undefined,{delta:true,pages:[own],removed:[]}).pages,[own]);
});
