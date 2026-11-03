import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mount,baseLink,settle} from './perf-test-harness.mjs';
import {validateTrackerControl} from '../src/tracker-input-validation.js';
const fixture={...baseLink,promo:{actions:[{date:'2026-11-03',text:'original',who:'A',status:'wait'}]},reviews:{plan:[{date:'2026-11-03',text:'original',status:'wait'}],bad:[{date:'2026-11-03',star:1,issue:'original',action:'',status:'open'}]}};
const ships=[{linkId:'test',no:'SYNTHETIC',qty:10,steps:[],checks:[{text:'test',done:false}],logs:[]}];
const report={inputs:[],forms:[],checks:0,failures:[]};
const get=(obj,path)=>path.split('.').reduce((value,key)=>value?.[key],obj);
async function check(name,fn){try{await fn();report.checks++;}catch(error){report.failures.push({name,error:error.stack});}}
const t=await mount({link:fixture,ships});
const event=(control)=>control.dispatchEvent(new t.window.Event('change',{bubbles:true}));
const view=async name=>{t.window.document.querySelector('nav [data-v="'+name+'"]').click();await settle();};
function descriptor(c){return c.dataset.f?['links/test',c.dataset.f]:c.dataset.sf?['ships/'+c.dataset.sf,c.dataset.sp]:c.dataset.pf?['perf/'+c.dataset.pf,c.dataset.field]:['links/test','content.frontUrl'];}
try{
for(const name of ['logistics','content','promo','reviews','perf']){
  await view(name);t.root().querySelector('[data-act="info"]')?.click();await settle();
  if(name==='logistics'){t.root().querySelector('[data-act="ship-sel"]')?.click();await settle();}
  const controls=[...t.root().querySelectorAll('[data-f],[data-sf],[data-pf],[data-front]')].map(c=>({id:c.id,selector:c.id?'#'+c.id:c.dataset.pf?'[data-pf="'+c.dataset.pf+'"][data-field="'+c.dataset.field+'"]':'[data-front]',path:descriptor(c),type:c.type}));
  for(const item of controls){
    const [doc,path]=item.path;if(report.inputs.some(row=>row.doc===doc&&row.path===path))continue;
    report.inputs.push({view:name,doc,path,type:item.type});
    await check('roundtrip '+doc+'/'+path,async()=>{
      let c=t.root().querySelector(item.selector);assert.ok(c,item.selector);
      let expected;
      if(c.tagName==='SELECT'){c.value=[...c.options].at(-1).value;expected=c.dataset.kind==='num'?Number(c.value):c.value;}
      else if(c.type==='checkbox'){c.checked=true;expected=true;}
      else if(c.type==='date'){c.value='2028-02-29';expected=c.value;}
      else if(c.type==='number'){c.value='12';if(path==='econ.trialUnits')c.value='200';if(path==='reviews.rating')c.value='4.5';expected=Number(c.value);}
      else {c.value=c.hasAttribute('data-front')?'https://www.amazon.com/dp/B000000001':'测试😀 <img src=x onerror="window.attacked=1">';expected=c.value;}
      event(c);await settle();await t.window.saveOpsFollowup();
      assert.deepEqual(get(t.snapshot.data.trackerV1.docs[doc],path),expected);
      assert.equal(t.window.attacked,undefined);assert.equal(t.root().querySelector('img[onerror]'),null);
      c=t.root().querySelector(item.selector);assert.ok(c,'control remains available');
      if(c.type==='number'&&!path.startsWith('econ.')){
        for(const bad of [-1,1e13,...(/qty|orders7d|count|target|vine|rar|dist|sessions|units|adOrders|returns/.test(path)?[.5]:[]),...(path==='reviews.rating'?[5.1]:[])]){
          const before=JSON.stringify(t.snapshot),writes=t.writes();c.value=String(bad);event(c);await settle();await t.window.saveOpsFollowup();
          assert.equal(JSON.stringify(t.snapshot),before,'invalid '+bad+' persisted');assert.equal(t.writes(),writes);assert.ok(c.validationMessage);
        }
      }
      if(['text','textarea','url'].includes(c.type)){
        const before=JSON.stringify(t.snapshot);c.value='x'.repeat(20001);event(c);await settle();await t.window.saveOpsFollowup();assert.equal(JSON.stringify(t.snapshot),before);
      }
      c=t.root().querySelector(item.selector);
      if(c.type==='number'&&!path.startsWith('econ.')){c.value='0';event(c);await settle();await t.window.saveOpsFollowup();assert.equal(get(t.snapshot.data.trackerV1.docs[doc],path),0);c=t.root().querySelector(item.selector);c.value='';event(c);await settle();await t.window.saveOpsFollowup();assert.equal(get(t.snapshot.data.trackerV1.docs[doc],path),null);}
      if(c.tagName==='SELECT')for(const option of [...c.options]){c=t.root().querySelector(item.selector);c.value=option.value;event(c);await settle();await t.window.saveOpsFollowup();assert.equal(get(t.snapshot.data.trackerV1.docs[doc],path),option.value);}
    });
  }
  // Every rendered form field is inventoried, including hidden-by-default editors.
  for(const form of t.root().querySelectorAll('form'))for(const c of form.querySelectorAll('input,select,textarea'))report.forms.push({view:name,form:form.dataset.form,list:form.dataset.list||'',name:c.name,type:c.type});
}
await check('forms: every list adds and persists',async()=>{
  for(const [name,list] of [['promo','promo.actions'],['reviews','reviews.plan'],['reviews','reviews.bad']]){
    await view(name);const form=t.root().querySelector('[data-list="'+list+'"][data-form="row"]');
    for(const c of form.elements){if(c.tagName==='BUTTON')continue;if(c.type==='date')c.value='2026-11-03';else if(c.tagName!=='SELECT')c.value='测试😀 <script>window.attacked=1</script>';}
    form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await t.window.saveOpsFollowup();assert.equal(get(t.snapshot.data.trackerV1.docs['links/test'],list).length,2);
  }
});
await check('forms: whitespace required, inverted period, negative metric blocked',async()=>{
  await view('promo');let form=t.root().querySelector('[data-form="row"]');form.elements.namedItem('text').value='   ';
  let before=JSON.stringify(t.snapshot);form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await t.window.saveOpsFollowup();assert.equal(JSON.stringify(t.snapshot),before);
  await view('perf');for(const values of [{from:'2030-01-02',to:'2030-01-01'},{from:'2030-01-01',to:'2030-01-02',units:'-1'}]){
    form=t.root().querySelector('[data-form="perf"]');for(const [k,v] of Object.entries(values))form.elements.namedItem(k).value=v;
    before=JSON.stringify(t.snapshot);form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await t.window.saveOpsFollowup();assert.equal(JSON.stringify(t.snapshot),before);
  }
});
await check('validator: text limits, URL schemes, nonfinite, fraction, leap date',async()=>{
  for(const [attrs,value,valid] of [[{name:'text'},'x'.repeat(20000),true],[{name:'text'},'x'.repeat(20001),false],[{'data-front':''},'javascript:alert(1)',false],[{'data-front':''},'https://user:pass@example.com',false],[{'data-front':''},'https://www.amazon.com',true],[{'data-kind':'num','data-f':'reviews.count'},'Infinity',false],[{'data-kind':'num','data-f':'reviews.count'},'0.5',false],[{'data-kind':'num','data-f':'reviews.count'},'1000000000',true],[{'data-kind':'num','data-f':'reviews.count'},'1000000001',false]]){
    const c=t.window.document.createElement('input');for(const [k,v] of Object.entries(attrs))c.setAttribute(k,v);if(c.dataset.f)c.id='f-test-'+c.dataset.f.replace(/\./g,'-');c.value=value;assert.equal(!validateTrackerControl(c),valid,value.slice(0,80));
  }
});
const inventory=form=>{for(const c of form.querySelectorAll('input,select,textarea'))report.forms.push({form:form.dataset.form,list:form.dataset.list||'',name:c.name,type:c.type});};
const submit=async form=>{form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await t.window.saveOpsFollowup();};
const fill=form=>{inventory(form);for(const c of form.querySelectorAll('input,select,textarea')){if(c.tagName==='SELECT')c.value=[...c.options].at(-1).value;else c.value=c.type==='date'?'2031-01-01':c.type==='number'?'10':'表单😀 <svg onload="window.attacked=1">';}};
await check('all shipment creation and checklist/log form inputs persist',async()=>{
 await view('logistics');t.root().querySelector('[data-act="ship-add"]').click();await settle();let form=t.root().querySelector('[data-form="ship"]');fill(form);await submit(form);
 const entries=Object.entries(t.snapshot.data.trackerV1.docs).filter(([k])=>k.startsWith('ships/'));assert.equal(entries.length,2);const [key,ship]=entries.find(([k])=>k!=='ships/s0');assert.equal(ship.qty,10);assert.equal(ship.headFreight,10);assert.ok(ship.shipment.includes('😀'));assert.equal(ship.steps[0].date,'2031-01-01');
 if(!t.root().querySelector('[data-form="srow"][data-ship="'+key.slice(6)+'"]')){t.root().querySelector('button[data-act="ship-sel"][data-id="'+key.slice(6)+'"]').click();await settle();}
 for(const list of ['checks','logs']){form=t.root().querySelector('[data-form="srow"][data-list="'+list+'"]');fill(form);const old=ship[list].length;await submit(form);assert.equal(t.snapshot.data.trackerV1.docs[key][list].length,old+1);}
});
await check('review rejection input required and persisted',async()=>{
 await view('content');t.root().querySelector('[data-act="rv-rej"]').click();await settle();const form=t.root().querySelector('[data-form="rej"]');fill(form);await submit(form);const review=t.snapshot.data.trackerV1.docs['links/test'].content.review;assert.ok((review.mgr||review.gm).note.includes('😀'));
});
await check('valid period form fields persist',async()=>{
 await view('perf');const form=t.root().querySelector('[data-form="perf"]');fill(form);await submit(form);const row=Object.values(t.snapshot.data.trackerV1.docs).find(row=>row.from==='2031-01-01');assert.ok(row);for(const key of ['sessions','units','sales','adSpend','adSales','adOrders','returns'])assert.equal(row[key],10);
});
await check('all new-link form fields persist and escape script strings',async()=>{
 t.root().querySelector('[data-act="add-open"]').click();await settle();const form=t.root().querySelector('[data-form="add"]');fill(form);await submit(form);const link=Object.entries(t.snapshot.data.trackerV1.docs).find(([key,row])=>key.startsWith('links/')&&key!=='links/test');assert.ok(link);for(const field of ['sku','name','account','store','site','owner','issue'])assert.ok(link[1][field].includes('😀'));assert.equal(link[1].launchDate,'2031-01-01');assert.equal(t.window.attacked,undefined);assert.equal(t.root().querySelector('svg[onload]'),null);
});
await check('forged non-economics prototype path blocked before optimistic update',async()=>{
 await view('content');const c=t.root().querySelector('[data-f="content.note"]');c.dataset.f='content.__proto__.polluted';c.value='yes';const before=JSON.stringify(t.snapshot);event(c);await settle();await t.window.saveOpsFollowup();assert.equal(JSON.stringify(t.snapshot),before);assert.equal(t.window.Object.prototype.polluted,undefined);
});
await check('JSON file import: valid, duplicate, malformed and hostile paths',async()=>{
 const upload=async text=>{const input=t.root().querySelector('[data-import]');Object.defineProperty(input,'files',{configurable:true,value:[new t.window.File([text],'synthetic.json',{type:'application/json'})]});event(input);await new Promise(resolve=>setTimeout(resolve,100));await t.window.saveOpsFollowup();};
 const imported={'links/import-synthetic':{sku:'IMPORT😀',account:'test',store:'test',site:'US',owner:'Tester'}};
 await upload(JSON.stringify(imported));assert.equal(t.snapshot.data.trackerV1.docs['links/import-synthetic'].sku,'IMPORT😀');
 const count=Object.keys(t.snapshot.data.trackerV1.docs).length;await upload(JSON.stringify(imported));assert.equal(Object.keys(t.snapshot.data.trackerV1.docs).length,count);
 for(const invalid of ['{bad json',JSON.stringify({'../bad':{sku:'bad'}})]){const before=JSON.stringify(t.snapshot);await upload(invalid);assert.equal(JSON.stringify(t.snapshot),before);}
 const oversized=t.root().querySelector('[data-import]'),before=JSON.stringify(t.snapshot);Object.defineProperty(oversized,'files',{configurable:true,value:[{size:16*1024*1024+1}]});event(oversized);await settle();assert.equal(JSON.stringify(t.snapshot),before);assert.match(t.window.document.querySelector('#toast').textContent,/16MB/);
 report.forms.push({form:'import',name:'file',type:'file'});
});
await check('operator and site filters never upload and include all when reset',async()=>{
 const writes=t.writes();for(const key of ['owner','site']){
  let select=t.root().querySelector('[data-filter="'+key+'"]');select.value=select.options[1].value;event(select);await settle();select=t.root().querySelector('[data-filter="'+key+'"]');select.value='';event(select);await settle();report.forms.push({form:'filter',name:key,type:'select-one'});
 }assert.equal(t.writes(),writes);
});
await check('no UI exceptions',()=>assert.equal(t.errors.length,0,t.errors.join('\n')));
}finally{t.window.close();}
const readonly=await mount({link:fixture,ships,canEdit:false});
try{
for(const name of ['content','promo','reviews','perf','logistics']){
 readonly.window.document.querySelector('nav [data-v="'+name+'"]').click();await settle();
 await check('readonly forged change '+name,async()=>{const c=readonly.root().querySelector('[data-f],[data-pf],[data-front]');if(c){c.value=c.type==='number'?'1':'forged';c.dispatchEvent(new readonly.window.Event('change',{bubbles:true}));await settle();}assert.equal(readonly.writes(),0);});
}
assert.equal(readonly.errors.length,0,readonly.errors.join('\n'));
}finally{readonly.window.close();}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/followup-all-inputs.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({inputs:report.inputs.length,formFields:report.forms.length,checks:report.checks,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
