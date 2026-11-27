import http from 'node:http';
import {readFile, writeFile, mkdir, rename, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {collect,scope} from './collect.mjs';
import {LingxingClient} from './lingxing.mjs';

const trackerPage = new URL('../../modules/new-product-tracker/index.html',import.meta.url);
const systemFiles = new Set(['Main.dc.html','advertising.html','tracker.html','tracker-source.js','global-navigation.css','global-navigation.js','support.js','vendor/react.js','vendor/react-dom.js']);
export function service({directory,client,collector=collect,demo=false}) {
  let busy = false;
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
  async function savedRanges(){
    let files=[];
    try {files=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
    const ranges=[];
    for(const file of files.filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
      ranges.push({id:file.slice(0,-5),snapshot:await readJson(file)});
    }
    return ranges.sort((a,b)=>String(a.snapshot.syncedAt).localeCompare(String(b.snapshot.syncedAt)));
  }
  async function enriched(snapshot){
    if(!snapshot.lines)return snapshot;
    // A later successful sync replaces the complete overlapping date interval,
    // including an interval that is now empty. Keep all lines of a multi-item order.
    const target=snapshot.scope;
    let lines=snapshot.lines,updated=snapshot.syncedAt;
    for(const {snapshot:next} of await savedRanges()){
      const s=next.scope;
      if(next.syncedAt<=snapshot.syncedAt || s.sid!==target.sid || s.asin!==target.asin || s.to<target.from || s.from>target.to)continue;
      const date=row=>String(row.date).slice(0,10);
      lines=lines.filter(row=>date(row)<s.from || date(row)>s.to)
        .concat(next.lines.filter(row=>date(row)>=target.from && date(row)<=target.to));
      updated=next.syncedAt;
    }
    snapshot={...snapshot,lines,orderCount:new Set(lines.map(r=>r.orderId)).size,dataUpdatedAt:updated};
    const book=await fees();
    const orderFees={};
    for(const row of snapshot.lines){
      const entry=book[snapshot.scope.sid+':'+row.orderId];
      if(entry)orderFees[row.orderId]=entry;
    }
    return {...snapshot,orderFees};
  }
  return http.createServer(async (req,res)=>{
    const origin = 'http://127.0.0.1:'+req.socket.localPort;
    function send(status,value,type='application/json; charset=utf-8') {
      res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    }
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin!==origin)) return send(403,{error:'仅支持本机同源访问'});
      const path = new URL(req.url,origin).pathname;
      if (req.method==='GET' && (path==='/system/board' || path==='/')) {
        const page=await readFile(trackerPage,'utf8');
        const bootstrap='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/system/global-navigation.css"><script src="/system/tracker-source.js" data-mode="'+(demo?'demo':'live')+'"></script>';
        return send(200,bootstrap+page,'text/html; charset=utf-8');
      }
      if (req.method==='GET' && path==='/system/growth.html') {
        res.writeHead(302,{Location:'/system/tracker.html'});return res.end();
      }
      if (req.method==='GET' && path.startsWith('/system/')) {
        const file=path.slice(8)||'Main.dc.html';
        if (!systemFiles.has(file)) return send(404,{error:'页面不存在'});
        const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html';
        let asset=await readFile(new URL('../'+file,import.meta.url));
        if(file==='Main.dc.html' || file==='advertising.html'){
          asset=asset.toString().replace('</head>','<script defer src="/system/tracker-source.js" data-mode="'+(demo?'demo':'live')+'"></script></head>');
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
        if(!p || !/^[a-f0-9]{64}$/.test(p.id) || !/^\d{3}-\d{7}-\d{7}$/.test(p.orderId) || !/^[A-Z]{3}$/.test(p.currency) || typeof p.amount!=='string' || !/^\d{1,6}(\.\d{1,2})?$/.test(p.amount))return send(400,{error:'请核对订单、金额和币种'});
        if(writingFees)return send(409,{error:'另一笔费用正在保存，请重试'});
        writingFees=true;
        try {
          let snapshot;
          try {snapshot=await readJson(p.id+'.json');}catch(e){if(e.code==='ENOENT')return send(404,{error:'快照不存在'});throw e;}
          if(!(await enriched(snapshot)).lines.some(r=>r.orderId===p.orderId))return send(404,{error:'快照中无此订单'});
          const key=snapshot.scope.sid+':'+p.orderId,book=await fees();
          if((book[key]?.version??0)!==p.version)return send(409,{error:'费用已更新，请重新读取后保存'});
          book[key]={amount:Number(p.amount).toFixed(2),currency:p.currency,version:p.version+1};
          await persist('order-fees.json',book);return send(200,book[key]);
        } finally {writingFees=false;}
      }
      let query;
      try {query=scope(JSON.parse(body));} catch(error){return send(400,{error:error instanceof SyntaxError?'请求格式错误':error.message});}
      if (!client) return send(503,{error:'请在服务端配置共用的领星 App ID 与 App Secret，再重启增长服务。'});
      if (busy) return send(409,{error:'正在同步其他查询，请稍后重试'});
      busy=true;
      try {
        const snapshot=await collector(client,query);
        const id=createHash('sha256').update(JSON.stringify(query)).digest('hex');
        await persist(id+'.json',snapshot);
        return send(200,{id,snapshot:await enriched(snapshot)});
      } finally {busy=false;}
    } catch(error) {return send(502,{error:error.code?'共享快照读写失败':error.message});}
  });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {LINGXING_APP_ID:appId,LINGXING_APP_SECRET:appSecret}=process.env;
  service({client:appId && appSecret ? new LingxingClient({appId,appSecret}):null,
    directory:process.env.LINGXING_DATA_DIR || join(homedir(),'.ai-data-analysis','live-snapshots')
  }).listen(4188,'127.0.0.1',()=>console.log('AI 数据分析系统 http://127.0.0.1:4188/system/'));
}
