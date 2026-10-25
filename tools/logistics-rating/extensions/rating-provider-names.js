(function(root){
 'use strict';
 function parseDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('名称日期无效');const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));if(date.toISOString().slice(0,10)!==value)throw Error('名称日期无效');return date;}
 function cutoffDay(asOf,mode){const date=parseDay(asOf),y=date.getUTCFullYear(),m=date.getUTCMonth();if(mode==='calendar-months')return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10);if(mode!=='rolling-months')throw Error('须明确三个月口径');const end=new Date(Date.UTC(y,m-2,0)).getUTCDate();return new Date(Date.UTC(y,m-3,Math.min(date.getUTCDate(),end))).toISOString().slice(0,10);}
 // Names only: no quotation details or cooperation fields are accepted in output.
 // Missing dates are reported separately until an explicit migration policy is agreed.
 function projectRatingProviderNames(directory,{asOf,mode}){
  const cutoff=cutoffDay(asOf,mode),eligible=[],expired=[],unknown=[];
  for(const company of directory){if(!company.imported)continue;const name={id:company.id,name:company.name},lastSeen=company.ratingNameLastSeenOn;if(!lastSeen){unknown.push(name);continue;}parseDay(lastSeen);if(lastSeen>asOf)throw Error('名称日期晚于核验日期');(lastSeen>=cutoff?eligible:expired).push(name);}
  return {asOf,cutoff,eligible,expired,unknown};
 }
 const initialGraceOn='2026-10-25',initialIds=new Set(['5ef8c9d1-c14f-41e4-a9a4-f32c5c842737','41483751-cb88-4681-a85b-163e4e5abebc','ae0642fd-8556-4803-b472-8d2e83f91bf4','2fe1e1d5-4c0b-4b2c-b1bd-2412276dfd11','5f6652e0-8753-4db8-a4c5-1446bc2ba175']);
 function eligibleRatingNames(directory,asOf){return projectRatingProviderNames(directory.map(c=>({...c,ratingNameLastSeenOn:c.ratingNameLastSeenOn||(initialIds.has(c.id)?initialGraceOn:undefined)})),{asOf,mode:'rolling-months'});}
 function stageNameImports(directory,ids,day,eventId){parseDay(day);if(!eventId)throw Error('缺少名称入库事件编号');const seen=new Set(ids);return directory.map(c=>seen.has(c.id)?{...c,ratingNamePendingImport:{day,eventId}}:{...c});}
 // Prepare metadata in the upload payload. Local eligibility is unchanged until receipt.
 function prepareConfirmedNames(directory,confirmedOn){parseDay(confirmedOn);return directory.map(c=>{const pending=c.ratingNamePendingImport;if(!pending)return {...c};parseDay(pending.day);if(!pending.eventId)throw Error('名称入库事件异常');const next={...c,ratingNameLastSeenOn:[c.ratingNameLastSeenOn||'',confirmedOn].sort().at(-1)};delete next.ratingNamePendingImport;return next;});}
 function acknowledgeNames(current,submitted,confirmed){const before=new Map(submitted.map(c=>[c.id,c])),after=new Map(confirmed.map(c=>[c.id,c]));return current.map(c=>{const a=after.get(c.id),b=before.get(c.id);if(!a?.ratingNameLastSeenOn)return {...c};const next={...c,ratingNameLastSeenOn:[c.ratingNameLastSeenOn||'',a.ratingNameLastSeenOn].sort().at(-1)};if(JSON.stringify(c.ratingNamePendingImport)===JSON.stringify(b?.ratingNamePendingImport))delete next.ratingNamePendingImport;return next;});}
 function retainCooperations(records,asOf){const cutoff=cutoffDay(asOf,'rolling-months');const kept=[],expired=[];for(const r of records){parseDay(r.finished);(r.finished>=cutoff?kept:expired).push({...r});}return {kept,expiredCount:expired.length,cutoff};}
 const api={cutoffDay,projectRatingProviderNames,eligibleRatingNames,stageNameImports,prepareConfirmedNames,acknowledgeNames,retainCooperations,initialGraceOn};if(typeof module!=='undefined')module.exports=api;else root.RatingProviderNames=api;
})(typeof window==='undefined'?globalThis:window);
