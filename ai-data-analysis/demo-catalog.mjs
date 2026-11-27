/** Seed the demo once; all module-specific shapes are projections of these records. */
export const demoShops = [
  {sid:'101',name:'示例店铺 A',site:'US',currency:'USD',domain:'www.amazon.com',timezone:'America/Los_Angeles'},
  {sid:'102',name:'示例店铺 B',site:'UK',currency:'GBP',domain:'www.amazon.co.uk',timezone:'Europe/London'}
];
export const demoProducts = [
  {id:'demo-hook',sid:'101',sku:'LX-HOOK-10',asin:'B0C9X1PL7A',name:'挂钩',price:12.99,cogs:1.90,head:0.95,fba:0,commission:1.95,adSpend:5.10,clicks:17,impressions:840},
  {id:'demo-lamp',sid:'102',sku:'LX-LAMP-01',asin:'B0D7K2M9QX',name:'台灯',price:29.99,cogs:6.80,head:3.20,fba:0,commission:1.95,adSpend:2.40,clicks:8,impressions:400}
].map(product=>{
  const shop=demoShops.find(s=>s.sid===product.sid);
  return {...product,site:shop.site,currency:shop.currency,url:'https://'+shop.domain+'/dp/'+product.asin};
});
export const demoPurchases = [
  {orderId:'114-2209188-7731026',date:'2026-10-08',product:'demo-hook',qty:4,tracking:'DEMO-TRACK-001',ad:true},
  {orderId:'113-7781024-1638859',date:'2026-10-14',product:'demo-hook',qty:2,tracking:'DEMO-TRACK-002',ad:false},
  {orderId:'112-3318842-9905172',date:'2026-10-17',product:'demo-lamp',qty:1,tracking:null,ad:true}
];
const round=n=>Math.round(n*100)/100;
export const demoOrders=demoPurchases.map(order=>{
  const p=demoProducts.find(product=>product.id===order.product),q=order.qty;
  return {sid:Number(p.sid),amazon_order_id:order.orderId,purchase_date_local:order.date,
    tracking_number:order.tracking,order_status:order.tracking?'Shipped':'Unshipped',fulfillment_channel:'MFN',
    order_total_currency_code:p.currency,shipment_date_local:order.tracking?order.date:null,refund_amount:0,
    item_list:[{asin:p.asin,seller_sku:p.sku,quantity_ordered:q,cg_price:-round(q*p.cogs),
      cg_transport_costs:-round(q*p.head),fba_shipment_amount:-round(q*p.fba),
      sales_price_amount:round(q*p.price),commission_amount:-round(q*p.commission),
      profit:round(q*(p.price-p.cogs-p.head-p.fba-p.commission))}]};
});
