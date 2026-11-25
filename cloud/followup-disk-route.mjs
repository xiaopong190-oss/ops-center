export async function routeFollowupToDisk(req,env,user){
 if(env.FOLLOWUP_DISK_MIGRATING==='1'&&req.method!=='GET')return Response.json({error:'新品数据正在切换到D盘，原草稿保留，请稍后继续上传'},{status:503});
 if(env.FOLLOWUP_DISK_ENABLED!=='1')return null;
 if(!env.FOLLOWUP_DISK_RELAY||!env.DISK_RELAY_KEY)return Response.json({error:'D盘服务尚未连接，原草稿保留'},{status:503});
 const body=req.method==='POST'?await req.text():'';
 if(new TextEncoder().encode(body).length>3000000)return Response.json({error:'请使用分片上传'},{status:413});
 try{return await env.FOLLOWUP_DISK_RELAY.fetch('https://followup-disk/relay',{method:'POST',headers:{Authorization:'Bearer '+env.DISK_RELAY_KEY,'Content-Type':'application/json'},body:JSON.stringify({path:new URL(req.url).pathname,method:req.method,body,user})});}
 catch{return Response.json({error:'D盘连接暂时中断，原草稿保留，请重试核对'},{status:503});}
}
