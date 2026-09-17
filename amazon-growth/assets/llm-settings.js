(function(){
  'use strict';
  const specs={auto:['自动（Cloudflare 优先）',''],cloudflare:['Cloudflare',''],gemini:['Gemini','gemini-3.8-flash'],deepseek:['DeepSeek','deepseek-flash'],anthropic:['Claude','claude-sonnet-4-6']};
  const user=new URLSearchParams(location.search).get('opsUser')||'local';
  const storageKey='growth-ai-v1:'+user;
  const read=(store,key)=>{try{return JSON.parse(store.getItem(key)||'{}');}catch{return {};}};
  let prefs=read(localStorage,storageKey), secrets=read(sessionStorage,storageKey);
  let current=specs[prefs.provider]?prefs.provider:'auto';
  function config(base){const provider=specs[prefs.provider]?prefs.provider:'auto';return {...base,llmProvider:provider,model:prefs[provider]?.model||specs[provider][1],llmKey:secrets[provider]||''};}
  window.LLMSettings={config};
  const modal=document.createElement('div');modal.className='modal';modal.hidden=true;
  modal.innerHTML='<div class="modal-box" role="dialog" aria-modal="true" aria-label="AI 设置"><div class="modal-hd"><h2>AI 设置</h2><button class="btn" id="ai-close">关闭</button></div><div class="modal-bd"><div class="field"><label for="ai-provider">分析服务</label><select id="ai-provider">'+Object.entries(specs).map(([id,s])=>'<option value="'+id+'">'+s[0]+'</option>').join('')+'</select></div><div id="ai-fields"><div class="field"><label for="ai-key">API Key</label><input id="ai-key" type="password" autocomplete="new-password" placeholder="服务端已配置时可留空"></div><div class="field"><label for="ai-model">模型名称</label><input id="ai-model" autocomplete="off"></div><p class="hint">密钥仅在当前标签页会话保存，关闭标签页后需重新填写。模型与服务选择会记住。请求通过本站服务端发送至所选服务商。</p></div><p id="ai-note" class="hint"></p><div class="modal-actions"><button class="btn" id="ai-test">测试 AI（少量用量）</button><button class="btn btn-primary" id="ai-save">保存</button></div><p id="ai-status" role="status"></p></div></div>';
  document.body.appendChild(modal);
  const el=id=>modal.querySelector('#ai-'+id);
  let draft={},keys={};
  function capture(){draft[current]={model:el('model').value.trim()};keys[current]=el('key').value.trim();}
  function show(){el('provider').value=current;el('fields').hidden=['auto','cloudflare'].includes(current);el('model').value=draft[current]?.model||specs[current][1];el('key').value=keys[current]||'';el('note').textContent=current==='auto'?'优先使用 Cloudflare；不可用时使用管理员已配置的 Claude 备用服务。':current==='cloudflare'?'仅使用 Cloudflare；不可用时提醒你选择其他服务。':'生成报告时使用 '+specs[current][0]+'，不自动切换到其他服务。';el('status').textContent='';}
  document.getElementById('llmSettings').addEventListener('click',()=>{draft=JSON.parse(JSON.stringify(prefs));keys={...secrets};current=specs[prefs.provider]?prefs.provider:'auto';show();modal.hidden=false;el('provider').focus();});
  el('provider').onchange=()=>{capture();current=el('provider').value;show();};
  function close(){modal.hidden=true;el('key').value='';keys={};document.getElementById('llmSettings').focus();}
  el('close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
  el('save').onclick=()=>{capture();draft.provider=current;try{sessionStorage.setItem(storageKey,JSON.stringify(keys));localStorage.setItem(storageKey,JSON.stringify(draft));prefs=draft;secrets=keys;close();}catch{el('status').textContent='浏览器禁止保存设置，请启用本站存储后重试。';}};
  el('test').onclick=async()=>{
    capture();const provider=current;el('test').disabled=true;el('status').textContent='正在测试…';
    try{
      const headers={'Content-Type':'application/json'};if(keys[provider])headers['X-LLM-Key']=keys[provider];
      const legacy=read(localStorage,'xiyou-console-v1').cfg||{};if(legacy.proxyToken)headers['X-Proxy-Token']=legacy.proxyToken;
      const base=(legacy.proxy||location.origin).replace(/\/$/,'');
      const response=await fetch(base+'/api/claude',{method:'POST',headers,body:JSON.stringify({provider,model:draft[provider]?.model||undefined,max_tokens:256,messages:[{role:'user',content:'Reply with OK.'}]}),signal:AbortSignal.timeout(150000)});
      const data=await response.json();if(!response.ok)throw Error(typeof data.error==='string'?data.error:'测试失败（HTTP '+response.status+'）');
      el('status').textContent='连接成功：'+data.provider+' / '+data.model;
    }catch(e){el('status').textContent=e.message||'连接失败';}finally{el('test').disabled=false;}
  };
})();
