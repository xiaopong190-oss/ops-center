/* Excel-style provider selection backed by the full server query, not DOM rows. */
(function(root){
 'use strict';
 function bind(doc,onChange){
  const host=doc.getElementById('comparison');let state={values:null,order:''},choices=[],names={},popup=null,anchor=null,cleanup=null;
  function mark(){const button=host.querySelector('[data-score-column="0"]');if(button){button.classList.toggle('provider-column-active',state.values!==null||!!state.order);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded',String(!!popup));button.title='物流商筛选与排序 · 全部匹配报价';}}
  function close(){if(!popup)return;popup.remove();popup=null;cleanup?.();cleanup=null;if(anchor?.isConnected)anchor.setAttribute('aria-expanded','false');anchor=null;}
  function commit(next){
   const prior=JSON.stringify(state),values=next.values===null?null:[...new Set(next.values)].sort();state={values,order:next.order};close();mark();if(JSON.stringify(state)!==prior)onChange();
  }
  function open(button){
   if(popup&&anchor===button){close();return;}close();anchor=button;
   popup=doc.createElement('div');popup.className='excel-provider-filter';popup.id='provider-column-menu';popup.role='dialog';popup.setAttribute('aria-label','物流商筛选与排序');
   const menu=popup,title=doc.createElement('strong');title.textContent='物流商';menu.append(title);
   function command(text,action,disabled=false){const control=doc.createElement('button');control.type='button';control.className='excel-filter-command';control.textContent=text;control.disabled=disabled;control.onclick=action;menu.append(control);return control;}
   command('A → Z  升序',()=>commit({...state,order:'asc'})).classList.toggle('selected',state.order==='asc');
   command('Z → A  降序',()=>commit({...state,order:'desc'})).classList.toggle('selected',state.order==='desc');
   if(state.order)command('取消排序',()=>commit({...state,order:''}));
   command('清除“物流商”的筛选',()=>commit({...state,values:null}),state.values===null);
   const scope=doc.createElement('p');scope.className='excel-filter-scope';scope.textContent='当前条件下的全部报价，跨页生效；导出跟随此筛选。';menu.append(scope);
   const search=doc.createElement('input');search.type='search';search.placeholder='搜索物流商';search.title='搜索后确定，仅应用搜索匹配的勾选项';search.setAttribute('aria-label','搜索物流商');menu.append(search);
   const summary=doc.createElement('p');summary.className='excel-filter-count';summary.role='status';menu.append(summary);
   const controls=doc.createElement('div');controls.className='excel-filter-select';const allLabel=doc.createElement('label'),all=doc.createElement('input');all.type='checkbox';all.setAttribute('aria-label','全选搜索匹配的物流商');allLabel.append(all,doc.createTextNode('（全选）'));const none=doc.createElement('button');none.type='button';none.textContent='清空';controls.append(allLabel,none);menu.append(controls);
   const list=doc.createElement('div');list.className='excel-filter-options';menu.append(list);
   const available=choices.slice(),known=new Set(available.map(item=>item.value));
   for(const value of state.values||[])if(!known.has(value))available.push({value,label:names[value]||value,count:0});
   const selected=new Set(state.values===null?available.map(item=>item.value):state.values),inputs=[];
   for(const item of available){
    const label=doc.createElement('label'),input=doc.createElement('input'),name=doc.createElement('span'),count=doc.createElement('span');input.type='checkbox';input.value=item.value;input.checked=selected.has(item.value);name.textContent=item.label;count.className='excel-filter-option-count';count.textContent=String(item.count);label.append(input,name,count);list.append(label);inputs.push({input,label,item});
    input.onchange=()=>{input.checked?selected.add(item.value):selected.delete(item.value);refresh();};
   }
   const empty=doc.createElement('p');empty.className='excel-filter-empty';empty.textContent='没有匹配的物流商';menu.append(empty);
   const footer=doc.createElement('div');footer.className='excel-filter-footer';const cancel=doc.createElement('button'),apply=doc.createElement('button');cancel.type=apply.type='button';cancel.textContent='取消';apply.textContent='确定';apply.className='primary';footer.append(cancel,apply);menu.append(footer);
   function applicable(){return inputs.filter(entry=>(!search.value.trim()||!entry.label.hidden)&&selected.has(entry.item.value)).map(entry=>entry.item.value);}
   function refresh(){
    const needle=search.value.trim().toLocaleLowerCase(),visible=inputs.filter(entry=>{entry.label.hidden=!entry.item.label.toLocaleLowerCase().includes(needle);entry.input.checked=selected.has(entry.item.value);return !entry.label.hidden;});
    const checked=visible.filter(entry=>entry.input.checked).length;all.checked=visible.length>0&&checked===visible.length;all.indeterminate=checked>0&&checked<visible.length;all.disabled=!visible.length;empty.hidden=!!visible.length;
    summary.textContent='共 '+choices.length+' 家'+(needle?' · 搜索匹配 '+visible.length+' 家':'')+' · 已勾选 '+applicable().length+' 家';apply.disabled=!applicable().length;
   }
   search.oninput=refresh;
   search.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();apply.click();}};
   all.onchange=()=>{for(const entry of inputs)if(!entry.label.hidden)all.checked?selected.add(entry.item.value):selected.delete(entry.item.value);refresh();};
   none.onclick=()=>{selected.clear();refresh();};
   cancel.onclick=()=>{const trigger=anchor;close();trigger?.focus();};
   apply.onclick=()=>{const checked=applicable();if(!checked.length)return;const values=checked.length===available.length?null:checked;commit({...state,values});};
   const view=doc.defaultView,rect=button.getBoundingClientRect();let leftEdge=8,rightEdge=view.innerWidth-8,topEdge=8,bottomEdge=view.innerHeight-8;
   try{if(view.frameElement){const frame=view.frameElement.getBoundingClientRect();leftEdge=Math.max(leftEdge,8-frame.left);rightEdge=Math.min(rightEdge,view.parent.innerWidth-frame.left-8);topEdge=Math.max(topEdge,80-frame.top);bottomEdge=Math.min(bottomEdge,view.parent.innerHeight-frame.top-8);}}catch{}
   const width=Math.max(0,Math.min(304,rightEdge-leftEdge)),below=Math.max(0,bottomEdge-rect.bottom-4),above=Math.max(0,rect.top-topEdge-4),useBelow=below>=360||below>=above,height=Math.max(120,Math.min(500,useBelow?below:above));
   menu.style.width=width+'px';menu.style.maxHeight=height+'px';menu.style.left=Math.max(leftEdge,Math.min(rect.left,rightEdge-width))+'px';menu.style.top=Math.max(topEdge,useBelow?rect.bottom+4:rect.top-height-4)+'px';doc.body.append(menu);
   const pointer=event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();},key=event=>{if(event.key==='Escape'){event.preventDefault();const trigger=anchor;close();trigger?.focus();}},scroll=event=>{if(!menu.contains(event.target))close();};
   let parentDoc=null;try{if(view.parent!==view){parentDoc=view.parent.document;parentDoc.addEventListener('pointerdown',close);parentDoc.addEventListener('scroll',close,true);view.parent.addEventListener('resize',close);}}catch{}
   doc.addEventListener('pointerdown',pointer);doc.addEventListener('keydown',key);doc.addEventListener('scroll',scroll,true);view.addEventListener('resize',close);cleanup=()=>{doc.removeEventListener('pointerdown',pointer);doc.removeEventListener('keydown',key);doc.removeEventListener('scroll',scroll,true);view.removeEventListener('resize',close);if(parentDoc){parentDoc.removeEventListener('pointerdown',close);parentDoc.removeEventListener('scroll',close,true);view.parent.removeEventListener('resize',close);}};refresh();mark();search.focus();
  }
  host.addEventListener('click',event=>{const button=event.target.closest?.('[data-score-column="0"]');if(button&&button.closest('#online-results')){event.preventDefault();event.stopImmediatePropagation();open(button);}},{capture:true});
  doc.defaultView.addEventListener('pagehide',close,{once:true});
  return {
   update(result){close();choices=result.providerColumn.choices;names=result.providerNames||{};state={values:result.providerColumn.values,order:result.providerColumn.order};mark();},
   write(query){if(state.values!==null){if(!state.values.length)query.set('columnProviderNone','1');else for(const value of state.values)query.append('columnProvider',value);}if(state.order)query.set('providerOrder',state.order);},
   reset(){close();state={values:null,order:''};mark();},clearOrder(){state.order='';mark();},close
  };
 }
 root.OnlineProviderFilter=Object.freeze({bind});
})(window);
