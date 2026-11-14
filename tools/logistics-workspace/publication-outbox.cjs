// Local durable, encrypted recovery packages. Credentials stay in memory only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function atomic(file,bytes){const temp=file+'.new-'+crypto.randomUUID();let fd;try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(temp,file);if(process.platform!=='win32'){const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}}}finally{if(fd!==null&&fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp)}}
function defaultRoot(){return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'Hangxu','PublicationOutbox');}
function create({root=defaultRoot(),key,beforeWrite=()=>{}}={}){
 root=path.resolve(root);fs.mkdirSync(root,{recursive:true,mode:0o700});
 function synchronized(fn){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,'outbox-guard.sqlite'));try{db.exec('PRAGMA busy_timeout=15000; CREATE TABLE IF NOT EXISTS guard(id INTEGER PRIMARY KEY); BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}finally{db.close()}}
 // Windows master key is protected by DPAPI CurrentUser. Test keys are injected.
 if(!key){const file=path.join(root,'key.dpapi');if(process.platform==='win32'){
  const {execFileSync}=require('node:child_process'),run=(action,bytes)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $out=[Security.Cryptography.ProtectedData]::"+action+"($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($out))"],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000});
  key=synchronized(()=>{if(!fs.existsSync(file))atomic(file,Buffer.from(run('Protect',crypto.randomBytes(32)),'base64'));return Buffer.from(run('Unprotect',fs.readFileSync(file)),'base64')});
 }else{const file=path.join(root,'key');key=synchronized(()=>{if(!fs.existsSync(file))atomic(file,crypto.randomBytes(32));return fs.readFileSync(file)});}}
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('本地恢复密钥不可用；原任务保留');
 const filename=(owner,id)=>{if(!/^[a-f0-9]{64}$/.test(owner||'')||!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('本地任务身份无效');return path.join(root,owner+'-'+id+'.job')};
 const unpack=file=>{const b=fs.readFileSync(file);if(b.length>160*1024*1024||b.length<28)throw Error('本地恢复包损坏');const decipher=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAAD(Buffer.from(path.basename(file)));decipher.setAuthTag(b.subarray(12,28));const plain=Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]),value=JSON.parse(plain);if(digest(Buffer.from(value.task.transport||value.task.raw||''))!==value.contentHash)throw Error('本地恢复包摘要不一致');return value};
 function load(owner,id){const file=filename(owner,id);if(!fs.existsSync(file))return null;return unpack(file)}
 function saveUnlocked(owner,task){
  const file=filename(owner,task.operationId),raw=Buffer.from(task.transport||task.raw||'');if(!task.frozen||!raw.length||raw.length>64*1024*1024||!Number.isSafeInteger(task.confirmedAt))throw Error('固定发布任务无效');
  // Explicit whitelist prevents accidentally persisting tokens/passwords in a task.
  const allowed=['operationId','confirmedAt','protocol','baseSha','baseContentHash','batch','transport','raw','frozen','total','recordDelta','nextIndex','session','ownerScope','persisted','reliable','archiveOnly','archiveAcknowledged'];
  const frozen=Object.fromEntries(allowed.filter(k=>task[k]!==undefined).map(k=>[k,task[k]]));
  if(frozen.raw===frozen.transport)delete frozen.raw;
  if(frozen.batch){frozen.batchId=frozen.batch.id;delete frozen.batch;}
  const contentHash=digest(raw),prior=load(owner,task.operationId);
  if(prior){if(prior.contentHash!==contentHash||prior.task.confirmedAt!==task.confirmedAt)throw Error('原本地任务内容或确认时间不可修改');return prior;}
  const value={schema:2,owner,contentHash,task:frozen,savedAt:Date.now(),state:'LOCAL_SAVED'},iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(path.basename(file)));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);beforeWrite(file);atomic(file,Buffer.concat([iv,cipher.getAuthTag(),encrypted]));const actual=unpack(file);if(actual.contentHash!==contentHash)throw Error('本地任务落盘读回不一致');return actual;
 }
 function list(owner){if(!/^[a-f0-9]{64}$/.test(owner||''))throw Error('本地任务归属无效');return fs.readdirSync(root).filter(n=>n.startsWith(owner+'-')&&n.endsWith('.job')).map(n=>unpack(path.join(root,n))).sort((a,b)=>a.task.confirmedAt-b.task.confirmedAt||a.task.operationId.localeCompare(b.task.operationId));}
 // Recovery packages are intentionally retained on success; UI cleanup never
 // deletes the sole backup. Retention/explicit cleanup is a separate operation.
 const save=(owner,task)=>synchronized(()=>saveUnlocked(owner,task));
 function mark(owner,id,state,receipt){return synchronized(()=>{const file=filename(owner,id),value=load(owner,id);if(!value)throw Error('本地恢复包不存在');if(['SUCCEEDED','ARCHIVED'].includes(value.state)){if(receipt&&JSON.stringify(value.receipt)!==JSON.stringify(receipt))throw Error('原成功回执不可覆盖');return value;}if(value.state===state&&(!receipt||JSON.stringify(receipt)===JSON.stringify(value.receipt)))return value;value.state=state;value.updatedAt=Date.now();if(receipt)value.receipt=receipt;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(path.basename(file)));const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);atomic(file,Buffer.concat([iv,cipher.getAuthTag(),bytes]));return unpack(file)});}
 function cleanup(now=Date.now()){return synchronized(()=>{let deleted=0;for(const name of fs.readdirSync(root)){if(!/^[a-f0-9]{64}-[a-f0-9-]{36}\.job$/i.test(name))continue;const file=path.join(root,name);let value;try{value=unpack(file)}catch{continue;}if(['SUCCEEDED','ARCHIVED','CANCELLED','SUPERSEDED'].includes(value.state)&&Number.isFinite(value.updatedAt)&&(now-value.updatedAt)>30*86400000){fs.unlinkSync(file);deleted++;}}return {deleted,retentionDays:30}});}
 return {save,load,list,mark,cleanup,root};
}
module.exports={create,atomic,defaultRoot,digest};
