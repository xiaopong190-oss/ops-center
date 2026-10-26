(function(root){
 'use strict';
 function mountCargoFilter(doc){
  const modes=doc.querySelector('.n001-modes');if(!modes)return;
  const panel=doc.createElement('fieldset'),legend=doc.createElement('legend'),status=doc.createElement('p');legend.textContent='货物类型（可多选，满足任一项）';panel.id='cargoFilter';panel.append(legend);
  for(const type of root.CargoFilter.options){const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.value=type;label.append(input,doc.createTextNode(type));label.style.marginRight='12px';panel.append(label);}
  const clear=doc.createElement('button');clear.type='button';clear.textContent='全部货物';panel.append(clear,status);modes.after(panel);
  const selected=()=>[...panel.querySelectorAll('input:checked')].map(x=>x.value);
  function refresh(){status.textContent=selected().length?'已选：'+selected().join('、')+'；未声明支持的类型不推断。':'全部货物；未标明类型的报价保留为待确认。';root.N001UI?.invalidate();root.ComparisonStore?.render();}
  panel.addEventListener('change',refresh);clear.onclick=()=>{for(const input of panel.querySelectorAll('input'))input.checked=false;refresh();};doc.getElementById('n001Reset')?.addEventListener('click',clear.onclick);refresh();
 }
 const api={mountCargoFilter};if(typeof module!=='undefined')module.exports=api;else root.CargoFilterUI=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
