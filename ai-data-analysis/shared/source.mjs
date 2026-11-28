import {LingxingClient} from './lingxing.mjs';

// Module clients never handle MCP sessions, provider tool names or API credentials.
export function globalSource(env){
  const transport=env.LINGXING_TRANSPORT||'api';
  if(transport==='api'){
    return env.LINGXING_APP_ID && env.LINGXING_APP_SECRET
      ?new LingxingClient({appId:env.LINGXING_APP_ID,appSecret:env.LINGXING_APP_SECRET}):null;
  }
  if(transport!=='mcp')throw Error('未知的领星接入方式');
  const names={
    '/erp/sc/data/seller/lists':env.LINGXING_MCP_SHOPS_TOOL,
    '/erp/sc/data/mws/orders':env.LINGXING_MCP_ORDERS_TOOL,
    '/erp/sc/data/mws/orderDetail':env.LINGXING_MCP_DETAILS_TOOL
  };
  if(Object.values(names).some(n=>!n))throw Error('请配置领星 MCP 的三个只读工具名');
  const url=new URL(env.LINGXING_MCP_URL);
  if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('MCP 远程连接需使用 HTTPS');
  async function connect(){
    const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
    const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client=new Client({name:'ai-data-analysis',version:'1.0'});
    const headers=env.LINGXING_MCP_TOKEN?{Authorization:'Bearer '+env.LINGXING_MCP_TOKEN}:{};
    await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers}}));
    return client;
  }
  return mcpReader(names,connect);
}
export function mcpReader(names,connect){
  let session;
  async function read(path,args){
    if(!names[path])throw Error('未配置只读工具');
    session??=connect();
    try{
      const client=await session;
      const result=await client.callTool({name:names[path],arguments:args});
      if(result.isError)throw Error('领星 MCP 工具调用失败');
      const reply=result.structuredContent??JSON.parse(result.content.find(c=>c.type==='text')?.text||'null');
      if(!Array.isArray(reply?.data) || (reply.code!=null && String(reply.code)!=='0'))throw Error('领星 MCP 工具响应无效');
      return reply;
    }catch(error){
      const previous=session;
      session=null;
      await previous?.then(c=>c.close()).catch(()=>{});
      throw error;
    }
  }
  return {transport:'MCP',read,orderDetails:ids=>read('/erp/sc/data/mws/orderDetail',{order_id:ids.join(',')})};
}
