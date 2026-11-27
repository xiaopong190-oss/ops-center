import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {service} from './shared/server.mjs';
import {collect} from './shared/collect.mjs';

// The first two lines match the October hook orders in the order workspace.
const orders = [
  ['114-2209188-7731026','2026-10-08',101,'B0C9X1PL7A','LX-HOOK-10',4,-7.60,-3.80,'DEMO-TRACK-001'],
  ['113-7781024-1638859','2026-10-14',101,'B0C9X1PL7A','LX-HOOK-10',2,-3.80,-1.90,'DEMO-TRACK-002'],
  ['112-3318842-9905172','2026-10-17',102,'B0D7K2M9QX','LX-LAMP-01',1,-6.80,-3.20,null]
].map(([amazon_order_id,purchase_date_local,sid,asin,seller_sku,quantity_ordered,cg_price,cg_transport_costs,tracking_number])=>({
  amazon_order_id,purchase_date_local,sid,tracking_number,
  order_status:tracking_number?'Shipped':'Unshipped',fulfillment_channel:'MFN',order_total_currency_code:'USD',
  shipment_date_local:tracking_number?purchase_date_local:null,
  item_list:[{asin,seller_sku,quantity_ordered,cg_price,cg_transport_costs,fba_shipment_amount:null}]
}));

export const demoClient = {
  async read(path,{sid,start_date,end_date,offset,length}) {
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
  service({client:demoClient,collector:collectDemo,demo:true,directory:join(homedir(),'.ai-data-analysis','demo-snapshots')})
    .listen(4187,'127.0.0.1',()=>console.log('AI 数据分析系统 http://127.0.0.1:4187/system/'));
}
