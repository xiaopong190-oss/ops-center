(function(root){'use strict';
const M=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null);
const fields=['country','channel','currency','unit','tax','time','conditions'],encoder=new TextEncoder();
const names={country:'国家',channel:'渠道',currency:'币种',unit:'单位',tax:'税务',time:'时效',conditions:'货类及计费条件'};
function groupFindings(findings){const groups=new Map();for(const finding of findings){const key=JSON.stringify([finding.sheet,finding.field,finding.status,finding.current,finding.manual,finding.reason,finding.evidence]);if(!groups.has(key))groups.set(key,{...finding,priceCells:[]});const group=groups.get(key);if(!group.priceCells.includes(finding.priceCell))group.priceCells.push(finding.priceCell);}return [...groups.values()];}
const bytes=value=>encoder.encode(JSON.stringify(value)).length;
function candidateSnapshot(result){return JSON.stringify([...(result.records||[]),...(result.regionalRecords||[])].map(r=>[r.sourceSheet,r.priceCell,current(r)]));}
function candidateKeys(result){const keys=new Set();for(const record of [...(result.records||[]),...(result.regionalRecords||[])]){const c=current(record);for(const origin of [{sourceSheet:record.sourceSheet,priceCell:record.priceCell},...(record.sourceAliases||[])])keys.add(JSON.stringify([origin.sourceSheet,origin.priceCell,c]));}return keys;}
async function digest(value){const crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);if(!crypto?.subtle)throw Error('当前环境不能校验AI任务指纹，未宣称复核完成');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function current(record){const v=record.values,terms=String(v?v[10]:record.terms||'');return {country:String(v?v[1]:record.country||''),channel:String(v?v[2]:record.channel||''),currency:String(v?v[5]:record.currency||''),unit:String(v?v[6]:record.unit||''),tax:terms.match(/(?:^|[;；])条件=([^;；]*)/)?.[1]||'未注明',time:JSON.stringify({min:v?v[7]??null:record.min??null,max:v?v[8]??null:record.max??null,basis:record.timeBasis||'',unverified:record.timeUnverified!==false}),conditions:terms,manual:record.manualSourceFields===true};}
function indexed(sheet){return {rows:new Map(sheet.rows.map(r=>[r.row,r])),positions:new Map(sheet.rows.map((r,i)=>[r.row,i])),cells:new Map(sheet.rows.flatMap(r=>r.cells).map(c=>[c.cell,c])),blocks:M.scan(sheet)};}
function evidence(sheet,index,record,priceCell){
 const row=Number(priceCell.match(/\d+$/)?.[0]),column=priceCell.match(/^[A-Z]+/)?.[0];if(!row||!column||!index.cells.has(priceCell))return null;
 const chosen=new Map();let omittedCells=0,size=0;const add=c=>{if(!c||chosen.has(c.cell)||!String(c.v??'').trim())return;const v=String(c.v),cost=encoder.encode(v).length+40;if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)||v.length>2000||chosen.size>=160||size+cost>40000){omittedCells++;return}chosen.set(c.cell,{cell:c.cell,v});size+=cost;};
 add(index.cells.get(priceCell));for(const c of index.rows.get(row)?.cells||[])add(c);
 const anchors=[record.sourceChannelCell,record.sourceChannelHeaderCell,record.sourceTimeCell,record.sourceTimeHeaderCell,record.aiEvidence?.unitCell,record.aiEvidence?.channelCell,record.aiEvidence?.tierCell];for(const cell of anchors)add(index.cells.get(cell));
 const merges=[];for(const ref of sheet.merges||[]){const m=ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(m&&row>=+m[2]&&row<=+m[4]){add(index.cells.get(m[1]+m[2]));if(merges.length<60)merges.push(ref);else omittedCells++;}}
 const position=index.positions.get(row);for(const r of sheet.rows.slice(Math.max(0,position-4),position))for(const c of r.cells)add(c);
 const number=[...column].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),block=index.blocks.find(b=>row>b.header&&row<=b.end&&b.columns.some(c=>c.column===number));
 if(block)for(let n=Math.max(1,block.header-4);n<=block.header;n++)for(const c of index.rows.get(n)?.cells||[])add(c);
 for(const r of sheet.rows.slice(0,5))for(const c of r.cells)add(c);
 // Include header merge scopes too, without presenting remote cells as row-specific values.
 for(const ref of sheet.merges||[]){const anchor=ref.split(':')[0];if(chosen.has(anchor)&&!merges.includes(ref)){if(merges.length<60)merges.push(ref);else omittedCells++;}}
 return chosen.has(priceCell)?{cells:[...chosen.values()],merges,omittedCells}:null;
}
async function sourceBinding(model,meta){return digest({fileName:model.fileName,sheets:model.sheets.map(s=>({name:s.name,rows:s.rows,merges:s.merges||[],media:s.media||[]})),assets:model.assets||[],company:meta.company,date:meta.date,currency:meta.currency,allowedPriceCells:meta.allowedPriceCells||null,templates:meta.templates||[]});}
async function plan(model,result,meta,limits={}){
 const binding=await sourceBinding(model,meta);
 const sheets=new Map(model.sheets.map((s,i)=>[s.name,{sheet:s,index:indexed(s),i}])),groups=new Map(),held=[],maxItems=Math.max(1,Math.min(10000,limits.maxItems??10000));let beyond=0,visited=0;
 for(const record of [...(result.records||[]),...(result.regionalRecords||[])]){const c=current(record);for(const origin of [{sourceSheet:record.sourceSheet,priceCell:record.priceCell},...(record.sourceAliases||[])]){
  if(++visited%1000===0)await new Promise(resolve=>setTimeout(resolve,0));if(meta.allowedPriceCells&&!meta.allowedPriceCells.includes(origin.priceCell))continue;const key=JSON.stringify([origin.sourceSheet,origin.priceCell,c]);if(groups.has(key))continue;if(groups.size>=maxItems){beyond++;continue;}groups.set(key,{record,origin,current:c});
 }}
 if(beyond)held.push({sheet:'超出本次规划范围',priceCell:'',count:beyond,reason:'源引用超过10000项规划上限，请分文件核对，未宣称复核完成'});
 const items=[];for(const group of groups.values()){
  const source=sheets.get(group.origin.sourceSheet),proof=source&&evidence(source.sheet,source.index,group.record,group.origin.priceCell);
  if(!proof||fields.some(k=>group.current[k].length>600)){held.push({sheet:group.origin.sourceSheet,priceCell:group.origin.priceCell,reason:'源坐标或字段长度无法形成可核验请求'});continue;}
  const payload={sheet:group.origin.sourceSheet,priceCell:group.origin.priceCell,current:group.current,...proof};const id=source.i+':'+group.origin.priceCell+':'+await digest(payload);items.push({id,...payload});
  if(items.length%50===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {binding,items,held,unreadImages:model.sheets.reduce((n,s)=>n+(s.media||[]).length,0)};
}
function validate(items,data){
 if(!data||Object.keys(data).some(k=>k!=='items')||!Array.isArray(data.items)||data.items.length!==items.length)throw Error('AI字段复核数量不匹配');const ids=new Set();
 return data.items.map(answer=>{const item=items.find(i=>i.id===answer?.id);if(!item||ids.has(answer.id)||Object.keys(answer).some(k=>!['id','checks'].includes(k))||!Array.isArray(answer.checks)||answer.checks.length!==fields.length)throw Error('AI字段复核标识不匹配');ids.add(answer.id);const seen=new Set(),cells=new Set(item.cells.map(c=>c.cell));
  for(const check of answer.checks){if(!check||Object.keys(check).some(k=>!['field','status','cells','reason'].includes(k))||!fields.includes(check.field)||seen.has(check.field)||!['consistent','mismatch','uncertain'].includes(check.status)||typeof check.reason!=='string'||!check.reason.trim()||check.reason.length>300||!Array.isArray(check.cells)||check.cells.length>8||new Set(check.cells).size!==check.cells.length||check.cells.some(c=>!cells.has(c)||c===item.priceCell)||check.status!=='uncertain'&&!check.cells.length)throw Error('AI字段复核引用缺少源证据');seen.add(check.field);}return {id:answer.id,checks:answer.checks.map(c=>({...c,cells:c.cells.slice()}))};
 });
}
function summary(planned,answers,status,reason=''){
 const byId=new Map(answers.map(a=>[a.id,a])),findings=[];let completed=0;for(const item of planned.items){const answer=byId.get(item.id);if(!answer)continue;completed++;const raw=new Map(item.cells.map(c=>[c.cell,c.v]));for(const check of answer.checks)if(check.status!=='consistent')findings.push({id:item.id,sheet:item.sheet,priceCell:item.priceCell,field:check.field,label:names[check.field],status:check.status,current:item.current[check.field],manual:item.current.manual,reason:check.reason,evidence:check.cells.map(cell=>({cell,raw:raw.get(cell)}))});}
 if(status==='completed'&&planned.held.length){status='partial';reason='部分源坐标或字段无法组成可核验请求，需人工核对';}
 return {rule:'semantic-quote-review-v1',binding:planned.binding,status,reason,planned:planned.items.length,completed,remaining:planned.items.length-completed,held:planned.held,heldCount:planned.held.reduce((n,h)=>n+(h.count||1),0),unreadImages:planned.unreadImages,findings,answers};
}
async function review(model,result,meta,onProgress=()=>{},options={}){
 const planned=await plan(model,result,meta),old=result.semanticReview,answers=[];
 if(old?.binding===planned.binding)for(const item of planned.items){const prior=old.answers?.find(a=>a.id===item.id);if(prior)try{answers.push(...validate([item],{items:[prior]}))}catch{}}
 const pending=planned.items.filter(i=>!answers.some(a=>a.id===i.id));let status='completed',reason='',requests=0;const start=Date.now(),budgetMs=options.budgetMs??60000,maxRequests=options.maxRequests??4;
 const token=root.localStorage?.getItem('ops-cloud-session-v1');
 if(pending.length&&(root.LogisticsSpace?.isDemo||!token)){return {...result,semanticReview:summary(planned,answers,'unavailable',root.LogisticsSpace?.isDemo?'演示空间不调用AI':'未登录，已生成报价尚未进行AI字段复核')};}
 const endpoint=root.location?.hostname==='127.0.0.1'?'/local-ai-cleaning':'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-ai/recognize';
 for(let offset=0;offset<pending.length;){
  if(options.isCurrent&&!options.isCurrent()||options.signal?.aborted){status='partial';reason='AI字段复核已暂停，剩余任务可继续';break;}
  if(Date.now()-start>=budgetMs||requests>=maxRequests){status='partial';reason='本轮字段复核预算已到，剩余任务可继续';break;}
  const items=[];while(offset+items.length<pending.length&&items.length<6){const next=pending[offset+items.length];if(items.length&&bytes({purpose:'quote-field-audit',items:[...items,next]})>180000)break;items.push(next);}
  try{requests++;const timeout=AbortSignal.timeout(Math.max(1,Math.min(35000,budgetMs-(Date.now()-start)))),signal=options.signal&&AbortSignal.any?AbortSignal.any([options.signal,timeout]):timeout;
   const response=await root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({purpose:'quote-field-audit',items}),signal});if(!response.ok)throw Error(response.status===429?'AI每日额度或请求频率受限；进度保留':response.status===401?'登录已失效；进度保留':'AI字段复核暂不可用（HTTP '+response.status+'）');const text=await response.text();if(text.length>150000)throw Error('AI字段复核响应过大');const verified=validate(items,JSON.parse(text));
   if(options.isCurrent&&!options.isCurrent()||options.signal?.aborted){status='partial';reason='AI字段复核已暂停，本次未确认返回未计入完成';break;}
   const sourceSame=await sourceBinding(model,meta)===planned.binding,keys=candidateKeys(result),valid=verified.filter(a=>{const item=items.find(i=>i.id===a.id);return sourceSame&&keys.has(JSON.stringify([item.sheet,item.priceCell,item.current]));});
   if(options.isCurrent&&!options.isCurrent()||options.signal?.aborted){status='partial';reason='AI字段复核已暂停，进度保留';break;}
   answers.push(...valid);if(valid.length!==verified.length){status='partial';reason='源数据或候选字段已变化，变化项需重新复核';break;}offset+=items.length;onProgress(summary(planned,answers,'running'));
  }catch(error){status='partial';reason=options.signal?.aborted?'AI字段复核已暂停，进度保留':error.message||'AI字段复核失败，进度保留';break;}
 }
 // A field edited during an in-flight request must not inherit a stale “consistent” mark.
 const latest=await plan(model,result,meta),keys=candidateKeys(result);const valid=answers.filter(a=>{const item=latest.items.find(i=>i.id===a.id);return latest.binding===planned.binding&&item&&keys.has(JSON.stringify([item.sheet,item.priceCell,item.current]));});if(valid.length!==answers.length){status='partial';reason='源数据或候选字段已变化，变化项需重新复核';}
 return {...result,semanticReview:summary(latest,valid,status,reason)};
}
const api={fields,current,candidateSnapshot,groupFindings,evidence,sourceBinding,plan,validate,summary,review};root.SemanticQuoteReview=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
