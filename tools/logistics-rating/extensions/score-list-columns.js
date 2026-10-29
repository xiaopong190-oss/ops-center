(function(root){
 'use strict';
 function visibleDialogBounds({height,frameTop=null,parentHeight=height}){
  const top=frameTop===null?24:Math.max(24,80-frameTop);
  const bottom=frameTop===null?height-24:Math.min(height,parentHeight-frameTop)-24;
  return {top,maxHeight:Math.max(48,bottom-top)};
 }
 function fitColumnDialog(dialog,view){
  let top=16,left=16,width=view.innerWidth-32,height=view.innerHeight-32;
  try{if(view.frameElement){const r=view.frameElement.getBoundingClientRect();top=Math.max(16,80-r.top);left=Math.max(16,16-r.left);width=Math.min(view.innerWidth-left-16,view.parent.innerWidth-r.left-left-16);height=Math.min(view.innerHeight-top-16,view.parent.innerHeight-r.top-top-16)}}catch{}
  dialog.style.setProperty('position','fixed','important');dialog.style.setProperty('inset','auto','important');dialog.style.setProperty('margin','0','important');dialog.style.setProperty('transform','none','important');dialog.style.setProperty('top',top+'px','important');dialog.style.setProperty('left',left+'px','important');dialog.style.setProperty('width',Math.max(0,Math.min(680,width))+'px','important');dialog.style.setProperty('max-width',Math.max(0,width)+'px','important');dialog.style.setProperty('max-height',Math.max(0,height)+'px','important');dialog.style.setProperty('overflow','auto','important');dialog.style.setProperty('box-sizing','border-box','important');dialog.style.setProperty('overflow-wrap','anywhere','important');
 }
 function bindScoreListColumns(doc){
  const host=doc.getElementById('comparison');if(!host)return;
  const states=new WeakMap();
  doc.addEventListener('click',event=>{if(event.target.closest?.('[data-sort-col]')){const dialog=doc.getElementById('columnDialog');if(dialog?.open)fitColumnDialog(dialog,doc.defaultView)}});
  host.addEventListener('click',event=>{
   const button=event.target.closest?.('[data-score-column]');if(!button)return;
   const table=button.closest('table'),col=Number(button.dataset.scoreColumn),rows=[...table.tBodies[0].rows];
   if(!states.has(table))states.set(table,{original:rows.slice(),filters:new Map(),sort:null});
   const state=states.get(table),text=row=>row.cells[col].textContent.trim(),values=[...new Set(rows.map(text))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
   const dialog=doc.createElement('dialog'),title=doc.createElement('h3'),note=doc.createElement('p'),choices=doc.createElement('div'),order=doc.createElement('select');
   title.textContent=button.dataset.columnName+' · 筛选与排序';note.textContent='仅筛选和排序当前页；翻页或更改全局条件后重新选择。导出遵循全局筛选。';dialog.append(title,note,choices);
   const inputs=values.map(value=>{const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.checked=!state.filters.has(col)||state.filters.get(col).has(value);label.style.display='block';label.append(input,doc.createTextNode(value||'（空白）'));choices.append(label);return {input,value};});
   for(const [value,label]of [['','原始顺序'],['asc','升序'],['desc','降序']]){const option=doc.createElement('option');option.value=value;option.textContent=label;order.append(option);}order.value=state.sort?.col===col?state.sort.order:'';order.setAttribute('aria-label','排序');dialog.append(order);
   function apply(){
    const displayed=state.original.slice();
    for(const row of displayed)row.hidden=[...state.filters].some(([index,allowed])=>!allowed.has(row.cells[index].textContent.trim()));
    if(state.sort){const {col:index,order:direction}=state.sort;const value=row=>{const cell=row.cells[index],s=cell.textContent.trim();if(index===0)return /^\d/.test(s)?Number(s):null;if(index===6)return Number(cell.querySelector('b')?.textContent);if(index===7){const m=s.match(/(\d+)–(\d+)/);return m?Number(m[2]):null;}return s;};displayed.sort((a,b)=>{const x=value(a),y=value(b);if(x===null||Number.isNaN(x))return y===null||Number.isNaN(y)?0:1;if(y===null||Number.isNaN(y))return -1;const n=typeof x==='number'?x-y:String(x).localeCompare(String(y),'zh-CN',{numeric:true});return direction==='asc'?n:-n;});}
    table.tBodies[0].append(...displayed);for(const b of table.querySelectorAll('[data-score-column]'))b.classList.toggle('column-active',state.filters.has(Number(b.dataset.scoreColumn))||state.sort?.col===Number(b.dataset.scoreColumn));
   }
   function action(label,run){const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=run;dialog.append(b);}
   const close=()=>{dialog.close();dialog.remove();};
   action('全选',()=>inputs.forEach(x=>x.input.checked=true));action('全不选',()=>inputs.forEach(x=>x.input.checked=false));
   action('应用',()=>{const allowed=new Set(inputs.filter(x=>x.input.checked).map(x=>x.value));if(allowed.size===values.length)state.filters.delete(col);else state.filters.set(col,allowed);if(order.value)state.sort={col,order:order.value};else if(state.sort?.col===col)state.sort=null;apply();close();});
   action('重置本列',()=>{state.filters.delete(col);if(state.sort?.col===col)state.sort=null;apply();close();});action('取消',close);
   const view=doc.defaultView;let viewport={height:view.innerHeight};
   try{if(view.frameElement)viewport={...viewport,frameTop:view.frameElement.getBoundingClientRect().top,parentHeight:view.parent.innerHeight};}catch(ignore){}
   const bounds=visibleDialogBounds(viewport);
   dialog.addEventListener('cancel',()=>dialog.remove());dialog.style.top=bounds.top+'px';dialog.style.maxHeight=bounds.maxHeight+'px';dialog.style.maxWidth='90vw';doc.body.append(dialog);dialog.showModal();fitColumnDialog(dialog,view);
  });
 }
 const api={bindScoreListColumns,visibleDialogBounds,fitColumnDialog};if(typeof module!=='undefined')module.exports=api;else root.ScoreListColumns=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
