(function(root){
 'use strict';
 function arrangeComparisonPage(doc){
  const $=id=>doc.getElementById(id),search=$('n001Search'),panel=$('comparisonPanel');if(!search||!panel||search.dataset.arranged)return;search.dataset.arranged='true';
  search.querySelector('h2').textContent='筛选渠道';const intro=search.querySelector(':scope > p');if(intro&&!intro.id)intro.textContent='先选目的仓与货物条件，再查看报价或比较评分。';
  const actions=$('n001Scope')?.closest('div');if(actions)actions.classList.add('comparison-actions');
  $('n001Compare').textContent='比较评分';$('n001Reset').textContent='重置筛选';
  const notes=doc.createElement('details'),summary=doc.createElement('summary');notes.className='comparison-notes';summary.textContent='筛选说明与识别状态';notes.append(summary);
  for(const id of ['n001Counts','n001AIStatus'])if($(id))notes.append($(id));
  const help=search.querySelector('.n001-score-help');if(help)notes.append(help);search.append(notes);
  const results=doc.createElement('section'),heading=doc.createElement('div'),title=doc.createElement('h2'),exports=doc.createElement('div');results.className='comparison-results';heading.className='comparison-results-heading';title.textContent='报价结果';exports.className='comparison-export-actions';
  for(const id of ['exportQuotes','exportChannelScores'])if($(id))exports.append($(id));heading.append(title,exports);results.append(heading);
  panel.insertBefore(results,$('scoreViewControls'));results.append($('scoreViewControls'));
  const pager=$('n001Prev')?.parentElement;if(pager){pager.classList.add('comparison-pagination');results.append(pager);}results.append($('comparison'));
  const management=panel.querySelector('.n001-manage');if(management){management.querySelector('summary').textContent='数据管理与规则';panel.append(management);}
  for(const id of ['ratingSummary'])if($(id))notes.append($(id));
 }
 const api={arrangeComparisonPage};if(typeof module!=='undefined')module.exports=api;else {root.ComparisonLayout=Object.freeze(api);arrangeComparisonPage(root.document);}
})(typeof window==='undefined'?globalThis:window);
