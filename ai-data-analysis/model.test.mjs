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

test('三项全局服务独立验证，数据同步复用连接，模型调用仅发送显式输入',async t=>{
  const {connections}=await import('./shared/connections.mjs');
  const {service}=await import('./shared/server.mjs');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'global-connectors-'));
  const env={LINGXING_APP_ID:'id',LINGXING_APP_SECRET:'secret-placeholder',LINGXING_MCP_URL:'https://invalid.example',
    LINGXING_MCP_SHOPS_TOOL:'shops',LINGXING_MCP_ORDERS_TOOL:'orders',LINGXING_MCP_DETAILS_TOOL:'details',
    OPENAI_MODEL:'test-model',OPENAI_API_KEY:'key-placeholder'};
  const created=[],calls=[];
  const providers=connections(env,{sourceFactory:e=>{
    created.push(e.LINGXING_TRANSPORT);return {read:async()=>({data:[]})};
  },fetchImpl:async(path,opts)=>{
    calls.push({path,opts});return Response.json({model:'test-model',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'测试通过'}]}]});
  }});
  const server=service({providers,directory:dir});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const status=await(await fetch(base+'/api/connections')).text();
  assert.doesNotMatch(status,/key-placeholder|secret-placeholder|invalid.example/);
  assert.equal(JSON.parse(status).providers.filter(p=>p.configured).length,3);
  for(const id of ['api','mcp','llm'])assert.equal((await post('/api/connections/check',{id})).status,200);
  assert.deepEqual(created,['api','mcp']);
  assert.ok(calls[0].path.endsWith('/models/test-model'));
  assert.equal((await post('/api/llm/responses',{input:'test'},{origin:'https://elsewhere.example'})).status,403);
  assert.equal((await post('/api/llm/responses',{input:'  '})).status,400);
  assert.equal((await(await post('/api/llm/responses',{input:'test'})).json()).text,'测试通过');
  assert.equal(calls[1].path,'https://api.openai.com/v1/responses');
  assert.deepEqual(JSON.parse(calls[1].opts.body),{input:'test',model:'test-model',store:false,max_output_tokens:2048});
  delete env.OPENAI_API_KEY;
  assert.equal((await post('/api/llm/responses',{input:'test'})).status,503);
});
