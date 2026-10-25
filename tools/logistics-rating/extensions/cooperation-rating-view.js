(function(root){
 'use strict';
 const score=r=>r.mode==='rated'?r.price*3+r.time*4+r.coop*3:null;
 const grade=n=>n===null?'待评价':n>=90?'S':n>=80?'A':n>=70?'B':n>=60?'C':'D';
 function summarize(rows){
  const rated=rows.filter(r=>r.mode==='rated'),average=key=>rated.length?Math.round(rated.reduce((s,r)=>s+key(r),0)/rated.length*10)/10:null;
  const value=average(score);
  return {completed:rows.length,rated:rated.length,pending:rows.length-rated.length,score:value,grade:grade(value),coverage:rows.length?Math.round(rated.length/rows.length*100):null,price:average(r=>Number(r.price)),time:average(r=>Number(r.time)),coop:average(r=>Number(r.coop))};
 }
 function companyRatingView(records,{month,companyId,channel='',status='all',query='',page=1,pageSize=8}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('月份无效');
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>200)throw Error('每页数量无效');
  if(!Number.isInteger(page))page=1;
  const monthRows=records.filter(r=>r.finished.slice(0,7)===month),byCompany=new Map();
  for(const r of monthRows){if(!byCompany.has(r.companyId))byCompany.set(r.companyId,[]);byCompany.get(r.companyId).push(r);}
  const companies=[...byCompany].map(([id,rows])=>({id,name:rows[0].company,...summarize(rows)}));
  const history=records.filter(r=>r.companyId===companyId),current=monthRows.filter(r=>r.companyId===companyId);
  const months=[...new Set(history.map(r=>r.finished.slice(0,7)))].filter(m=>m<=month).sort().slice(-6);
  const needle=query.normalize('NFKC').trim().toUpperCase();
  const filtered=current.filter(r=>(!channel||r.channel===channel)&&(status==='all'||r.mode===status)&&(!needle||[r.shipment,r.operator,r.note].some(v=>String(v||'').normalize('NFKC').toUpperCase().includes(needle)))).sort((a,b)=>b.finished.localeCompare(a.finished)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.max(1,Math.min(pages,page));
  return {overview:summarize(monthRows),companies,selected:summarize(current),channels:[...new Set(current.map(r=>r.channel))],trend:months.map(m=>({month:m,...summarize(history.filter(r=>r.finished.slice(0,7)===m))})),rows:filtered.slice((page-1)*pageSize,page*pageSize),page,pages,total:filtered.length};
 }
 // In-memory design interaction only. Validate the complete next snapshot before return.
 function simulateRatingSave(records,record,validate){const next=records.filter(r=>r.id!==record.id).concat({...record});validate(next);return next;}
 const api={score,grade,summarize,companyRatingView,simulateRatingSave};if(typeof module!=='undefined')module.exports=api;else root.CooperationRatingView=api;
})(typeof window==='undefined'?globalThis:window);
