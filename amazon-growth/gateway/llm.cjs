const providers = {
  gemini: {url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-3.8-flash',secret:'GEMINI_API_KEY'},
  deepseek: {url:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',secret:'DEEPSEEK_API_KEY'},
  anthropic: {url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-6',secret:'ANTHROPIC_API_KEY'}
};
const cfModel='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
function fail(status,message){throw Object.assign(new Error(message),{status});}
async function generate(payload, env={}, key='', fetcher=(...args)=>fetch(...args), sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  const provider=payload.provider||'auto';
  if(!['auto','cloudflare',...Object.keys(providers)].includes(provider))fail(400,'不支持的 AI 服务');
  if(!Array.isArray(payload.messages)||!payload.messages.length)fail(400,'LLM 消息为空');
  const messages=payload.messages.filter(m=>m&&['user','assistant','system'].includes(m.role)).map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)}));
  if(payload.system)messages.unshift({role:'system',content:String(payload.system)});
  const max_tokens=Math.max(1,Math.min(Number(payload.max_tokens)||4000,8000));
  if(provider==='auto'||provider==='cloudflare'){
    try{
      if(!env.AI)throw Error('未配置');
      const data=await env.AI.run(cfModel,{messages,max_tokens:Math.min(max_tokens,4000)});
      const text=data?.response||data?.result?.response||data?.choices?.[0]?.message?.content;
      if(!text)throw Error('空响应');
      return {content:[{type:'text',text}],provider:'cloudflare',model:cfModel,usage:data.usage||{}};
    }catch{
      if(provider==='auto'&&env.ANTHROPIC_API_KEY)return generate({...payload,provider:'anthropic'},env,'',fetcher);
      fail(503,'Cloudflare AI 暂不可用或额度不足，请在 AI 设置中选择 Gemini、DeepSeek 或 Claude 并填写 API Key。');
    }
  }
  const spec=providers[provider];
  key=String(key||env[spec.secret]||'').trim();
  if(!key)fail(400,'请在 AI 设置中填写 '+provider+' API Key，或由管理员配置服务端密钥。');
  const model=payload.model||spec.model;
  const headers={'Content-Type':'application/json'};
  let request={model,messages,max_tokens,stream:false};
  if(provider==='anthropic'){
    headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    request={model,messages:payload.messages,max_tokens,...(payload.system?{system:payload.system}:{})};
  }else headers.Authorization='Bearer '+key;
  let response;
  const retryable=new Set([408,429,500,502,503,504]);
  for(let attempt=0;attempt<3;attempt++){
    try{response=await fetcher(spec.url,{method:'POST',headers,body:JSON.stringify(request),redirect:'manual',signal:AbortSignal.timeout(45000)});}
    catch{
      if(attempt===2)fail(502,provider+' 连接失败或超时，已自动重试 3 次，请稍后再试。');
      await sleep(700*Math.pow(2,attempt)+Math.floor(Math.random()*250));continue;
    }
    if(response.ok||!retryable.has(response.status)||attempt===2)break;
    const retryAfter=Math.min(5000,Math.max(0,Number(response.headers.get('retry-after'))*1000||0));
    await sleep(retryAfter||700*Math.pow(2,attempt)+Math.floor(Math.random()*250));
  }
  if(!response.ok){
    const hint=response.status===401||response.status===403?'密钥无效或无访问权限':response.status===429?'额度不足或请求过于频繁，已自动重试 3 次':response.status===503?'服务临时繁忙或不可用，已自动重试 3 次，请稍后再试':response.status===404?'模型不存在，请检查模型名称':'服务暂时异常，已自动重试 3 次，请稍后再试';
    fail(response.status>=400?response.status:502,provider+'：'+hint+'（HTTP '+response.status+'）');
  }
  const data=await response.json().catch(()=>null);
  const text=provider==='anthropic'?(data?.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'):data?.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim())fail(502,provider+' 未返回可用文本，请重试或更换模型。');
  return {content:[{type:'text',text}],provider,model:data.model||model,usage:data.usage||{}};
}
module.exports={generate,providers};
