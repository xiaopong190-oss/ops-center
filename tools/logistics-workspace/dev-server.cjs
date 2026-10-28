// Local preview serves the same release files as Pages; never exposes business files.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const routes=new Map(),base=__dirname,engine=path.resolve(base,'../logistics-rating');
for(const file of ['index.html','input.html','display.html','integration-shell.js','simulation.css','local-bootstrap.js','local-data-policy.js','local-view-mode.js','runtime-ready.js','quality-workflow.js','engine-theme.css','workspace-loader.js','snapshot-client.js','record-delta.js','upload-task.js',...['import','compare','warehouses','ratings','monthly','overview'].map(n=>'runtime/'+n+'.html')])routes.set('/tools/logistics-workspace/'+file,path.join(base,file));
const scripts=Object.keys(JSON.parse(fs.readFileSync(path.join(base,'shared-logic.json'))).sharedSourceHashes);
routes.set('/login',path.join(base,'portable-login.html'));routes.set('/index.html',path.join(base,'portable-login.html'));
routes.set('/portable-login.js',path.join(base,'portable-login.js'));
routes.set('/startup',path.join(base,'startup-help.html'));routes.set('/startup-help.js',path.join(base,'startup-help.js'));
routes.set('/data-check',path.join(base,'data-check.html'));routes.set('/data-check.js',path.join(base,'data-check.js'));
for(const page of ['import','compare','warehouses','ratings','monthly','overview']){const html=fs.readFileSync(path.join(base,'runtime',page+'.html'),'utf8');for(const match of html.matchAll(/href="\.\.\/\.\.\/logistics-rating\/([^"?]+\.css)/g)){const file=path.resolve(engine,match[1]);if(file.startsWith(engine+path.sep))routes.set('/tools/logistics-rating/'+match[1],file)}}
for(const file of [...scripts,'extensions/workbook-cleaning-worker.js','extensions/bulk-clean-adoption-worker.js','extensions/import-evidence-worker.js'])routes.set('/tools/logistics-rating/'+file,path.join(engine,file));
const aliases={'/':'input.html','/input':'input.html','/input.html':'input.html','/display':'display.html','/display.html':'display.html'};
const policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace; img-src 'self' data: blob:; object-src 'none'; frame-src 'self'; worker-src 'self'; frame-ancestors 'self'; base-uri 'self'";
function createServer({send=fetch}={}){return http.createServer(async(req,res)=>{
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':policy});res.end(JSON.stringify(value))};
 let url;try{url=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400);return res.end()}
 if(url.pathname==='/local-workspace'||url.pathname==='/local-ai-cleaning'){
  const ai=url.pathname==='/local-ai-cleaning';if(ai&&req.method!=='POST')return json(405,{error:'AI复核只接受POST'});
  if(!['GET','POST'].includes(req.method))return json(405,{error:'方法不允许'});
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)||(req.method==='POST'&&req.headers.origin!=='http://'+req.headers.host))return json(403,{error:'只允许本机工作台请求'});
  if(!/^Bearer [^\s]{1,512}$/.test(req.headers.authorization||''))return json(401,{error:'请先登录运营中心'});
  if(url.search&&url.search!=='?meta=1')return json(400,{error:'不支持的快照参数'});
  try{
   let body;if(req.method==='POST'){if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'需要JSON请求'});const chunks=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>(ai?200000:32*1024*1024))return json(413,{error:ai?'AI复核片段过大':'发布请求超过32MiB'});chunks.push(part)}body=Buffer.concat(chunks).toString('utf8')}
   if(ai){const data=JSON.parse(body||'{}');if(!['quote-cleaning','sheet-quote-detection'].includes(data.purpose)||data.purpose==='quote-cleaning'&&data.exception!==true)return json(400,{error:'只允许物流报价AI复核'})}
   const response=await send('https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/'+(ai?'logistics-ai/recognize':'logistics-workspace')+url.search,{method:req.method,headers:{'Content-Type':'application/json',Authorization:req.headers.authorization},...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(180000)});
   res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':policy});if(response.body)require('node:stream').Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);else res.end();return;
  }catch{return json(502,{error:ai?'AI复核连接失败（LOCAL_AI_NETWORK）；已清洗报价保留，请检查网络后重试':'本机连接云端失败（LOCAL_CLOUD_NETWORK）；上传进度保留，请检查此电脑网络后继续'})}
 }
 if(url.pathname==='/local-session'){
  if(req.method!=='POST')return json(405,{error:'方法不允许'});
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||req.headers.origin!=='http://'+req.headers.host)return json(403,{error:'只允许本机登录页提交'});
  if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'需要JSON请求'});
  try{let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>4096)return json(413,{error:'登录内容过长'})}const input=JSON.parse(raw);
   if(typeof input.password!=='string'||!input.password||input.password.length>200||typeof input.name!=='string'||input.name.length>100||Object.keys(input).some(k=>!['name','password'].includes(k)))return json(400,{error:'请填写姓名和M码'});
   const response=await send('https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/ops-api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)}),result=await response.json();
   if(!response.ok)return json(response.status,{error:result.error||'登录失败'});
   if(typeof result.token!=='string'||result.token.length>512)return json(502,{error:'登录回执无效'});return json(200,{token:result.token,user:result.user});
  }catch{return json(502,{error:'登录服务连接失败，请检查网络后重试'})}
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end('Read-only preview')}
 if(url.pathname==='/health')return json(200,{app:'hangxu-input',version:require('./package.json').version,supervised:process.env.HANGXU_SUPERVISED==='1',snapshotRelay:'chunks-v1'});
 if(aliases[url.pathname]){res.writeHead(302,{Location:'/tools/logistics-workspace/'+aliases[url.pathname]+url.search,'Cache-Control':'no-store'});return res.end()}
 const file=routes.get(url.pathname);if(!file||!fs.existsSync(file)){res.writeHead(404);return res.end('Not found')}const type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res)
})}
const server=createServer();
if(require.main===module)server.listen(Number(process.env.LOGISTICS_UI_PORT||4318),'127.0.0.1',()=>console.log('Shared release preview on http://127.0.0.1:'+(process.env.LOGISTICS_UI_PORT||4318)+'/input'));
module.exports={server,routes,createServer};
