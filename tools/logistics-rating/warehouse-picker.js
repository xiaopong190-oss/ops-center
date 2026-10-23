(function(root){
 'use strict';function matches(values,query){const q=String(query||'').trim().toUpperCase();return values.filter(v=>!q||v.toUpperCase().startsWith(q));}
 if(typeof module!=='undefined')module.exports={matches};if(!root.document)return;
 const select=document.getElementById('warehouse'),box=document.getElementById('warehousePicker');if(!select||!box)return;
 const trigger=document.getElementById('warehousePickerTrigger'),panel=document.getElementById('warehousePickerPanel'),input=document.getElementById('warehousePickerInput'),list=document.getElementById('warehousePickerList'),status=document.getElementById('warehousePickerStatus');let active=-1,shown=[];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const values=()=>Array.from(select.options).map(o=>o.value).filter(Boolean);
 function paint(){const found=matches(values(),input.value);shown=['',...found.slice(0,100)];active=-1;input.removeAttribute('aria-activedescendant');list.innerHTML=shown.map((value,i)=>'<button type="button" role="option" id="warehouseChoice'+i+'" data-choice="'+i+'" aria-selected="'+String(value===select.value)+'">'+esc(value||'全部仓库')+'</button>').join('');status.textContent=found.length?'匹配 '+found.length+' 个'+(found.length>100?'，继续输入缩小范围':''):'没有匹配仓库';}
 function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');input.setAttribute('aria-expanded','false');}
 function sync(){trigger.textContent=(select.value||'全部仓库')+' ▾';if(!panel.hidden)paint();}
 function choose(index){const value=shown[index];if(value===undefined)return;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));close();sync();trigger.focus();}
 trigger.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;trigger.setAttribute('aria-expanded','true');input.setAttribute('aria-expanded','true');input.value='';paint();input.focus();};
 input.oninput=paint;list.onclick=e=>{const b=e.target.closest('button[data-choice]');if(b)choose(Number(b.dataset.choice));};
 input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();trigger.focus();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=active<0?(e.key==='ArrowDown'?0:shown.length-1):(active+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;for(let i=0;i<shown.length;i++)document.getElementById('warehouseChoice'+i)?.setAttribute('data-active',String(i===active));const target=document.getElementById('warehouseChoice'+active);input.setAttribute('aria-activedescendant','warehouseChoice'+active);target?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();choose(active>=0?active:shown.length>1?1:0);}};
 document.addEventListener('pointerdown',e=>{if(!box.contains(e.target))close();});box.addEventListener('focusout',e=>{if(!box.contains(e.relatedTarget))close();});select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{childList:true,subtree:true});select.hidden=true;box.hidden=false;close();sync();
})(typeof window!=='undefined'?window:globalThis);
