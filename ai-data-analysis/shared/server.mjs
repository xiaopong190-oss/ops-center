import http from 'node:http';
import {readFile, writeFile, mkdir, rename, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {collectShop,scope} from './collect.mjs';
import {globalSource} from './source.mjs';

import {demoPerformance} from '../demo-catalog.mjs';

const trackerPage = new URL('../../modules/new-product-tracker/index.html',import.meta.url);
const systemFiles = new Set(['Main.dc.html','advertising.html','tracker.html','global-navigation.css','global-navigation.js','support.js','vendor/react.js','vendor/react-dom.js']);
export function service({directory,client,demo=false,loadModel}) {

  let writingFees = false;
  const readJson=async file=>JSON.parse(await readFile(join(directory,file),'utf8'));
  async function fees(){
    try {return await readJson('order-fees.json');}
    catch(e){if(e.code==='ENOENT')return {};throw e;}
  }
  async function persist(file,value){
    await mkdir(directory,{recursive:true,mode:0o700});
    const tmp=join(directory,randomUUID()+'.tmp');
    await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,join(directory,file));
  }
  let published,initializing,syncing,lastError;
  async function collectMaster(){
    const end=Date.now(), day=t=>new Date(t).toISOString().slice(0,10);
    const from=demo?'2026-10-01':day(end-29*86400000),to=demo?'2026-10-31':day(end);
    async function readOrders(){
      if(!client)throw Error('领星凭据待配置');
      const {data}=await client.read('/erp/sc/data/seller/lists',{});
      const shops=data.map(s=>({sid:String(s.sid),name:s.name||String(s.sid),site:s.country||s.region||''}));
      const rows=[];
      for(const shop of shops){
        if(!/^\d+$/.test(shop.sid))throw Error('领星店铺标识无效');
        const batch=await collectShop(client,{sid:shop.sid,from,to});
        rows.push(...batch.lines);
      }
      return {shops,rows,from,to,transport:client.transport||'API',...(demo?{demoCatalogVersion:3,products:client.products,performance:demoPerformance(client.products,rows)}:{})};
    }
    try{
      const model=loadModel?await loadModel():await readOrders();
      const master={...model,syncedAt:new Date().toISOString(),mode:demo?'demo':'live'};
      await persist('workspace.json',master);
      published=master;
      lastError=null;
    }catch(e){
      lastError=e.message;
      published??={shops:[],rows:[],products:[],performance:[],from,to,mode:demo?'demo':'live'};
    }
  }
  function synchronize(){
    syncing??=collectMaster().finally(()=>{syncing=null;});
    return syncing;
  }
  function initialize(){
    return initializing??=(async()=>{
      try {published=await readJson('workspace.json');}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(!published || (demo && published.demoCatalogVersion!==(loadModel?4:3)))await synchronize();
    })();
  }
  async function workspace(){
    await initialize();
    return {...published,...(lastError?{syncError:lastError,...(!published.syncedAt?{error:lastError}:{})}:{}),fees:await fees()};
  }
  async function bootstrap(){
    const master=await workspace();
    const data=JSON.stringify(master).replaceAll('<','\\u003c');
    return '<script>window.systemData='+data+';window.trackerSourceMode=window.systemData.mode;</script>';
  }
  async function savedRanges(){
    let files=[];
    try {files=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
    const ranges=[];
    for(const file of files.filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
      ranges.push({id:file.slice(0,-5),snapshot:await readJson(file)});
    }
    return ranges.sort((a,b)=>String(a.snapshot.syncedAt).localeCompare(String(b.snapshot.syncedAt)));
  }
  async function enriched({scope}){
    const master=await workspace();
    if(!master.syncedAt)throw Error(master.error||'数据尚未同步');
    if(scope.from<master.from || scope.to>master.to)throw Error('查询超出当前订单覆盖范围');
    const lines=master.rows.filter(r=>r.sid===scope.sid && r.asin===scope.asin && String(r.date).slice(0,10)>=scope.from && String(r.date).slice(0,10)<=scope.to);
    const orderFees={};
    for(const row of lines){
      const fee=master.fees[row.sid+':'+row.orderId];if(fee)orderFees[row.orderId]=fee;
    }
    return {scope,lines,orderCount:new Set(lines.map(r=>r.orderId)).size,orderFees,mode:master.mode,syncedAt:master.syncedAt,error:master.error};
  }
  const server=http.createServer(async (req,res)=>{
    const origin = 'http://127.0.0.1:'+req.socket.localPort;
    function send(status,value,type='application/json; charset=utf-8') {
      res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    }
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin!==origin)) return send(403,{error:'仅支持本机同源访问'});
      const path = new URL(req.url,origin).pathname;
      if(path==='/api/workspace/sync' && req.method==='POST'){
        if(req.headers['sec-fetch-site']==='cross-site' || req.headers['content-type']!=='application/json')return send(403,{error:'请从全局菜单同步'});
        await initialize();
        await synchronize();
        return send(lastError?502:200,{syncedAt:published.syncedAt,error:lastError});
      }
      if(path==='/api/workspace' && req.method==='GET'){
        if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'仅支持系统内访问'});
        return send(200,await workspace());
      }
      if (req.method==='GET' && (path==='/system/board' || path==='/')) {
        const page=await readFile(trackerPage,'utf8');
        return send(200,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+await bootstrap()+page,'text/html; charset=utf-8');
      }
      if (req.method==='GET' && path==='/system/growth.html') {
        res.writeHead(302,{Location:'/system/tracker.html'});return res.end();
      }
      if (req.method==='GET' && path.startsWith('/system/')) {
        const file=path.slice(8)||'Main.dc.html';
        if (!systemFiles.has(file)) return send(404,{error:'页面不存在'});
        const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html';
        let asset=await readFile(new URL('../'+file,import.meta.url));
        if(file==='Main.dc.html' || file==='advertising.html' || file==='tracker.html'){
          asset=asset.toString().replace('<head>','<head>'+await bootstrap());
        }
        return send(200,asset,type+'; charset=utf-8');
      }
      if(path==='/api/snapshots' && req.method==='GET'){
        if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'仅支持系统内访问'});
        const snapshots=(await savedRanges()).reverse().map(({id,snapshot})=>({id,scope:snapshot.scope,syncedAt:snapshot.syncedAt}));
        return send(200,{snapshots});
      }
      if (req.method==='GET' && /^\/api\/snapshots\/[a-f0-9]{64}$/.test(path)) {
        if (req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'请从系统页面读取共享数据'});
        try {return send(200,await enriched(await readJson(path.slice(-64)+'.json')));}
        catch (error) {if(error.code==='ENOENT') return send(404,{error:'共享快照不存在'});throw error;}
      }
      if (!['/api/sync','/api/order-fee'].includes(path) || req.method!=='POST') return send(404,{error:'未找到接口'});
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'需要 JSON'});
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>2048)return send(413,{error:'请求过大'});}
      if(path==='/api/order-fee'){
        let p;try{p=JSON.parse(body);}catch{return send(400,{error:'请求格式错误'});}
        if(!p || !(p.id?/^[a-f0-9]{64}$/.test(p.id):/^[1-9]\d*$/.test(p.sid)) || !/^\d{3}-\d{7}-\d{7}$/.test(p.orderId) || !/^[A-Z]{3}$/.test(p.currency) || typeof p.amount!=='string' || !/^\d{1,6}(\.\d{1,2})?$/.test(p.amount))return send(400,{error:'请核对订单、金额和币种'});
        if(writingFees)return send(409,{error:'另一笔费用正在保存，请重试'});
        writingFees=true;
        try {
          let sid=p.sid;
          if(p.id){let snapshot;
          try {snapshot=await readJson(p.id+'.json');}catch(e){if(e.code==='ENOENT')return send(404,{error:'快照不存在'});throw e;}
          if(!(await enriched(snapshot)).lines.some(r=>r.orderId===p.orderId))return send(404,{error:'快照中无此订单'});
          sid=snapshot.scope.sid;
          }else if(!(await workspace()).rows.some(r=>r.sid===sid&&r.orderId===p.orderId))return send(404,{error:'订单不存在'});
          const key=sid+':'+p.orderId,book=await fees();
          if((book[key]?.version??0)!==p.version)return send(409,{error:'费用已更新，请重新读取后保存'});
          book[key]={amount:Number(p.amount).toFixed(2),currency:p.currency,version:p.version+1};
          await persist('order-fees.json',book);return send(200,book[key]);
        } finally {writingFees=false;}
      }
      let query;
      try {query=scope(JSON.parse(body));} catch(error){return send(400,{error:error instanceof SyntaxError?'请求格式错误':error.message});}
      const snapshot=await enriched({scope:query});
      const id=createHash('sha256').update(JSON.stringify(query)).digest('hex');
      await persist(id+'.json',{scope:query,syncedAt:snapshot.syncedAt});
      return send(200,{id,snapshot});
    } catch(error) {return send(502,{error:error.code?'共享快照读写失败':error.message});}
  });
  server.once('listening',()=>initialize().catch(error=>console.error('共享数据初始化失败',error.message)));
  return server;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  service({client:globalSource(process.env),
    directory:process.env.LINGXING_DATA_DIR || join(homedir(),'.ai-data-analysis','live-snapshots')
  }).listen(4188,'127.0.0.1',()=>console.log('AI 数据分析系统 http://127.0.0.1:4188/system/'));
}
