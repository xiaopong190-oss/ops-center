import {get} from 'node:http';
import {createHash} from 'node:crypto';

// Stable demo SIDs are separate from advertising profile IDs.
const bindings={
  'atlas-us':{sid:'201',domain:'www.amazon.com'},
  'atlas-uk':{sid:'202',domain:'www.amazon.co.uk'},
  'cove-jp':{sid:'203',domain:'www.amazon.co.jp'}
};
const minorKeys=['orders','salesMinor','spendMinor','clicks','impressions'];
async function nativeRead(path){
  return new Promise((resolve,reject)=>{
    const req=get('http://127.0.0.1:3001/api/'+path,{signal:AbortSignal.timeout(10000)},async res=>{
      try{
        if(res.statusCode!==200){res.resume();throw Error('广告数据接口 HTTP '+res.statusCode);}
        const chunks=[];
        for await(const chunk of res)chunks.push(chunk);
        resolve(JSON.parse(Buffer.concat(chunks)));
      }catch(e){reject(e);}
    });
    req.on('error',reject);
  });
}

export async function sharedDemo(read=nativeRead){
  const {profiles}=await read('simulation/profiles');
  const shops=[],products=[],rows=[],performance=[];
  const orderIds=new Set();
  let from,to;
  for(const [profileId,binding] of Object.entries(bindings)){
    const p=profiles.find(profile=>profile.id===profileId);
    if(!p)throw Error('缺少演示账户 '+profileId);
    const w=await read('simulation/profiles/'+profileId);
    if(!w.simulated || w.profile.id!==profileId || w.profile.currency!==p.currency)throw Error('广告演示账户不匹配');
    if(from && (from!==w.period.start || to!==w.period.end))throw Error('广告演示统计周期不一致');
    from=w.period.start;to=w.period.end;
    const scale=10**p.minorUnits, {sid,domain}=binding;
    shops.push({sid,name:p.accountName,site:p.marketplace,currency:p.currency,profileId});
    for(const product of Object.values(w.inventory.products)){
      const id=profileId+'-'+product.id;
      const ads=Object.values(w.inventory.ads).filter(ad=>ad.productId===product.id);
      const m=Object.fromEntries(minorKeys.map(k=>[k,ads.reduce((sum,ad)=>sum+ad.metrics[k],0)]));
      if(minorKeys.some(k=>!Number.isSafeInteger(m[k])||m[k]<0)||m.orders>10000||(!m.orders&&m.salesMinor))throw Error('广告指标不适合模拟拆单');
      const average=m.orders?Math.round(m.salesMinor/m.orders):null;
      // Unit economics are synthetic and rounded in the marketplace's minor unit.
      const cost=average===null?null:Math.round(average*.25);
      const freight=average===null?null:Math.round(average*.08);
      const commission=average===null?null:Math.round(average*.15);
      const amount=n=>n===null?null:n/scale;
      products.push({...product,id,sid,site:p.marketplace,currency:p.currency,url:'https://'+domain+'/dp/'+product.asin,
        price:amount(average),cogs:amount(cost),head:amount(freight),commission:amount(commission),fba:0,profileId,adProductId:product.id});
      performance.push({id:id+'-'+to,linkId:id,from,to,units:m.orders,sales:amount(m.salesMinor),adSales:amount(m.salesMinor),
        adOrders:m.orders,adSpend:amount(m.spendMinor),clicks:m.clicks,impressions:m.impressions});
      for(let i=0;i<m.orders;i++){
        const minor=Math.floor(m.salesMinor/m.orders)+(i<m.salesMinor%m.orders?1:0);
        const hash=createHash('sha256').update([id,from,to,i].join('|')).digest('hex');
        const digits=(BigInt('0x'+hash.slice(0,16))%100000000000000n).toString().padStart(14,'0');
        const orderId=sid+'-'+digits.slice(0,7)+'-'+digits.slice(7);
        if(orderIds.has(orderId))throw Error('模拟订单号重复');
        orderIds.add(orderId);
        rows.push({sid,orderId,sku:product.sku,asin:product.asin,date:to,orderCurrency:p.currency,quantity:1,sales:amount(minor),
          purchase:-amount(cost),firstLeg:-amount(freight),commission:-amount(commission),fba:0,profit:amount(minor-cost-freight-commission),
          tracking:'DEMO-'+digits,channel:'MFN',status:'Shipped',shipped:to,refundTotal:0});
      }
    }
  }
  const overview=await read('profiles');
  for(const account of overview.profiles.filter(p=>p.isSyntheticFixture)){
    if(!/^\d+$/.test(account.profileId)||shops.some(s=>s.sid===account.profileId))throw Error('复盘账户标识冲突');
    shops.push({sid:account.profileId,name:account.displayName,site:account.countryCode,currency:account.currencyCode,
      profileId:account.profileId,campaigns:account.campaigns});
  }
  return {shops,products,rows,performance,from,to,demoCatalogVersion:4,dataset:'native-ad-demo-v1'};
}
