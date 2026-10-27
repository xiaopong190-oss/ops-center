(function(root){'use strict';
 const Q=root.QuoteCore||(typeof require==='function'?require('../quote-core.js'):null),R=root.ImportResolution||(typeof require==='function'?require('../import-resolution.js'):null),D=root.Domain||(typeof require==='function'?require('../domain.js'):null);
 const rules={lowest:'同条件取最低价',highest:'同条件取最高价','latest-lowest':'取最新报价日期，同日取最低价','latest-highest':'取最新报价日期，同日取最高价'};
 const eligible=e=>e.kind==='regional'&&R.pending(e)&&/同批区域报价条件相同但价格冲突/.test(e.reason),source=e=>JSON.parse(e.raw),manual=e=>!R.pending(e)&&['confirm','edit','ignore'].includes(e.decision?.action);
 function previewBulkCleanAdoption(db,{rule,today,directory,actor='',operationId='',at=new Date().toISOString()}={}){
  if(!Object.hasOwn(rules,rule))throw Error('请先明确批量选价规则，不会默认取第一条价格');D.date(today);D.directory(directory||[]);Q.validate(db);
  const byName=new Map();for(const c of directory||[])for(const n of [c.id,c.name,...c.aliases])byName.set(D.clean(n),c.id);
  const resolveId=name=>{const id=byName.get(D.clean(name));if(!id)throw Error('服务商尚未确认到全局档案，请先核对名称');return id};
  const grouped=new Map(),skipped=[];const scope=e=>{const x=source(e);return JSON.stringify([Q.regionalScope(x),rule.startsWith('latest-')?'':x.date])};
  for(const e of db.importExceptions||[])if(eligible(e)){let id;try{id=scope(e)}catch(error){skipped.push({count:1,reason:'原始证据损坏，不能批量确认'});continue}if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(e)}
  const protectedScopes=new Set();for(const e of db.importExceptions||[])if(e.kind==='regional'&&manual(e))try{protectedScopes.add(scope(e))}catch{}
  const changes=new Map(),accepted=[],choices=[];
  for(const [id,items] of grouped){
   if(protectedScopes.has(id)){skipped.push({count:items.length,reason:'同组已有明确人工决定，保留原决定'});continue}
   const candidates=[];let invalid='';
   for(const e of items)try{const miniature=R.resolve({quotes:[],templates:[],importExceptions:[e]},[R.key(e)],'confirm',{},today,actor,resolveId),row=miniature.db.regionalQuotes[0];candidates.push({item:e,row})}catch(error){invalid=error.message;break}
   if(invalid||!candidates.length){skipped.push({count:items.length,reason:invalid||'没有有效清洗报价'});continue}
   const latest=rule.startsWith('latest-')?candidates.reduce((d,c)=>c.row.date>d?c.row.date:d,''):null;
   const pool=latest?candidates.filter(c=>c.row.date===latest):candidates;
   const direction=rule==='highest'||rule==='latest-highest'?-1:1;
   pool.sort((a,b)=>direction*(a.row.price-b.row.price)||R.key(a.item).localeCompare(R.key(b.item)));
   const chosen=pool[0],mini={quotes:[],templates:[],importExceptions:items};let result=R.resolve(mini,[R.key(chosen.item)],'confirm',{},today,actor,resolveId);
   // The original resolver ignores same-date alternatives. A latest-date policy
   // explicitly ignores remaining older-date alternatives through that same API.
   const remaining=result.db.importExceptions.filter(R.pending);if(remaining.length)result=R.resolve(result.db,remaining.map(R.key),'ignore',{},today,actor,resolveId);
   for(const e of result.db.importExceptions)changes.set(R.key(e),{...e,decision:{...e.decision,bulk:{rule,operationId,at}}});
   accepted.push(chosen.row);choices.push({key:R.key(chosen.item),company:chosen.row.company,country:chosen.row.country,region:chosen.row.regionRaw,channel:chosen.row.channel,price:chosen.row.price,currency:chosen.row.currency,unit:chosen.row.unit,date:chosen.row.date,alternatives:items.length-1});
  }
  const next={...db,regionalQuotes:Q.mergeRegional(db.regionalQuotes||[],accepted),importExceptions:(db.importExceptions||[]).map(e=>changes.get(R.key(e))||e)};
  Q.validate(next);const coverage=Q.assertImportCoverage(next,[],accepted),ignored=[...changes.values()].filter(e=>e.status==='ignored').length;
  return {db:next,rule,ruleLabel:rules[rule],choices,adopted:accepted.length,ignored,processed:changes.size,remaining:(next.importExceptions||[]).filter(eligible).length,skipped,coverage,companyIds:[...new Set(accepted.map(r=>r.companyId))]};
 }
 const api=Object.freeze({rules,eligible,previewBulkCleanAdoption});root.BulkCleanAdoption=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
