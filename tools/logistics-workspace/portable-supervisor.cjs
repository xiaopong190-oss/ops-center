// Owns only the child process it starts; unrelated port occupants are never stopped.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
function healthy(port){return new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:1500,agent:false},response=>{let raw='';response.on('data',part=>{raw+=part;if(raw.length>4096)req.destroy()});response.on('end',()=>{try{resolve(JSON.parse(raw).app==='hangxu-input')}catch{resolve(false)}})});req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false))})}
function childEnvironment(env,port){const next={...env,LOGISTICS_UI_PORT:String(port),HANGXU_SUPERVISED:'1',NO_PROXY:[env.NO_PROXY,'127.0.0.1','localhost'].filter(Boolean).join(',')};delete next.NODE_OPTIONS;return next}
async function supervise({port=4318,serverFile=path.join(__dirname,'dev-server.cjs'),logRoot=path.resolve(__dirname,'../../logs'),signal,interval=2000,poll=250,readyTimeout=12000,maxFailures=3}={}){
 fs.mkdirSync(logRoot,{recursive:true});const log=text=>fs.appendFileSync(path.join(logRoot,'startup.log'),new Date().toISOString()+' '+text+'\n');let child=null,failures=0;
 const pause=ms=>new Promise(resolve=>{if(signal?.aborted)return resolve();const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()},timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true})});
 const stop=async()=>{if(child&&child.exitCode===null&&!child.killed){const owned=child;await new Promise(resolve=>{owned.once('exit',resolve);owned.kill()})}child=null};
 try{while(!signal?.aborted){if(await healthy(port)){failures=0;await pause(interval);continue}
  await stop();let occupied=false;log('Starting local input service');child=spawn(process.execPath,[serverFile],{cwd:path.dirname(serverFile),windowsHide:true,env:childEnvironment(process.env,port),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>log(chunk.toString().trim()));child.stderr.on('data',chunk=>{const text=chunk.toString();if(text.includes('EADDRINUSE'))occupied=true;log(text.trim())});child.on('error',error=>log('Child launch failed: '+error.code));
  const deadline=Date.now()+readyTimeout;let ready=false;while(!signal?.aborted&&Date.now()<deadline&&child.exitCode===null){if(await healthy(port)){ready=true;break}await pause(poll)}
  if(ready){log('Service healthy; automatic recovery enabled');await pause(interval);continue}
  await stop();if(occupied)throw Error('4318端口已被其他程序占用；未结束其他程序。');if(++failures>=maxFailures)throw Error('连续启动失败，请查看 logs/startup.log');await pause(1000)
 }}finally{await stop()}
}
if(require.main===module){const controller=new AbortController();for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>controller.abort());supervise({port:Number(process.env.LOGISTICS_UI_PORT||4318),signal:controller.signal}).catch(error=>{try{fs.appendFileSync(path.resolve(__dirname,'../../logs/startup.log'),error.message+'\n')}catch{}process.exitCode=1})}
module.exports={healthy,childEnvironment,supervise};
