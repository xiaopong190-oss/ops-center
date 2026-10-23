import {Buffer} from 'node:buffer';
import {validateBackup} from './logistics-backup.mjs';
import {logisticsStorage} from './logistics-storage.mjs';
const path='data/logistics/shared.json',api='https://api.github.com/repos/xiaopong190-oss/ops-center/contents/'+path;
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const emptyData=()=>({space:'real',storage:{'logistics-company-directory-v1':[],'logistics-quotes-v1':{quotes:[],templates:[]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}});
function headers(env){return {'Accept':'application/vnd.github+json','User-Agent':'ops-center-logistics','X-GitHub-Api-Version':'2022-11-28',...(env.LOGISTICS_GITHUB_TOKEN?{Authorization:'Bearer '+env.LOGISTICS_GITHUB_TOKEN}:{})};}
export async function readGithub(env,send=fetch){
 const response=await send(api+'?ref=main',{headers:headers(env),redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status===404)return {sha:null,document:{schemaVersion:1,data:emptyData()}};
 if(!response.ok){
  const raw=await send('https://raw.githubusercontent.com/xiaopong190-oss/ops-center/main/'+path+'?t='+Date.now(),{headers:{'User-Agent':'ops-center-logistics'},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!raw.ok)fail(502,'GitHub读取失败，请稍后重试');const bytes=Buffer.from(await raw.arrayBuffer());if(bytes.length>16*1024*1024)fail(502,'公开数据超过读取上限');let document;try{document=JSON.parse(bytes.toString('utf8'));validateBackup(document.data);}catch{fail(502,'公开数据校验失败');}
  const blob=Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]);const sha=Buffer.from(await crypto.subtle.digest('SHA-1',blob)).toString('hex');return {sha,document};
 }const file=await response.json();let document;
 try{let bytes;if(file.encoding==='base64')bytes=Buffer.from(file.content.replace(/\s/g,''),'base64');else{if(!/^[0-9a-f]{40,64}$/.test(file.sha)||file.size>16*1024*1024)throw Error();const blob=await send('https://api.github.com/repos/xiaopong190-oss/ops-center/git/blobs/'+file.sha,{headers:headers(env),redirect:'manual',signal:AbortSignal.timeout(30000)});if(!blob.ok)throw Error();const b=await blob.json();if(b.encoding!=='base64')throw Error();bytes=Buffer.from(b.content.replace(/\s/g,''),'base64');}if(bytes.length>16*1024*1024)throw Error();document=JSON.parse(bytes.toString('utf8'));validateBackup(document.data);}catch{fail(502,'GitHub数据文件校验失败，未覆盖本地草稿');}
 return {sha:file.sha,document};
}
export async function saveGithub(input,env,user,send=fetch){
 if(user.canEdit===false&&user.auth!=='super')fail(403,'当前账号只允许查看');if(!env.LOGISTICS_GITHUB_TOKEN)fail(503,'尚未配置GitHub写入凭证，未上传');
 if(!input||!['string','object'].includes(typeof input.baseSha)||(input.baseSha!==null&&!/^[0-9a-f]{40,64}$/.test(input.baseSha))||!/^[0-9a-f-]{36}$/i.test(input.operationId||''))fail(400,'提交版本或操作编号无效');
 const data=validateBackup(input.data),current=await readGithub(env,send);
 if(current.document.operationId===input.operationId)return {ok:true,sha:current.sha,commitSha:current.document.receiptCommit||null,savedAt:current.document.savedAt,url:'https://github.com/xiaopong190-oss/ops-center/blob/main/'+path};
 if(current.sha!==input.baseSha)fail(409,'GitHub数据已被他人更新，本地待提交数据已保留；请先加载最新数据后重新核对');
 const document={schemaVersion:1,operationId:input.operationId,savedAt:new Date().toISOString(),data};const content=Buffer.from(JSON.stringify(document,null,2)+'\n');if(content.length>16*1024*1024)fail(413,'共享数据超过16MiB上限');
 const response=await send(api,{method:'PUT',redirect:'manual',signal:AbortSignal.timeout(45000),headers:{...headers(env),'Content-Type':'application/json'},body:JSON.stringify({message:'Update classified logistics data',branch:'main',...(current.sha?{sha:current.sha}:{}),content:content.toString('base64')})});
 if(response.status===409||response.status===422)fail(409,'GitHub版本冲突，请重新核对后提交，本地数据保留');if(!response.ok)fail(502,'GitHub上传失败，未确认入库');const result=await response.json();if(!result.content?.sha||!result.commit?.sha)fail(502,'GitHub未返回有效提交凭据');return {ok:true,sha:result.content.sha,commitSha:result.commit.sha,savedAt:document.savedAt,url:result.commit.html_url};
}
export async function logisticsGithub(req,env,user=null,assembled=null){
 const url=new URL(req.url);if(req.method==='GET'){const result=await readGithub(env);return Response.json({...result,writeConfigured:!!env.LOGISTICS_GITHUB_TOKEN},{headers:{'Cache-Control':'no-store'}});}
 if(!user)fail(401,'请先登录运营中心');if(url.pathname.endsWith('/upload'))return logisticsStorage({id:'github-staging-'+user.id}).upload(req,env,user,text=>logisticsGithub(new Request('https://local/api/logistics-data',{method:'POST'}),env,user,text));
 if(req.method!=='POST')fail(405,'方法不允许');let text=assembled??await req.text();if(Buffer.byteLength(text)>16*1024*1024)fail(413,'提交超过16MiB');let input;try{input=JSON.parse(text);}catch{fail(400,'无效提交JSON');}return Response.json(await saveGithub(input,env,user),{headers:{'Cache-Control':'no-store'}});
}
