import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),config=JSON.parse(fs.readFileSync(path.join(root,'data','connection.json'),'utf8'));
const lock=path.join(root,'data','client.pid');
if(!process.argv.includes('--import')){
 if(fs.existsSync(lock)){const old=Number(fs.readFileSync(lock,'utf8'));try{process.kill(old,0);process.exit(0);}catch{}}
 fs.writeFileSync(lock,String(process.pid));process.on('exit',()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}});
}
const store=openStore(path.join(root,'data'));
if(process.argv.includes('--import')){console.log(JSON.stringify(await store.importSnapshot(path.join(root,'data','cloud-latest-verified.json'))));store.close();process.exit(0);}
let socket,reconnect,timer,lastPong=0,stopping=false;
const log=(event,fields={})=>fs.appendFileSync(path.join(root,'data','connection.log'),JSON.stringify({at:new Date().toISOString(),event,...fields})+'\n');
function connect(){
 if(stopping)return;
 socket=new WebSocket(config.url,['ops-disk-v1','auth.'+config.key]);
 socket.addEventListener('open',()=>{lastPong=Date.now();log('connected');clearInterval(timer);timer=setInterval(()=>{if(socket.readyState!==1||Date.now()-lastPong>90000){socket.close();return;}socket.send(JSON.stringify({kind:'ping'}));},25000);});
 socket.addEventListener('message',async event=>{
  let input;try{input=JSON.parse(event.data);}catch{return;}
  if(input.kind==='pong'){lastPong=Date.now();return;}
  if(typeof input.id!=='string')return;
  try{const response=await store.handle(input);if(socket.readyState===1)socket.send(JSON.stringify({id:input.id,...response}));log('request',{method:input.method,path:input.path,status:response.status});}
  catch(error){log('request_error',{code:error.code||error.name});}
 });
 socket.addEventListener('error',()=>log('connection_error'));
 socket.addEventListener('close',()=>{clearInterval(timer);log('disconnected');if(!stopping)reconnect=setTimeout(connect,5000);});
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;clearTimeout(reconnect);clearInterval(timer);socket?.close();setTimeout(()=>process.exit(0),1000).unref();});
connect();
