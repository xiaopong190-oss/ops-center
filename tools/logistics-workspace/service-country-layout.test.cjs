const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Worker=require('./worker-test-helper.cjs');
const Layout=require('../logistics-rating/extensions/service-country-layout.js');
const row=(number,values)=>({row:number,cells:Object.entries(values).map(([col,value])=>({cell:col+number,v:String(value)}))});
const header=number=>row(number,{A:'目的地',B:'服务类型',C:'邮编',D:'时效（工作日）',E:'21-99KG',F:'100KG以上',G:'备注'});
const meta={company:'合成测试物流',date:'2026-11-01',currency:'CNY'};
const sheet={name:'Sheet1',rows:[header(1),row(3,{A:'卡航',B:'德国（含税）',C:'亚马逊地址',D:'18-20提取',E:17,F:15,G:'合成附加费200元/票'}),row(4,{B:'法国（不含税）',C:'亚马逊地址',E:20,F:18}),header(8),row(9,{A:'欧洲空加派',B:'英国（含税）',C:'亚马逊地址',D:44450,E:32,F:30}),row(10,{B:'西班牙、意大利',C:'亚马逊地址',E:35,F:33}),row(11,{B:'德国（含税）',C:'德国 ABC1(12345)+XYZ2(45678)',E:16,F:14}),row(12,{B:'欧洲',C:'不限',E:50,F:'/'}),row(13,{B:'英国',C:'亚马逊地址',E:'/',F:'/'})],merges:['A3:A4','A9:A13']};
function worker(){const root={Worker};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../logistics-rating/extensions/workbook-cleaning.js'),'utf8'),{window:root,document:{currentScript:{src:'https://local/extensions/workbook-cleaning.js'}},URL,Date,Error,Promise,setTimeout,clearTimeout,setInterval,clearInterval,AbortController});return root.WorkbookCleaning;}
test('repeated service-country blocks retain merged channels, per-row tax, both tiers and source evidence in the real worker',async()=>{
 const model={fileName:'合成分段报价.xlsx',sheets:[sheet]},before=JSON.stringify(model);
 const result=await worker().run(model,meta);
 assert.equal(result.regionalRecords.length,10);
 assert.equal(result.rejectedRecords.length,3);
 const at=cell=>result.regionalRecords.filter(record=>record.priceCell===cell);
 assert.match(at('E3')[0].channel,/卡航/);
 assert.match(at('E3')[0].terms,/条件=含税/);
 assert.match(at('E4')[0].terms,/条件=不含税/);
 assert.match(at('E9')[0].channel,/欧洲空加派/);
 assert.equal(at('E9')[0].leadRaw,'44450');
 assert.equal(at('E9')[0].price,3200);
 assert.match(at('E10')[0].terms,/税费待确认/);
 assert.deepEqual(at('E10').map(record=>record.country).sort(),['意大利','西班牙']);
 assert(at('E3')[0].sourceNotes.some(note=>note.value.includes('200元')));
 assert(!result.regionalRecords.some(record=>record.price===20000||record.priceCell==='E13'));
 assert.deepEqual(result.rejectedRecords.map(item=>item.record.priceCell),['E11','F11','E12']);
 assert.equal(JSON.stringify(model),before);
});
test('unrelated layouts pass through without replacing records',()=>{
 const result={records:[],regionalRecords:[{id:'keep'}]};
 assert.equal(Layout.project({sheets:[{name:'其他报价',rows:[row(1,{A:'仓库',B:'21KG+'})]}]},result,meta),result);
});
