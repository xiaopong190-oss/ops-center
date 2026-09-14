(function () {
  const base = 'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev';
  const key = 'ops-cloud-session-v1';
  const token = () => { try { return localStorage.getItem(key)||''; } catch { return ''; } };
  async function request(path, data, method) {
    const r=await fetch(base+path,{method:method||(data?'POST':'GET'),headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const result=await r.json();if(!r.ok)throw Error(result.error||'云端请求失败');return result;
  }
  window.OpsCloud={base,token,request,async login(name,password){const r=await request('/ops-api/login',{name,password});localStorage.setItem(key,r.token);return r.user;},logout(){localStorage.removeItem(key);}};
  window.addEventListener('message',e=>{
    if(e.origin!==base||e.data?.type!=='ops-cloud-ready')return;
    if(![...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))return;
    e.source.postMessage({type:'ops-cloud-session',token:token()},base);
  });
})();
