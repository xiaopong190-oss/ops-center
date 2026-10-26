const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch{}
const base=path.resolve(__dirname,'../..');
test('score column dialog is visible after scrolling the embedded quotation page',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage();
  const styles=[...fs.readFileSync(path.join(base,'n001.html'),'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+['n001-compact.css','comparison-clean.css'].map(f=>fs.readFileSync(path.join(base,f),'utf8')).join('\n');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   await page.setContent('<style>body{margin:0}header{position:fixed;top:0;height:64px;background:white;width:100%;z-index:9}iframe{margin-top:80px;width:100%;height:6000px;border:0}</style><header>物流商评级中心</header><iframe title="报价对比"></iframe>');
   const frame=page.frames()[1];
   await frame.setContent('<style>'+styles+'</style><div style="height:1100px">筛选渠道</div><section class="comparison-results"><h2>报价结果</h2><div id="comparison" class="scroll"></div></section>');
   for(const file of ['extensions/score-filter.js','extensions/score-list-columns.js'])await frame.addScriptTag({path:path.join(base,file)});
   await frame.evaluate(()=>{document.getElementById('comparison').innerHTML=LogisticsScoreView.renderScoreList([{company:'甲',channelScore:5,country:'美国',warehouse:'ONT8',channel:'海运',terms:'100KG+;包税',price:1000,currency:'CNY',unit:'kg',min:15,max:22}],r=>r.company,[]);ScoreListColumns.bindScoreListColumns(document);});
   await frame.locator('[data-score-column="0"]').click();
   const dialog=frame.locator('dialog[open]');assert.equal(await dialog.count(),1);
   const bounds=await dialog.boundingBox();
   if(process.env.LAYOUT_SCREENSHOTS){fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,'score-filter-'+width+'.png')});}
   assert.ok(bounds.y>=64,'dialog must appear below parent navigation: '+JSON.stringify(bounds));
   assert.ok(bounds.y+bounds.height<=900,'dialog must fit the visible parent viewport');
   await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await frame.locator('dialog[open]').count(),0);
  }
 }finally{await browser.close();}
});
