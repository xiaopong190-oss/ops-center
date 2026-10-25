const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{env}=require('./harness.cjs');
const KEY='logistics-completed-ratings-v1',COMPANY='logistics-company-directory-v1';
const day=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const row=(id,patch={})=>({id,companyId:'c1',company:'测试公司',operator:'运营',shipment:'W'+id,channel:'美国 · 海运',shipped:day(),finished:day(),mode:'rated',price:8,time:8,coop:8,note:'费用及时效已核实',...patch});
function live(rows=[],initial={}){
 const e=env({[COMPANY]:JSON.stringify([{id:'c1',name:'测试公司',aliases:[],imported:true}]),[KEY]:JSON.stringify(rows),...initial});
 const original=e.context.document.getElementById;e.context.document.getElementById=id=>{const el=original(id);el.style??={};el.appendChild??=()=>{};el.closest??=()=>e.el('formSection');el.showModal??=()=>{el.open=true;};el.close??=()=>{el.open=false;};return el;};
 e.el('cr-status').value='all';e.queued=0;e.context.CloudBackup={queue(){e.queued++;}};
 e.run('extensions/cooperation-rating-view.js');e.run('extensions/cooperation-rating-live.js');e.run('ratings.js');return e;
}
function edit(e,id){e.el('cr-records').onclick({target:{closest:()=>({dataset:{record:id}})}});}
function submit(e){e.el('form').onsubmit({preventDefault(){}});}
test('existing real snapshot renders without fixture injection or changes; filters keep company mean',()=>{
 const rows=[row('1'),row('2',{price:10,time:10,coop:10}),row('3',{mode:'pending'})],raw=JSON.stringify(rows),e=live(rows);
 assert.equal(e.el('cr-score').textContent,'90.0');assert.equal(e.el('cr-coverageNote').textContent,'已评价 2 票 · 待评价 1 票 · 共 3 票');assert.equal(e.map[KEY],raw);assert.equal(e.queued,0);assert.equal(e.el('ratingLegacy').hidden,true);
 e.el('cr-status').value='pending';e.el('cr-status').onchange();assert.equal(e.el('cr-historyCount').textContent,'1 次合作');assert.equal(e.el('cr-score').textContent,'90.0');assert.equal(e.map[KEY],raw);
});
test('UI edits beyond original 200 rows through original writer, refresh and duplicate submission do not add tickets',()=>{
 const rows=Array.from({length:205},(_,i)=>row(String(i),{mode:'pending'})),e=live(rows);edit(e,'204');assert.equal(e.el('editId').value,'204');assert.equal(e.el('cooperationEditor').open,true);
 for(const id of ['price','time','coop'])e.el(id).value='9';e.el('note').value='已核实本票履约';submit(e);
 const saved=JSON.parse(e.map[KEY]);assert.equal(saved.length,205);assert.equal(saved.find(r=>r.id==='204').price,9);assert.equal(e.el('cr-score').textContent,'90.0');assert.equal(e.queued,1);
 submit(e);assert.equal(JSON.parse(e.map[KEY]).length,205);assert.match(e.el('message').textContent,/同一单号/);
 const fresh=live(saved);assert.equal(fresh.el('cr-score').textContent,'90.0');assert.equal(fresh.el('cr-coverageNote').textContent,'已评价 1 票 · 待评价 204 票 · 共 205 票');
});
test('save failure retains snapshot; retry uses same record and queues existing cloud sync once',()=>{
 const e=live([row('1')]),before=e.map[KEY];edit(e,'1');e.el('price').value='10';e.setFail(true);submit(e);assert.equal(e.map[KEY],before);assert.equal(e.queued,0);assert.match(e.el('message').textContent,/Quota/);e.setFail(false);submit(e);assert.equal(JSON.parse(e.map[KEY]).length,1);assert.equal(e.el('cr-score').textContent,'86.0');assert.equal(e.queued,1);
});
test('cross-tab updates refresh live view, stale editor cannot overwrite newer snapshot',()=>{
 const e=live([row('1')]);e.map[KEY]=JSON.stringify([row('1',{price:10,time:10,coop:10})]);for(const fn of e.events.storage)fn({key:KEY});assert.equal(e.el('cr-score').textContent,'100.0');
 edit(e,'1');e.map[KEY]=JSON.stringify([row('1',{price:6,time:6,coop:6})]);for(const fn of e.events.storage)fn({key:KEY});assert.match(e.el('message').textContent,/当前编辑尚未保存/);submit(e);assert.equal(JSON.parse(e.map[KEY])[0].price,6);assert.equal(e.queued,0);
 e.el('cancel').onclick();for(const fn of e.events.storage)fn({key:KEY});assert.equal(e.el('cr-score').textContent,'60.0');
});
test('empty and corrupt data show explicit states and preserve storage; live entry excludes design writer',()=>{
 const empty=live();assert.equal(empty.el('cr-score').textContent,'—');assert.match(empty.el('cr-records').innerHTML,/没有符合/);
 const e=live([],{[KEY]:'broken'});assert.equal(e.map[KEY],'broken');assert.equal(e.el('cr-add').disabled,true);assert.equal(e.el('cr-lockNotice').hidden,false);assert.equal(e.el('save').disabled,true);
 const html=fs.readFileSync(path.join(__dirname,'../ratings.html'),'utf8'),scripts=JSON.parse(html.match(/<script id="appScripts" type="application\/json">(.*?)<\/script>/s)[1]);assert(!scripts.some(s=>s.includes('cooperation-rating-design.js')));assert(scripts.findIndex(s=>s.startsWith('github-data.js'))<scripts.findIndex(s=>s.startsWith('ratings.js')));assert(scripts.includes('extensions/cooperation-rating-live.js?v=0.2.7-beta.79'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
});
