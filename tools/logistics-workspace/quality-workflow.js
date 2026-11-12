(function(root){'use strict';
const params=new URLSearchParams(location.search),view=params.get('access')==='view'||params.get('audience')==='display',day=()=>new Date().toLocaleDateString('sv-SE');let busy=false,last=null;
const style=document.createElement('style');style.textContent='#importExceptionPanel,#importEvidencePanel,#bulkCleanAdoption{display:none!important}#quoteQualitySummary{padding:12px 16px}#quoteQualitySummary summary{cursor:pointer;line-height:1.6;font-weight:600}#quoteQualitySummary summary span{display:inline-block;margin-left:12px;font-size:12px;font-weight:400;color:#617493}#quoteQualitySummary details>p{margin:10px 0;line-height:1.6}';document.head.append(style);
const panel=document.createElement('section');panel.id='quoteQualitySummary';panel.className='card';panel.setAttribute('role','status');const host=document.getElementById('importExceptionPanel')||document.getElementById('comparisonPanel');if(host)host.before(panel);else document.body.append(panel);
function render(db,error){
 const providers=db.quoteDataQuality?.providers||[];
 panel.hidden=!providers.length&&!error;if(panel.hidden)return;
 const wasOpen=panel.querySelector('details')?.open||false;
 panel.replaceChildren();
 if(error){
  const title=document.createElement('h3');title.textContent='异常归档尚未保存';panel.append(title);
  const text=document.createElement('p');text.textContent=error+'；完成或取消当前导入预览后将自动重试。';panel.append(text);return;
 }
 const details=document.createElement('details');details.open=wasOpen;
 const summary=document.createElement('summary');summary.append('异常已留档，有效报价可继续使用');
 const hint=document.createElement('span');
 const updateHint=()=>{hint.textContent=providers.length+' 家物流商 · '+(details.open?'收起详情':'展开详情')};
 updateHint();details.addEventListener('toggle',updateHint);summary.append(hint);details.append(summary);
 const note=document.createElement('p');note.textContent='报价资料质量：5分起，每类问题扣0.1分，最多扣1分；同类不按条数重复扣。异常价格不参与比价，原文留在本地备份中。';details.append(note);
 for(const provider of providers){const p=document.createElement('p');p.textContent=provider.company+'：资料质量 '+provider.score.toFixed(1)+'分（扣 '+provider.deduction.toFixed(1)+'分） · '+provider.reasons.map(r=>r.reason+' '+r.count+'条'+(r.penalty?'（−'+r.penalty.toFixed(1)+'）':'（不扣分）')).join('；');details.append(p)}
 const unresolved=providers.reduce((n,p)=>n+p.reasons.filter(r=>r.penalty>0).reduce((n,r)=>n+r.count,0),0);
 if(unresolved){const warning=document.createElement('div');warning.className='quality-unresolved-warning';warning.setAttribute('role','alert');warning.style.cssText='border-left:4px solid #b45309;background:#fffbeb;color:#78350f;padding:12px;margin-bottom:12px';const strong=document.createElement('strong');strong.textContent='注意：'+unresolved+' 条异常报价仍未恢复为可用报价';const p=document.createElement('p');p.textContent='这些异常已按现有规则自动留档，不参与查询或比价。“待处理为0”不表示问题已解决，请核对原表后重新导入。';warning.append(strong,p);panel.append(warning);}
 const rawIssues=(db.importExceptions||[]).filter(e=>e.status==='ignored'&&e.decision?.qualityRule===root.QuoteDataQuality.version&&root.QuoteDataQuality.classify(e).penalty>0&&e.date<=day()&&e.date>=(root.QuoteCore?.cutoff(day())||'0000-01-01'));
 if(!view&&rawIssues.length){const evidence=document.createElement('details');evidence.className='quality-source-issues';const summary=document.createElement('summary');summary.textContent='查看异常报价来源（'+rawIssues.length+'条）';evidence.append(summary);for(const item of rawIssues.slice(0,30)){let raw;try{raw=JSON.parse(item.raw)}catch{raw={}}const p=document.createElement('p');p.textContent=[raw.company||raw.values?.[0],raw.sourceSheet,raw.priceCell||('第'+(raw.sourceRow||'?')+'行'),item.reason].filter(Boolean).join(' · ');evidence.append(p)}if(rawIssues.length>30){const p=document.createElement('p');p.textContent='其余异常原文保留在本地备份中。';evidence.append(p)}panel.append(evidence);}
 panel.append(details);
}
async function run(){const store=root.ComparisonStore;if(!store||busy)return;const db=store.read();if(last===db)return;busy=true;try{if(view){render(db);last=db;return}await root.Domain.withWriteLock(async()=>{const base=store.read(),archived=root.QuoteDataQuality.archive(base,{today:day()}),next=root.OriginExclusions?root.OriginExclusions.cleanDatabase(archived,day()):archived;if(next.originExcludedQuotes!==archived.originExcludedQuotes||JSON.stringify(base.quoteDataQuality)!==JSON.stringify(next.quoteDataQuality)||(base.importExceptions||[]).some(root.ImportResolution.pending)){store.commit(next);last=next;await root.LocalQuoteStore?.flush()}else last=base;render(store.read())})}catch(error){render(store.read(),error.message)}finally{busy=false}}
root.WorkspaceQuality={run};
})(window);
