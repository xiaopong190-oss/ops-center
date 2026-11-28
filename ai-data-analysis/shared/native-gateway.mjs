import {request} from 'node:http';

export async function nativeGateway(req,res,url,master,synchronize){
  const path=url.pathname;
  const entry=path==='/system/ad-console';
  const asset=/^\/assets\/[\w.-]+$/.test(path);
  const api=/^\/api\/(profiles|simulation\/profiles|reviews|suggestions|playbook|sync\/status|diagnosis|health)(\/|$)/.test(path);
  if(!entry && !asset && !api)return false;
  function json(status,value){
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(value));
  }
  if(!['GET','POST'].includes(req.method)||req.headers['sec-fetch-site']==='cross-site'||
    (req.method==='POST' && (!api || !req.headers['content-type']?.startsWith('application/json')))){
    json(403,{error:'仅支持系统内访问'});return true;
  }
  const shared=master.nativeAds;
  if(api && req.method==='GET'){
    const profile=path.match(/^\/api\/simulation\/profiles\/([\w-]+)$/);
    if(profile || path==='/api/profiles' || path==='/api/simulation/profiles'){
      const data=profile?shared?.workspaces[profile[1]]:path==='/api/profiles'?shared?.overview:shared?.catalog;
      if(data && (!profile||Object.hasOwn(shared.workspaces,profile[1])))json(200,data);
      else if(!profile)json(200,{profiles:[]});
      else json(404,{error:'共享版本中无此账户'});
      return true;
    }
  }
  if(api && !shared){json(503,{error:'当前共享数据源尚未接入广告业务数据'});return true;}
  await new Promise((resolve,reject)=>{
    const headers={host:req.headers.host};
    for(const key of ['content-type','origin','sec-fetch-site'])if(req.headers[key])headers[key]=req.headers[key];
    const proxy=request({hostname:'127.0.0.1',port:api?3001:4173,path:(entry?'/':path)+url.search,
      method:req.method,headers,signal:AbortSignal.timeout(90000)},async reply=>{
      try{
        if(req.method==='POST' && path.startsWith('/api/simulation/profiles/') && reply.statusCode===200)await synchronize();
        res.writeHead(reply.statusCode,{'Content-Type':reply.headers['content-type']||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        reply.on('error',reject);reply.on('end',resolve);reply.pipe(res);
      }catch(error){reply.resume();reject(error);}
    });
    proxy.on('error',reject);
    req.pipe(proxy);
  });
  return true;
}
