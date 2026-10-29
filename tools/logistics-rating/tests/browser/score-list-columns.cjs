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

test('column popup resets centering and stays inside a scrolled embedded viewport, including grouped filters',()=>{
 const {fitColumnDialog,bindScoreListColumns}=require('../../extensions/score-list-columns.js');
 const dom=new JSDOM('<div id="comparison"><button data-sort-col="1">渠道</button></div><dialog id="columnDialog"></dialog>'),doc=dom.window.document,dialog=doc.querySelector('dialog');
 try{const view={innerWidth:1400,innerHeight:6000,frameElement:{getBoundingClientRect:()=>({top:-1200,left:-200})},parent:{innerHeight:800,innerWidth:390}};
 fitColumnDialog(dialog,view);const top=parseFloat(dialog.style.top),left=parseFloat(dialog.style.left),width=parseFloat(dialog.style.width),height=parseFloat(dialog.style.maxHeight);
 assert(top-1200>=80);assert(left-200>=16);assert(left-200+width<=374);assert(top-1200+height<=784);assert.equal(dialog.style.margin,'0px');assert.equal(dialog.style.transform,'none');assert.equal(dialog.style.overflow,'auto');
 bindScoreListColumns(doc);dialog.open=true;doc.querySelector('button').click();assert.equal(dialog.style.position,'fixed');assert.equal(dialog.style.getPropertyPriority('left'),'important');
 }finally{dom.window.close()}
});
