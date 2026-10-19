(function () {
// Browser transport: small saves use the original endpoint, large saves are staged
// in authenticated, retryable parts. Only the final verified commit becomes live.
async function uploadFollowupPayload(send,payload,progress=()=>{}) {
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  if(bytes.length<=700000)return send('/ops-api/followup',payload);
  if(bytes.length>16*1024*1024)throw Error('数据超过16MB容量保护上限，请先导出归档并联系管理员扩容；原数据未改变');
  const partBytes=512*1024,id=crypto.randomUUID();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  const count=Math.ceil(bytes.length/partBytes);
  const retry=async body=>{
    for(let attempt=0;attempt<3;attempt++){
      try{return await send('/ops-api/followup/upload',body);}
      catch(error){if(attempt===2||(error.status&&error.status<500&&error.status!==429))throw error;}
    }
  };
  await retry({action:'start',id,bytes:bytes.length,count,sha256:hash});
  for(let index=0;index<count;index++){
    const part=bytes.subarray(index*partBytes,(index+1)*partBytes);
    let binary='';for(let offset=0;offset<part.length;offset+=8192)binary+=String.fromCharCode(...part.subarray(offset,offset+8192));
    await retry({action:'part',id,index,content:btoa(binary)});
    progress({completed:index+1,total:count});
  }
  // A response lost after commit is handled by the saved operation IDs on retry.
  return send('/ops-api/followup/upload',{action:'commit',id});
}

  const base = 'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev';
  const requestBase = ['localhost','127.0.0.1'].includes(location.hostname) ? '/ops-cloud' : base;
  const key = 'ops-cloud-session-v1';
  const token = () => { try { return localStorage.getItem(key)||''; } catch { return ''; } };
  async function send(path, data, method) {
    const r=await fetch(requestBase+path,{method:method||(data?'POST':'GET'),headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'云端请求失败'),{status:r.status});return result;
  }
  async function request(path,data,method){
    if(path==='/ops-api/followup'&&data&&(!method||method==='POST'))return uploadFollowupPayload(send,data,progress=>window.dispatchEvent(new CustomEvent('ops-followup-upload-progress',{detail:progress})));
    return send(path,data,method);
  }
  window.OpsCloud={base:requestBase,token,request,async login(name,password){const r=await request('/ops-api/login',{name,password});localStorage.setItem(key,r.token);return r.user;},logout(){localStorage.removeItem(key);}};
  window.addEventListener('message',e=>{
    if(e.origin!==base||e.data?.type!=='ops-cloud-ready')return;
    if(![...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))return;
    e.source.postMessage({type:'ops-cloud-session',token:token()},base);
  });
})();
