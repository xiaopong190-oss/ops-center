(function(root){
 'use strict';
 function visibleDialogBounds({height,frameTop=null,parentHeight=height}){
  const top=frameTop===null?24:Math.max(24,80-frameTop);
  const bottom=frameTop===null?height-24:Math.min(height,parentHeight-frameTop)-24;
  return {top,maxHeight:Math.max(48,bottom-top)};
 }
 function fitColumnDialog(dialog,view){
  enhanceColumnDialog(dialog);
  let top=16,left=16,width=view.innerWidth-32,height=view.innerHeight-32;
  try{if(view.frameElement){const r=view.frameElement.getBoundingClientRect();top=Math.max(16,80-r.top);left=Math.max(16,16-r.left);width=Math.min(view.innerWidth-left-16,view.parent.innerWidth-r.left-left-16);height=Math.min(view.innerHeight-top-16,view.parent.innerHeight-r.top-top-16)}}catch{}
  dialog.style.setProperty('position','fixed','important');dialog.style.setProperty('inset','auto','important');dialog.style.setProperty('margin','0','important');dialog.style.setProperty('transform','none','important');dialog.style.setProperty('top',top+'px','important');dialog.style.setProperty('left',left+'px','important');dialog.style.setProperty('width',Math.max(0,Math.min(680,width))+'px','important');dialog.style.setProperty('max-width',Math.max(0,width)+'px','important');dialog.style.setProperty('max-height',Math.max(0,height)+'px','important');dialog.style.setProperty('overflow','auto','important');dialog.style.setProperty('box-sizing','border-box','important');dialog.style.setProperty('overflow-wrap','anywhere','important');
 }
 function enhanceColumnDialog(dialog){
  if(dialog.dataset.columnEnhanced){dialog.dispatchEvent(new dialog.ownerDocument.defaultView.Event('column-reopen'));return}dialog.dataset.columnEnhanced='true';dialog.classList.add('column-filter-dialog');
  const doc=dialog.ownerDocument,choices=dialog.querySelector('#columnChoices,.column-filter-options');if(!choices)return;
  choices.classList.add('column-filter-options');const search=doc.createElement('input'),count=doc.createElement('p'),empty=doc.createElement('p'),scope=doc.createElement('p');
  scope.className='column-filter-scope';scope.textContent=(dialog.id==='columnDialog'?'作用范围：当前仓库表格的当前页。':'作用范围：高分列表当前页。')+'不跨页筛选，导出仍使用顶部全局条件。搜索只缩小选项列表，全选／全不选仅作用于搜索匹配项。';choices.before(scope);
  search.type='search';search.placeholder='搜索当前页的选项';search.setAttribute('aria-label','搜索筛选选项');search.className='column-filter-search';count.className='column-filter-count';count.setAttribute('role','status');empty.textContent='当前页没有匹配选项；可清空搜索或使用顶部全局筛选。';empty.className='column-filter-empty';empty.hidden=true;
  choices.before(search,count);choices.after(empty);
  const refresh=()=>{const labels=[...choices.querySelectorAll('label')],term=search.value.trim().toLocaleLowerCase();let shown=0,selected=0;for(const label of labels){label.hidden=!label.textContent.toLocaleLowerCase().includes(term);if(!label.hidden)shown++;if(label.querySelector('input')?.checked)selected++}count.textContent='当前页 '+labels.length+' 个选项 · 已选 '+selected+' 个 · 搜索匹配 '+shown+' 个';empty.hidden=shown>0;};
  search.addEventListener('input',refresh);dialog.addEventListener('change',refresh);dialog.addEventListener('click',refresh);dialog.addEventListener('column-reopen',()=>{search.value='';refresh()});refresh();
 }
 function tableFilterSummary(table){const rows=[...table.tBodies[0].rows],active=table.querySelectorAll('.column-active').length,doc=table.ownerDocument;let caption=table.querySelector('caption.column-filter-summary');if(!caption){caption=doc.createElement('caption');caption.className='column-filter-summary';caption.setAttribute('role','status');table.prepend(caption)}caption.textContent='本表当前页显示 '+rows.filter(r=>!r.hidden).length+' / '+rows.length+' 条 · '+active+' 列设置了筛选或排序'+(rows.length&&!rows.some(r=>!r.hidden)?'。没有匹配结果，可逐列重置筛选恢复。':'');}
 function bindScoreListColumns(doc){
  const host=doc.getElementById('comparison');if(!host)return;
  if(host.dataset.scoreColumnsBound)return;host.dataset.scoreColumnsBound='true';const states=new WeakMap();
  let groupedTable=null;doc.addEventListener('click',event=>{const opener=event.target.closest?.('[data-sort-col]');if(opener){groupedTable=opener.closest('table');const dialog=doc.getElementById('columnDialog');if(dialog?.open)fitColumnDialog(dialog,doc.defaultView)}if(groupedTable&&event.target.closest?.('#columnApply,#columnReset'))tableFilterSummary(groupedTable)});
  host.addEventListener('click',event=>{
   const button=event.target.closest?.('[data-score-column]');if(!button)return;
   const table=button.closest('table'),col=Number(button.dataset.scoreColumn),rows=[...table.tBodies[0].rows];
   if(!states.has(table))states.set(table,{original:rows.slice(),filters:new Map(),sort:null});
   const state=states.get(table),text=row=>row.cells[col].textContent.trim(),values=[...new Set(rows.map(text))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
   const dialog=doc.createElement('dialog'),title=doc.createElement('h3'),note=doc.createElement('p'),choices=doc.createElement('div'),order=doc.createElement('select');
   choices.className='column-filter-options';title.textContent=button.dataset.columnName+' · 筛选与排序';note.textContent='作用范围：仅当前页。其他页的值不会列在这里；筛选全部结果请使用顶部全局筛选。翻页后需重新选择，导出遵循全局筛选。';dialog.append(title,note,choices);
   const inputs=values.map(value=>{const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.checked=!state.filters.has(col)||state.filters.get(col).has(value);label.style.display='block';label.append(input,doc.createTextNode(value||'（空白）'));choices.append(label);return {input,value};});
   for(const [value,label]of [['','原始顺序'],['asc','升序'],['desc','降序']]){const option=doc.createElement('option');option.value=value;option.textContent=label;order.append(option);}order.value=state.sort?.col===col?state.sort.order:'';order.setAttribute('aria-label','排序');dialog.append(order);
   function apply(){
    const displayed=state.original.slice();
    for(const row of displayed)row.hidden=[...state.filters].some(([index,allowed])=>!allowed.has(row.cells[index].textContent.trim()));
    if(state.sort){const {col:index,order:direction}=state.sort;const value=row=>{const cell=row.cells[index],s=cell.textContent.trim();if(index===0)return /^\d/.test(s)?Number(s):null;if(index===6)return Number(cell.querySelector('b')?.textContent);if(index===7){const m=s.match(/(\d+)–(\d+)/);return m?Number(m[2]):null;}return s;};displayed.sort((a,b)=>{const x=value(a),y=value(b);if(x===null||Number.isNaN(x))return y===null||Number.isNaN(y)?0:1;if(y===null||Number.isNaN(y))return -1;const n=typeof x==='number'?x-y:String(x).localeCompare(String(y),'zh-CN',{numeric:true});return direction==='asc'?n:-n;});}
    table.tBodies[0].append(...displayed);for(const b of table.querySelectorAll('[data-score-column]'))b.classList.toggle('column-active',state.filters.has(Number(b.dataset.scoreColumn))||state.sort?.col===Number(b.dataset.scoreColumn));tableFilterSummary(table);
   }
   function action(label,run){const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=run;dialog.append(b);}
   const close=()=>{dialog.close();dialog.remove();};
   action('全选',()=>inputs.filter(x=>!x.input.parentElement.hidden).forEach(x=>x.input.checked=true));action('全不选',()=>inputs.filter(x=>!x.input.parentElement.hidden).forEach(x=>x.input.checked=false));
   action('应用',()=>{const allowed=new Set(inputs.filter(x=>x.input.checked).map(x=>x.value));if(allowed.size===values.length)state.filters.delete(col);else state.filters.set(col,allowed);if(order.value)state.sort={col,order:order.value};else if(state.sort?.col===col)state.sort=null;apply();close();});
   action('重置本列',()=>{state.filters.delete(col);if(state.sort?.col===col)state.sort=null;apply();close();});action('取消',close);
   const view=doc.defaultView;let viewport={height:view.innerHeight};
   try{if(view.frameElement)viewport={...viewport,frameTop:view.frameElement.getBoundingClientRect().top,parentHeight:view.parent.innerHeight};}catch(ignore){}
   const bounds=visibleDialogBounds(viewport);
   dialog.addEventListener('cancel',()=>dialog.remove());dialog.style.top=bounds.top+'px';dialog.style.maxHeight=bounds.maxHeight+'px';dialog.style.maxWidth='90vw';doc.body.append(dialog);dialog.showModal();fitColumnDialog(dialog,view);
  });
 }
 const api={bindScoreListColumns,visibleDialogBounds,fitColumnDialog,enhanceColumnDialog};if(typeof module!=='undefined')module.exports=api;else root.ScoreListColumns=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
