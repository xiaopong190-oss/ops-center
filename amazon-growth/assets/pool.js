(function(){'use strict';
 const certain=e=>/^HTTP (429|402)\b/.test(e.message||'')||/本组可用连接已耗尽|weekly credit|WeeklyCreditBalanceInsufficient|(?:insufficient[_ ]credits|quota[_ ]exceeded|rate[_ ]limit[_ ]exceeded|额度不足|余额不足)/i.test(e.message||'');
 class Pool{
  constructor(cfg,provider='xiyou'){this.cfg=cfg;this.provider=provider;this.clients=new Map();this.index=0;this.schemas={};this.events=[];this.blocked=new Set();this.entries=[];}
  headers(){const headers={};if(this.cfg.proxyToken)headers['X-Proxy-Token']=this.cfg.proxyToken;return headers;}
  async reloadEntries(){
    const res=await fetch(this.cfg.proxy.replace(/\/$/,'')+'/api/connections',{headers:this.headers()});
    if(!res.ok)throw Error('无法读取连接组，请检查本地代理');
    this.entries=(await res.json()).connections.filter(c=>c.provider===this.provider&&c.enabled);
  }
  async connect(){
    this.blocked=new Set();
    this.events=[];
    this.resourceContext=null;
    this.active=null;
    await this.reloadEntries();
    if(!this.entries.length)throw Error('本平台没有已启用的 MCP 连接，请先添加连接');
    let error;
    for(this.index=0;this.index<this.entries.length;this.index++){
      try{return await this.activate(this.index);}
      catch(e){error=e;this.events.push({connection:this.entries[this.index].name,state:'连接失败'});}
    }
    throw error;
  }
  async activate(index){
    const entry=this.entries[index];
    if(!entry)throw Error('本组没有更多可用连接');
    let c=this.clients.get(entry.id);
    if(!c){
      c=new window.Mcp.McpClient({...this.cfg,mode:'proxy',endpoint:'',apiKey:'',connectionId:entry.id});
      await c.connect();
      if(c.tools.some(t=>t.name==='secret_expired'))throw Error(entry.name+'：密钥已过期，请编辑连接更新密钥');
      this.clients.set(entry.id,c);
    }
    this.index=index;this.active=c;this.schemas=c.schemas;
    return {server:{name:entry.name},tools:c.tools};
  }
  async scopedArgs(client,args,form){
    const resource=Object.keys(args).find(k=>/^(resource_?id|insight_?resource_?id)$/i.test(k));
    if(!resource)return args;
    if(this.provider!=='xiyou'||!form?.category)throw Error('切换连接后需要重新建立前置资源；请填写类目并从前置步骤继续');
    const search='search_market_insight_categories',generate='generate_category_insight_resource';
    if(!client.schemas[search]||!client.schemas[generate])throw Error('备用连接不具备类目前置工具');
    const result=await client.call(search,window.Mcp.buildArgs(search,window.TOOL[search],form,client.schemas[search],{})),root=result.data?.data||result.data,candidates=(root?.list||[]).filter(r=>r.available!==false&&r.categoryId),norm=s=>String(s||'').trim().toLowerCase().replace(/s$/,''),target=norm(this.categoryName||form.category),chosen=candidates.filter(c=>norm(c.categoryName?.original)===target||norm(c.categoryName?.translated)===target);
    if(chosen.length!==1)throw Error('备用连接类目匹配不唯一，已暂停，避免使用错误类目');
    const ctx={categoryId:chosen[0].categoryId};
    const generated=await client.call(generate,window.Mcp.buildArgs(generate,window.TOOL[generate],form,client.schemas[generate],ctx));
    Object.assign(ctx,window.Mcp.harvestContext(generated.data));
    if(!ctx.resource)throw Error('备用连接未返回资源 ID');
    this.resourceContext=ctx;
    const next={...args,[resource]:ctx.resource};
    for(const k of Object.keys(next))if(/^(category_?id|cid)$/i.test(k))next[k]=ctx.categoryId;
    return next;
  }
  async nextOpen(){
    for(let i=0;i<this.entries.length;i++){
      if(this.blocked.has(this.entries[i].id))continue;
      try{await this.activate(i);return true;}
      catch(_){this.blocked.add(this.entries[i].id);this.events.push({connection:this.entries[i].name,state:'备用连接失败'});}
    }
    await this.reloadEntries();
    for(let i=0;i<this.entries.length;i++){
      if(this.blocked.has(this.entries[i].id))continue;
      try{await this.activate(i);return true;}
      catch(_){this.blocked.add(this.entries[i].id);this.events.push({connection:this.entries[i].name,state:'备用连接失败'});}
    }
    return false;
  }
  async invoke(name,actual){
    if(this.cfg&&this.cfg.skipGateway)return this.active.call(name,actual);
    try{
      const headers=Object.assign({'Content-Type':'application/json','X-Evidence-Client':'xiyou-console'},this.headers());
      const res=await fetch((this.cfg.proxy||'').replace(/\/$/,'')+'/api/evidence/call',{
        method:'POST',headers,body:JSON.stringify({
          provider:this.provider,tool:name,arguments:actual,
          connectionId:this.entries[this.index]&&this.entries[this.index].id
        })
      });
      const body=await res.json();
      if(res.ok&&body&&(body.payload!==undefined||body.hit)){
        return {data:body.payload,ms:body.ms||0,raw:body.payload,cacheHit:!!body.hit,evidenceKey:body.key,source:body.source,events:body.events};
      }
      if(!res.ok&&body&&body.error)throw Error(body.error);
    }catch(e){
      if(/本组可用连接已耗尽|HTTP (429|402)/.test(e.message||''))throw e;
    }
    return this.active.call(name,actual);
  }
  async call(name,args,options={}){
    if(!this.active)await this.connect();
    let actual={...args};
    if(Object.keys(actual).some(k=>/^resource_?id$/i.test(k))&&options.contextSource&&options.contextSource!==this.entries[this.index]?.id&&!this.resourceContext){
      const owner=this.entries.findIndex(c=>c.id===options.contextSource);
      if(owner>=0)await this.activate(owner);
      else actual=await this.scopedArgs(this.active,actual,options.form);
    }
    if(this.resourceContext)for(const k of Object.keys(actual)){
      if(/^resource_?id$/i.test(k))actual[k]=this.resourceContext.resource;
      if(/^category_?id$/i.test(k))actual[k]=this.resourceContext.categoryId;
    }
    for(;;){
      const entry=this.entries[this.index];
      if(!this.schemas[name])throw Error(entry.name+' 不提供接口 '+name+'，未跨平台替换');
      try{
        const r=await this.invoke(name,actual);
        if(name==='search_market_insight_categories'){
          const picked=window.Mcp.pickCategory&&window.Mcp.pickCategory(r.data,options.form&&options.form.category);
          const root=r.data?.data||r.data,first=(root?.list||[]).find(c=>c.available!==false&&c.categoryId);
          this.categoryName=(picked&&picked.name)||first?.categoryName?.original;
          if(picked&&picked.categoryId)this.pickedCategoryId=picked.categoryId;
        }
        return {...r,args:actual,context:this.resourceContext,source:{provider:this.provider,id:entry.id,name:entry.name},events:this.events.slice()};
      }catch(e){
        if(!certain(e))throw e;
        this.blocked.add(entry.id);
        this.events.push({connection:entry.name,state:'额度不足或限流，切换备用'});
        if(!await this.nextOpen())throw Error('本组可用连接已耗尽：'+e.message);
        actual=await this.scopedArgs(this.active,actual,options.form);
      }
    }
  }
 }
 window.ConnectionPool={Pool,certain};
})();
