const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
test('clean comparison layout moves original controls without losing handlers, IDs or notices',()=>{
 const base=path.resolve(__dirname,'../..'),dom=new JSDOM(fs.readFileSync(path.join(base,'n001.html'),'utf8'),{url:'https://isolated.test',runScripts:'outside-only'}),w=dom.window,doc=w.document,$=id=>doc.getElementById(id);
 try{
  for(const f of ['extensions/cargo-filter.js','extensions/cargo-filter-ui.js','extensions/score-list-columns.js','extensions/comparison-filter-reset.js','n001-layout.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
  const ids=['n001Scope','n001Compare','n001Reset','n001Counts','n001AIStatus','comparison','scoreViewControls','n001Prev','n001Next','exportQuotes','exportChannelScores','deleteQuotes','restoreQuotes','ratingSummary','cargoFilter','provider','country','warehouse'];
  const original=new Map(ids.map(id=>[id,$(id)]));let calls=0;$('exportQuotes').onclick=()=>calls++;
  const before=w.localStorage.length;w.eval(fs.readFileSync(path.join(base,'extensions/comparison-layout.js'),'utf8'));w.ComparisonLayout.arrangeComparisonPage(doc);
  for(const id of ids){assert.equal($(id),original.get(id),id);assert.equal(doc.querySelectorAll('#'+id).length,1,id+' unique');}
  $('exportQuotes').click();assert.equal(calls,1);assert.equal(w.localStorage.length,before);
  assert.equal($('comparison').closest('.comparison-results')!==null,true);assert.equal($('exportQuotes').closest('.comparison-export-actions')!==null,true);
  assert.equal($('n001Counts').closest('.comparison-notes').open,false);assert.equal($('n001Status').closest('details'),null,'comparison status stays visible');
  assert.equal($('deleteQuotes').closest('.n001-manage').open,false);assert.equal($('cargoFilter').closest('.n001-search')!==null,true);
  assert.equal(doc.querySelectorAll('.comparison-results').length,1);assert.equal(doc.querySelectorAll('.comparison-notes').length,1);
 }finally{w.close();}
});
