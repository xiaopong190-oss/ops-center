const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto'),D=require('../domain.js'),Q=require('../quote-core.js');const keys=['logistics-company-directory-v1','logistics-quotes-v1','logistics-monthly-bills-v1','logistics-completed-ratings-v1'];
const empty=()=>({space:'real',storage:Object.fromEntries(keys.map((k,i)=>[k,i===0||i===3?[]:i===1?{quotes:[],templates:[]}:{rows:[],aliases:{}}]))});
function setup(initial=[],cloud=empty(),failed=false){let map=new Map(initial),calls=[];const w={LogisticsSpace:{isDemo:false}},ctx={window:w,Domain:D,QuoteCore:Q,localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},crypto:webcrypto,TextEncoder,Uint8Array,AbortSignal,Date,JSON,fetch:async(url,o)=>{calls.push({url,o});if(failed)throw Error('断网');return Response.json(o.method==='GET'?{sha:'a'.repeat(40),document:{data:cloud},writeConfigured:true}:{ok:true,sha:'b'.repeat(40),commitSha:'c'.repeat(40),savedAt:'2026-10-22T12:00:00Z'});}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../extensions/cloud-data-review.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../github-data.js'),'utf8'),ctx);return {w,map,calls,ctx};}
test('新浏览器从GitHub加载共享数据而非空本地库',async()=>{const cloud=empty();cloud.storage[keys[0]]=[{id:'c',name:'公开公司',aliases:[]}];const e=setup([],cloud);await e.w.GithubData.ready;assert.equal(JSON.parse(e.map.get(keys[0]))[0].name,'公开公司');assert.equal(e.w.GithubData.state().sha,'a'.repeat(40));});
test('已有未提交数据遇到不同GitHub数据时不静默覆盖',async()=>{const cloud=empty();cloud.storage[keys[0]]=[{id:'remote',name:'远端公司',aliases:[]}];const local=JSON.stringify([{id:'local',name:'本机公司',aliases:[]}]),e=setup([[keys[0],local]],cloud);await e.w.GithubData.ready;assert.equal(e.map.get(keys[0]),local);assert.equal(e.w.GithubData.state().conflict,true);await assert.rejects(()=>e.w.GithubData.save());});

test('保留冲突草稿不更新同步基线，连续刷新仍禁止覆盖云端',async()=>{
 const cloud=empty();cloud.storage[keys[0]]=[{id:'remote',name:'远端公司',aliases:[]}];
 const initial=[[keys[0],JSON.stringify([{id:'local',name:'本机公司',aliases:[]}])],['ops-cloud-session-v1','synthetic']];
 const first=setup(initial,cloud);await first.w.GithubData.ready;
 assert.equal(first.map.has('logistics-github-meta-v1'),false);
 const second=setup([...first.map],cloud);await second.w.GithubData.ready;
 assert.equal(second.w.GithubData.state().conflict,true);await assert.rejects(()=>second.w.GithubData.save());
 assert.equal(second.calls.length,1,'没有发出POST');
});

function quoteDocument(date){const d=empty();d.storage[keys[0]]=[{id:'a',name:'甲',aliases:[]}];d.storage[keys[1]]={quotes:[{company:'甲',companyId:'a',country:'美国',channel:'海运',warehouse:'ONT8',price:1000,currency:'CNY',unit:'kg',date,terms:'包税',min:null,max:null}],templates:[{country:'美国',warehouse:'ONT8'}]};return d;}
function currentDay(){const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');}
test('同步提示沿用本周截至今天口径，不把未来报价算作已恢复',()=>{
 const {reviewCloudQuotes}=require('../extensions/cloud-data-review.js'),local=quoteDocument('2026-10-25'),remote=quoteDocument('2026-10-27');
 assert.equal(reviewCloudQuotes(local,remote,Q.weekWindow('2026-10-26')).missingCurrent,false);
 remote.storage[keys[1]].quotes[0].date='2026-10-26';assert.equal(reviewCloudQuotes(local,remote,Q.weekWindow('2026-10-26')).missingCurrent,true);
});
test('截图场景：错误的相同SHA不能掩盖本周零报价，切换后云端恢复且草稿逐字保留',async()=>{
 const local=quoteDocument('2026-01-01'),cloud=quoteDocument(currentDay()),initial=keys.map(k=>[k,JSON.stringify(local.storage[k])]);
 initial.push(['logistics-github-meta-v1',JSON.stringify({sha:'a'.repeat(40)})],['logistics-github-pending-v1','1'],['ops-cloud-session-v1','synthetic']);
 const e=setup(initial,cloud);await e.w.GithubData.ready;
 assert.equal(e.w.GithubData.state().conflict,true);assert.match(e.w.GithubData.state().error,/云端本周 1 条/);
 assert.equal(e.map.get(keys[1]),JSON.stringify(local.storage[keys[1]]));await assert.rejects(()=>e.w.GithubData.save());
 const result=await e.w.GithubData.load(true);assert.equal(result.loaded,true);
 assert.equal(e.map.get('logistics-github-unsent-draft-v1'),JSON.stringify(local));
 assert.equal(e.map.get(keys[1]),JSON.stringify(cloud.storage[keys[1]]));assert.equal(e.map.has('logistics-github-pending-v1'),false);
 assert.ok(e.calls.every(c=>c.o.method==='GET'),'恢复过程没有上传业务数据');
});
test('暂存落盘失败不切换数据，也不改同步基线或待提交标记',async()=>{
 const local=quoteDocument('2026-01-01'),cloud=quoteDocument(currentDay()),e=setup(keys.map(k=>[k,JSON.stringify(local.storage[k])]),cloud);await e.w.GithubData.ready;
 e.w.LocalQuoteStore={flush:async()=>{throw Error('磁盘失败');}};
 const result=await e.w.GithubData.load(true);assert.equal(result.loaded,false);assert.match(result.error,/磁盘失败/);
 assert.equal(e.map.get(keys[1]),JSON.stringify(local.storage[keys[1]]));assert.equal(e.map.has('logistics-github-meta-v1'),false);assert.equal(e.map.get('logistics-github-pending-v1'),'1');
});
test('已有不同暂存草稿时禁止覆盖；相同草稿重试可恢复云端',async()=>{
 const local=quoteDocument('2026-01-01'),cloud=quoteDocument(currentDay()),e=setup([...keys.map(k=>[k,JSON.stringify(local.storage[k])]),['logistics-github-unsent-draft-v1','another draft']],cloud);await e.w.GithubData.ready;
 const blocked=await e.w.GithubData.load(true);assert.equal(blocked.loaded,false);assert.match(blocked.error,/另一份暂存草稿/);assert.equal(e.map.get('logistics-github-unsent-draft-v1'),'another draft');assert.equal(e.map.get(keys[1]),JSON.stringify(local.storage[keys[1]]));
 e.map.set('logistics-github-unsent-draft-v1',JSON.stringify(local));assert.equal((await e.w.GithubData.load(true)).loaded,true);
});
test('同一云端基线上的本周新增草稿保持可提交，不误判成旧缓存',async()=>{
 const local=quoteDocument(currentDay()),cloud=quoteDocument(currentDay());local.storage[keys[1]].quotes[0].price=1200;
 const e=setup([...keys.map(k=>[k,JSON.stringify(local.storage[k])]),['logistics-github-meta-v1',JSON.stringify({sha:'a'.repeat(40)})],['logistics-github-pending-v1','1'],['ops-cloud-session-v1','synthetic']],cloud);await e.w.GithubData.ready;
 assert.equal(e.w.GithubData.state().conflict,false);await e.w.GithubData.save();assert.equal(JSON.parse(e.calls[1].o.body).data.storage[keys[1]].quotes[0].price,1200);
});
test('已同步且没有待提交内容的旧缓存正常自动加载云端本周报价',async()=>{
 const local=quoteDocument('2026-01-01'),cloud=quoteDocument(currentDay()),e=setup([...keys.map(k=>[k,JSON.stringify(local.storage[k])]),['logistics-github-meta-v1',JSON.stringify({sha:'z'.repeat(40)})]],cloud);await e.w.GithubData.ready;
 assert.equal(e.w.GithubData.state().conflict,false);assert.equal(e.map.get(keys[1]),JSON.stringify(cloud.storage[keys[1]]));assert.equal(e.map.has('logistics-github-pending-v1'),false);
});
test('提交使用加载时SHA，成功保存GitHub回执，加载失败不允许写入',async()=>{const e=setup([['ops-cloud-session-v1','synthetic']]);await e.w.GithubData.ready;e.w.GithubData.markPending();const r=await e.w.GithubData.save();assert.equal(r.commitSha,'c'.repeat(40));assert.equal(JSON.parse(e.calls[1].o.body).baseSha,'a'.repeat(40));assert.equal(e.map.has('logistics-github-pending-v1'),false);const f=setup([],empty(),true);await f.w.GithubData.ready;await assert.rejects(()=>f.w.GithubData.save(),/未取得GitHub最新版本/);});

test('所有页面先读取GitHub数据再初始化公司与业务模块',()=>{const base=path.join(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(base,'VERSION.json'))).version;for(const name of ['index.html','quotes.html','monthly.html','ratings.html']){const html=fs.readFileSync(path.join(base,name),'utf8'),list=JSON.parse(html.match(/<script id="appScripts" type="application\/json">(.*?)<\/script>/s)[1]),index=list.findIndex(s=>s.startsWith('github-data.js?'));assert.ok(index>=0);assert.ok(index<list.findIndex(s=>s.startsWith('companies.js?')));for(const src of list){assert.ok(fs.existsSync(path.join(base,src.split('?')[0])));if(!src.startsWith('vendor/'))assert.equal(new URLSearchParams(src.split('?')[1]).get('v'),version);}}});

test('大批报价无损压缩后直接提交，SHA版本及本机草稿完整保留',async()=>{const {gunzipSync}=require('node:zlib'),local=empty();local.storage[keys[0]]=[{id:'a',name:'甲',aliases:[]}];local.storage[keys[1]].quotes=[{company:'甲',companyId:'a',country:'美国',channel:'海卡',warehouse:'ONT8',price:1000,currency:'CNY',unit:'kg',date:'2026-10-24',terms:'包税',min:null,max:null,sourceNotes:[{value:'原始报价来源'.repeat(100000)}]}];const initial=keys.map(k=>[k,JSON.stringify(local.storage[k])]);initial.push(['ops-cloud-session-v1','synthetic']);const e=setup(initial);e.ctx.CompressionStream=CompressionStream;e.ctx.Blob=Blob;e.ctx.Response=Response;e.ctx.btoa=btoa;await e.w.GithubData.ready;e.w.GithubData.markPending();await e.w.GithubData.save();assert.equal(e.calls.length,2);const envelope=JSON.parse(e.calls[1].o.body);assert.equal(envelope.encoding,'logistics-gzip-v1');const bytes=gunzipSync(Buffer.from(envelope.content,'base64')),decoded=JSON.parse(bytes);assert.equal(envelope.bytes,bytes.length);assert.equal(envelope.sha256,require('node:crypto').createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(decoded.data,local);assert.equal(decoded.baseSha,'a'.repeat(40));assert.equal(e.map.get(keys[1]),JSON.stringify(local.storage[keys[1]]));assert.ok(Buffer.byteLength(e.calls[1].o.body)<700000);});
