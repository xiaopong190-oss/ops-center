import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDemo,demoClient} from './demo.mjs';
const q={sid:'101',asin:'B0C9X1PL7A',from:'2026-10-01',to:'2026-10-31'};
test('订单示例匹配两单，成本与物流属于当前 ASIN',async()=>{
 const s=await collectDemo(demoClient,q);
 assert.equal(s.mode,'demo');assert.equal(s.orderCount,2);
 assert.deepEqual(s.lines.map(x=>x.purchase),[-7.6,-3.8]);
 assert.deepEqual(s.lines.map(x=>x.tracking),['DEMO-TRACK-001','DEMO-TRACK-002']);
});
test('按店铺及日期过滤，缺失运单保留空值',async()=>{
 assert.equal((await collectDemo(demoClient,{...q,sid:'102'})).orderCount,0);
 assert.equal((await collectDemo(demoClient,{...q,to:'2026-10-08'})).orderCount,1);
 const s=await collectDemo(demoClient,{...q,sid:'102',asin:'B0D7K2M9QX'});
 assert.equal(s.lines[0].tracking,null);
});
