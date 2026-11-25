const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const allowed=new Set(['/ops-api/followup','/ops-api/followup/upload']);
export class FollowupDiskBridge{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=new Map();}
 async fetch(req){
  const url=new URL(req.url);
  if(url.pathname==='/connect'){
   const protocols=(req.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(x=>x.trim());
   if(req.headers.get('Upgrade')!=='websocket'||!this.env.DISK_RELAY_KEY||!protocols.includes('auth.'+this.env.DISK_RELAY_KEY))return json({error:'禁止连接'},403);
   for(const socket of this.ctx.getWebSockets('disk'))socket.close(1000,'replaced by authenticated reconnect');
   const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server,['disk']);
   return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'ops-disk-v1'}});
  }
  if(url.pathname==='/health')return json({ok:true,connected:this.ctx.getWebSockets('disk').some(s=>s.readyState===1),storage:'D-disk'});
  if(url.pathname!=='/relay'||req.headers.get('Authorization')!=='Bearer '+this.env.DISK_RELAY_KEY)return json({error:'禁止访问'},403);
  const socket=this.ctx.getWebSockets('disk').find(s=>s.readyState===1);
  if(!socket)return json({error:'D盘保存服务离线，请保持数据主机开机联网；本机草稿保留'},503);
  if(this.pending.size>=4)return json({error:'D盘服务正在处理其他请求，请稍后重试；草稿保留'},429);
  let input;try{input=await req.json();}catch{return json({error:'无效请求'},400);}
  if(!allowed.has(input.path)||!['GET','POST'].includes(input.method)||!input.user?.id||typeof input.user.id!=='string'||typeof input.body!=='string'||new TextEncoder().encode(input.body).length>3000000)return json({error:'请求格式无效'},400);
  if(input.method==='POST'&&input.user.canEdit===false&&input.user.auth!=='super')return json({error:'当前账号只可查看'},403);
  const id=crypto.randomUUID();
  return new Promise(resolve=>{
   const timer=setTimeout(()=>{this.pending.delete(id);resolve(json({error:'D盘服务响应超时，提交结果未确认；请重试核对，草稿保留'},504));},35000);
   this.pending.set(id,{resolve,timer,socket});
   try{socket.send(JSON.stringify({...input,id}));}catch{clearTimeout(timer);this.pending.delete(id);resolve(json({error:'D盘连接中断，结果未确认；草稿保留'},503));}
  });
 }
 webSocketMessage(socket,message){
  if(typeof message!=='string')return;
  let response;try{response=JSON.parse(message);}catch{return;}
  if(response.kind==='ping'){socket.send(JSON.stringify({kind:'pong'}));return;}
  const pending=this.pending.get(response.id);if(!pending||pending.socket!==socket)return;
  if(!Number.isInteger(response.status)||response.status<200||response.status>599||typeof response.body!=='string')return;
  clearTimeout(pending.timer);this.pending.delete(response.id);pending.resolve(new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Followup-Storage':'D-disk'}}));
 }
 webSocketClose(socket,code){for(const [id,p] of this.pending)if(p.socket===socket){clearTimeout(p.timer);p.resolve(json({error:'D盘连接断开，结果未确认；请重试核对，草稿保留'},503));this.pending.delete(id);}if(code!==1006)try{socket.close(code);}catch{}}
 webSocketError(socket){this.webSocketClose(socket,1006);}
}
export default {async fetch(req,env){
 const path=new URL(req.url).pathname;
 if(!['/connect','/relay','/health'].includes(path))return json({error:'没有这个接口'},404);
 if(path!=='/health'&&!env.DISK_RELAY_KEY)return json({error:'连接尚未配置'},503);
 if(path==='/relay'&&req.headers.get('Authorization')!=='Bearer '+env.DISK_RELAY_KEY)return json({error:'禁止访问'},403);
 return env.DISK_BRIDGE.get(env.DISK_BRIDGE.idFromName('new-product-followup')).fetch(req);
}};
