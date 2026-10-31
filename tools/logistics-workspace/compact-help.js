/* Presentation only: retain business nodes and handlers; never read or write storage. */
(function(){'use strict';
if(window.WorkspaceHelp)return;
let serial=0,current=null,pinned=false,timer;
const entries=new Map(),doc=document;
const popup=doc.createElement('div');popup.id='workspace-help-bubble';popup.className='hx-help-bubble';popup.role='tooltip';popup.tabIndex=0;popup.hidden=true;
const title=doc.createElement('strong'),copy=doc.createElement('div');popup.append(title,copy);
function close(){clearTimeout(timer);if(current)current.setAttribute('aria-expanded','false');current=null;pinned=false;popup.hidden=true;if(typeof popup.hidePopover==='function'&&popup.matches(':popover-open'))popup.hidePopover();}
function place(){if(!current)return;const a=current.getBoundingClientRect(),p=popup.getBoundingClientRect(),gap=10,w=doc.documentElement.clientWidth||innerWidth,h=innerHeight;popup.style.left=Math.max(gap,Math.min(a.left,w-p.width-gap))+'px';popup.style.top=Math.max(gap,Math.min(a.bottom+8,h-p.height-gap))+'px';}
function show(button,pin=false){clearTimeout(timer);const entry=entries.get(button);if(!entry||!entry.source.isConnected)return;const text=entry.source.textContent.trim();if(!text)return;if(current&&current!==button)current.setAttribute('aria-expanded','false');current=button;pinned=pin;title.textContent=entry.label;copy.textContent=text;const host=button.closest('dialog[open]')||doc.body;if(popup.parentElement!==host)host.append(popup);popup.hidden=false;if(typeof popup.showPopover==='function'){popup.setAttribute('popover','manual');if(!popup.matches(':popover-open'))popup.showPopover();}button.setAttribute('aria-expanded','true');place();}
function attach(source,label,anchor){if(!source||source.querySelector('button,input,select,textarea,a')||entriesHas(source))return;const button=doc.createElement('button');button.type='button';button.className='hx-help-trigger';button.innerHTML='<span aria-hidden="true">i</span><span class="hx-help-label"></span>';button.querySelector('.hx-help-label').textContent=label;button.setAttribute('aria-label',label+'，查看说明');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',popup.id);if(!source.id)source.id='hx-help-copy-'+(++serial);button.setAttribute('aria-describedby',source.id);entries.set(button,{source,label});source.classList.add('hx-help-copy');(anchor||source).insertAdjacentElement(anchor?'beforeend':'beforebegin',button);}
function entriesHas(source){for(const e of entries.values())if(e.source===source)return true;return false;}
function arrangeFilters(search){
 const legend=search.querySelector('#cargoFilter legend');if(legend&&legend.textContent!=='货物类型')legend.textContent='货物类型';
 const modes=search.querySelector('.n001-modes'),scope=search.querySelector('#n001Scope');
 if(modes&&scope&&!scope.closest('.hx-transport-scope')){const label=scope.closest('label')||doc.createElement('label');label.className='hx-transport-scope';const caption=doc.createElement('span');caption.textContent='显示';label.replaceChildren(caption,scope);scope.setAttribute('aria-label','运输方式显示范围');const names={inside:'未排除的方式',unknown:'仅其它方式',outside:'已排除的方式',all:'全部方式'};for(const option of scope.options)if(names[option.value])option.textContent=names[option.value];const last=[...modes.querySelectorAll('[data-transport]')].at(-1)||modes.lastElementChild;if(last)last.after(label);else modes.append(label);}
}
function scan(){
 for(const [button,e]of entries){if(!e.source.isConnected||!button.isConnected){if(current===button)close();button.remove();e.source.classList.remove('hx-help-copy');entries.delete(button);}}
 const heading=doc.querySelector('.heading');attach(doc.querySelector('.logicboundary'),'权限',heading);attach(doc.querySelector('.heading p'),'更新信息',heading);
 const search=doc.querySelector('#n001Search');if(search){
  arrangeFilters(search);
  const paragraphs=[...search.querySelectorAll('p')].filter(p=>!p.id&&!p.closest('#cargoFilter')&&!p.querySelector('button,a,input'));
  for(const p of paragraphs){const text=p.textContent;const transport=/点击切换|卡派、快递派/.test(text),score=/评分与评级分开|每个渠道初始/.test(text);attach(p,transport?'运输方式说明':score?'评分规则':'筛选指南',transport?search.querySelector('.n001-modes'):score?doc.querySelector('#n001Compare')?.parentElement:search.querySelector('h2'));}
 }
 for(const p of doc.querySelectorAll('#comparisonPanel>p.muted'))if(!p.id)attach(p,'表格与导出',doc.querySelector('#scoreViewControls')||p.parentElement.querySelector('h2'));
 for(const p of doc.querySelectorAll('main>p.muted:not([id]),#warehousePanel>p.muted:not([id]),#cooperation-app>.toolbar p,.section-head p'))attach(p,'使用说明',p.parentElement.querySelector('h2,h3'));
 attach(doc.querySelector('#retentionNote'),'数据保留',doc.querySelector('#warehousePanel h2'));
 // Only known explanatory success copy is folded; validation and conflict messages stay visible.
 const status=doc.querySelector('#n001Status');if(status){const text=status.textContent.trim(),safe=/^(基准5分与运营加减分已显示。|已按本次筛选评分：)/.test(text)&&!/存在冲突|没有可用归属|请核对档案/.test(text);if(safe)attach(status,'比较口径',doc.querySelector('#n001Compare')?.parentElement);for(const [button,e]of entries)if(e.source===status){status.classList.toggle('hx-help-copy',safe);button.hidden=!safe||!text;if(current===button){if(!safe)close();else if(copy.textContent!==text)show(button,pinned);}}}
 for(const [button,e]of entries){button.hidden=!e.source.textContent.trim()||e.source===status&&!e.source.classList.contains('hx-help-copy');if(current===button&&copy.textContent!==e.source.textContent.trim())show(button,pinned);}
}
doc.addEventListener('click',e=>{const button=e.target.closest('.hx-help-trigger');if(button){const was=current===button&&pinned;if(was)close();else show(button,true);}});
doc.addEventListener('pointerover',e=>{const button=e.target.closest('.hx-help-trigger');if(button&&!pinned)show(button);if(popup.contains(e.target))clearTimeout(timer);});
doc.addEventListener('pointerout',e=>{if(!pinned&&(e.target.closest('.hx-help-trigger')||popup.contains(e.target))&&!popup.contains(e.relatedTarget)&&!e.relatedTarget?.closest?.('.hx-help-trigger'))timer=setTimeout(close,180);});
doc.addEventListener('focusin',e=>{const button=e.target.closest('.hx-help-trigger');if(button)show(button);else if(!popup.contains(e.target))close();});
doc.addEventListener('pointerdown',e=>{if(!e.target.closest('.hx-help-trigger')&&!popup.contains(e.target))close();});
doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&current){const button=current,focused=popup.contains(doc.activeElement);close();if(focused){button.focus();close();}e.preventDefault();e.stopPropagation();}});
addEventListener('resize',close);doc.addEventListener('scroll',e=>{if(!popup.contains(e.target))close();},true);
let pending=false;new MutationObserver(records=>{if(records.every(r=>popup.contains(r.target)))return;if(!pending){pending=true;queueMicrotask(()=>{pending=false;scan();});}}).observe(doc.body,{childList:true,subtree:true,characterData:true});
window.WorkspaceHelp={refresh:scan,close};scan();
})();
