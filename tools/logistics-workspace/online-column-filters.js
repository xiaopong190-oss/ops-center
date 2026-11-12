/* Full-result Excel filters. Only bounded option metadata is downloaded. */
(function(root){
 'use strict';
 function bind(doc,onChange,fetchFacet){
  const host=doc.getElementById('comparison'),definitions=root.TableColumns.definitions;
  let state={filters:{},sort:'',mode:'base'},popup=null,anchor=null,cleanup=null,controller=null;
  function mark(){for(const button of host.querySelectorAll('[data-score-column]')){const field=definitions[Number(button.dataset.scoreColumn)]?.id;button.classList.toggle('column-active',!!state.filters[field]||state.sort.startsWith(field+':'));button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded',String(button===anchor));button.title=button.dataset.columnName+'筛选与排序 · 全部匹配报价';}}
  function close(){controller?.abort();controller=null;popup?.remove();popup=null;cleanup?.();cleanup=null;anchor?.setAttribute('aria-expanded','false');anchor=null;}
  function commit(field,rule,sort=state.sort){const before=JSON.stringify(state);if(rule)state.filters[field]=rule;else delete state.filters[field];state.sort=sort;close();mark();if(before!==JSON.stringify(state))onChange();}
  function open(button){
   if(anchor===button){close();return;}close();anchor=button;
   const definition=definitions[Number(button.dataset.scoreColumn)],field=definition.id;
   const menu=doc.createElement('div');popup=menu;menu.className='excel-provider-filter';menu.id='column-filter-menu';menu.role='dialog';menu.setAttribute('aria-label',definition.label+'筛选与排序');
   const title=doc.createElement('strong');title.textContent=definition.label;menu.append(title);
   const command=(text,action,disabled=false)=>{const control=doc.createElement('button');control.type='button';control.className='excel-filter-command';control.textContent=text;control.disabled=disabled;control.onclick=action;menu.append(control);return control;};
   const labels={text:['A → Z  升序','Z → A  降序'],number:['从小到大','从大到小'],time:['从短到长','从长到短'],date:['从旧到新','从新到旧'],grade:['从低到高','从高到低']}[definition.type];
   for(const [i,direction] of ['asc','desc'].entries())command(labels[i],()=>commit(field,state.filters[field],field+':'+direction)).classList.toggle('selected',state.sort===field+':'+direction);
   if(state.sort.startsWith(field+':'))command('取消排序',()=>commit(field,state.filters[field],''));
   command('清除“'+definition.label+'”的筛选',()=>commit(field,null),!state.filters[field]);
   const scope=doc.createElement('p');scope.className='excel-filter-scope';scope.textContent='全部匹配报价 · 多列组合筛选 · 翻页与导出同步';menu.append(scope);
   const search=doc.createElement('input');search.type='search';search.placeholder='搜索'+definition.label;search.setAttribute('aria-label',search.placeholder);menu.append(search);
   const summary=doc.createElement('p');summary.className='excel-filter-count';summary.role='status';menu.append(summary);
   const controls=doc.createElement('div');controls.className='excel-filter-select';const allLabel=doc.createElement('label'),all=doc.createElement('input'),none=doc.createElement('button');all.type='checkbox';all.setAttribute('aria-label','全选搜索匹配的'+definition.label);allLabel.append(all,doc.createTextNode('（全选）'));none.type='button';none.textContent='清空';controls.append(allLabel,none);menu.append(controls);
   const list=doc.createElement('div');list.className='excel-filter-options';menu.append(list);
   const more=doc.createElement('button');more.type='button';more.className='excel-filter-command';more.textContent='加载更多选项';menu.append(more);
   const footer=doc.createElement('div');footer.className='excel-filter-footer';const cancel=doc.createElement('button'),apply=doc.createElement('button');cancel.type=apply.type='button';cancel.textContent='取消';apply.textContent='确定';apply.className='primary';footer.append(cancel,apply);menu.append(footer);
   let draft=JSON.parse(JSON.stringify(state.filters[field]||{mode:'exclude',values:[]})),selected=new Set(draft.values),items=[],allValues=[],cursor=0,busy=false,serial=0,debounce=null,failed=false;
   const checked=value=>selected.has(value)===(draft.mode==='include');
   function refresh(){
    list.replaceChildren();for(const item of items){const label=doc.createElement('label'),input=doc.createElement('input'),name=doc.createElement('span'),count=doc.createElement('span');input.type='checkbox';input.value=String(item.value);input.checked=checked(item.value);name.textContent=item.label;count.textContent=String(item.count);count.className='excel-filter-option-count';label.append(input,name,count);list.append(label);input.onchange=()=>{input.checked===(draft.mode==='include')?selected.add(item.value):selected.delete(item.value);refresh();};}
    const searching=!!search.value.trim(),scopeValues=searching?items.map(item=>item.value):allValues,amount=scopeValues.filter(checked).length;
    all.checked=scopeValues.length>0&&amount===scopeValues.length;all.indeterminate=amount>0&&amount<scopeValues.length;all.disabled=busy||failed;
    summary.textContent=failed?'选项读取失败，请重新打开筛选':busy?'正在读取选项…':'共 '+allValues.length+' 项'+(searching?' · 已找到 '+items.length+' 项':'')+(cursor!==null?' · 还有更多选项':'')+' · 已勾选 '+amount+' 项';
    more.hidden=cursor===null;more.disabled=busy||failed;apply.disabled=busy||failed||(!amount&&cursor===null);none.disabled=busy;search.disabled=false;
   }
   async function load(reset=false){
    const current=++serial;controller?.abort();controller=new AbortController();if(reset){items=[];cursor=0;}busy=true;failed=false;refresh();
    try{const result=await fetchFacet(field,search.value.trim(),cursor,controller.signal);if(current!==serial||popup!==menu)return;const facet=result.columnFacet;allValues=facet.allValues;items.push(...facet.choices);cursor=facet.nextCursor;if(search.value.trim()&&!items.length&&cursor!==null){await load();return;}busy=false;refresh();}
    catch(error){if(error.name==='AbortError'||current!==serial||popup!==menu)return;busy=false;failed=true;refresh();}
   }
   search.oninput=()=>{clearTimeout(debounce);controller?.abort();serial++;busy=true;items=[];cursor=0;refresh();debounce=setTimeout(()=>load(true),180);};
   all.onchange=()=>{draft.mode=all.checked?'exclude':'include';selected.clear();refresh();};
   none.onclick=()=>{draft.mode='include';selected.clear();refresh();};more.onclick=()=>load();
   cancel.onclick=()=>{const trigger=anchor;close();trigger?.focus();};
   apply.onclick=async()=>{
    // Search-confirm includes every matching value, including unloaded metadata pages.
    if(search.value.trim()){
     const before=new Set(items.map(item=>item.value)),allChecked=items.length>0&&items.every(item=>checked(item.value));
     while(cursor!==null&&!failed&&popup===menu)await load();if(failed||popup!==menu)return;
     if(allChecked)for(const item of items)if(!before.has(item.value))draft.mode==='include'?selected.add(item.value):selected.delete(item.value);
     const values=items.filter(item=>checked(item.value)).map(item=>item.value);if(!values.length)return;commit(field,{mode:'include',values});
    }else{const values=[...selected].sort((a,b)=>a-b);commit(field,draft.mode==='exclude'&&!values.length?null:{mode:draft.mode,values});}
   };
   search.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(!apply.disabled)apply.click();}};
   const view=doc.defaultView,rect=button.getBoundingClientRect();let left=8,right=view.innerWidth-8,top=8,bottom=view.innerHeight-8;
   try{if(view.frameElement){const frame=view.frameElement.getBoundingClientRect();left=Math.max(left,8-frame.left);right=Math.min(right,view.parent.innerWidth-frame.left-8);top=Math.max(top,80-frame.top);bottom=Math.min(bottom,view.parent.innerHeight-frame.top-8);}}catch{}
   const width=Math.max(0,Math.min(304,right-left)),below=Math.max(0,bottom-rect.bottom-4),above=Math.max(0,rect.top-top-4),useBelow=below>=360||below>=above,height=Math.max(120,Math.min(520,useBelow?below:above));menu.style.width=width+'px';menu.style.maxHeight=height+'px';menu.style.left=Math.max(left,Math.min(rect.left,right-width))+'px';menu.style.top=Math.max(top,useBelow?rect.bottom+4:rect.top-height-4)+'px';doc.body.append(menu);
   const pointer=event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();},key=event=>{if(event.key==='Escape'){event.preventDefault();const trigger=anchor;close();trigger?.focus();}},scroll=event=>{if(!menu.contains(event.target))close();};
   let parentDoc=null;try{if(view.parent!==view){parentDoc=view.parent.document;parentDoc.addEventListener('pointerdown',close);parentDoc.addEventListener('scroll',close,true);view.parent.addEventListener('resize',close);}}catch{}
   doc.addEventListener('pointerdown',pointer);doc.addEventListener('keydown',key);doc.addEventListener('scroll',scroll,true);view.addEventListener('resize',close);cleanup=()=>{clearTimeout(debounce);serial++;doc.removeEventListener('pointerdown',pointer);doc.removeEventListener('keydown',key);doc.removeEventListener('scroll',scroll,true);view.removeEventListener('resize',close);if(parentDoc){parentDoc.removeEventListener('pointerdown',close);parentDoc.removeEventListener('scroll',close,true);view.parent.removeEventListener('resize',close);}};
   mark();load(true);search.focus();
  }
  host.addEventListener('click',event=>{const button=event.target.closest?.('[data-score-column]');if(button&&button.closest('#online-results')){event.preventDefault();event.stopImmediatePropagation();open(button);}},{capture:true});
  doc.defaultView.addEventListener('pagehide',close,{once:true});
  return {update(result){close();state=result.tableColumns;mark();},write(query){if(Object.keys(state.filters).length)query.set('columns',JSON.stringify(state.filters));query.set('columnMode',state.mode);if(state.sort)query.set('columnSort',state.sort);},hasFilters(){return Object.keys(state.filters).length>0;},reset(){close();state={filters:{},sort:'',mode:'base'};mark();},clearDynamic(){close();for(const item of definitions)if(item.dynamic)delete state.filters[item.id];},clearOrder(){state.sort='';mark();},close};
 }
 root.OnlineColumnFilters=Object.freeze({bind});
})(window);
