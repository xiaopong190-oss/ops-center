const assert=require('node:assert/strict');
const {generate}=require('../gateway/llm.cjs');
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const input={messages:[{role:'user',content:'Analyze evidence'}],system:'Use evidence only',max_tokens:4000};
  for(const provider of ['gemini','deepseek','anthropic']){
    let sent;
    const result=await generate({...input,provider,model:'custom-model'},{AI:{run(){throw Error('Wrong provider');}}},'test-secret',async(url,opts)=>{
      sent={url,opts,body:JSON.parse(opts.body)};
      return Response.json(provider==='anthropic'?{content:[{type:'text',text:'analysis'}]}:{choices:[{message:{content:'analysis'}}]});
    });
    assert.equal(result.provider,provider);assert.equal(result.content[0].text,'analysis');
    assert.equal(sent.body.model,'custom-model');assert.equal(sent.opts.redirect,'manual');
    assert(!JSON.stringify(sent.body).includes('test-secret'));
    assert.equal(provider==='anthropic'?sent.opts.headers['x-api-key']:sent.opts.headers.Authorization,provider==='anthropic'?'test-secret':'Bearer test-secret');
    assert(sent.url.startsWith(provider==='gemini'?'https://generativelanguage.googleapis.com/':provider==='deepseek'?'https://api.deepseek.com/':'https://api.anthropic.com/'));
    await assert.rejects(generate({...input,provider},{},''),/API Key/);
    await assert.rejects(generate({...input,provider},{},'test-secret',async()=>Response.json({error:'test-secret'},{status:401})),e=>e.status===401&&!e.message.includes('test-secret'));
    await assert.rejects(generate({...input,provider},{},'test-secret',async()=>Response.json({})),/未返回可用文本/);
  }
  assert.equal((await generate(input,{AI:{run:async()=>({response:'cf text'})}})).provider,'cloudflare');
  await assert.rejects(generate({...input,provider:'cloudflare'},{AI:{run:async()=>{throw Error('quota');}},ANTHROPIC_API_KEY:'secret'}),/Cloudflare/);
  assert.equal((await generate(input,{ANTHROPIC_API_KEY:'secret'},'',async()=>Response.json({content:[{type:'text',text:'fallback'}]}))).provider,'anthropic');
  await assert.rejects(generate({...input,provider:'evil'},{},'key'),/不支持/);
  let sent;
  const ctx={window:{LLMSettings:{config:base=>({...base,llmProvider:'deepseek',llmKey:'user-key',model:'deepseek-flash'})}},AbortSignal,fetch:async(url,opts)=>{sent={url,opts};return Response.json({provider:'deepseek',model:'deepseek-flash',content:[{type:'text',text:'ok'}]});}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/claude.js'),'utf8'),ctx);
  const report=await ctx.window.Analyst.analyze({mode:'proxy',proxy:'https://app.example'}, {name:'test'}, {}, []);
  assert.equal(JSON.parse(sent.opts.body).provider,'deepseek');assert.equal(sent.opts.headers['X-LLM-Key'],'user-key');assert.equal(report.provider,'deepseek');
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',focus(){},addEventListener(event,fn){this[event]=fn;}});return elements.get(id);};
  const memory=()=>{const data={};return {getItem:k=>data[k],setItem:(k,v)=>{data[k]=v;}};};
  const local=memory(),session=memory();
  const ui={window:{},location:{search:'?opsUser=test-user',origin:'https://app.example'},URLSearchParams,localStorage:local,sessionStorage:session,
    document:{createElement:()=>({querySelector:element,addEventListener(){}}),body:{appendChild(){}},getElementById:element,addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/llm-settings.js'),'utf8'),ui);
  element('llmSettings').click();element('#ai-provider').value='gemini';element('#ai-provider').onchange();
  element('#ai-key').value='gemini-secret';element('#ai-model').value='gemini-custom';
  element('#ai-provider').value='deepseek';element('#ai-provider').onchange();assert.equal(element('#ai-key').value,'');
  element('#ai-key').value='deepseek-secret';element('#ai-save').onclick();
  assert.equal(ui.window.LLMSettings.config({}).llmKey,'deepseek-secret');
  assert(!local.getItem('growth-ai-v1:test-user').includes('secret'));
  element('llmSettings').click();element('#ai-provider').value='gemini';element('#ai-provider').onchange();
  assert.equal(element('#ai-key').value,'gemini-secret');assert.equal(element('#ai-model').value,'gemini-custom');
  console.log('PASS Gemini / DeepSeek / Claude routing, key isolation, errors, Cloudflare fallback, browser selection');
})().catch(e=>{console.error(e);process.exitCode=1;});
