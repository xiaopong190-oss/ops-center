(function(){
  const parentOrigin='https://xiaopong190-oss.github.io';
  let token='';
  let resolve;const ready=new Promise(r=>{resolve=r;});
  let actualParentOrigin=parentOrigin;try{if(parent.location.origin===location.origin)actualParentOrigin=location.origin;}catch{}
  addEventListener('message',e=>{
    if(e.source===parent&&e.origin===actualParentOrigin&&e.data?.type==='ops-cloud-session'){token=e.data.token||'';resolve();return;}
    if(e.origin===location.origin&&e.data?.type==='ops-cloud-ready'&&[...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))ready.then(()=>e.source.postMessage({type:'ops-cloud-session',token},location.origin));
  });
  if(parent!==window)parent.postMessage({type:'ops-cloud-ready'},actualParentOrigin);
  const original=window.fetch.bind(window);
  window.fetch=async function(input,options){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin===location.origin&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/ops-api/'))){
      await Promise.race([ready,new Promise(r=>setTimeout(r,5000))]);
      const req=new Request(input,options),headers=new Headers(req.headers);if(token)headers.set('Authorization','Bearer '+token);
      if(url.pathname==='/api/connections'&&!headers.has('X-Connection-Admin'))url.pathname='/api/pool';
      return original(new Request(url,req),{headers});
    }
    return original(input,options);
  };
  const params=new URLSearchParams(location.search);
  const file=id=>'playbook-u-'+btoa(unescape(encodeURIComponent(id))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')+'.json';
  window.opsPlaybookCloud={configured:()=>true,async load(id){const r=await fetch('/ops-api/gist/main');if(!r.ok)throw Error('云端读取失败，请重新登录');const g=await r.json();return g.files[file(id)]?JSON.parse(g.files[file(id)].content):null;},async save(id,data){const value={kind:'hongsen-playbook-cloud',version:1,userId:id,updatedAt:Date.now(),...data};const r=await fetch('/ops-api/gist/main',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:{[file(id)]:{content:JSON.stringify(value)}}})});if(!r.ok)throw Error('云端保存失败');return value;}};
  addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.app-switch a,iframe').forEach(el=>{const attr=el.tagName==='IFRAME'?'src':'href',raw=el.getAttribute(attr);if(!raw)return;const u=new URL(raw,location.href);if(u.origin!==location.origin)return;['embedded','opsUser','opsName','opsRole'].forEach(k=>{if(params.has(k))u.searchParams.set(k,params.get(k));});el.setAttribute(attr,u.href);});});
})();
