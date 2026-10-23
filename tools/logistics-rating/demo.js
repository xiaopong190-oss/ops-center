(function(root){
 'use strict';const K={companies:'logistics-company-directory-v1',quotes:'logistics-quotes-v1',bills:'logistics-monthly-bills-v1',ratings:'logistics-completed-ratings-v1'};
 function day(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function read(storage,today){let get=(k,f)=>JSON.parse(storage.getItem(k)||JSON.stringify(f));return {companies:Domain.directory(get(K.companies,[])),quotes:QuoteCore.validate(get(K.quotes,{quotes:[],templates:[]})),bills:Domain.bills(get(K.bills,{rows:[],aliases:{}})),ratings:Domain.ratings(get(K.ratings,[]),today)};}
 function commit(storage,db){let prior=Object.fromEntries(Object.values(K).map(k=>[k,storage.getItem(k)])),done=[];try{for(let key of Object.keys(K)){storage.setItem(K[key],JSON.stringify(db[key]));done.push(K[key]);}}catch(e){for(let k of done.reverse()){try{if(prior[k]===null)storage.removeItem(k);else storage.setItem(k,prior[k]);}catch(ignore){}}throw Error('演示数据写入失败，请检查存储空间；已尝试还原已写入部分。');}}
 function seed(storage=localStorage,now=new Date()){
  const today=day(now),db=read(storage,today),names=['演示·海桥物流','演示·远航国际','演示·云速供应链'];
  let companies=names.map(name=>{let c=db.companies.find(c=>c.name===name||c.aliases.includes(name));if(!c){c={id:crypto.randomUUID(),name,aliases:[],imported:true,demo:true};db.companies.push(c);}c.imported=true;return c;});
  let specs=[['美国','海运','ont 8',[9.8,9.2,10.5],[32,38,29]],['美国','海运','LGB-8',[10.2,9.6,10.8],[34,39,30]],['美国','空运','ＯＮＴ８',[38,40,36.5],[10,9,8]],['德国','铁路','DTM 2',[16.5,15.8,17.2],[35,38,32]],['德国','海运','FRA7',[8.6,8.2,9.1],[45,49,40]],['英国','卡航','BHX4',[23,21.8,24.5],[23,26,21]]];
  let quotes=[];specs.forEach(([country,channel,warehouse,prices,days])=>companies.forEach((c,i)=>{let r=QuoteCore.normalize([c.name,country,channel,warehouse,prices[i],'CNY','kg',days[i]-4,days[i],today,'普货 / 含税 / 21kg起']);quotes.push({...r,companyId:c.id,demo:true,source:'【演示】物流商报价.csv',sourceRow:quotes.length+2});}));
  let real=db.quotes.quotes.filter(r=>!r.demo),templates=db.quotes.templates;
  let merged=QuoteCore.merge({...db.quotes,quotes:real,templates},quotes,today).db;db.quotes=merged;
  let bills=companies.flatMap((c,i)=>[0,1].map(j=>({company:c.name,companyId:c.id,date:today,bill:'DEMO-BILL-'+i+'-'+j,waybill:'DEMO-00'+(i*2+j+1),channel:j?'美国 · 空运':'美国 · 海运',warehouse:'ONT8',currency:'CNY',amount:[196000,184000,210000][i]+j*30000,paid:j?0:[196000,100000,210000][i],note:'【虚拟演示】'+(j?'未付款':'已付或部分付款'),source:'【演示】实际账单.csv',sourceRow:i*2+j+2,demo:true})));
  db.bills={...db.bills,rows:db.bills.rows.filter(r=>!r.demo).concat(bills)};
  let ratings=companies.flatMap((c,i)=>[0,1].map(j=>{let shipped=new Date(now);shipped.setDate(shipped.getDate()-(j?12:48));return {id:'demo-rating-suite-'+i+'-'+j,company:c.name,companyId:c.id,operator:['张敏','李晨','王悦'][i],shipment:'DEMO-00'+(i*2+j+1),channel:j?'美国 · 空运':'美国 · 海运',shipped:day(shipped),finished:today,mode:'rated',price:[8.5,9,8][i],time:[8,7,9.5][i],coop:[9,8,9.5][i],note:'【虚拟演示】合作完成后由负责运营评价。',demo:true};}));
  Domain.bills(db.bills);Domain.ratings(db.ratings.filter(r=>!r.demo).concat(ratings),today);db.ratings=db.ratings.filter(r=>!r.demo).concat(ratings);Domain.directory(db.companies);commit(storage,db);return {quotes:18,warehouses:5,bills:6,ratings:6};
 }
 function clear(storage=localStorage,now=new Date()){
  let db=read(storage,day(now)),realQuotes=db.quotes.quotes.filter(r=>!r.demo),refs=new Set(realQuotes.map(r=>JSON.stringify([r.country,r.warehouse])));
  db.quotes={...db.quotes,quotes:realQuotes,templates:db.quotes.templates.filter(t=>!t.demo||refs.has(JSON.stringify([t.country,t.warehouse])))};
  db.bills={...db.bills,rows:db.bills.rows.filter(r=>!r.demo)};db.ratings=db.ratings.filter(r=>!r.demo);
  let ids=new Set(realQuotes.concat(db.bills.rows,db.ratings).map(r=>r.companyId));db.companies=db.companies.filter(c=>!c.demo||ids.has(c.id));commit(storage,db);
 }
 root.Demo={seed,clear};
})(typeof window!=='undefined'?window:globalThis);
