const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
let chromium;
try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch{}
const base=path.resolve(__dirname,'../..');

// Synthetic data and an isolated DOM only: never load a business browser profile
// or the cloud scripts. Exercise both production renderers and the real cascade.
async function fixture(){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 try{
  w.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  const load=f=>w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  for(const f of ['domain.js','comparison-core.js','channel-score.js','quote-core.js','companies.js'])load(f);
  const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const quotes=Array.from({length:3},(_,i)=>({company:'测试物流'+i,companyId:'fixture'+i,country:'美国',warehouse:'ONT8',channel:'美森海运',terms:'档=100KG+;包税;普货;最低计费重量100KG，单件超长附加费用另计，偏远地区送仓预约和燃油附加费以实际账单为准;'+('UNBROKEN_CONDITION_'.repeat(i*3)),price:980+i*70,currency:'CNY',unit:'kg',date:day,min:15,max:22}));
  w.localStorage.setItem('logistics-quotes-v1',JSON.stringify({quotes,templates:[{country:'美国',warehouse:'ONT8'}]}));
  for(const f of ['relation-core.js','extensions/transport-exclusion.js','n001.js','extensions/score-filter.js','quotes.js','extensions/comparison-filter-reset.js','extensions/score-list-columns.js','extensions/cargo-filter.js','extensions/cargo-filter-ui.js','n001-layout.js','extensions/comparison-layout.js'])load(f);
  await new Promise(r=>setTimeout(r,0));
  for(const script of doc.querySelectorAll('script'))script.remove();
  for(const link of doc.querySelectorAll('link[rel=stylesheet]')){const style=doc.createElement('style');style.textContent=fs.readFileSync(path.join(base,link.getAttribute('href').split('?')[0]),'utf8');link.replaceWith(style);}
  const score=doc.documentElement.outerHTML;
  doc.getElementById('scoreViewMode').value='grouped';doc.getElementById('scoreViewMode').dispatchEvent(new w.Event('change'));
  return {score,grouped:doc.documentElement.outerHTML};
 }finally{w.close();}
}

test('real browser: long terms stay inside cells and both result views scroll without overlays',{skip:!chromium},async()=>{
 const html=await fixture(),browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage();
  for(const width of [1440,900,390])for(const mode of ['score','grouped']){
   await page.setViewportSize({width,height:1000});await page.setContent(html[mode]);
   await page.locator('#scoreViewMode').selectOption(mode);
   await page.locator('#comparison details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
   const geometry=await page.locator('#comparison').evaluate(host=>{
    const table=host.querySelector('table'),viewport=table.parentElement;
    const spills=[...host.querySelectorAll('td')].filter(cell=>cell.scrollWidth>cell.clientWidth+1).map(cell=>cell.textContent);
    // Text geometry catches painted overflow even if a browser's table metrics
    // report only the allocated cell width.
    const escaped=[];
    for(const cell of host.querySelectorAll('td')){const bounds=cell.getBoundingClientRect(),walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){
     if(text.parentElement.closest('[role=tooltip]')||!text.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(text);
     for(const rect of range.getClientRects())if(rect.width&&(rect.left<bounds.left-1||rect.right>bounds.right+1))escaped.push(text.textContent);
    }}
    viewport.scrollLeft=400;
    return {spills,escaped,scrolled:viewport.scrollLeft,pageWidth:document.documentElement.scrollWidth,sticky:[...table.querySelectorAll('td,th')].some(c=>getComputedStyle(c).position==='sticky')};
   });
   assert.deepEqual(geometry.spills,[],mode+' '+width+' cell overflow');
   assert.deepEqual(geometry.escaped,[],mode+' '+width+' text crosses columns');
   assert.equal(geometry.sticky,false);assert.ok(geometry.pageWidth<=width+1);
   if(width===390)assert.ok(geometry.scrolled>0,mode+' retains horizontal scroll');
   if(process.env.LAYOUT_SCREENSHOTS){fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.locator('.comparison-results').screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,mode+'-'+width+'.png')});}
  }
  // The same table headings still open the production filter/sort dialog.
  await page.setContent(html.score);await page.addScriptTag({path:path.join(base,'extensions/score-list-columns.js')});
  await page.evaluate(()=>ScoreListColumns.bindScoreListColumns(document));
  await page.locator('[data-score-column="6"]').click();assert.equal(await page.locator('dialog[open]').count(),1);
  await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);
 }finally{await browser.close();}
});


