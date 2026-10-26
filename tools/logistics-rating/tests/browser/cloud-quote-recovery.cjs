const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch{}
const Q=require('../../quote-core.js');
const base=path.resolve(__dirname,'../..'),keys=['logistics-company-directory-v1','logistics-quotes-v1','logistics-monthly-bills-v1','logistics-completed-ratings-v1'];
function documentWith(date,count){return {space:'real',storage:{[keys[0]]:[{id:'a',name:'测试物流',aliases:[]}],[keys[1]]:{quotes:Array.from({length:count},(_,i)=>({company:'测试物流',companyId:'a',country:'美国',channel:'海运',warehouse:'ONT8',price:1000+i*100,currency:'CNY',unit:'kg',date,terms:'档='+(100+i)+'KG+;包税;普货',min:15,max:22})),templates:[{country:'美国',warehouse:'ONT8'}]},[keys[2]]:{rows:[],aliases:{}},[keys[3]]:[]}};}
test('Chrome + IndexedDB: stale local draft is protected, explicit recovery restores cloud rows without POST',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const local=documentWith('2026-10-25',2),remote=documentWith('2026-10-26',3),page=await browser.newPage({viewport:{width:1280,height:1000}});let uploads=0;remote.storage[keys[1]]=Q.canonical(remote.storage[keys[1]]);
  await page.addInitScript(({local,keys})=>{
   class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-26T12:00:00']));}}window.Date=Clock;
   if(!sessionStorage.getItem('seeded')){for(const key of keys)localStorage.setItem(key,JSON.stringify(local.storage[key]));localStorage.setItem('logistics-github-pending-v1','1');localStorage.setItem('logistics-github-meta-v1',JSON.stringify({sha:'a'.repeat(40)}));sessionStorage.setItem('seeded','1');}
  },{local,keys});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.startsWith('/api/logistics-data')){if(request.method()!=='GET')uploads++;return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({sha:'a'.repeat(40),document:{data:remote},writeConfigured:true})});}
   if(url.hostname!=='recovery.test')return route.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'});
   const file=path.resolve(base,'.'+url.pathname.replace('/tools/logistics-rating',''));assert.ok(file.startsWith(base+path.sep));
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'not found'});
   return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/json',body:fs.readFileSync(file)});
  });
  await page.goto('https://recovery.test/tools/logistics-rating/n001.html');
  await page.getByRole('button',{name:'暂存本机草稿并加载云端报价',exact:true}).waitFor();
  await page.locator('.comparison-results').waitFor();
  assert.equal(await page.getByRole('button',{name:'提交/重试GitHub',exact:true}).isDisabled(),true);
  assert.match(await page.locator('body').innerText(),/云端本周 3 条/);
  const draft=await page.evaluate(()=>JSON.stringify(GithubData.snapshot()));
  assert.equal(await page.locator('#comparison tbody tr').count(),0);
  if(process.env.LAYOUT_SCREENSHOTS){fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,'recovery-before.png'),fullPage:true});}
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'暂存本机草稿并加载云端报价',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#comparison tbody tr').length===3);
  assert.equal(await page.evaluate(()=>localStorage.getItem('logistics-github-unsent-draft-v1')),draft);
  assert.equal(await page.evaluate(()=>GithubData.hasPending()),false);assert.equal(uploads,0);
  await page.getByRole('button',{name:'导出本机及暂存草稿',exact:true}).waitFor();
  if(process.env.LAYOUT_SCREENSHOTS)await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,'recovery-after.png'),fullPage:true});
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#comparison tbody tr').length===3);
  assert.equal(await page.evaluate(()=>localStorage.getItem('logistics-github-unsent-draft-v1')),draft);assert.equal(uploads,0);
 }finally{await browser.close();}
});
