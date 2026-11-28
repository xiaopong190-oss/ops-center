import {globalSource} from './source.mjs';

const settings={
  api:['LINGXING_APP_ID','LINGXING_APP_SECRET'],
  mcp:['LINGXING_MCP_URL','LINGXING_MCP_SHOPS_TOOL','LINGXING_MCP_ORDERS_TOOL','LINGXING_MCP_DETAILS_TOOL'],
  llm:['OPENAI_API_KEY','OPENAI_MODEL']
};
const labels={api:'领星 API',mcp:'领星 MCP',llm:'OpenAI 模型 API'};
export function connections(env=process.env,{fetchImpl=fetch,sourceFactory=globalSource}={}){
  const selected=env.LINGXING_TRANSPORT||'api', clients=new Map();
  function status(id){
    const missing=settings[id].filter(key=>!env[key]?.trim());
    return {id,label:labels[id],configured:!missing.length,missing,model:id==='llm'?env.OPENAI_MODEL:undefined};
  }
  function requireSettings(id){
    if(!Object.hasOwn(settings,id))throw Error('未知的接入服务');
    if(!status(id).configured)throw Error(labels[id]+' 缺少服务端配置');
  }
  function dataClient(id=selected){
    if(!['api','mcp'].includes(id))throw Error('未知的数据通道');
    requireSettings(id);
    if(!clients.has(id))clients.set(id,sourceFactory({...env,LINGXING_TRANSPORT:id}));
    return clients.get(id);
  }
  async function openai(path,options){
    requireSettings('llm');
    const response=await fetchImpl('https://api.openai.com/v1/'+path,{...options,redirect:'error',signal:AbortSignal.timeout(60000),
      headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'}});
    if(!response.ok)throw Error('OpenAI HTTP '+response.status);
    return response.json();
  }
  return {
    describe:()=>({selected,providers:Object.keys(settings).map(status)}),
    source:{transport:selected.toUpperCase(),read:(...args)=>dataClient().read(...args),orderDetails:ids=>dataClient().orderDetails(ids)},
    async check(id){
      requireSettings(id);
      if(id==='llm')await openai('models/'+encodeURIComponent(env.OPENAI_MODEL),{method:'GET'});
      else await dataClient(id).read('/erp/sc/data/seller/lists',{});
      return {ok:true};
    },
    async generate(input){
      const result=await openai('responses',{method:'POST',body:JSON.stringify({model:env.OPENAI_MODEL,input,store:false,max_output_tokens:2048})});
      const text=result.output?.filter(o=>o.type==='message').flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
      if(result.status!=='completed'||!text)throw Error('模型未返回完整文本');
      return {text,model:result.model||env.OPENAI_MODEL};
    }
  };
}
