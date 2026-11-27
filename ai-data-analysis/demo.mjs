import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {service} from './shared/server.mjs';
import {collect} from './shared/collect.mjs';

import {demoShops,demoProducts,demoOrders as orders} from './demo-catalog.mjs';

export const demoClient = {
  products:demoProducts,
  async read(path,{sid,start_date,end_date,offset,length}) {
    if(path==='/erp/sc/data/seller/lists')return {data:demoShops.map(s=>({sid:Number(s.sid),name:s.name,country:s.site}))};
    if(path!=='/erp/sc/data/mws/orders') throw Error('模拟接口不存在');
    const rows=orders.filter(row=>row.sid===sid && row.purchase_date_local>=start_date && row.purchase_date_local<end_date);
    return {total:rows.length,data:rows.slice(offset,offset+length)};
  },
  async orderDetails(ids){return {data:orders.filter(row=>ids.includes(row.amazon_order_id))};}
};
export async function collectDemo(client,query){
  return {...await collect(client,query),source:'虚拟领星数据',mode:'demo'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  service({client:demoClient,demo:true,directory:join(homedir(),'.ai-data-analysis','demo-snapshots')})
    .listen(4187,'127.0.0.1',()=>console.log('AI 数据分析系统 http://127.0.0.1:4187/system/'));
}
