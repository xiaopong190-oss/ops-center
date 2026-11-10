import Q from '../tools/logistics-rating/quote-core.js';
import W from '../tools/logistics-rating/extensions/weekly-carryover.js';

// Aggregate only: never log quote evidence, prices, credentials or session state.
export function auditDisplay(data, now = new Date()) {
 const db=data.storage['logistics-quotes-v1'];
 const group=rows=>{
  const groups=new Map();
  for(const r of rows||[]){const id=r.companyId||r.company,key=JSON.stringify([id,r.company,r.date]);const item=groups.get(key)||{id,name:r.company,date:r.date,count:0};item.count++;groups.set(key,item)}
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.date.localeCompare(b.date));
 };
 const saved=db.weeklyCarryover;
 return {at:now.toISOString(),warehouse:group(db.quotes),regional:group(db.regionalQuotes),carryover:saved?{weekStart:saved.weekStart,sourceStart:saved.sourceStart,decidedOn:saved.decidedOn,choice:saved.choice,warehouse:group(saved.quotes),regional:group(saved.regionalQuotes)}:null,
  clocks:['UTC','America/Los_Angeles','Asia/Shanghai'].map(timeZone=>{
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now),retained=Q.prune(Q.canonical(db),today),effective=W.effective(retained,today);
   return {timeZone,today,week:effective.week,decided:effective.decided,current:effective.currentQuoteCount,warehouse:group(effective.quotes),regional:group(effective.regionalQuotes),carried:effective.carriedQuotes.length};
  })};
}
