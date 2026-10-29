const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
const base=path.resolve(__dirname,'../..');
test('full quotes render pipeline repeatedly recovers after excluding every available mode',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test/n001.html',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 try{
  class Clock extends w.Date{constructor(...args){super(...(args.length?args:['2026-10-26T12:00:00']));}}w.Date=Clock;
  w.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  for(const f of ['domain.js','comparison-core.js','channel-score.js','quote-core.js','companies.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  const rows=Array.from({length:4130},(_,i)=>({company:'测试物流',companyId:'test',country:'美国',warehouse:'ONT8',channel:i<3180?'海运':'铁路',terms:'档='+i+'KG+;'+(i%3===0?'带电':i%3===1?'带磁':'普货'),price:1000,currency:'CNY',unit:'kg',date:'2026-10-26',min:20,max:30}));
  w.localStorage.setItem('logistics-quotes-v1',JSON.stringify({quotes:rows,templates:[]}));
  for(const f of ['relation-core.js','extensions/transport-exclusion.js','n001.js','extensions/score-filter.js','quotes.js','extensions/comparison-filter-reset.js','extensions/cargo-filter.js','extensions/cargo-filter-ui.js','n001-layout.js','extensions/comparison-layout.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  await new Promise(resolve=>setTimeout(resolve,0));
  const snapshot=w.localStorage.getItem('logistics-quotes-v1'),buttons=[...w.document.querySelectorAll('[data-transport]')],button=mode=>buttons.find(b=>b.dataset.transport===mode);
  function total(expected){assert.match($('n001Page').textContent,new RegExp('共 '+expected+' 条'));assert.equal($('comparison').querySelectorAll('tbody tr').length,Math.min(expected,200));}
  function scope(value){$('n001Scope').value=value;$('n001Scope').dispatchEvent(new w.Event('change'));}
  total(4130);
  for(let attempt=0;attempt<5;attempt++){
   button('海运').click();total(950);button('铁路').click();total(0);
   scope('outside');total(4130);scope('all');total(4130);scope('unknown');total(0);scope('inside');total(0);
   button('海运').click();total(3180);button('铁路').click();total(4130);
   button('空运').click();total(4130);button('卡航').click();total(4130);
   $('n001Reset').click();total(4130);
  }
  $('scoreViewMode').value='score';$('scoreViewMode').dispatchEvent(new w.Event('change'));
  // Reproduce a hidden applied score filter: clearing its field without applying does not clear its state.
  $('scoreMin').value='6';$('scoreApply').click();total(0);
  $('scoreMin').value='';button('海运').click();button('海运').click();total(0);
  $('n001Reset').click();total(4130);assert.equal($('scoreMin').value,'');
  $('scoreClear').click();total(4130);
  $('scoreMin').value='6';$('scoreApply').click();total(0);
  $('scoreMin').value='';$('scoreMin').dispatchEvent(new w.Event('input'));total(4130);
  button('海运').click();total(950);button('海运').click();total(4130);
  const cargo=docCargo=>w.document.querySelector('#cargoFilter input[value="'+docCargo+'"]');
  cargo('带电').checked=true;cargo('带电').dispatchEvent(new w.Event('change',{bubbles:true}));total(1377);
  cargo('带磁').checked=true;cargo('带磁').dispatchEvent(new w.Event('change',{bubbles:true}));total(2754);
  $('n001Reset').click();total(4130);assert.equal(w.document.querySelectorAll('#cargoFilter input:checked').length,0);
  assert.equal(w.localStorage.getItem('logistics-quotes-v1'),snapshot);
 }finally{w.close();}
});

test('other exclusion filters real comparison rows and reset restores unclassified channels without writes',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test/n001.html',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 try{
  class Clock extends w.Date{constructor(...args){super(...(args.length?args:['2026-10-26T12:00:00']));}}w.Date=Clock;w.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  for(const f of ['domain.js','comparison-core.js','channel-score.js','quote-core.js','companies.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  const rows=['海运-卡派','空派-快递派','欧洲卡车运输','铁路-快递派','专线A'].map((channel,i)=>({company:'测试物流',companyId:'test',country:'美国',warehouse:'ONT8',channel,terms:'档='+i+'KG+;普货',price:1000,currency:'CNY',unit:'kg',date:'2026-10-26',min:5,max:10}));w.localStorage.setItem('logistics-quotes-v1',JSON.stringify({quotes:rows,templates:[]}));
  for(const f of ['relation-core.js','extensions/transport-exclusion.js','extensions/transport-other.js','extensions/transport-linehaul.js','n001.js','quotes.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  await new Promise(r=>setTimeout(r,0));const before=w.localStorage.getItem('logistics-quotes-v1'),buttons=[...w.document.querySelectorAll('[data-transport]')],button=mode=>buttons.find(b=>b.dataset.transport===mode),total=n=>assert.match($('n001Page').textContent,new RegExp('共 '+n+' 条'));
  total(5);button('其它').click();total(4);assert.equal(w.N001UI.transport(rows[4]),'待确认');assert(![...$('comparison').querySelectorAll('tbody tr')].some(r=>r.textContent.includes('专线A')));
  for(const mode of ['海运','卡航','铁路'])button(mode).click();total(1);assert.match($('comparison').textContent,/空派/);
  button('空运').click();total(0);$('n001Scope').value='outside';$('n001Scope').dispatchEvent(new w.Event('change'));total(5);
  $('n001Reset').click();total(5);assert.equal(button('其它').dataset.state,'neutral');assert.equal(w.localStorage.getItem('logistics-quotes-v1'),before);
 }finally{w.close()}
});
