(function(root){'use strict';
 const Q=root.QuoteCore||(typeof require==='function'?require('../quote-core.js'):null);
 const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
 function weeks(today){const current=Q.weekWindow(today);return {...current,previousStart:shift(current.start,-7),previousEnd:shift(current.start,-1)}}
 const provider=(row,resolve=()=>null)=>row.companyId||resolve(row.company)||row.company;
 const usable=row=>!row.conflict&&!row.comparisonIssue&&!row.geographyUnresolved&&!row.warehouseCountryConflict&&!row.carryover&&Number.isFinite(row.price)&&row.price>0;
 function validate(db){const saved=db.weeklyCarryover;if(saved===undefined)return db;
  if(!saved||saved.schema!==1||!['keep','skip'].includes(saved.choice)||!Array.isArray(saved.quotes)||!Array.isArray(saved.regionalQuotes))throw Error('上周沿用记录格式无效');
  const w=weeks(saved.decidedOn);if(saved.weekStart!==w.start||saved.sourceStart!==w.previousStart)throw Error('上周沿用日期范围无效');
  Q.validate({quotes:saved.quotes,regionalQuotes:saved.regionalQuotes,templates:[]});
  for(const row of [...saved.quotes,...saved.regionalQuotes])if(row.date<w.previousStart||row.date>w.previousEnd||!usable(row))throw Error('只允许沿用紧邻上周的有效原始报价，不可连续滚动续期');
  return db;
 }
 const deleted=db=>new Set((db.deletedQuotes||[]).map(Q.identity));
 function candidates(db,today){const w=weeks(today),saved=validate(db).weeklyCarryover,known=saved?.weekStart===w.start?saved:null;
  const excluded=deleted(db),collect=field=>{const unique=new Map();for(const row of [...(db[field]||[]),...(known?.[field]||[])])if(usable(row)&&(field!=='quotes'||!excluded.has(Q.identity(row)))&&row.date>=w.previousStart&&row.date<=w.previousEnd)unique.set(JSON.stringify(row),row);return [...unique.values()]};
  return {...w,quotes:collect('quotes'),regionalQuotes:collect('regionalQuotes')};
 }
 function choose(db,today,choice){if(!['keep','skip'].includes(choice))throw Error('请选择是否沿用上周报价');const c=candidates(db,today),prior=db.weeklyCarryover?.weekStart===c.start?db.weeklyCarryover:null;
  const next={...db,weeklyCarryover:{schema:1,weekStart:c.start,sourceStart:c.previousStart,decidedOn:today,choice,quotes:choice==='keep'?c.quotes:prior?.quotes||[],regionalQuotes:choice==='keep'?c.regionalQuotes:prior?.regionalQuotes||[]}};validate(next);return next;
 }
 const projections=new WeakMap();
 function effective(db,today){const prior=projections.get(db);if(prior?.today===today&&prior.quotes===db.quotes&&prior.regionalQuotes===db.regionalQuotes&&prior.saved===db.weeklyCarryover&&prior.deleted===db.deletedQuotes)return prior.result;validate(db);const w=weeks(today),saved=db.weeklyCarryover,quotes=Q.weekQuotes(db.quotes||[],today),regionalQuotes=Q.weekQuotes(db.regionalQuotes||[],today),currentProviders=new Set([...quotes,...regionalQuotes].filter(usable).map(row=>provider(row)));
  const decided=saved?.weekStart===w.start,active=decided&&saved.choice==='keep';
  const excluded=active?deleted(db):null;
  const carry=field=>active?saved[field].filter(row=>!currentProviders.has(provider(row))&&(field!=='quotes'||!excluded.has(Q.identity(row)))).map(row=>({...row,carryover:{weekStart:w.start,sourceDate:row.date,sourceWeekStart:saved.sourceStart}})):[];
  const carriedQuotes=carry('quotes'),carriedRegions=carry('regionalQuotes');
  const result={decided,currentQuoteCount:quotes.length,quotes:quotes.concat(carriedQuotes),regionalQuotes:regionalQuotes.concat(carriedRegions),carriedQuotes,carriedRegions,providers:[...new Set([...carriedQuotes,...carriedRegions].map(row=>row.company))],week:w};projections.set(db,{today,quotes:db.quotes,regionalQuotes:db.regionalQuotes,saved:db.weeklyCarryover,deleted:db.deletedQuotes,result});return result;
 }
 function replaceProviders(db,rows,resolve,today){const saved=db.weeklyCarryover;if(!saved||saved.weekStart!==weeks(today).start)return db;const ids=new Set(Q.weekQuotes(rows,today).filter(usable).map(row=>provider(row,resolve)));if(!ids.size)return db;validate(db);return {...db,weeklyCarryover:{...saved,quotes:saved.quotes.filter(row=>!ids.has(provider(row,resolve))),regionalQuotes:saved.regionalQuotes.filter(row=>!ids.has(provider(row,resolve)))}}}
 function shouldAsk(db,today){if(db.weeklyCarryover?.weekStart===weeks(today).start)return false;const c=candidates(db,today);return c.quotes.length+c.regionalQuotes.length>0}
 function message(db,today){const e=effective(db,today);return '本周 '+e.week.start+' 至 '+e.week.end+'：本周及沿用仓库报价 '+e.quotes.length+' 条，其中沿用上周 '+e.carriedQuotes.length+' 条；原始日期保留。'}
 function label(row,text){return text+(row.carryover?' · 沿用上周（'+row.date+'）':'')}
 const api={weeks,candidates,choose,effective,replaceProviders,shouldAsk,validate,label,message};if(typeof module!=='undefined')module.exports=api;root.WeeklyCarryover=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
