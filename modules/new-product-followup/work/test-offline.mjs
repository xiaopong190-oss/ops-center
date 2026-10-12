import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(new URL('../outputs/产品跟进工作台-独立完整版.html',import.meta.url),'utf8');
const definitions=html.match(/<script>([\s\S]*?)const \$=/)[1];
const engine=fs.readFileSync(new URL('offline-engine.js',import.meta.url),'utf8');
const context=vm.createContext({structuredClone,crypto:webcrypto,URL,Blob,Date,console,setTimeout,document:{addEventListener(){}}});
vm.runInContext(definitions+'\n'+engine,context);
vm.runInContext('let data=freshData();',context);
await vm.runInContext(`(async()=>{
  const p={name:'测试产品',sku:'TEST-1',owner:'负责人',stage:'打样',operating:'待上架',health:'正常',purpose:'验证产品',issue:'等待样品',next:'检查样品',due:'2026-10-15'};
  const created=await api('/api/workbench',{kind:'product',body:p,actor:'测试人',reason:'创建测试产品'});
  const current=await api('/api/workbench');
  if(current.products.length!==1||current.events.length!==1)throw Error('创建没有记录历史');
  let rejected=false;
  try{await api('/api/workbench',{kind:'product',body:p,actor:'测试人',reason:'重复SKU'})}catch{rejected=true;}
  if(!rejected)throw Error('重复SKU未被拒绝');
  await api('/api/workbench',{kind:'product',id:created.id,version:1,body:{...p,operating:'测款中'},actor:'测试人',reason:'开始测款'});
  rejected=false;
  try{await api('/api/workbench',{kind:'product',id:created.id,version:1,body:p,actor:'测试人',reason:'旧版本'})}catch{rejected=true;}
  if(!rejected)throw Error('未拒绝旧版本写入');
  rejected=false;
  try{validBody('task',{title:'检查',owner:'测试人',due:'2026-10-15',target:'检查样品',status:'已验证'})}catch{rejected=true;}
  if(!rejected)throw Error('缺少验证证据仍可完成');
  rejected=false;
  try{validBody('cost',{title:'费用',status:'已付',actual:-1})}catch{rejected=true;}
  if(!rejected)throw Error('负数金额未被拒绝');
  const zero=validBody('cost',{title:'费用',status:'已付',actual:0});
  if(zero.actual!==0||zero.budget!=='')throw Error('零与未填写混淆');
  rejected=false;
  try{validBody('task',{title:'检查',owner:'测试人',due:'2026-02-30',target:'检查样品',status:'待开始'})}catch{rejected=true;}
  if(!rejected)throw Error('无效日期未被拒绝');
  rejected=false;
  try{validBody('cost',{title:'费用',status:'已付',evidence:'javascript:alert(1)'})}catch{rejected=true;}
  if(!rejected)throw Error('危险链接未被拒绝');
  const saved=await api('/api/workbench');
  if(saved.events.length!==2||JSON.parse(saved.events[0].before).operating!=='待上架'||JSON.parse(saved.events[0].after).operating!=='测款中')throw Error('变更前后记录错误');
  const restored=validateBackup({format:STORE_NAME,data:structuredClone(saved)});
  if(restored.products.length!==1||restored.events.length!==2)throw Error('备份验证错误');
  const assignment=(owner,store,site,status)=>({title:'产品运营',owner,store,site,status,purpose:'验证转化',issue:'等待复盘',next:'检查订单',due:'2026-10-15',target:'检查7天订单'});
  const a=await api('/api/workbench',{kind:'operation',productId:created.id,body:assignment('运营甲','A店','美国','推广中'),actor:'测试人',reason:'分配美国站'});
  const b=await api('/api/workbench',{kind:'operation',productId:created.id,body:assignment('运营乙','B店','德国','测款中'),actor:'测试人',reason:'分配德国站'});
  await api('/api/workbench',{kind:'operation',id:a.id,version:1,body:assignment('运营甲','A店','美国','优化中'),actor:'测试人',reason:'优化美国站'});
  const p2=await api('/api/workbench',{kind:'product',body:{...p,sku:'TEST-2',name:'第二款产品'},actor:'测试人',reason:'创建第二款产品'});
  rejected=false;
  try{await api('/api/workbench',{kind:'task',productId:p2.id,body:{title:'跨产品关联',owner:'运营甲',due:'2026-10-15',target:'检查',status:'待开始',operationId:a.id},actor:'测试人',reason:'错误关联'})}catch{rejected=true;}
  if(!rejected)throw Error('错误跨产品关联未被拒绝');
  await api('/api/workbench',{kind:'task',productId:created.id,body:{title:'甲的跟进',owner:'运营甲',due:'2026-10-15',target:'检查',status:'待开始',operationId:a.id},actor:'测试人',reason:'关联跟进'});
  data=await api('/api/workbench');
  if(data.records.find(r=>r.id===b.id).body.status!=='测款中')throw Error('运营甲更新覆盖了运营乙状态');
  if(data.products.find(r=>r.id===created.id).body.operating!=='测款中')throw Error('分工状态覆盖了产品整体状态');
  ownerFilter='运营甲';
  if(scopedProducts().length!==1||data.records.filter(inOperatorScope).some(r=>r.body.owner==='运营乙'))throw Error('按运营筛选包含其他运营');
  validateBackup({format:STORE_NAME,data:structuredClone(data)});
  console.log('PASS: two operators retain independent statuses, cross-product links rejected, operator scope, complete backup');
  console.log('PASS: create, duplicate SKU, stale version, evidence, amounts, dates, URL safety, audit history, backup validation');
})()`,context);
assert(!/\bfetch\s*\(|https?:\/\/[^'"<> ]+\.(?:js|css)/.test(html));
assert(html.includes('导出备份')&&html.includes('导入备份'));
assert(html.includes('仅本次页面 · 关闭前请导出备份'));
console.log('PASS: standalone has no network dependency and reports storage availability');
