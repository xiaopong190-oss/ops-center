(function () {
// Each attempt queries durable server receipts before sending any missing parts.
async function uploadFollowupPayload(send,payload,progress=()=>{},scope='') {
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  if(bytes.length>16*1024*1024)throw Error('数据超过16MB容量保护上限，请先导出归档并联系管理员扩容；原数据未改变');
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
  const hash=await digest(bytes),key=await digest(new TextEncoder().encode(scope+':'+hash));
  const id=key.slice(0,8)+'-'+key.slice(8,12)+'-'+key.slice(12,16)+'-'+key.slice(16,20)+'-'+key.slice(20,32);
  const partBytes=512*1024,count=Math.ceil(bytes.length/partBytes),hashes=[];
  for(let i=0;i<count;i++)hashes.push(await digest(bytes.subarray(i*partBytes,(i+1)*partBytes)));
  let completed=0;
  const report=phase=>progress({completed,total:count,phase});
  try {
    report('checking');
    let status;
    try {status=await send('/ops-api/followup/upload',{action:'status',id});}
    catch(error){if(![404,410].includes(error.status))throw error;}
    if(!status){await send('/ops-api/followup/upload',{action:'start',id,bytes:bytes.length,count,sha256:hash,hashes});status=await send('/ops-api/followup/upload',{action:'status',id});}
    const received=new Set((status.parts||[]).filter(p=>p.sha256===hashes[p.index]).map(p=>p.index));
    completed=received.size;report('uploading');
    for(let index=0;index<count;index++){
      if(received.has(index))continue;
      const part=bytes.subarray(index*partBytes,(index+1)*partBytes);
      let binary='';for(let offset=0;offset<part.length;offset+=8192)binary+=String.fromCharCode(...part.subarray(offset,offset+8192));
      const receipt=await send('/ops-api/followup/upload',{action:'part',id,index,content:btoa(binary),sha256:hashes[index]});
      if(receipt.sha256!==hashes[index])throw Error('分片保存确认校验失败');
      completed++;report('uploading');
    }
    report('verifying');
    const saved=await send('/ops-api/followup/upload',{action:'commit',id});
    if(!saved?.data||!Number.isSafeInteger(saved.revision))throw Error('云端提交尚未确认');
    report('complete');return saved;
  } catch(error) {
    report('paused');
    if(error.status&&[400,401,403,409,413,507].includes(error.status)){if(error.status!==409)error.uploadPaused=true;throw error;}
    throw Object.assign(Error('已保留'+completed+'片，点击继续上传；'+error.message),{status:error.status,uploadPaused:true,completed,total:count});
  }
}

  const base = 'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev';
  const requestBase = ['localhost','127.0.0.1'].includes(location.hostname) ? '/ops-cloud' : base;
  const key = 'ops-cloud-session-v1';
  const token = () => { try { return localStorage.getItem(key)||''; } catch { return ''; } };
  async function send(path, data, method) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
    const r=await fetch(requestBase+path,{signal:controller.signal,method:method||(data?'POST':'GET'),headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'云端请求失败'),{status:r.status});return result;
    } catch(error) {if(error.name==='AbortError')throw Error('连接超时，请检查网络后重试');throw error;} finally {clearTimeout(timer);}
  }
  async function request(path,data,method){
    if(path==='/ops-api/followup'&&data&&(!method||method==='POST'))return uploadFollowupPayload(send,data,progress=>window.dispatchEvent(new CustomEvent('ops-followup-upload-progress',{detail:progress})),token());
    return send(path,data,method);
  }
  window.OpsCloud={base:requestBase,token,request,async login(name,password){const r=await request('/ops-api/login',{name,password});localStorage.setItem(key,r.token);return r.user;},logout(){localStorage.removeItem(key);}};
  window.addEventListener('message',e=>{
    if(e.origin!==base||e.data?.type!=='ops-cloud-ready')return;
    if(![...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))return;
    e.source.postMessage({type:'ops-cloud-session',token:token()},base);
  });
})();
