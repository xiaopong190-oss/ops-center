import {demoShops,demoPurchases} from '../demo-catalog.mjs';

export const profiles=demoShops.map(s=>({id:s.sid,accountId:s.sid,accountName:s.name,marketplace:s.site,
  currency:s.currency,timezone:s.timezone,minorUnits:2}));
export function demoPerformance(products,rows){
  return products.flatMap(p=>{
    const purchases=demoPurchases.filter(o=>o.product===p.id);
    const attribution=new Set(purchases.filter(o=>o.ad).map(o=>o.orderId));
    const adDate=purchases.find(o=>o.ad)?.date;
    const days=new Map();
    for(const row of rows.filter(r=>r.sid===p.sid && r.asin===p.asin && r.sku===p.sku)){
      const date=row.date.slice(0,10);
      const period=days.get(date) || {id:p.id+'-'+date,linkId:p.id,from:date,to:date,units:0,sales:0,
        adOrders:0,adSales:0,adSpend:date===adDate?p.adSpend:0,attributed:new Set()};
      period.units+=row.quantity;
      period.sales+=row.sales;
      if(attribution.has(row.orderId)){
        period.attributed.add(row.orderId);
        period.adSales+=row.sales;
      }
      days.set(date,period);
    }
    return [...days.values()].map(({attributed,...period})=>({...period,adOrders:attributed.size}));
  });
}
export function adWorkspace(master,sid){
  const profile=profiles.find(s=>s.id===sid);
  if(!profile)return null;
  const inventory={campaigns:{},groups:{},products:{},ads:{},targets:{},searchTerms:[],negatives:{}};
  for(const p of master.products.filter(p=>p.sid===sid)){
    const periods=master.performance.filter(r=>r.linkId===p.id);
    const total=k=>periods.reduce((sum,row)=>sum+row[k],0);
    const salesMinor=Math.round(total('adSales')*100),spendMinor=Math.round(total('adSpend')*100);
    const metrics={salesMinor,spendMinor,clicks:p.clicks,impressions:p.impressions,orders:total('adOrders'),acos:salesMinor?spendMinor/salesMinor:null};
    const id=p.id;
    inventory.campaigns[id]={id,name:p.sku+' · SP',adProduct:'SP',state:'ENABLED',dailyBudgetMinor:2000,
      inBudgetPct:100,targetAcos:.3,globalCampaign:null,strategy:'DOWN_ONLY',placements:[],businessBoostPct:null,
      audienceBoostPct:null,videoBoostPct:null,rules:{scheduledBidPct:null,scheduledBudgetPct:null,schedule:null,roasGoal:null},metrics};
    inventory.groups[id]={id,campaignId:id,name:p.name,defaultBidMinor:40,state:'ENABLED'};
    inventory.products[id]={id,sku:p.sku,asin:p.asin,name:p.name};
    inventory.ads[id]={id,groupId:id,productId:id,state:'ENABLED',eligible:true,metrics};
  }
  return {simulated:true,profile,period:{start:master.from,end:master.to,attributionDays:7},inventory,actions:[],history:[]};
}
