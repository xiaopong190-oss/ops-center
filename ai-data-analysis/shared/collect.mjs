const day = 86400000;
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('请输入有效日期');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw Error('日期无效');
  return time;
}

export function scope(input) {
  const asin = String(input.asin ?? '').trim().toUpperCase();
  const sid = String(input.sid ?? '').trim();
  if (!/^[A-Z0-9]{10}$/.test(asin) || !/^[1-9]\d{0,9}$/.test(sid)) throw Error('请填写 10 位 ASIN 和有效店铺 SID');
  const {from, to} = input;
  const span = parseDate(to) - parseDate(from);
  if (span < 0 || span >= 31 * day) throw Error('请选择 1 至 31 天的查询范围');
  return {asin,sid,from,to};
}

export async function collect(client, query, pause = () => new Promise(resolve => setTimeout(resolve,1100))) {
  const {asin,sid,from,to} = scope(query);
  return collectShop(client,{asin,sid,from,to},pause);
}
export async function collectShop(client,{asin,sid,from,to},pause=()=>new Promise(r=>setTimeout(r,1100))) {
  const end = new Date(parseDate(to) + day).toISOString().slice(0,10);
  const orders = new Map();
  let offset = 0;
  while (true) {
    const {data,total} = await client.read('/erp/sc/data/mws/orders', {
      sid:Number(sid), start_date:from, end_date:end, date_type:1, sort_desc_by_date_type:2, offset, length:1000
    });
    if (!Number.isSafeInteger(Number(total)) || total == null || Number(total)<0) throw Error('订单分页总数缺失');
    for (const row of data) {
      if (String(row.sid) !== sid) continue;
      if (!Array.isArray(row.item_list)) throw Error('订单缺少商品明细');
      if (!asin || row.item_list.some(item => item.asin === asin)) orders.set(row.amazon_order_id,row);
    }
    offset += data.length;
    if (offset >= Number(total)) break;
    if (!data.length || offset >= 1000000) throw Error('订单分页不完整，请缩短查询范围');
    await pause();
  }
  const ids = [...orders.keys()];
  const lines = [];
  for (let index = 0; index < ids.length; index += 200) {
    if (index) await pause();
    const batch = ids.slice(index,index+200);
    const {data} = await client.orderDetails(batch);
    const details = new Map(data.filter(row=>String(row.sid)===sid).map(row=>[row.amazon_order_id,row]));
    for (const id of batch) {
      const order = orders.get(id);
      const items = details.get(id)?.item_list?.filter(item=>!asin || item.asin===asin);
      if (!items?.length) throw Error('订单详情不完整，请重新同步');
      for (const item of items) {
        lines.push({orderId:id,sid,asin:item.asin,itemId:item.order_item_id??item.id, sku:item.seller_sku, quantity:item.quantity_ordered,
          sales:item.sales_price_amount??null,commission:item.commission_amount??null,
          refundTotal:order.refund_amount??null,
          date:order.purchase_date_local, status:order.order_status, channel:order.fulfillment_channel,
          tracking:order.tracking_number || null, shipped:order.shipment_date_local || null,
          purchase:item.cg_price ?? null, firstLeg:item.cg_transport_costs ?? null,
          fba:item.fba_shipment_amount ?? null, profit:item.profit ?? null,
          orderCurrency:order.order_total_currency_code || null});
      }
    }
  }
  return {version:1,source:'领星订单列表与订单详情',scope:{asin,sid,from,to},syncedAt:new Date().toISOString(),orderCount:orders.size,lines};
}
