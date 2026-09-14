'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),vm=require('vm');
const {createRegistry}=require('../proxy/connections');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'xiyou-registry-')),protect=(mode,v)=>mode==='seal'?Buffer.from(v).toString('base64'):Buffer.from(v,'base64').toString();
const r=createRegistry({env:{MCP_ENDPOINT:'https://example.invalid/mcp?token=hidden',MCP_API_KEY:'secret'},folder,protect});
assert(!JSON.stringify(r.list()).includes('secret'));assert(!JSON.stringify(r.list()).includes('hidden'));
r.update({action:'save',connection:{provider:'xiyou',name:'B',endpoint:'https://b.invalid/mcp',key:'another'}});const b=r.list().find(c=>c.name==='B');r.update({action:'move',id:b.id,direction:'up'});assert.equal(r.list()[0].name,'B');r.update({action:'toggle',id:b.id});assert.equal(r.get(b.id),undefined);assert.throws(()=>r.update({action:'save',connection:{provider:'xiyou',name:'bad',endpoint:'http://bad.invalid'}}));
for(const f of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,f));fs.rmdirSync(folder);
let calls=[];class FakeClient{constructor(cfg){this.id=cfg.connectionId;this.schemas={lookup:{}};this.tools=[{name:'lookup'}];}async connect(){return {tools:this.tools};}async call(){calls.push(this.id);if(this.id==='a')throw Error('HTTP 429 Too Many Requests');return {data:{ok:true},ms:1};}}
const c={window:{Mcp:{McpClient:FakeClient}},fetch:async()=>({ok:true,json:async()=>({connections:[{id:'a',name:'A',provider:'xiyou',enabled:true},{id:'b',name:'B',provider:'xiyou',enabled:true}]})})};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pool.js'),'utf8'),c);
(async()=>{
  const p=new c.window.ConnectionPool.Pool({proxy:'http://localhost'},'xiyou');
  await p.connect();
  const out=await p.call('lookup',{});
  assert.equal(out.source.id,'b');
  assert.deepEqual(calls,['a','b']);
  let later=[];
  class FakeLate{
    constructor(cfg){this.id=cfg.connectionId;this.schemas={lookup:{}};this.tools=[{name:'lookup'}];}
    async connect(){return {tools:this.tools};}
    async call(){later.push(this.id);if(this.id!=='c')throw Error('HTTP 402 weekly credit limit exceeded');return {data:{ok:true},ms:1};}
  }
  let listed=[{id:'a',name:'A',provider:'xiyou',enabled:true},{id:'b',name:'B',provider:'xiyou',enabled:true}];
  const c2={window:{Mcp:{McpClient:FakeLate}},fetch:async()=>({ok:true,json:async()=>({connections:listed})})};
  vm.createContext(c2);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pool.js'),'utf8'),c2);
  const p2=new c2.window.ConnectionPool.Pool({proxy:'http://localhost'},'xiyou');
  await p2.connect();
  await assert.rejects(()=>p2.call('lookup',{}),/本组可用连接已耗尽/);
  listed=listed.concat([{id:'c',name:'C',provider:'xiyou',enabled:true}]);
  const recovered=await p2.call('lookup',{});
  assert.equal(recovered.source.id,'c');
  assert.deepEqual(later,['a','b','b','c']);
  console.log('PASS connection secrecy, ordering, HTTPS validation, quota failover and new backup pickup');
})().catch(e=>{console.error(e);process.exitCode=1;});
