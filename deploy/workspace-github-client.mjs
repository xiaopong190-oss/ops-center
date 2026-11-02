// Diagnostics contain only fixed operation labels, never request bodies or credentials.
const api='https://api.github.com/repos/xiaopong190-oss/ops-center/';
const routes=[[/^git\/blobs$/,'git/blobs'],[/^git\/blobs\/[a-f0-9]{40}$/,'git/blobs/:sha'],[/^git\/ref\/heads\/main$/,'git/ref/heads/main'],[/^contents\/data\/logistics\/workspace-snapshot\.enc\.json\?ref=(?:main|[a-f0-9]{40})$/,'contents/workspace-snapshot?ref=:ref'],[/^git\/commits\/[a-f0-9]{40}$/,'git/commits/:sha'],[/^git\/trees$/,'git/trees'],[/^git\/commits$/,'git/commits'],[/^git\/refs\/heads\/main$/,'git/refs/heads/main']];
const stages=new Set(['part-write','part-readback','root-write','branch-read','baseline-read','commit-read','tree-write','commit-write','branch-update','root-readback']);
export function createGitHubClient({token,send=fetch,report=entry=>console.error('GitHub request diagnostic: '+JSON.stringify(entry))}){
 let sequence=0;
 return async function github(path,{method='GET',body,allow404=false,stage,part}={}){
  const diagnostic={sequence:++sequence,method:['GET','POST','PATCH'].includes(method)?method:'OTHER',endpoint:routes.find(([re])=>re.test(path))?.[1]||'unrecognized',stage:stages.has(stage)?stage:'unspecified',...(Number.isSafeInteger(part)&&part>=0&&part<256?{part}:{} )};
  const emit=entry=>{try{report({...diagnostic,...entry})}catch{}};
  let r;try{r=await send(api+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ops-center-snapshot-publisher'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(60000)})}catch(error){emit({kind:'network'});throw error}
  if(allow404&&r.status===404)return null;
  if(!r.ok){const id=r.headers.get('x-github-request-id');emit({kind:'http',status:r.status,...(/^[a-f0-9:]{1,100}$/i.test(id||'')?{requestId:id}:{})});throw Object.assign(Error('GITHUB_'+r.status),{code:'GITHUB_'+r.status,status:r.status,githubRequest:diagnostic})}
  try{return await r.json()}catch(error){emit({kind:'invalid-json',status:r.status});throw error}
 };
}
