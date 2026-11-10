/* Public presentation only. Local detail view and saved business records stay intact. */
(function(){'use strict';
 const params=new URLSearchParams(location.search);
 if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&params.get('publicPreview')!=='1')return;
 if(params.get('presentation')!=='public'||params.get('audience')!=='display'||params.get('access')!=='view')return;
 document.documentElement.dataset.presentation='public';
 const style=document.createElement('style');style.textContent=`
 html[data-presentation="public"] :is(#quoteQualitySummary,#importExceptionPanel,#importEvidencePanel,#quoteDiagnostics,#ratingSummary,#scenarioRating,.n001-manage,.comparison-notes,#importPanel,.hx-help-trigger,#n001AIStatus,#n001Counts,#n001Status[data-public-info],#scoreViewMessage,#exportChannelScores,[data-evidence],[data-score-edit],#retentionNote,#quoteStats){display:none!important}
 html[data-presentation="public"] .comparison-results-heading{gap:12px}
 html[data-presentation="public"] .comparison-results{margin-top:16px}
 html[data-presentation="public"] #comparison td>details{display:none}
 html[data-presentation="public"] #comparison .warehouse-group td:nth-child(9)>details{display:none}
 html[data-presentation="public"] #weekWarning:empty{display:none}
 html[data-presentation="public"] #regional-query-panel :is(th:last-child,td:last-child){display:none}
 html[data-presentation="public"] .result-transport-filter{font-weight:600}
 html[data-presentation="public"] #scoreViewControls{border-radius:8px;gap:8px}
 `;document.head.append(style);
 const set=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text};
 function simplify(){
  const actionStatus=document.getElementById('n001Status');if(actionStatus){const info=/^(基准5分|已按本次筛选评分：)/.test(actionStatus.textContent)||!actionStatus.textContent;actionStatus.toggleAttribute('data-public-info',info);if(!info)actionStatus.classList.remove('hx-help-copy');}
  for(const error of document.querySelectorAll('body>.notice[role=alert]')){if(error.querySelector('button'))continue;set(error,'暂时无法加载报价，请使用页面上方的“重新加载”。');}
  set(document.getElementById('n001Compare'),'比较价格与评分');
  set(document.getElementById('scoreApply'),'筛选分数');set(document.getElementById('scoreClear'),'清除分数');
  const mode=document.querySelector('#scoreViewMode option[value="grouped"]');set(mode,'按仓库查看');
  set(document.querySelector('#scoreViewMode option[value="score"]'),'按分数查看');
  const page=document.getElementById('n001Page');if(page){const text=page.textContent.split('，表头筛选')[0];set(page,text)}
  const week=document.getElementById('weekWarning');if(week){const text=week.textContent;const match=text.match(/本周 (\d{4}-\d{2}-\d{2}) 至 (\d{4}-\d{2}-\d{2})/);if(match)set(week,'报价日期：'+match[1]+' 至 '+match[2]+'（北京时间）');}
  const region=document.getElementById('regional-query-panel');if(region){const note=region.querySelector(':scope>p');set(note,'选择仓库后，仅显示原文明确覆盖该仓库的区域报价。');const status=region.querySelector('[data-region-status]');if(status){const count=status.textContent.match(/当前匹配 (\d+) 条/);if(count)set(status,count[1]==='0'?'没有匹配报价，请调整筛选。':'匹配 '+count[1]+' 条报价');}const coverage=region.querySelector('[data-region-coverage-label]');if(coverage)coverage.hidden=true;}
 }
 let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;simplify()})}});observer.observe(document.body,{childList:true,subtree:true,characterData:true});simplify();addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
