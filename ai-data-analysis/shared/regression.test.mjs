import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {scope,collect} from './collect.mjs';
import {service} from './server.mjs';

const q={asin:'B0ABC49975',sid:'101',from:'2026-10-01',to:'2026-10-07'};
const id='123-1234567-1234567';
const other={asin:'B0XYZ12345',cg_price:-999};
const item={asin:q.asin,cg_price:0,cg_transport_costs:-3};
const row={sid:101,amazon_order_id:id,item_list:[item,other],tracking_number:'TRACK', buyer_email:'private'};
test('日期、店铺和 ASIN 输入校验',()=>{
  assert.equal(scope({...q,asin:q.asin.toLowerCase()}).asin,q.asin);
  for(const input of [{from:'2026-02-30'},{to:'2026-11-30'},{sid:'0'},{asin:'abc'},{from:q.to,to:q.from}]) assert.throws(()=>scope({...q,...input}));
});
test('分页去重、店铺隔离、同单多 ASIN 和费用缺值',async()=>{
  const offsets=[];
  const client={read:async(path,args)=>{
    assert.equal(path,'/erp/sc/data/mws/orders');assert.equal(args.end_date,'2026-10-08');
    offsets.push(args.offset);return {data:args.offset?[row]:[row,{...row,sid:102}],total:3};
  },orderDetails:async(ids)=>{assert.deepEqual(ids,[id]);return {data:[row,{...row,sid:102,item_list:[other]}]};}};
  const result=await collect(client,q,async()=>{});
  assert.deepEqual(offsets,[0,2]);assert.equal(result.orderCount,1);assert.equal(result.lines.length,1);
  assert.equal(result.lines[0].purchase,0);assert.equal(result.lines[0].firstLeg,-3);assert.equal(result.lines[0].fba,null);
  assert.equal(result.lines[0].tracking,'TRACK');assert.ok(!JSON.stringify(result).includes('private'));
  client.orderDetails=async()=>({data:[]});await assert.rejects(collect(client,q,async()=>{}),/不完整/);
});
test('空结果与分页中断',async()=>{
  const client={read:async()=>({data:[],total:0})};
  assert.equal((await collect(client,q)).orderCount,0);
  client.read=async()=>({data:[],total:4});await assert.rejects(collect(client,q),/分页不完整/);
});

async function startSystem(t){
  const {demoClient}=await import('../demo.mjs');
  const dir=await mkdtemp(join(tmpdir(),'system-orders-'));
  const calls=[];
  const client={read:async(path,params)=>{calls.push(path);return demoClient.read(path,params);},orderDetails:ids=>demoClient.orderDetails(ids)};
  const server=service({directory:dir,client,demo:true});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,input,extra={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(input)});
  const read=async path=>(await fetch(base+path)).json();
  return {calls,base,post,read};
}
test('三个入口使用同一店铺与订单版本，页面无附加流水',async t=>{
  const {calls,base,read}=await startSystem(t);
  const [master,concurrent]=await Promise.all([read('/api/workspace'),read('/api/workspace')]);
  assert.deepEqual(master,concurrent);assert.equal(master.shops.length,2);assert.equal(master.rows.length,3);
  assert.equal(master.rows.filter(r=>r.sid==='101').reduce((s,r)=>s+r.quantity,0),6);
  for(const page of ['Main.dc.html','board','advertising.html']){
    const html=await(await fetch(base+'/system/'+page)).text();
    assert.match(html,/window.systemData=/);assert.doesNotMatch(html,/lingxing-orders|共用快照 JSON|共用数据范围/);
    assert.ok(html.includes(master.syncedAt));
  }
  assert.equal(calls.filter(p=>p.endsWith('/seller/lists')).length,1);
  assert.equal(calls.filter(p=>p.endsWith('/mws/orders')).length,2);
});
test('旧范围接口投影自同一订单源，服务费按店铺和订单隔离',async t=>{
  const {read,post,calls}=await startSystem(t);
  const query={...q,asin:'B0C9X1PL7A',to:'2026-10-31'};
  const range=await(await post('/api/sync',query)).json();
  assert.equal(range.snapshot.orderCount,2);
  const orderId=range.snapshot.lines[0].orderId;
  const fee={sid:'101',orderId,amount:'2.50',currency:'USD',version:0};
  assert.equal((await post('/api/order-fee',fee,{Origin:'https://outside.example'})).status,403);
  assert.equal((await post('/api/order-fee',fee)).status,200);
  assert.equal((await post('/api/order-fee',fee)).status,409);
  assert.equal((await post('/api/order-fee',{...fee,sid:'102'})).status,404);
  assert.equal((await read('/api/workspace')).fees['101:'+orderId].amount,'2.50');
  assert.equal((await read('/api/snapshots/'+range.id)).orderFees[orderId].amount,'2.50');
  assert.equal(calls.filter(p=>p.endsWith('/mws/orders')).length,2);
});
