/* Restore the pre-query-service filter presentation without reading business storage. */
(function(root){
 'use strict';
 function warehousePicker(doc,select){
  const box=doc.createElement('div');box.className='classic-warehouse-picker';
  box.innerHTML='<button type="button" id="online-warehouse-trigger" aria-expanded="false" aria-controls="online-warehouse-panel">全部仓库 ▾</button><div id="online-warehouse-panel" hidden><input id="online-warehouse-search" type="search" aria-label="搜索仓库编号" placeholder="输入仓库编号"><div id="online-warehouse-choices" role="listbox" aria-label="仓库选项"></div><p id="online-warehouse-status" class="muted"></p></div>';
  select.after(box);select.hidden=true;
  const trigger=box.querySelector('button'),panel=box.querySelector('#online-warehouse-panel'),input=box.querySelector('input'),list=box.querySelector('[role=listbox]'),status=box.querySelector('p');
  let shown=[],active=-1;
  function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function choose(value){select.value=value;select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));close();trigger.focus();}
  function paint(){
   const needle=input.value.trim().toUpperCase(),matches=[...select.options].filter(option=>option.value&&(!needle||option.value.toUpperCase().startsWith(needle)));
   shown=['',...matches.slice(0,100).map(option=>option.value)];active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
   for(const [index,value] of shown.entries()){
    const button=doc.createElement('button');button.type='button';button.id='online-warehouse-choice-'+index;button.role='option';button.textContent=value||'全部仓库';button.setAttribute('aria-selected',String(value===select.value));button.onclick=()=>choose(value);list.append(button);
   }
   status.textContent=matches.length?'匹配 '+matches.length+' 个'+(matches.length>100?'，继续输入缩小范围':''):'没有匹配仓库';
  }
  function sync(){trigger.textContent=(select.value||'全部仓库')+' ▾';if(!panel.hidden)paint();}
  trigger.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;trigger.setAttribute('aria-expanded','true');input.value='';paint();input.focus();};
  input.oninput=paint;input.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();close();trigger.focus();}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();active=active<0?(event.key==='ArrowDown'?0:shown.length-1):(active+(event.key==='ArrowDown'?1:-1)+shown.length)%shown.length;
    for(const [index,button] of [...list.children].entries())button.toggleAttribute('data-active',index===active);
    const target=list.children[active];input.setAttribute('aria-activedescendant',target.id);target.scrollIntoView?.({block:'nearest'});
   }else if(event.key==='Enter'){event.preventDefault();choose(shown[active>=0?active:shown.length>1?1:0]);}
  };
  doc.addEventListener('pointerdown',event=>{if(!box.contains(event.target))close();});box.addEventListener('focusout',event=>{if(!box.contains(event.relatedTarget))close();});select.addEventListener('change',sync);
  const observer=new doc.defaultView.MutationObserver(sync);observer.observe(select,{childList:true,subtree:true});doc.defaultView.addEventListener('pagehide',()=>observer.disconnect(),{once:true});sync();
 }
 function fieldset(doc,old,title){
  const panel=doc.createElement('fieldset'),legend=doc.createElement('legend');panel.className=old.className;panel.id=old.id;legend.textContent=title;panel.append(legend);
  for(const child of [...old.children])panel.append(child);old.replaceWith(panel);return panel;
 }
 function mount(doc){
  const form=doc.getElementById('online-filters');if(!form||!doc.getElementById('online-compare'))return;
  form.classList.add('classic-query-filters');const primary=form.querySelector('.filters');primary.classList.add('classic-primary');
  const transport=doc.getElementById('online-transport');transport.setAttribute('form',form.id);transport.closest('label').classList.add('classic-result-transport');doc.querySelector('.score-controls').append(transport.closest('label'));
  doc.getElementById('online-rule').closest('label').hidden=true;
  for(const [id,label] of [['provider','服务商'],['country','国家'],['region','地区'],['channel','渠道']]){
   const select=doc.getElementById('online-'+id);select.setAttribute('aria-label',label);select.closest('label').replaceWith(select);
  }
  const previous=doc.getElementById('online-warehouse'),select=doc.createElement('select');select.id=previous.id;select.name=previous.name;select.setAttribute('aria-label','仓库');select.add(new doc.defaultView.Option('全部仓库',''));previous.closest('label').replaceWith(select);doc.getElementById('online-warehouse-list')?.remove();warehousePicker(doc,select);
  const cargo=fieldset(doc,doc.getElementById('online-cargo'),'货物类型'),all=doc.createElement('button');all.type='button';all.id='online-all-cargo';all.textContent='全部货物';cargo.append(all);
  const tax=fieldset(doc,form.querySelector('.check-options:not(#online-cargo)'),'税务方式');tax.id='online-tax';
  const actions=form.querySelector('.actions');actions.classList.add('classic-actions');actions.querySelector('[type=submit]').remove();doc.getElementById('online-retry').hidden=true;
  const results=doc.querySelector('.score-controls').closest('section'),heading=doc.createElement('div');heading.className='classic-results-heading';results.prepend(heading);heading.append(results.querySelector('h2'),results.querySelector('.actions'));doc.getElementById('online-export').textContent='导出报价';
  doc.getElementById('online-coverage-label').hidden=true;
  doc.querySelector('#online-regional>h2').textContent='区域 / 邮编报价查询';doc.querySelector('#online-regional>p').textContent='选择仓库后，仅显示原文明确覆盖该仓库的区域报价。';
 }
 root.OnlineClassicFilters=Object.freeze({mount});
})(window);
