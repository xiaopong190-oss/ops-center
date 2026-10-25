(function(root){
 'use strict';
 const version='monthly-cooperation-review-1';
 function pageRows(rows,page=1,size=50){
  if(!Number.isInteger(size)||size<1||size>200)throw Error('每页数量须为1–200');
  const pages=Math.max(1,Math.ceil(rows.length/size));
  page=Math.min(pages,Math.max(1,Number.isInteger(page)?page:1));
  return {rows:rows.slice((page-1)*size,page*size),page,pages,total:rows.length};
 }
 function scope(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('请选择有效月份');}
 function balanceLabel(value){return value>0?'待付':value<0?'超付':'账面差额为零';}
 // Inputs must first pass the existing Domain validators. Display names are explicit,
 // so directory lookup and persistence remain outside this read-only projection.
 function projectBills(rows,{month,company='',name=r=>r.company}={}){
  scope(month);const groups=new Map(),references=new Map();
  const details=rows.filter(r=>r.date.slice(0,7)===month).map(r=>({...r,displayCompany:name(r)})).filter(r=>!company||r.displayCompany===company);
  for(const r of details){
   const key=JSON.stringify([r.displayCompany,r.currency]);
   if(!groups.has(key))groups.set(key,{company:r.displayCompany,currency:r.currency,count:0,amount:0,paid:0,outstanding:0,overpaid:0});
   const g=groups.get(key),delta=r.amount-r.paid;g.count++;g.amount+=r.amount;g.paid+=r.paid;g.outstanding+=Math.max(0,delta);g.overpaid+=Math.max(0,-delta);
   // Same reference can legitimately contain split charges. Flag only, never dedup.
   for(const [kind,value] of [['账单号',r.bill],['运单号',r.waybill]])if(value){const ref=JSON.stringify([r.displayCompany,r.currency,kind,value]);if(!references.has(ref))references.set(ref,[]);references.get(ref).push(r);}
  }
  const repeated=new Set();for(const list of references.values())if(list.length>1)for(const r of list)repeated.add(r);
  return {version,groups:[...groups.values()].map(g=>({...g,balance:g.amount-g.paid,status:balanceLabel(g.amount-g.paid)})),details:details.map(r=>({...r,balance:r.amount-r.paid,status:balanceLabel(r.amount-r.paid),review:repeated.has(r)?'同公司同币种同单多行，请核对分项或修订；未自动去重':''})),reviewCount:repeated.size};
 }
 function ratingEvidence(r){
  if(r.mode!=='rated')return {score:null,grade:'待评价',contributions:null};
  const contributions={price:r.price*3,time:r.time*4,coop:r.coop*3};
  const score=contributions.price+contributions.time+contributions.coop;
  return {score,contributions,grade:grade(score)};
 }
 function grade(n){return n>=90?'S':n>=80?'A':n>=70?'B':n>=60?'C':'D';}
 function projectRatings(records,{month,company='',name=r=>r.company}={}){
  scope(month);const details=records.filter(r=>r.finished.slice(0,7)===month).map(r=>({...r,displayCompany:name(r),...ratingEvidence(r)})).filter(r=>!company||r.displayCompany===company).sort((a,b)=>b.finished.localeCompare(a.finished));
  const companies=new Map(),channels=new Map();
  for(const r of details){for(const [map,key] of [[companies,JSON.stringify([r.displayCompany])],[channels,JSON.stringify([r.displayCompany,r.channel])]]){if(!map.has(key))map.set(key,[]);map.get(key).push(r);}}
  function summarize(list,channel){const rated=list.filter(r=>r.mode==='rated'),score=rated.length?Math.round(rated.reduce((s,r)=>s+r.score,0)/rated.length*10)/10:null;return {company:list[0].displayCompany,channel:channel?list[0].channel:'公司汇总',count:list.length,rated:rated.length,pending:list.length-rated.length,score,grade:score===null?'待评价':grade(score)};}
  return {version,completed:details.length,rated:details.filter(r=>r.mode==='rated').length,groups:[...[...companies.values()].map(v=>summarize(v,false)),...[...channels.values()].map(v=>summarize(v,true))],details};
 }
 const api={version,pageRows,projectBills,projectRatings,ratingEvidence};
 if(typeof module!=='undefined')module.exports=api;else root.MonthlyCooperationReview=api;
})(typeof window==='undefined'?globalThis:window);
