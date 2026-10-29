const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
const base=path.resolve(__dirname,'../..'),modes=['海运','空运','卡航','铁路','渠道代码'];
for(const view of ['grouped','score'])for(const patched of [false,true])test(`record identity/content survives repeated mode/scope transitions (${view}, ${patched?'patched UI':'deployed UI logic'})`,async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test/n001.html',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 try{
  class Clock extends w.Date{constructor(...args){super(...(args.length?args:['2026-10-26T12:00:00']));}}w.Date=Clock;
  w.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  for(const f of ['domain.js','comparison-core.js','channel-score.js','quote-core.js','companies.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  const rows=Array.from({length:205},(_,i)=>({id:'record-'+i,company:'测试物流',companyId:'test',country:'美国',warehouse:'ONT8',channel:modes[i%5],terms:'档='+i+'KG+',price:1000+i,currency:'CNY',unit:'kg',date:'2026-10-26',min:20,max:30}));
  w.localStorage.setItem('logistics-quotes-v1',JSON.stringify({quotes:rows,templates:[]}));
  for(const f of ['relation-core.js','extensions/transport-exclusion.js','extensions/transport-other.js','extensions/transport-linehaul.js','n001.js','extensions/score-filter.js','quotes.js',...(patched?['extensions/comparison-filter-reset.js']:[]),'n001-layout.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal($('scoreViewMode').value,'grouped','warehouse groups are the actual default');if(view==='score'){$('scoreViewMode').value='score';$('scoreViewMode').dispatchEvent(new w.Event('change'));}
  const storage=()=>JSON.stringify(Object.keys(w.localStorage).sort().map(k=>[k,w.localStorage.getItem(k)])),snapshot=storage(),memory=JSON.stringify(w.ComparisonStore.read());
  let csv='',checks=0;w.Blob=class{constructor(parts){this.parts=parts;}};w.URL.createObjectURL=blob=>{csv=blob.parts.join('');return 'blob:isolated';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  const buttons=[...w.document.querySelectorAll('[data-transport]')],states=[false,false,false,false];let scope='inside';
  const exported=()=>{$('exportQuotes').click();return Array.from(w.QuoteCore.parse(csv.replace(/^\uFEFF/,''))).slice(1).map(row=>Array.from(row).slice(0,11));};
  const baseline=exported(),canonical=new Map(baseline.map(row=>[row[10],JSON.stringify(row)]));assert.equal(canonical.size,205);
  async function verify(label){
   const expected=rows.filter((r,i)=>scope==='all'||scope==='unknown'&&i%5===4||scope==='outside'&&i%5<4&&states[i%5]||scope==='inside'&&(i%5===4||!states[i%5])).map(r=>r.terms).sort();
   const actual=exported();assert.deepEqual(actual.map(r=>r[10]).sort(),expected,label+' complete exported IDs');
   assert.equal(new Set(actual.map(r=>r[10])).size,actual.length,label+' no duplicates');
   for(const row of actual)assert.equal(JSON.stringify(row),canonical.get(row[10]),label+' content unchanged');
   // Inspect every actual rendered page, not only the first 200 rows or counter.
   w.N001UI.page=0;w.ComparisonStore.render();let displayed=[];
   do{displayed.push(...Array.from($('comparison').querySelectorAll('tbody tr'),tr=>tr.children[view==='grouped'?2:5].textContent));if($('n001Next').disabled)break;$('n001Next').click();}while(true);
   assert.deepEqual(displayed.sort(),expected,label+' every displayed record');
   assert.equal(storage(),snapshot,label+' persistent data unchanged');assert.equal(JSON.stringify(w.ComparisonStore.read()),memory,label+' in-memory source unchanged');checks++;
   // Let DOM observer deliveries release removed grouped tables between states.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await verify('initial');
  for(let round=0;round<2;round++)for(let step=0;step<16;step++){
   // Gray-code masks change one transport at a time; every change is immediately checked.
   const mask=step^(step>>1);
   for(let i=0;i<4;i++)if(states[i]!==!!(mask&(1<<i))){buttons[i].click();states[i]=!states[i];await verify(`round ${round}, toggle ${modes[i]}`);}
   for(const value of ['unknown','outside','all','inside']){scope=value;$('n001Scope').value=value;$('n001Scope').dispatchEvent(new w.Event('change'));await verify(`round ${round}, mask ${mask}, scope ${value}`);}
  }
  $('n001Reset').click();states.fill(false);scope='inside';await verify('reset exact restoration');
  assert.deepEqual(exported(),baseline,'original full record sequence restored');
  console.log(`Verified ${checks} successive states, full exports, every page, record content, storage and source IDs (${patched?'patched':'deployed'})`);
 }finally{w.close();}
});
