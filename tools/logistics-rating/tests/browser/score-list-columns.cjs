const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
test('score list columns: real rendered headers filter, sort numerically, combine, reset and escape names',()=>{
 const dom=new JSDOM('<div id="comparison"></div>',{url:'https://isolated.test',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 try{
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const file of ['score-filter','score-list-columns'])w.eval(fs.readFileSync(path.resolve(__dirname,'../../extensions',file+'.js'),'utf8'));
 const rows=[{company:'甲',channelScore:9,price:1000},{company:'乙',channelScore:10,price:200},{company:'<img src=x onerror=alert(1)>',channelScore:null,price:3000}].map((r,i)=>({...r,country:'美国',warehouse:'ONT8',channel:'海运',terms:'档'+i,currency:'CNY',unit:'kg',min:i?null:10,max:i?null:20}));
 const before=JSON.stringify(rows),host=doc.getElementById('comparison');host.innerHTML=w.LogisticsScoreView.renderScoreList(rows,r=>r.company,[]);w.ScoreListColumns.bindScoreListColumns(doc);
 const open=col=>{host.querySelector('[data-score-column="'+col+'"]').click();return doc.querySelector('dialog');},click=(dialog,label)=>[...dialog.querySelectorAll('button')].find(b=>b.textContent===label).click();
 const visible=()=>[...host.querySelectorAll('tbody tr')].filter(r=>!r.hidden).map(r=>r.cells[3].textContent);
 assert.equal(host.querySelectorAll('[data-score-column]').length,8);
 let d=open(0);d.querySelector('select').value='desc';click(d,'应用');assert.deepEqual(visible(),['乙','甲','<img src=x onerror=alert(1)>']);
 d=open(6);d.querySelector('select').value='asc';click(d,'应用');assert.deepEqual(visible(),['乙','甲','<img src=x onerror=alert(1)>']);
 d=open(3);for(const label of d.querySelectorAll('label'))label.querySelector('input').checked=label.textContent==='甲';click(d,'应用');assert.deepEqual(visible(),['甲']);
 d=open(4);click(d,'全不选');click(d,'应用');assert.deepEqual(visible(),[]);
 d=open(4);click(d,'重置本列');assert.deepEqual(visible(),['甲']);
 d=open(3);click(d,'重置本列');assert.equal(visible().length,3);
 d=open(0);click(d,'取消');assert.equal(doc.querySelector('dialog'),null);
 assert.equal(doc.querySelectorAll('img,script').length,0);assert.equal(JSON.stringify(rows),before);assert.equal(w.localStorage.length,0);
 }finally{w.close();}
});

test('search is only an option-list aid; cancel, reopening, empty selections and all original rows remain recoverable',()=>{
 const dom=new JSDOM('<div id="comparison"></div>',{url:'https://isolated.test',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 try{w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};for(const f of ['score-filter','score-list-columns'])w.eval(fs.readFileSync(path.resolve(__dirname,'../../extensions',f+'.js'),'utf8'));
 const host=doc.querySelector('#comparison'),rows=Array.from({length:200},(_,i)=>({company:i%2?'甲':'乙',channelScore:i%11,country:'美国',warehouse:'ONT8',channel:'渠道'+i,terms:'100KG+',price:1000,currency:'CNY',unit:'kg',min:10,max:20}));host.innerHTML=w.LogisticsScoreView.renderScoreList(rows,r=>r.company,[]);w.ScoreListColumns.bindScoreListColumns(doc);w.ScoreListColumns.bindScoreListColumns(doc);
 const open=i=>{host.querySelector('[data-score-column="'+i+'"]').click();assert.equal(doc.querySelectorAll('dialog').length,1);return doc.querySelector('dialog')},click=(d,name)=>[...d.querySelectorAll('button')].find(b=>b.textContent===name).click(),visible=()=>[...host.querySelectorAll('tbody tr')].filter(r=>!r.hidden);
 let d=open(4),search=d.querySelector('input[type=search]');search.value='渠道199';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('label:not([hidden])').length,1);assert.match(d.querySelector('[role=status]').textContent,/已选 200/);click(d,'应用');assert.equal(visible().length,200);
 d=open(4);search=d.querySelector('input[type=search]');search.value='没有此渠道';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('.column-filter-empty').hidden,false);click(d,'取消');assert.equal(visible().length,200);
 d=open(3);click(d,'全不选');click(d,'取消');assert.equal(visible().length,200);d=open(3);assert([...d.querySelectorAll('input[type=checkbox]')].every(x=>x.checked));click(d,'全不选');click(d,'应用');assert.equal(visible().length,0);
 d=open(4);assert.equal(d.querySelectorAll('input[type=checkbox]').length,200);click(d,'取消');d=open(3);click(d,'重置本列');assert.equal(visible().length,200);assert.equal(JSON.stringify(rows).includes('渠道199'),true);assert.equal(w.localStorage.length,0);
 }finally{w.close()}
});

test('column popup resets centering and stays inside a scrolled embedded viewport, including grouped filters',()=>{
 const {fitColumnDialog,bindScoreListColumns}=require('../../extensions/score-list-columns.js');
 const dom=new JSDOM('<div id="comparison"><button data-sort-col="1">渠道</button></div><dialog id="columnDialog"></dialog>'),doc=dom.window.document,dialog=doc.querySelector('dialog');
 try{const view={innerWidth:1400,innerHeight:6000,frameElement:{getBoundingClientRect:()=>({top:-1200,left:-200})},parent:{innerHeight:800,innerWidth:390}};
 fitColumnDialog(dialog,view);const top=parseFloat(dialog.style.top),left=parseFloat(dialog.style.left),width=parseFloat(dialog.style.width),height=parseFloat(dialog.style.maxHeight);
 assert(top-1200>=80);assert(left-200>=16);assert(left-200+width<=374);assert(top-1200+height<=784);assert.equal(dialog.style.margin,'0px');assert.equal(dialog.style.transform,'none');assert.equal(dialog.style.overflow,'auto');
 bindScoreListColumns(doc);dialog.open=true;doc.querySelector('button').click();assert.equal(dialog.style.position,'fixed');assert.equal(dialog.style.getPropertyPriority('left'),'important');
 }finally{dom.window.close()}
});

test('persistent grouped dialog refreshes options and counts when reopening a different column',()=>{
 const {enhanceColumnDialog}=require('../../extensions/score-list-columns.js'),dom=new JSDOM('<dialog id="columnDialog"><div id="columnChoices"><label><input type="checkbox" checked>甲渠道</label></div></dialog>'),doc=dom.window.document,d=doc.querySelector('dialog');
 try{enhanceColumnDialog(d);const search=d.querySelector('input[type=search]');search.value='不存在';search.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('label').hidden,true);doc.querySelector('#columnChoices').innerHTML='<label><input type="checkbox" checked>美国</label><label><input type="checkbox">英国</label>';enhanceColumnDialog(d);assert.equal(search.value,'');assert.equal(d.querySelectorAll('input[type=search]').length,1);assert.match(d.querySelector('.column-filter-count').textContent,/当前页 2.*已选 1/);assert([...d.querySelectorAll('label')].every(x=>!x.hidden))}finally{dom.window.close()}
});
