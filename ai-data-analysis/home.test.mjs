import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeAds,summarizeOrders,summarizeProducts} from './home.js';

test('首页 ACOS 按币种加权，分母为零或指标不全时不计算',()=>{
  const products=[{id:'a',sid:'1',currency:'USD'},{id:'b',sid:'2',currency:'JPY'}];
  const performance=[{linkId:'a',adSpend:4,adSales:40},{linkId:'a',adSpend:6,adSales:10},{linkId:'b',adSpend:2,adSales:0}];
  const summary=()=>summarizeAds({products,performance},'all',new Map()).items;
  assert.equal(summary().find(x=>x.currency==='USD').acos,.2);
  assert.equal(summary().find(x=>x.currency==='JPY').acos,null);
  performance[1].adSpend=null;
  assert.equal(summary().find(x=>x.currency==='USD').acos,null);
});

test('首页同单多行只扣一次费用，费用币种不匹配时盈亏待核对',()=>{
  const rows=[4,5].map(profit=>({orderId:'A',sid:'1',orderCurrency:'USD',profit}));
  const fee={amount:'10',currency:'USD'};
  const summary=()=>summarizeOrders({rows,fees:{'1:A':fee}},'1').items[0];
  assert.equal(summary().provisionalProfit,-1);
  assert.equal(summary().lossOrderCount,1);
  fee.currency='GBP';
  assert.equal(summary().provisionalProfit,null);
  assert.equal(summary().lossOrderCount,null);
});

test('首页按店铺筛选新品，只有已知销量为零的链接计入零销量',()=>{
  const products=['a','b','c','d'].map((id,i)=>({id,sid:i===3?'2':'1'}));
  const performance=[{linkId:'a',units:1},{linkId:'b',units:0},{linkId:'c',units:null,sales:0},{linkId:'d',units:0}];
  const s=summarizeProducts({products,performance},'1');
  assert.deepEqual([s.totalCount,s.zeroSalesCount,s.withSalesCount,s.missingCount],[3,1,1,1]);
});
