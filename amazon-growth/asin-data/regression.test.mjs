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
test('本机 API 同步、共享读取、同范围替换和失败保留',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'growth-regression-'));
  let generation=0;
  const server=service({directory:dir,client:{},collector:async(c,query)=>{
    if(generation===2)throw Error('同步失败');
    return {scope:query,generation:generation++};
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(extra={})=>fetch(base+'/api/sync',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(q)});
  assert.equal((await post({Origin:'https://other.example'})).status,403);
  const first=await (await post()).json();const next=await(await post()).json();
  assert.match(first.id,/^[a-f0-9]{64}$/);assert.equal(first.id,next.id);
  assert.equal((await post()).status,502);
  assert.equal((await(await fetch(base+'/api/snapshots/'+first.id)).json()).generation,1);
  assert.equal((await fetch(base+'/.env')).status,404);
});
