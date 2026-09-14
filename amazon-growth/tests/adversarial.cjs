const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const root = path.resolve(__dirname, '..');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({name, pass:true, detail:'预期行为已验证'}); }
  catch(e) { results.push({name, pass:false, detail:e.message}); }
}
function check(ok, detail) { if (!ok) throw Error(detail); return detail; }
function context() {
  const elements = new Map();
  const element = s => { if (!elements.has(s)) elements.set(s, {value:'',innerHTML:'',classList:{remove(){},add(){}},setAttribute(){}}); return elements.get(s); };
  const c = vm.createContext({window:{},AbortSignal,document:{querySelector:element,querySelectorAll:()=>[]},localStorage:{setItem(){},getItem(){return null}},setTimeout:()=>0,clearTimeout(){},console});
  for (const f of ['mcp.js','claude.js','data.js']) vm.runInContext(fs.readFileSync(path.join(root,'assets',f),'utf8'),c);
  let app = fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
  app = app.slice(0,app.indexOf('  /* ---------------- 启动')) + 'window.testing={state,missingFor,renderResult,runScene,selectScene,skipReasonFor,quotaHaltMessage,requiredFieldIds,sceneNeedKeys,pickStealCores,parseKeywords,expandKeywordSteps,harvestListingRelations,maybeInjectListingByRelation,harvestSellerNode,harvestPredictionInputs,expandReviewSteps};})();';
  vm.runInContext(app,c); return c;
}
(async()=>{
  const c=context(), a=c.window.testing, M=c.window.Mcp;
  await test('空 ASIN 阻止运行',()=>check(a.missingFor({needs:['asin']}).length===1,'空值必须被拦截'));
  a.state.form.asin='x';
  await test('非法 ASIN 拦截',()=>check(a.missingFor({needs:['asin']}).length>0,'单字符 x 被接受'));
  a.state.form.dateFrom='2026-09-09'; a.state.form.dateTo='2026-01-01';
  await test('倒置日期拦截',()=>check(a.missingFor({needs:['date']}).length>0,'开始日期晚于结束日期仍被接受'));
  await test('null 行容错',()=>a.renderResult({data:[null]},0));
  await test('混合 null 行容错',()=>a.renderResult({data:[{x:1},null]},0));
  await test('HTML 对抗文本转义',()=>check(!c.window.Analyst.md('<img src=x onerror=alert(1)>').includes('<img'),'HTML 已转义'));
  await test('空数组渲染',()=>a.renderResult({data:[]},0));
  await test('美国站词表不把日文译名当站点',()=>{
    const html=a.renderResult({args:{request:{marketplace:'US',keyword:'gooseneck electric kettle'}},data:{data:[
      {marketplace:'US',keyword:'coffee maker',keywordCn:'咖啡机',keywordJp:'コーヒーメーカー',departments:[{code:'kitchen'}],searchVolume:1200,abaRank:80,cpc:1.2}
    ]}},0);
    const heads=[...html.matchAll(/<th>([^<]*)<\/th>/g)].map(m=>m[1]);
    const jp=heads.indexOf('keywordJp');
    const kw=heads.indexOf('keyword');
    return check(html.includes('不是日本站')&&kw>=0&&heads.indexOf('marketplace')>=0&&heads.indexOf('keywordCn')>=0&&jp<0&&heads.indexOf('departments')<0,'heads='+heads.join(','));
  });
  await test('未知 schema 字段不误映射',()=>{
    const args=M.buildArgs('x',{p:['site']},{site:'US'},{properties:{limit:{type:'integer'}}},{});
    return check(!('limit' in args),'site 被错误映射到 limit：'+JSON.stringify(args));
  });
  await test('类目文本不得冒充 categoryId',()=>{
    let rejected=false;
    try {M.buildArgs('x',{p:['category']},{category:'electric kettle'},{type:'object',properties:{categoryId:{type:'string'}},required:['categoryId']},{});} catch {rejected=true;}
    return check(rejected,'类目文本被错误写入 categoryId');
  });
  await test('真实 categoryId 从前置上下文注入',()=>{
    const args=M.buildArgs('x',{p:['category']},{category:'electric kettle'},{type:'object',properties:{categoryId:{type:'string'}},required:['categoryId']},{categoryId:'us_real_category_id'});
    return check(args.categoryId==='us_real_category_id','未使用前置步骤返回的真实 categoryId');
  });
  await test('类目接口自动补 last30days 周期',()=>{
    const schema={type:'object',properties:{categoryId:{type:'string'},resourceId:{type:'string'},cycleFilter:{type:'object'}},required:['categoryId','resourceId','cycleFilter']};
    const args=M.buildArgs('get_category_price_segment_trends',{p:['category']},{category:'electric kettle'},schema,{categoryId:'cid-real',resource:'rid-real'});
    return check(JSON.stringify(args.cycleFilter)==='{"period":"last30days"}','cycleFilter 不符合接口约束');
  });
  await test('新品榜自动补 reportPeriod',()=>{
    const schema={type:'object',properties:{country:{type:'string'},categoryId:{type:'string'},resourceId:{type:'string'},reportPeriod:{type:'string',enum:['last30days','last90days']}},required:['country','categoryId','resourceId','reportPeriod']};
    const args=M.buildArgs('get_category_new_release_ranking',c.window.TOOL.get_category_new_release_ranking,{site:'US',category:'kettle'},schema,{categoryId:'cid',resource:'rid'});
    return check(args.reportPeriod==='last30days'&&!args.rangeFilters,'reportPeriod 未按 schema 补齐');
  });
  await test('新品榜在 schema 允许时写入上架天数',()=>{
    const schema={type:'object',properties:{country:{type:'string'},categoryId:{type:'string'},resourceId:{type:'string'},reportPeriod:{type:'string'},rangeFilters:{type:'object',properties:{streetDays:{type:'array'}}}},required:['country','categoryId','resourceId','reportPeriod']};
    const args=M.buildArgs('get_category_new_release_ranking',c.window.TOOL.get_category_new_release_ranking,{site:'US',category:'kettle'},schema,{categoryId:'cid',resource:'rid'});
    return check(args.rangeFilters&&args.rangeFilters.streetDays&&args.rangeFilters.streetDays[0].max===180,'未写入 streetDays 180 天观察窗');
  });
  await test('代表商品在 schema 允许时写入销量最大价格带',()=>{
    const schema={type:'object',properties:{country:{type:'string'},categoryId:{type:'string'},resourceId:{type:'string'},priceType:{type:'string',enum:['lowPrice','midPrice','highPrice']}},required:['country','categoryId','resourceId']};
    const args=M.buildArgs('get_category_primary_asins',c.window.TOOL.get_category_primary_asins,{site:'US',category:'kettle'},schema,{categoryId:'cid',resource:'rid',priceType:'highPrice'});
    return check(args.priceType==='highPrice','未把销量最大价格带写入代表商品查询');
  });
  await test('代表商品 schema 无价格带字段时不得写入',()=>{
    const schema={type:'object',properties:{country:{type:'string'},categoryId:{type:'string'},resourceId:{type:'string'}},required:['country','categoryId','resourceId']};
    const args=M.buildArgs('get_category_primary_asins',c.window.TOOL.get_category_primary_asins,{site:'US',category:'kettle'},schema,{categoryId:'cid',resource:'rid',priceType:'highPrice'});
    return check(!('priceType' in args),'无 schema 字段时仍写入了 priceType');
  });
  await test('类目搜索优先叶子而不是父级复合类目',()=>{
    const picked=M.pickCategory({list:[{available:true,categoryId:'parent',categoryName:{original:'Electric Kettles & Smart Drinkware'},level:2},{available:true,categoryId:'leaf',categoryName:{original:'Electric Kettles'},level:4},{available:true,categoryId:'goose',categoryName:{original:'Gooseneck Electric Kettles'},level:5}]},'electric kettle');
    return check(picked&&picked.categoryId==='leaf','选中了 '+((picked&&picked.categoryId)||'空'));
  });
  await test('ABA 周趋势补 start_week',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'},start_week:{type:'string'},end_week:{type:'string'}},required:['marketplace','keyword','start_week']};
    const args=M.buildArgs('get_keyword_aba_trends',c.window.TOOL.get_keyword_aba_trends,{site:'US',keyword:'gooseneck kettle',dateFrom:'2026-09-01',dateTo:'2026-09-10'},schema,{});
    return check(args.start_week==='2026-08-31'&&args.end_week==='2026-09-07','start_week='+args.start_week+' end_week='+args.end_week);
  });
  await test('ABA 周趋势按 ISO 周格式',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'},start_week:{type:'string',pattern:'^\\d{4}-W\\d{2}$'}},required:['marketplace','keyword','start_week']};
    const args=M.buildArgs('get_keyword_aba_trends',c.window.TOOL.get_keyword_aba_trends,{site:'US',keyword:'kettle',dateFrom:'2026-09-01',dateTo:'2026-09-10'},schema,{});
    return check(args.start_week==='2026-W36','ISO week='+args.start_week);
  });
  await test('月度格局短窗口补到 6 个月',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'},start_month:{type:'string'},end_month:{type:'string'}},required:['marketplace','keyword','start_month','end_month']};
    const args=M.buildArgs('get_keyword_analysis_monthly',c.window.TOOL.get_keyword_analysis_monthly,{site:'US',keyword:'kettle',dateFrom:'2026-08-10',dateTo:'2026-09-08'},schema,{});
    return check(args.start_month==='2026-04'&&args.end_month==='2026-09','start='+args.start_month+' end='+args.end_month);
  });
  await test('销量走势短窗口补到 6 个月',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'},start_month:{type:'string'},end_month:{type:'string'}}};
    const args=M.buildArgs('get_asin_order_trends',c.window.TOOL.get_asin_order_trends,{site:'US',asin:'B0GH78L65N',dateFrom:'2026-08-10',dateTo:'2026-09-08'},schema,{});
    return check(args.start_month==='2026-04'&&args.end_month==='2026-09','start='+args.start_month+' end='+args.end_month);
  });
  await test('词库核心词可补 get_keyword_info',()=>{
    a.state.form=Object.assign({},a.state.form,{keyword:''});
    const skip=a.skipReasonFor({tool:'get_keyword_info',targetKeyword:'gooseneck kettle'},{},null);
    return check(!skip,'有 targetKeyword 仍被跳过：'+skip);
  });
  await test('反打补拉优先自然位>4 的词',()=>{
    a.state.form=Object.assign({},a.state.form,{keyword:'electric kettle'});
    const picked=a.pickStealCores([
      {tool:'get_asin_keywords',status:'ok',data:{list:[
        {searchTerm:'electric kettle',organicRank:2,searchVolume:5000},
        {searchTerm:'gooseneck kettle',organicRank:2,searchVolume:800},
        {searchTerm:'pour over kettle',organicRank:8,searchVolume:400},
        {searchTerm:'tea kettle',organicRank:12,searchVolume:200}
      ]}}
    ],5,2);
    return check(picked.info[0]==='pour over kettle'&&picked.arena[0]==='pour over kettle'&&picked.info.indexOf('electric kettle')<0,'info='+picked.info.join(',')+' arena='+picked.arena.join(','));
  });
  await test('反打自然位读 ranks.or.totalRank',()=>{
    a.state.form=Object.assign({},a.state.form,{keyword:'electric kettle'});
    const picked=a.pickStealCores([
      {tool:'get_asin_keywords',status:'ok',data:{list:[
        {searchTerm:'gooseneck kettle',ranks:[{position:'sp',totalRank:1},{position:'or',totalRank:2}]},
        {searchTerm:'pour over kettle',ranks:[{position:'or',totalRank:8,page:1,pageRank:8}]}
      ]}}
    ],5,2);
    return check(picked.info[0]==='pour over kettle'&&picked.arena[0]==='pour over kettle','info='+picked.info.join(',')+' arena='+picked.arena.join(','));
  });
  await test('场景必填字段包含日期与关键词',()=>{
    const ids=a.requiredFieldIds({needs:['asin','kw'],chain:[['get_asin_keyword_rank_hourly']]});
    return check(ids.indexOf('f-asin')>=0&&ids.indexOf('f-keyword')>=0&&ids.indexOf('f-from')>=0&&ids.indexOf('f-to')>=0,'ids='+ids.join(','));
  });
  await test('关键词按逗号拆分且保留词面空格',()=>{
    const k=a.parseKeywords('electric kettle, gooseneck electric kettle\nsteel kettle');
    return check(k.length===3&&k[0]==='electric kettle'&&k[1]==='gooseneck electric kettle'&&k[2]==='steel kettle','k='+k.join('|'));
  });
  await test('超过 8 个关键词拦截',()=>{
    const prev=a.state.form.keyword;
    a.state.form.keyword=Array.from({length:9},(_,i)=>'kw'+i).join(',');
    const miss=a.missingFor({needs:['kw']});
    a.state.form.keyword=prev;
    return check(miss.length>0,'9 个词被接受');
  });
  await test('两个关键词通过校验',()=>{
    const prev=a.state.form.keyword;
    a.state.form.keyword='electric kettle, gooseneck kettle';
    const miss=a.missingFor({needs:['kw']});
    a.state.form.keyword=prev;
    return check(miss.length===0,'两个合法词被拦截：'+miss.join(','));
  });
  await test('多关键词展开接口步骤',()=>{
    const steps=a.expandKeywordSteps([
      {tool:'get_keyword_info',why:'指标',cn:'指标'},
      {tool:'get_asin_info',why:'详情',cn:'详情'}
    ],{keyword:'electric kettle, gooseneck kettle'});
    const infos=steps.filter(s=>s.tool==='get_keyword_info');
    return check(infos.length===2&&infos[0].targetKeyword==='electric kettle'&&infos[1].targetKeyword==='gooseneck kettle'&&steps.filter(s=>s.tool==='get_asin_info').length===1,'steps='+steps.map(s=>s.tool+':'+(s.targetKeyword||'')).join(','));
  });
  await test('逗号串不会整段传给 keyword',()=>{
    const args=M.buildArgs('get_keyword_info',c.window.TOOL.get_keyword_info,{site:'US',keyword:'electric kettle, gooseneck kettle'},{type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'}}},{});
    return check(args.keyword==='electric kettle','keyword='+args.keyword);
  });
  await test('卖家精灵 request 包装关键词接口',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'}},required:['marketplace','keyword']}}};
    const args=M.buildArgs('keyword_miner',c.window.TOOL.keyword_miner,{site:'US',keyword:'electric kettle'},schema,{});
    return check(args.request&&args.request.marketplace==='US'&&args.request.keyword==='electric kettle'&&args.keyword===undefined,'args='+JSON.stringify(args));
  });
  await test('卖家精灵 request 包装出单词接口',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'}},required:['marketplace','asin']}}};
    const args=M.buildArgs('keyword_order',c.window.TOOL.keyword_order,{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.request&&args.request.marketplace==='US'&&args.request.asin==='B0GH78L65N','args='+JSON.stringify(args));
  });
  await test('卖家精灵 request 包装 Google 趋势',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},keyword:{type:'string'}},required:['marketplace','keyword']}}};
    const args=M.buildArgs('google_trend',c.window.TOOL.google_trend,{site:'US',keyword:'gooseneck electric kettle'},schema,{});
    return check(args.request&&args.request.keyword==='gooseneck electric kettle'&&args.request.marketplace==='US','args='+JSON.stringify(args));
  });
  await test('卖家精灵出单词补齐 reverseType 和月份',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{asins:{type:'array',items:{type:'string'}},date:{type:'string'},marketplace:{type:'string'},reverseType:{type:'string'}},required:['asins','date','marketplace','reverseType']}}};
    const args=M.buildArgs('keyword_order',c.window.TOOL.keyword_order,{site:'US',asin:'B0GH78L65N',dateFrom:'2026-08-10',dateTo:'2026-09-08'},schema,{});
    return check(args.request&&Array.isArray(args.request.asins)&&args.request.asins[0]==='B0GH78L65N'&&args.request.reverseType==='M'&&args.request.date==='202608'&&args.request.marketplace==='US','args='+JSON.stringify(args));
  });
  await test('卖家精灵 request 无内层 properties 仍包装',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object'}}};
    const args=M.buildArgs('keyword_miner',c.window.TOOL.keyword_miner,{site:'US',keyword:'electric kettle'},schema,{});
    return check(args.request&&args.request.marketplace==='US'&&args.request.keyword==='electric kettle'&&args.keyword===undefined,'args='+JSON.stringify(args));
  });
  await test('卖家精灵流量来源 q 使用 ASIN',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},q:{type:'string'}},required:['marketplace','q']}}};
    const args=M.buildArgs('traffic_source',c.window.TOOL.traffic_source,{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.request&&args.request.q==='B0GH78L65N'&&args.request.q!=='asin','args='+JSON.stringify(args));
  });
  await test('关联列表补齐 relations 和 asinList',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},asinList:{type:'array',items:{type:'string'}},relations:{type:'array',items:{type:'string'}},size:{type:'integer'}},required:['asinList','marketplace','relations']}}};
    const args=M.buildArgs('traffic_listing',c.window.TOOL.traffic_listing,{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.request&&args.request.marketplace==='US'&&args.request.asinList&&args.request.asinList[0]==='B0GH78L65N'&&Array.isArray(args.request.relations)&&args.request.relations.indexOf('vav')>=0,'args='+JSON.stringify(args));
  });
  await test('关联列表优先用统计出的非零类型',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},asinList:{type:'array',items:{type:'string'}},relations:{type:'array',items:{type:'string'}}},required:['asinList','marketplace','relations']}}};
    const args=M.buildArgs('traffic_listing',c.window.TOOL.traffic_listing,{site:'US',asin:'B0GH78L65N'},schema,{relations:['vav','sp']});
    return check(args.request.relations.join(',')==='vav,sp','args='+JSON.stringify(args));
  });
  await test('关联统计全 0 跳过明细',()=>{
    return check(!!a.skipReasonFor({tool:'traffic_listing'},{relationStatEmpty:true}),'未跳过空统计的明细');
  });
  await test('关联明细按类型拆步',()=>{
    a.state.run={ctx:{},steps:[
      {tool:'traffic_listing_stat',status:'ok',data:{data:{items:[{relation:'vav',count:77},{relation:'fbt',count:2},{relation:'mib',count:0}]}}},
      {tool:'traffic_listing',status:'idle'}
    ]};
    a.harvestListingRelations(a.state.run.steps[0].data,a.state.run.ctx);
    a.maybeInjectListingByRelation({id:'s28'},a.state.run.steps[0],0);
    const ls=a.state.run.steps.filter(s=>s.tool==='traffic_listing');
    return check(ls.length===2&&ls[0].targetRelation==='vav'&&ls[1].targetRelation==='fbt','rels='+ls.map(s=>s.targetRelation).join(','));
  });
  await test('类目文本不得写入 nodeIdPath',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},nodeIdPath:{type:'string'},topN:{type:'integer'},newProduct:{type:'integer'}},required:['marketplace','nodeIdPath']}}};
    let rejected=false;
    try {M.buildArgs('market_product_concentration',c.window.TOOL.market_product_concentration,{site:'US',category:'electric kettle'},schema,{});} catch {rejected=true;}
    return check(rejected,'类目文本被当成 nodeIdPath');
  });
  await test('非法 nodeIdPath 不得注入市场接口',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},nodeIdPath:{type:'string'}},required:['marketplace','nodeIdPath']}}};
    let rejected=false;
    try {M.buildArgs('market_product_concentration',c.window.TOOL.market_product_concentration,{site:'US',category:'electric kettle'},schema,{nodeIdPath:'electric kettle'});} catch {rejected=true;}
    return check(rejected,'非法路径仍被写入');
  });
  await test('市场集中度使用数字 nodeIdPath',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},nodeIdPath:{type:'string'},topN:{type:'integer'},newProduct:{type:'integer'}},required:['marketplace','nodeIdPath']}}};
    const args=M.buildArgs('market_product_concentration',c.window.TOOL.market_product_concentration,{site:'US',category:'electric kettle'},schema,{nodeIdPath:'1055398:284507:915194:19309415011:289753'});
    return check(args.request&&args.request.marketplace==='US'&&args.request.nodeIdPath==='1055398:284507:915194:19309415011:289753'&&args.request.nodeIdPath!=='electric kettle'&&args.request.topN===10&&args.request.newProduct===6,'args='+JSON.stringify(args));
  });
  await test('卖家精灵节点优先 Electric Kettles 叶子',()=>{
    const picked=M.pickSellerNode({data:[
      {nodeIdPath:'1:2',nodeLabelPath:'Musical Instruments:Electric Guitar Parts',products:200},
      {nodeIdPath:'1055398:284507:915194:19309415011:289753',nodeLabelPath:'Home & Kitchen:Kitchen & Dining:Coffee, Tea & Espresso:Kettles & Tea Machines:Electric Kettles',products:1200},
      {nodeIdPath:'9:8:7',nodeLabelPath:'Home & Kitchen:Electric Kettles & Smart Drinkware',products:5000}
    ]},'electric kettle');
    return check(picked&&String(picked.nodeIdPath).endsWith('289753'),JSON.stringify(picked));
  });
  await test('市场壁垒无节点则跳过',()=>{
    return check(!!a.skipReasonFor({tool:'market_product_concentration'},{})&&!a.skipReasonFor({tool:'market_product_concentration'},{nodeIdPath:'1055398:284507:915194:19309415011:289753'}),'跳过条件不对');
  });
  await test('评论接口 size 不超过 10',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'},size:{type:'integer',maximum:10},starList:{type:'array',items:{type:'integer'}},page:{type:'integer'}},required:['marketplace','asin']}}};
    const args=M.buildArgs('review',c.window.TOOL.review,{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.request&&args.request.size===10&&args.request.size<=10&&args.request.page===1,'args='+JSON.stringify(args));
  });
  await test('评论按星级写入 starList',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'},starList:{type:'array',items:{type:'integer'}}},required:['marketplace','asin']}}};
    const args=M.buildArgs('review',c.window.TOOL.review,{site:'US',asin:'B0GH78L65N'},schema,{starList:[3,4]});
    return check(args.request.starList&&args.request.starList.join(',')==='3,4','args='+JSON.stringify(args));
  });
  await test('BSR 预测拒绝类目文本和西柚 categoryId',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},bsr:{type:'integer'},categoryId:{type:'string'}},required:['marketplace','bsr','categoryId']}}};
    let rejected=false;
    try {M.buildArgs('bsr_prediction',c.window.TOOL.bsr_prediction,{site:'US',category:'electric kettle',asin:'B0GH78L65N'},schema,{categoryId:'us_xiyou_cid'});} catch {rejected=true;}
    return check(rejected,'类目文本或西柚 ID 被写入 BSR 预测');
  });
  await test('BSR 预测使用大类排名和一级节点',()=>{
    const schema={type:'object',required:['request'],properties:{request:{type:'object',properties:{marketplace:{type:'string'},bsr:{type:'integer'},categoryId:{type:'string'}},required:['marketplace','bsr','categoryId']}}};
    const args=M.buildArgs('bsr_prediction',c.window.TOOL.bsr_prediction,{site:'US',category:'electric kettle',asin:'B0GH78L65N'},schema,{bsr:23540,bsrCategoryId:'1055398',categoryId:'us_xiyou_cid'});
    return check(args.request&&args.request.bsr===23540&&args.request.categoryId==='1055398'&&args.request.categoryId!=='electric kettle'&&args.request.categoryId!=='us_xiyou_cid','args='+JSON.stringify(args));
  });
  await test('变体字符串 ASIN 写入对比名单',()=>{
    const found=M.harvestVariantAsins({data:{childAsins:['B0CHILD001','B0CHILD002']}});
    check(found.indexOf('B0CHILD001')>=0&&found.indexOf('B0CHILD002')>=0,'found='+found.join(','));
    const args=M.buildArgs('get_multi_asin_keyword_comparison',c.window.TOOL.get_multi_asin_keyword_comparison,{site:'US',asin:'B0GH78L65N'},{type:'object',properties:{marketplace:{type:'string'},asins:{type:'array',items:{type:'string'}}}},{variantAsins:found});
    const raw=args.asins||(args.request&&args.request.asins)||[];
    const arr=Array.isArray(raw)?raw:String(raw).split(/[,，\s]+/);
    return check(arr.indexOf('B0CHILD001')>=0&&arr.indexOf('B0CHILD002')>=0,'args='+JSON.stringify(args));
  });
  await test('销量趋势写入 BSR 上下文',()=>{
    const ctx={};
    a.harvestPredictionInputs({data:{asin:{bsrRank:23540,nodeIdPath:'1055398:284507:915194:19309415011:289753',nodeLabelPath:'Home & Kitchen:Kitchen & Dining:Coffee, Tea & Espresso:Kettles & Tea Machines:Electric Kettles'}}},ctx);
    return check(ctx.bsr===23540&&ctx.bsrCategoryId==='1055398','ctx='+JSON.stringify(ctx));
  });
  await test('缺少大类 BSR 则跳过 BSR 预测',()=>{
    return check(!!a.skipReasonFor({tool:'bsr_prediction'},{})&&!a.skipReasonFor({tool:'bsr_prediction'},{bsr:23540,bsrCategoryId:'1055398'}),'跳过条件不对');
  });
  await test('VOC 场景按星级拆成三步',()=>{
    const steps=a.expandReviewSteps([{tool:'review',why:'读取评论',cn:'卖家精灵 · Product Review',status:'idle'}]);
    return check(steps.length===3&&steps[0].targetStars.join(',')==='1,2'&&steps[1].targetStars.join(',')==='3,4'&&steps[2].targetStars.join(',')==='5','steps='+steps.map(s=>(s.targetStars||[]).join('-')).join('|'));
  });
  await test('产品节点写入 ctx.nodeIdPath',()=>{
    const ctx={};
    a.harvestSellerNode({tool:'product_node',data:{data:[
      {nodeIdPath:'1:2',nodeLabelPath:'Musical Instruments:Electric Guitar Parts',products:200},
      {nodeIdPath:'1055398:284507:915194:19309415011:289753',nodeLabelPath:'Home & Kitchen:Kitchen & Dining:Coffee, Tea & Espresso:Kettles & Tea Machines:Electric Kettles',products:1200}
    ]}},{category:'electric kettle'},ctx);
    return check(ctx.nodeIdPath==='1055398:284507:915194:19309415011:289753','ctx='+JSON.stringify(ctx));
  });
  await test('关联统计按条数排序',()=>{
    const html=a.renderResult({data:{data:{items:[{relation:'mib',count:0},{relation:'vav',count:77},{relation:'sp',count:37}]}}},0);
    const cells=[...html.matchAll(/<td>([^<]*)<\/td>/g)].map(m=>m[1]);
    return check(cells.indexOf('vav')>=0&&cells.indexOf('vav')<cells.indexOf('mib')&&cells.indexOf('77')<cells.indexOf('0'),'cells='+cells.join(','));
  });
  await test('Keepa 扁平 schema 仍带美国站',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'}},required:['marketplace','asin']};
    const args=M.buildArgs('keepa_info',{p:['asin']},{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.marketplace==='US'&&args.asin==='B0GH78L65N','args='+JSON.stringify(args));
  });
  await test('schema 未列出 marketplace 时 Keepa 仍强制美国站',()=>{
    const schema={type:'object',properties:{asin:{type:'string'}},required:['asin']};
    const args=M.buildArgs('keepa_info',c.window.TOOL.keepa_info,{site:'US',asin:'B0GH78L65N'},schema,{});
    return check(args.marketplace==='US'&&args.asin==='B0GH78L65N','args='+JSON.stringify(args));
  });
  await test('空站点默认美国站而不是日本站',()=>{
    const schema={type:'object',properties:{marketplace:{type:'string'},asin:{type:'string'}},required:['marketplace','asin']};
    const args=M.buildArgs('asin_detail_with_coupon_trend',c.window.TOOL.asin_detail_with_coupon_trend,{asin:'B0GH78L65N'},schema,{});
    return check(args.marketplace==='US','args='+JSON.stringify(args));
  });
  await test('类目关键词强制使用上一完整自然月',()=>{
    const schema={type:'object',properties:{country:{type:'string'},categoryId:{type:'string'},resourceId:{type:'string'},cycleFilter:{type:'object'},startDate:{type:'string'},endDate:{type:'string'}},required:['country','categoryId','resourceId','startDate','endDate']};
    const args=M.buildArgs('get_category_keywords',c.window.TOOL.get_category_keywords,{site:'US',category:'kettle',dateTo:'2026-09-08'},schema,{categoryId:'cid',resource:'rid'});
    return check(!args.cycleFilter&&args.startDate==='2026-08-01'&&args.endDate==='2026-08-31','关键词日期未规范为上一完整自然月');
  });
  await test('前置代表 ASIN 覆盖表单残留值',()=>{
    const schema={type:'object',properties:{primaryAsin:{type:'string'}},required:['primaryAsin']};
    const args=M.buildArgs('get_primary_asin_children',{p:['asin']},{asin:'B0STALE000' },schema,{primaryAsin:'B08PP48979'});
    return check(args.primaryAsin==='B08PP48979','仍使用了表单里的旧 ASIN');
  });
  const client=new M.McpClient({endpoint:'mock',mode:'direct'}); client.tools=[];
  const response=(obj,type='application/json')=>({ok:true,headers:{get:n=>n.toLowerCase()==='content-type'?type:null},text:async()=>typeof obj==='string'?obj:JSON.stringify(obj)});
  await test('MCP isError 不得当成功',async()=>{
    c.fetch=async(url,options)=>response({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:{isError:true,content:[{type:'text',text:'denied'}]}});
    let rejected=false; try {await client.call('x',{});} catch {rejected=true;}
    return check(rejected,'isError:true 正常返回，被运行器计为成功');
  });
  await test('JSON-RPC 错误触发失败',async()=>{
    c.fetch=async(url,options)=>response({id:JSON.parse(options.body).id,error:{code:-32602,message:'bad args'}});
    let rejected=false; try {await client.rpc('x',{});} catch {rejected=true;} return check(rejected,'错误必须抛出');
  });
  await test('响应 ID 不匹配应拒绝',async()=>{
    c.fetch=async()=>response({jsonrpc:'2.0',id:99999,result:{value:1}});
    let rejected=false; try {await client.rpc('x',{});} catch {rejected=true;} return check(rejected,'接受了无关请求的响应');
  });
  await test('SSE 多帧末帧无空行',async()=>{
    c.fetch=async(url,options)=>response('data: {"id":999,"result":{"value":1}}\n\ndata: '+JSON.stringify({id:JSON.parse(options.body).id,result:{value:2}}),'text/event-stream');
    const r=await client.rpc('x',{}); return check(r.result.value===2,'末帧丢失，返回第一帧');
  });
  await test('运行中切换场景',async()=>{
    a.state.scene={id:'test',needs:[],chain:[['mock','test']],name:'test'}; a.state.connected=true;
    let release; a.state.client={schemas:{},call:()=>new Promise(r=>release=r)};
    const running=a.runScene(); await new Promise(r=>setImmediate(r)); a.selectScene('s7'); release({data:{ok:true},ms:1});
    await running; return '无异常';
  });
  await test('重复运行阻止重复调用',async()=>{
    a.state.scene={id:'test',needs:[],chain:[['mock','test']],name:'test'}; a.state.connected=true;
    const pending=[]; a.state.client={schemas:{},call:()=>new Promise(r=>pending.push(r))};
    const p=a.runScene(), q=a.runScene(); await new Promise(r=>setImmediate(r)); const count=pending.length;
    pending.forEach(r=>r({data:{ok:true},ms:1})); await Promise.allSettled([p,q]);
    return check(count===1,'重复触发了 '+count+' 次上游请求');
  });
  await test('运行中编辑不改变后续实参',async()=>{
    const el=c.document.querySelector('#p-kw'); el.value='original';
    c.window.TOOL.mock={p:['keyword']};
    a.state.scene={id:'test',needs:[],chain:[['mock','one'],['mock','two']],name:'test'};
    const args=[]; let release;
    a.state.client={schemas:{},call:async(name,arg)=>{args.push(arg);if(args.length===1) await new Promise(r=>release=r);return {data:{ok:true},ms:1};}};
    const running=a.runScene(); await new Promise(r=>setImmediate(r)); a.state.form.keyword='changed'; el.value='changed'; release(); await running;
    return check(args.length===2 && args.every(v=>v.keyword==='original') && a.state.run.form.keyword==='original','参数快照未保留');
  });
  await test('类目链在搜索 402 后跳过后续且不误报 categoryId', async () => {
    a.state.scene = {id:'s3fail', needs:[], chain:[
      ['search_market_insight_categories','定位'],
      ['generate_category_insight_resource','资源'],
      ['get_category_price_segment_trends','价格带'],
      ['get_category_primary_asins','代表'],
      ['get_primary_asin_children','子体']
    ], name:'价格带'};
    a.state.connected = true;
    a.state.run = null;
    const calls = [];
    a.state.client = { schemas:{}, call: async (name) => { calls.push(name); throw new Error('本组可用连接已耗尽：HTTP 402 weekly credit limit exceeded'); } };
    await a.runScene();
    check(calls.length === 1, '后续步骤仍被调用 '+calls.join(','));
    check(a.state.run.steps[0].status === 'error', '搜索未记为失败');
    check(a.state.run.steps.slice(1).every(s => s.status === 'skip'), '后续未跳过：'+a.state.run.steps.map(s=>s.status).join(','));
    check(!a.state.run.steps.some(s => /缺少接口必填参数/.test(s.error||'')), '误报缺少参数：'+(a.state.run.steps.map(s=>s.error).join('|')));
  });
  await test('全失败时保留上次成功运行', async () => {
    a.state.scene = {id:'keepme', needs:[], chain:[['mock','x']], name:'keep'};
    a.state.connected = true;
    a.state.client = {schemas:{}, call: async () => ({data:{ok:true, keep:1}, ms:1})};
    await a.runScene();
    check(a.state.run.steps[0].status==='ok', '先跑成功');
    a.state.client = {schemas:{}, call: async () => { throw new Error('HTTP 402 weekly credit limit exceeded'); }};
    await a.runScene();
    check(a.state.run.steps[0].status==='ok' && a.state.run.steps[0].data && a.state.run.steps[0].data.keep===1, '成功结果被覆盖');
    check(!!a.state.run.lastFailedNote, '未记录失败原因');
  });
  await test('跳过原因：缺 categoryId 不提必填参数', () => {
    const msg = a.skipReasonFor({tool:'get_category_price_segment_trends'}, {}, null);
    return check(msg && msg.indexOf('categoryId')>=0 && msg.indexOf('缺少接口必填参数')<0, msg||'空');
  });
  await test('不存在的日历日期拒绝',()=>{a.state.form.dateFrom='2026-02-31';a.state.form.dateTo='2026-03-05';return check(a.missingFor({needs:['date']}).length>0,'不存在日期被接受');});
  await test('20 个 ASIN 边界接受',()=>{a.state.form.asins=Array.from({length:20},(_,i)=>'B'+String(i).padStart(9,'0')).join(',');return check(a.missingFor({needs:['asins']}).length===0,'20 个应接受');});
  await test('21 个 ASIN 边界拒绝',()=>{a.state.form.asins+=',B999999999';return check(a.missingFor({needs:['asins']}).length>0,'21 个应拒绝');});
  await test('工具列表分页读取',async()=>{
    c.fetch=async(url,options)=>{
      const q=JSON.parse(options.body); let result={serverInfo:{name:'mock'}};
      if(q.method==='tools/list') result=q.params.cursor?{tools:[{name:'second'}]}:{tools:[{name:'first'}],nextCursor:'next'};
      return response({id:q.id,result});
    };
    const info=await new M.McpClient({mode:'direct',endpoint:'mock'}).connect();
    return check(info.tools.length===2,'分页工具丢失');
  });
  // Execute proxy source using actual filesystem and mocked upstream.
  // Real loopback HTTP exercises its router, body reader and response handling.
  let server, captured;
  const pc=vm.createContext({AbortSignal,require:n=>n==='http'?{createServer:fn=>{server=http.createServer(fn);return {listen:()=>{}};}}:require(n),__dirname:path.join(root,'proxy'),process:{env:{MCP_ENDPOINT:'https://configured.invalid',MCP_API_KEY:'TEST_CANARY',ASINSCOPE_DISABLE:'1'}},console,Buffer,fetch:async(url,opts)=>{captured={url,opts};return {status:200,headers:{get:()=>null},text:async()=>'{}'};}});
  vm.runInContext(fs.readFileSync(path.join(root,'proxy/server.js'),'utf8'),pc);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const request=(url,method='GET',headers={},body='')=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,headers,agent:false},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject); req.end(body);
  });
  try {
    await test('健康检查',async()=>check((await request('/api/health')).status===200,'200'));
    await test('MCP GET 拒绝',async()=>check((await request('/api/mcp')).status===405,'405'));
    await test('OPTIONS 预检',async()=>check((await request('/api/mcp','OPTIONS')).status===204,'204'));
    await test('禁止 .env 静态读取',async()=>{const r=await request('/.env');return check(r.status!==200,'返回 200，读取到模拟 .env 内容');});
    await test('相邻目录前缀穿越',async()=>{const r=await request('/..%2fxiyou-amz-console-sibling%2fcanary.txt');return check(r.status===403,'越界路径进入 readFile：'+r.text);});
    await test('禁止请求头改写上游并泄露服务端密钥',async()=>{captured=null;const r=await request('/api/mcp','POST',{'X-Mcp-Endpoint':'http://127.0.0.1:9999/capture'},'{}');return check(r.status===403 && captured===null,'覆盖请求被拒绝，未调用上游');});
    await test('非法 JSON 拦截',async()=>{const r=await request('/api/mcp','POST',{},'{bad');return check(r.status===400,'非法 JSON 被转发，状态 '+r.status);});
    await test('路由必须精确匹配',async()=>{const r=await request('/api/mcp-evil','POST',{},'{}');return check(r.status===404,'前缀路径被当作 MCP 接口，状态 '+r.status);});
    await test('恶意 Origin 不能访问代理',async()=>{const r=await request('/api/mcp','POST',{Origin:'https://attacker.invalid'},'{}');return check(r.status===403,'状态 '+r.status+'，CORS='+r.headers['access-control-allow-origin']);});
    await test('损坏 URL 编码返回客户端错误',async()=>{const r=await request('/%ZZ');return check(r.status===400,'返回 '+r.status);});
    await test('真实静态首页可读取',async()=>{const r=await request('/');return check(r.status===200 && r.text.includes('西柚数据调用台') && r.text.includes('assets/scene-reports.js') && r.text.includes('href="/asinscope/"') && r.text.includes('href="/watchlist/"'),'首页读取失败');});
    await test('8787 页头可打开完整竞品分析',async()=>{const r=await request('/asinscope/');return check(r.status===200 && r.text.includes('完整竞品分析') && r.text.includes('mcp-client.js') && r.text.includes('class="cols"') && r.text.includes('class="rail"') && !r.text.includes('scene-reports'),'竞品页未独立挂到 /asinscope/');});
    await test('8787 页头可打开监控清单',async()=>{const r=await request('/watchlist/');return check(r.status===200 && r.text.includes('监控清单') && r.text.includes('开始监控') && r.text.includes('每日定点') && r.text.includes('最多一个月') && r.text.includes('保存本期数据') && r.text.includes('B0BNVHR71X') && r.text.includes('mcp-client.js') && r.text.includes('analyze.js') && !r.text.includes('scene-reports'),'监控清单未独立挂到 /watchlist/');});
    await test('专项报告脚本可读取',async()=>{const r=await request('/assets/scene-reports.js');return check(r.status===200 && r.text.includes('sceneBuilders'),'scene-reports 未放行');});
    await test('带版本号的脚本可读取',async()=>{const r=await request('/assets/mcp.js?v=20260911-s27');return check(r.status===200 && r.text.includes('buildArgs'),'版本查询串被当成禁止访问');});
    await test('浏览器默认图标不返回禁止访问',async()=>{const r=await request('/favicon.ico');return check(r.status===204 && !r.text.includes('禁止访问'),'favicon='+r.status+' '+r.text);});
    await test('正常 MCP 请求转发固定端点并禁止重定向',async()=>{const r=await request('/api/mcp','POST',{},'{}');return check(r.status===200 && captured.url==='https://configured.invalid' && captured.opts.redirect==='error','正常代理失败');});
    await test('伪造 Host 被拦截',async()=>check((await request('/api/mcp','POST',{Host:'attacker.invalid'},'{}')).status===403,'Host 未拦截'));
    await test('超大请求返回 413',async()=>check((await request('/api/mcp','POST',{},JSON.stringify({data:'x'.repeat(8*1024*1024)}))).status===413,'超大请求未拒绝'));
  } finally {await new Promise(r=>server.close(r));}
  for (const name of ['mcp','claude']) {
    const env={PROXY_TOKEN:'test-token',MCP_ENDPOINT:'https://configured.invalid',ANTHROPIC_API_KEY:'FAKE'};
    let calls=0;
    const api=vm.createContext({process:{env},Buffer,AbortSignal,fetch:async()=>{calls++;return {status:200,headers:{get:()=>null},text:async()=>'{}'};}});
    vm.runInContext(fs.readFileSync(path.join(root,'api',name+'.js'),'utf8').replace('export default async function handler','async function handler'),api);
    const invoke=async(headers,body='{}')=>{
      const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;return this;},send(v){this.data=v;return this;},end(){return this;}};
      await api.handler({method:'POST',headers,body},res);return res;
    };
    await test(name+' 部署版拒绝匿名调用',async()=>check((await invoke({})).code===401 && calls===0,'匿名调用未拦截'));
    await test(name+' 部署版授权正常调用',async()=>check((await invoke({'x-proxy-token':'test-token'})).code===200,'授权请求失败'));
    await test(name+' 部署版拒绝非法 JSON',async()=>check((await invoke({'x-proxy-token':'test-token'},'{bad')).code===400,'非法 JSON 未拒绝'));
    await test(name+' 部署版无令牌配置时关闭服务',async()=>{delete env.PROXY_TOKEN;return check((await invoke({})).code===503,'配置缺失未关闭');});
  }
  try {
    fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({scope:'Local HTTP with real filesystem + VM frontend and deployment handlers; mocked upstream, no external API calls',results},null,2));
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    console.warn('结果文件不可写，本次仅输出到控制台。');
  }
  for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name}: ${r.detail||'OK'}`);
  console.log(`${results.filter(r=>r.pass).length}/${results.length} passed`);
  process.exitCode = results.some(r=>!r.pass) ? 1 : 0;
})();
