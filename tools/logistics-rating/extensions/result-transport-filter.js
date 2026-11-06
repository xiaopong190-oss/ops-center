(function(root){
 'use strict';
 const modes=['空运','海运','卡航','铁路','其它'];
 // A UI selection translated into the existing exclusion/scope state; no new classifier.
 function selectionState(value){
  if(!modes.includes(value))return {states:{},tab:'inside'};
  return {states:Object.fromEntries(modes.map(mode=>[mode,mode===value?'neutral':'exclude'])),tab:value==='其它'?'unknown':'inside'};
 }
 function mount(doc){
  const host=doc.getElementById('scoreViewControls'),ui=root.N001UI;
  if(!host||!ui||host.dataset.transportFilterBound)return;
  host.dataset.transportFilterBound='true';let selected='',style;
  function reconcile(){
   if(host.querySelector('#resultTransport')||!host.querySelector('#scoreViewMode')||!host.querySelector('#scoreViewMessage'))return;
   const label=doc.createElement('label'),select=doc.createElement('select');
   label.className='result-transport-filter';label.style.marginLeft='auto';label.append('运输方式 ');
   select.id='resultTransport';select.setAttribute('aria-label','报价结果运输方式');
   for(const [value,text] of [['','全部方式'],...modes.map(mode=>[mode,mode==='其它'?'其它 / 待确认':mode])]){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option)}
   select.value=selected;label.append(select);host.insertBefore(label,host.querySelector('#scoreViewMessage'));
   if(!style){style=doc.createElement('style');style.textContent='#n001Search .n001-modes{display:none!important}#n001Search label:has(#n001Scope){display:none!important}';doc.head.append(style)}
   select.addEventListener('change',()=>{
    selected=select.value;const next=selectionState(selected);ui.states=next.states;ui.tab=next.tab;
    const scope=doc.getElementById('n001Scope');if(scope)scope.value=next.tab;
    for(const button of doc.querySelectorAll('[data-transport]')){const state=next.states[button.dataset.transport]||'neutral';button.dataset.state=state;button.textContent=button.dataset.transport+' · '+(state==='exclude'?'排除':'不限')}
    ui.invalidate();root.ComparisonStore?.render();
   });
  }
  // Large published snapshots can create or rebuild the score toolbar after this module loads.
  const observer=new doc.defaultView.MutationObserver(reconcile);observer.observe(host,{childList:true});
  doc.defaultView.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  doc.getElementById('n001Reset')?.addEventListener('click',()=>{selected='';const select=host.querySelector('#resultTransport');if(select)select.value=''});
  reconcile();
 }
 const api={selectionState,mount};
 if(typeof module!=='undefined')module.exports=api;else{root.ResultTransportFilter=Object.freeze(api);mount(root.document)}
})(typeof window==='undefined'?globalThis:window);
