import http from 'node:http';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
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
        const bootstrap='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/system/tracker-source.js" data-mode="'+(demo?'demo':'live')+'"></script>';
        return send(200,bootstrap+page,'text/html; charset=utf-8');
      }
      if (req.method==='GET' && path==='/system/growth.html') {
        res.writeHead(302,{Location:'/system/tracker.html'});return res.end();
      }
      if (req.method==='GET' && path.startsWith('/system/')) {
        const file=path.slice(8)||'Main.dc.html';
        if (!systemFiles.has(file)) return send(404,{error:'页面不存在'});
        const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html';
        return send(200,await readFile(new URL('../'+file,import.meta.url)),type+'; charset=utf-8');
      }
      if (req.method==='GET' && /^\/api\/snapshots\/[a-f0-9]{64}$/.test(path)) {
        if (req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'请从系统页面读取共享数据'});
        try {return send(200,JSON.parse(await readFile(join(directory,path.slice(-64)+'.json'),'utf8')));}
        catch (error) {if(error.code==='ENOENT') return send(404,{error:'共享快照不存在'});throw error;}
      }
      if (path!=='/api/sync' || req.method!=='POST') return send(404,{error:'未找到接口'});
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'需要 JSON'});
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>2048)return send(413,{error:'请求过大'});}
      let query;
      try {query=scope(JSON.parse(body));} catch(error){return send(400,{error:error instanceof SyntaxError?'请求格式错误':error.message});}
      if (!client) return send(503,{error:'请在服务端配置共用的领星 App ID 与 App Secret，再重启增长服务。'});
      if (busy) return send(409,{error:'正在同步其他查询，请稍后重试'});
      busy=true;
      try {
        const snapshot=await collector(client,query);
        const id=createHash('sha256').update(JSON.stringify(query)).digest('hex');
        await mkdir(directory,{recursive:true,mode:0o700});
        const tmp=join(directory,randomUUID()+'.tmp');
        await writeFile(tmp,JSON.stringify(snapshot),{mode:0o600});
        await rename(tmp,join(directory,id+'.json'));
        return send(200,{id,snapshot});
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
