import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedDemo} from './shared/demo-model.mjs';
import {mcpReader} from './shared/source.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';

test('全局 MCP 共用一个协议会话，支持结构化及文本返回',async t=>{
  const [a,b]=InMemoryTransport.createLinkedPair();
  const server=new Server({name:'demo-source',version:'1'},{capabilities:{tools:{}}});
  server.setRequestHandler(CallToolRequestSchema,async req=>{
    const data=[req.params.arguments];
    return req.params.name==='detail'?{content:[{type:'text',text:JSON.stringify({data})}]}:{structuredContent:{data},content:[]};
  });
  await server.connect(b);
  const client=new Client({name:'demo-reader',version:'1'});
  t.after(async()=>{await client.close();await server.close();});
  let connections=0;
  const source=mcpReader({shops:'list','/erp/sc/data/mws/orderDetail':'detail'},async()=>{connections++;await client.connect(a);return client;});
  assert.deepEqual(await source.read('shops',{}),{data:[{}]});
  assert.deepEqual(await source.orderDetails(['123']),{data:[{order_id:'123'}]});
  assert.equal(connections,1);
});

test('跨站同 ASIN 隔离、币种精度、模拟订单稳定、广告销售回算',async()=>{
  const profiles=['atlas-us','atlas-uk','cove-jp'].map((id,i)=>({id,marketplace:['US','UK','JP'][i],currency:['USD','GBP','JPY'][i],accountName:id,minorUnits:i===2?0:2}));
  const read=async path=>{
    if(path==='profiles')return {profiles:[]};
    if(path==='simulation/profiles')return {profiles};
    const profile=profiles.find(p=>path.endsWith('/'+p.id));
    return {profile,simulated:true,period:{start:'2026-10-24',end:'2026-11-06'},inventory:{products:{one:{id:'one',asin:'B0MOCK1001',sku:'LOCAL',name:'box'}},ads:{a:{productId:'one',metrics:{orders:3,salesMinor:1001,spendMinor:22,clicks:8,impressions:140}}}}};
  };
  const model=await sharedDemo(read);
  assert.deepEqual(model,await sharedDemo(read));
  assert.equal(new Set(model.rows.map(r=>r.orderId)).size,9);
  for(const p of model.products){
    const rows=model.rows.filter(r=>r.sid===p.sid);
    const period=model.performance.find(r=>r.linkId===p.id);
    const scale=p.currency==='JPY'?1:100;
    assert.equal(rows.length,period.adOrders);
    assert.equal(rows.reduce((n,r)=>n+Math.round(r.sales*scale),0),1001);
    assert.equal(period.adSales*scale,1001);
    assert.ok(rows.every(r=>r.purchase===-p.cogs && r.sku===p.sku && r.orderCurrency===p.currency));
  }
});
