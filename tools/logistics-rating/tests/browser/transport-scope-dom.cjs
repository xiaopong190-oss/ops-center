const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
const base=path.resolve(__dirname,'../..');
test('real transport controls: exhaustive exclusions/scopes, reset, score invalidation, paging and read-only storage',()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test/n001.html',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 try{
  const modes=['海运','空运','卡航','铁路'],rows=modes.concat('渠道代码').map((channel,id)=>({id,channel}));let visible=[],renders=0;
  w.localStorage.setItem('business-sentinel',JSON.stringify(rows));const snapshot=w.localStorage.getItem('business-sentinel');
  w.ComparisonStore={render(){renders++;visible=w.N001UI.rows(rows);w.N001UI.paint(rows);}};
  for(const f of ['extensions/transport-exclusion.js','n001.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  const N=w.N001UI,buttons=[...w.document.querySelectorAll('[data-transport]')];assert.equal(buttons.length,4);
  for(let mask=0;mask<16;mask++){
   $('n001Reset').click();for(let i=0;i<4;i++)if(mask&(1<<i))buttons[i].click();
   for(const scope of ['inside','unknown','outside','all']){
    N.confirmed=true;N.page=9;$('n001Scope').value=scope;$('n001Scope').dispatchEvent(new w.Event('change'));
    assert.equal(N.confirmed,false);assert.equal(N.page,0);
    const excluded=rows.filter((r,i)=>i<4&&(mask&(1<<i))).map(r=>r.id),expected=scope==='all'?[0,1,2,3,4]:scope==='unknown'?[4]:scope==='outside'?excluded:[0,1,2,3,4].filter(i=>!excluded.includes(i));
    assert.deepEqual(Array.from(visible,r=>r.id),expected,`${mask}/${scope}`);
    assert.equal($('n001Counts').textContent.includes('范围外 '+excluded.length),true);
   }
  }
  for(const id of ['provider','region','country','channel','warehouse']){$(id).innerHTML='<option value="x">测试</option>';$(id).value='x';}
  $('n001Reset').click();assert.equal($('n001Scope').value,'inside');for(const id of ['provider','region','country','channel','warehouse'])assert.equal($(id).value,'');
  assert(buttons.every(b=>b.textContent.endsWith('不限')));assert.equal(Object.keys(N.states).length,0);
  $('n001Compare').click();assert.equal(N.confirmed,false);assert.match($('n001Status').textContent,/请先选择仓库/);
  for(const id of ['country','warehouse']){$(id).innerHTML='<option value="x">测试</option>';$(id).value='x';}
  $('n001Compare').click();assert.equal(N.confirmed,true);buttons[0].click();assert.equal(N.confirmed,false);
  N.page=999;N.pagination(0);assert.equal(N.page,0);assert.equal($('n001Next').disabled,true);N.pagination(201);assert.equal($('n001Next').disabled,false);
  $('n001Next').click();N.pagination(201);assert.equal(N.page,1);assert.equal($('n001Next').disabled,true);
  buttons[0].dataset.state='include';buttons[0].click();assert.equal(buttons[0].dataset.state,'exclude');assert(!buttons.some(b=>b.textContent.includes('纳入')));
  N.paint([{channel:'<img src=x onerror="window.pwned=1">'}]);assert.equal(w.pwned,undefined);assert.equal($('n001Counts').querySelectorAll('img,script').length,0);
  assert.equal(w.localStorage.length,1);assert.equal(w.localStorage.getItem('business-sentinel'),snapshot);assert(renders>64);
 }finally{w.close();}
});
