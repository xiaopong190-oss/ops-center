const {test}=require('node:test'),assert=require('node:assert/strict'),{openRuntime}=require('./runtime-test-helper.cjs');
const instant='2026-11-10T07:30:00Z';
test('full display shows all six audited providers and 7003 rows on an American clock',async()=>{
 const e=await openRuntime('compare','view',false,{instant,audience:'display',presentation:'public'}),{w,doc}=e;
 try{
 const counts=[['11.9聚美',648],['2026 聚美',1961],['T2US',1030],['V永达',2768],['恒祥',186],['天盛',410]],quotes=[];
 for(const [name,count] of counts){const c=w.Companies.ensure(name),r={...w.QuoteCore.normalize([name,'英国','海运','BHX1','10','CNY','kg',10,20,name==='天盛'?'2026-11-09':'2026-11-10','普货']),companyId:c.id};for(let i=0;i<count;i++)quotes.push({...r,terms:'起重档'+i})}
 const extras=['2026-11-06','2026-11-11'].map((date,i)=>{const c=w.Companies.ensure('排除'+i);return {...quotes[0],company:c.name,companyId:c.id,date}});
 let db={quotes:quotes.concat(extras),templates:[{country:'英国',warehouse:'BHX1'}],regionalQuotes:quotes.slice(0,1).map(r=>({...r,regionRaw:'BHX1'}))};db=w.WeeklyCarryover.choose(db,'2026-11-09','skip');
 w.ComparisonStore.commit(db);await w.LocalQuoteStore.flush();await e.wait(()=>doc.querySelector('#provider').options.length===7);
 const before=JSON.stringify(w.ComparisonStore.read()),options=[...doc.querySelector('#provider').options].slice(1).map(o=>o.textContent).sort();
 assert.deepEqual(options,counts.map(x=>x[0]).sort());assert.match(doc.querySelector('#n001Page').textContent,/7003/);assert.match(doc.querySelector('#weekWarning').textContent,/北京时间/);
 await e.wait(()=>doc.querySelectorAll('#regional-query-panel tbody tr').length===1);
 const provider=doc.querySelector('#provider');provider.value=w.Companies.find('恒祥').id;provider.dispatchEvent(new w.Event('change',{bubbles:true}));
 await e.wait(()=>/186/.test(doc.querySelector('#n001Page').textContent));assert.equal(provider.options.length,7,'choosing one provider does not erase others');
 doc.querySelector('#n001Reset').click();await e.wait(()=>/7003/.test(doc.querySelector('#n001Page').textContent));
 assert.equal(JSON.stringify(w.ComparisonStore.read()),before);assert.equal(e.errors.length,0);
 }finally{e.close()}
});
