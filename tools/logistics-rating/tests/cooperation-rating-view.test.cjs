const {test}=require('node:test'),assert=require('node:assert/strict'),V=require('../extensions/cooperation-rating-view.js'),D=require('../domain.js'),fs=require('node:fs'),vm=require('node:vm');
const row=(id,extra={})=>({id,companyId:'a',company:'甲',shipment:id,channel:'美国 · 海运',operator:'张',shipped:'2026-09-01',finished:'2026-10-01',mode:'rated',price:8,time:8,coop:8,note:'已核实',...extra});
test('one company multiple cooperations average every rated shipment once; pending excluded',()=>{
 const rows=[row('1',{price:10,time:10,coop:10}),row('2',{price:0,time:0,coop:0}),row('3',{mode:'pending'}),row('4',{finished:'2026-09-20',price:10,time:10,coop:10}),row('5',{companyId:'b',company:'乙'})],before=JSON.stringify(rows);
 const v=V.companyRatingView(rows,{month:'2026-10',companyId:'a'});assert.equal(v.selected.score,50);assert.equal(v.selected.completed,3);assert.equal(v.selected.rated,2);assert.equal(v.selected.pending,1);assert.equal(v.trend[0].score,100);assert.equal(v.trend[1].score,50);assert.equal(v.companies.length,2);assert.equal(JSON.stringify(rows),before);
});
test('channel, status, evidence search and paging do not change company average',()=>{
 const rows=Array.from({length:24},(_,i)=>row(String(i),{channel:i%2?'欧洲 · 空运':'美国 · 海运',mode:i===0?'pending':'rated'}));
 const full=V.companyRatingView(rows,{month:'2026-10',companyId:'a'}),filtered=V.companyRatingView(rows,{month:'2026-10',companyId:'a',channel:'欧洲 · 空运',status:'rated',query:'已核实',page:2});assert.equal(filtered.selected.score,full.selected.score);assert.equal(filtered.total,12);assert.equal(filtered.rows.length,4);assert.equal(filtered.pages,2);
 assert.equal(V.companyRatingView(rows,{month:'2026-10',companyId:'a',status:'pending'}).rows.length,1);
});
test('repeat save or edit replaces one ID, duplicate shipment rejected, input unchanged on failure',()=>{
 const rows=[row('1'),row('2')],before=JSON.stringify(rows),validate=next=>D.ratings(next,'2026-10-24');
 let next=V.simulateRatingSave(rows,row('1',{price:10,time:10,coop:10}),validate);assert.equal(next.length,2);assert.equal(V.summarize(next).score,90);next=V.simulateRatingSave(next,row('1',{price:10,time:10,coop:10}),validate);assert.equal(next.length,2);assert.equal(V.summarize(next).score,90);
 assert.throws(()=>V.simulateRatingSave(rows,row('3',{shipment:'1'}),validate),/重复/);assert.equal(JSON.stringify(rows),before);
});
test('empty samples, zero score, rounded grade and 10000 records pagination',()=>{
 assert.equal(V.summarize([]).score,null);assert.equal(V.summarize([row('p',{mode:'pending'})]).grade,'待评价');assert.equal(V.summarize([row('z',{price:0,time:0,coop:0})]).score,0);
 const rows=Array.from({length:10000},(_,i)=>row(String(i))),seen=[];for(let page=1;page<=50;page++)seen.push(...V.companyRatingView(rows,{month:'2026-10',companyId:'a',page,pageSize:200}).rows);assert.equal(new Set(seen.map(r=>r.id)).size,10000);
 const almost=Array.from({length:11},(_,i)=>row(String(i),{coop:i?8:7.5}));assert.equal(V.summarize(almost).score,79.9);assert.equal(V.summarize(almost).grade,'B');assert.throws(()=>V.companyRatingView([],{month:'2026-10',pageSize:0}));
});
test('design loads actual UI script, multiple-company fixture valid, no business storage access',()=>{
 const els={},el=id=>els[id]??={value:({month:'2026-10',status:'all'})[id]||'',innerHTML:'',textContent:'',disabled:false,style:{},reset(){},showModal(){this.open=true;},close(){this.open=false;}};
 const context={document:{getElementById:el},CooperationRatingView:V,Domain:D,Date,crypto:{randomUUID:()=> 'new'},setTimeout:()=>0,clearTimeout(){},localStorage:new Proxy({},{get(){throw Error('No business storage');}})};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../extensions/cooperation-rating-design.js'),'utf8'),context);
 assert.equal(el('score').textContent,'84.8');assert.equal(el('coverageNote').textContent,'已评价 5 票 · 待评价 1 票 · 共 6 票');assert.equal(el('records').innerHTML.match(/<tr>/g).length,6);
 el('status').value='pending';el('status').onchange();assert.equal(el('records').innerHTML.match(/<tr>/g).length,1);assert.equal(el('score').textContent,'84.8');
 el('companyList').onclick({target:{closest:()=>({dataset:{company:'yunsu'}})}});assert.equal(el('companyName').textContent,'云速供应链');assert.equal(el('score').textContent,'91.8');
 el('addSelected').onclick();assert.equal(el('editCompany').value,'yunsu');assert.equal(el('editor').open,true);
 el('records').onclick({target:{closest:()=>({dataset:{record:'yunsu-3'}})}});assert.equal(el('editMode').value,'rated');for(const id of ['price','time','coop'])el(id).value='10';el('note').value='本票费用、时效和配合均兑现';el('ratingForm').onsubmit({preventDefault(){}});assert.equal(el('formError').textContent,'');assert.equal(el('score').textContent,'94.5');assert.equal(el('coverageNote').textContent,'已评价 3 票 · 待评价 0 票 · 共 3 票');
 el('ratingForm').onsubmit({preventDefault(){}});assert.equal(el('score').textContent,'94.5');assert.equal(el('coverageNote').textContent,'已评价 3 票 · 待评价 0 票 · 共 3 票');
});
