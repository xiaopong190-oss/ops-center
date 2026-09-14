(function(){
  'use strict';
  const METRICS={sales:['销量',0],salesRevenue:['销售额',0],orders:['推算订单',0],orderCount:['推算订单',0],bsr:['BSR 排名',0],price:['价格',0],ratings:['评价数量',0],stars:['星级',0],avgRatings:['平均评价数',0],avgStars:['平均星级',0],searchVolume:['搜索量',0],weeklySearchVolume:['周搜索量',0],searchTermCount:['关键词数',0],keywordCount:['关键词数',0],searchFrequencyRank:['搜索频率排名',0],categoryRelevantSearchVolume:['类目相关搜索量',0],cpc:['CPC',0],costPerClick:['CPC',0],avgCpc:['平均 CPC',0],competitiveDifficulty:['竞争难度',0],searchTermCompetitiveDifficulty:['竞争难度',0],avgSearchTermCompetitiveDifficulty:['平均竞争难度',0],adjustedClickConversionRate:['调整后点击转化率',1],clickConversionRate:['点击转化率',1],avgCvr:['平均转化率',1],categoryRelevance:['类目相关性',1],cr5:['前五占比（接口口径）',1],cr10:['前十占比（接口口径）',1],cr50:['前五十占比（接口口径）',1],salesRatio:['销量份额',1],clickShare:['点击份额',1],conversionShare:['转化份额',1],organic:['自然流量得分',0],advertising:['广告流量得分',0],totalRank:['排名',0],primaryAsinCount:['主 ASIN 数',0],newAsinCount:['新品数量',0],k80Index:['K80 指数',0]};
  const ACTIONS={
    s1:['对照增长方向、价格带与评价门槛，优先复核门槛可达到的细分。','结合自身成本、毛利和预算后再做进入决策。'],s2:['优先拆解销量较高且评价较少的新品，核验上架时间、价格和功能。','排查品牌、促销与广告对销量上升的影响。'],s3:['对比各价格带销量及增速，再结合成本确定可测试区间。','补充成本和费用后测算净利。'],s4:['按月度高峰倒推生产、运输和入仓节点。','至少对照两个完整年度再确认季节性。'],s5:['转化前三超过 60% 时新手先回避；黄金信号是搜索量在涨而商品数量几乎没变。','价格偏离主流带超过 30% 必须先有差异化理由，再决定是否切入。'],s6:['优先复核搜索量较高且竞争难度低于样本中位数的相关词。','长尾词先验证相关性与转化，再扩大投放。'],s7:['结合流量来源、销量与变体分布确定重点竞品。','用实际订单复核接口推算订单。'],s8:['先看推算单量里自然和广告各占多少，再核对是不是 SB/SBV 在撑。','没有花费就不能判断这套打法能不能复制，更不能算广告利润。'],s9:['将销量拐点与广告、价格和文案变更日期逐项对齐。','用对照期验证原因。'],s10:['结合子体销量、价格与关键词覆盖复核主推子体。','补充曝光与转化证据后再处理低销量子体。'],s11:['按同一 ASIN 拉长区间周期回看，对照本窗口有没有重复动作。','把反复出现的打法记进档案；不要把单次变更当成必须跟的指令。'],s12:['销量、流量同向变化时继续观察，方向背离时核验库存和转化。','解读 BSR 时按数值越小位次越靠前处理。'],s13:['将 CPC 与单次转化可承受成本比较后做小预算测试。','补充自身转化率后测算出价。'],s14:['先确认最松窗口对应的是单个广告位、广告区还是整页采样，再决定测哪个位置。','只在标明的那个位或页做小范围分时测试，保留对照时段；结合真实花费和订单调整。'],s15:['按投放结构建组：精准打爆用精确/词组测，广泛拓量控预算，否定词人工确认后再加。','没有自身转化率就不写死出价；用本组 CPC 口径做上限参考，结合实际花费调整。'],s16:['分开观察自然位与广告位（displayPositions 的 or / sp）。没有自然位时仍要看广告位。','用多次采样确认投放状态。'],s17:['把日期拉到至少 90 天（建议 6 个月）后重新跑，才能看搜索量涨跌和新进入者。','词在放量且头部份额下降才更像切入窗口；单月新进可能只是采样噪音。'],s18:['先看完整反查词表：可抢的按性价比测精确/词组；前排守得紧的不要硬碰，改打侧翼长尾。','自然位缺失时不要把可抢当成 0；用词信息和竞争名单核验量、难度和份额后再投。'],s19:['优先复核掉出词原本贡献的流量。','区分采样遗漏与持续掉词。'],s20:['把主 ASIN 与对手纳入同一查询，核验缺词后再补词。','只对参与查询的 ASIN 做覆盖判断。'],s21:['比较子体覆盖，识别重复词和相关空缺词。','结合实际投放数据确认子体是否互相抬价。'],s22:['对照自然流量、广告流量和自然位曲线。自然流量整天是 0 也算结果：广告在花、自然没接住。','结合花费、订单和库存决定是否停投。'],s23:['把监控名单存进清单，用同一日期窗口周期回看，对照谁又动了。','下一周期先拆动作最多或订单最高的那个，不要把名单里每个竞品平均对待。'],s24:['优先拆解新品榜∩飙升榜、Ratings 低于成熟门槛、且不是共享评价的高置信候选。','西柚新品榜不是官方 HNR；上架超过 180 天的前排当老品，不输出成活率百分比。'],s25:['把功能词按搜索量趋势、购买信号和对应产品销量交叉分层。','标题未出现或关键词证据不足的特征保留为待验证，不写成上升功能。'],s26:['先盯量级标杆和同价带对标，不要把关系名单里的所有 ASIN 当成同一产品。','没有成本不能建议跟价；优惠连续在线时，成交价才是对标口径。'],s27:['出单词才是真实出单证据，矿词和 Google 趋势不能当订单。','先把词接到 Listing/PPC，再决定是否加预算。'],s28:['先看非零关联类型，再按看了又看 / FBT / SP 分开核导流 ASIN。','关联名单不是必投，没有花费不下投放令。'],s29:['先确认叶子类目 nodeIdPath，再读六维份额，不要用记录条数当壁垒。','Amazon 自营占比高、A+近全覆盖、老品吃量时，按细分差异化进，不按大盘头部品硬拼。'],s30:['只在本批评论里比痛点次数，3★/4★更像可改进点。','抽样不是全量 VOC。'],s31:['三条预测分开看，方向一致才提高置信。','预测区间不能直接当首批产量。']  };
  function parseKeywords(raw, max) {
    const cap = max == null ? 8 : max;
    const out = [];
    String(raw == null ? '' : raw).split(/[\n\r,，;；]+/).forEach(part => {
      const t = String(part || '').trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (out.some(x => x.toLowerCase() === key)) return;
      out.push(t);
    });
    return cap < 0 ? out : out.slice(0, cap);
  }
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const scalar=v=>v&&typeof v==='object'?num(v.value??v.metrics?.value):num(v);
  const clean=v=>String(v??'').replace(/[|\r\n]/g,' ');
  const fmt=(v,ratio)=>num(v)===null?'—':ratio?(Number(v)*100).toFixed(2)+'%':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
  const PRICE_NAMES={lowPrice:'低价带',midPrice:'中价带',highPrice:'高价带',allPrice:'全部价格带'};
  function measures(row,parent='',out={}){
    if(!row||typeof row!=='object'||Array.isArray(row))return out;
    for(const [key,value] of Object.entries(row)){
      if(['mom','yoy','previous','path','ranks','trends','periods','trafficAcquisitionRate'].includes(key))continue;
      if(METRICS[key]&&scalar(value)!==null)out[key]={value:scalar(value),spec:METRICS[key],raw:value};
      else if(key==='value'&&METRICS[parent]&&num(value)!==null)out[parent]={value:num(value),spec:METRICS[parent],raw:row};
      else if(value&&typeof value==='object'&&!Array.isArray(value))measures(value,key,out);
    }
    return out;
  }
  function readable(v){
    if(v===null||v===undefined)return '';
    if(typeof v!=='object')return v;
    return v.value??v.original??v.translated??v.name??v.label??v.asin??'';
  }
  function rowLabel(r,i){
    const candidate=r.searchTerm||r.brand||r.asin||r.primaryAsin||r.localDate||r.date||r.month||r.categoryName||r.name;
    return clean(readable(candidate)||(r.hour!==undefined?r.hour+':00':'第 '+(i+1)+' 项'));
  }
  function findRows(data,depth=0){
    if(depth>12)return [];
    if(Array.isArray(data)&&data.some(x=>x&&typeof x==='object'))return data.filter(x=>x&&typeof x==='object');
    if(data&&typeof data==='object'){
      for(const key of ['data','list','items','rows','records','result','entities','keywords','searchTerms','trends']){
        const found=findRows(data[key],depth+1);if(found.length)return found;
      }
      for(const [key,value] of Object.entries(data)){
        if(key==='ranks')continue;
        const found=findRows(value,depth+1);if(found.length)return found;
      }
    }
    return [];
  }
  function organicRankOf(r){
    if(!r||typeof r!=='object')return null;
    const posOf=x=>String((x&&(x.position||x.displayPosition||x.pos||x.type||x.slot))||'').toLowerCase();
    const isOr=p=>p==='or'||p==='organic'||p==='organicrank'||p==='natural'||p==='organic_rank';
    const rankNum=x=>{
      if(x===null||x===undefined||x==='')return null;
      if(typeof x!=='object')return num(x);
      return num(x.totalRank??x.organicRank??x.orRank??x.rank??x.value??x.current??(x.metrics&&x.metrics.value));
    };
    if(Array.isArray(r.ranks)){
      const hit=r.ranks.find(x=>x&&isOr(posOf(x)));
      const n=rankNum(hit);
      if(n!==null)return n;
    }
    for(const v of [r.orRank,r.organicRank,r.organicRankValue,r.naturalRank,r.organicSearchRank,r.organicPosition]){
      const n=rankNum(v);
      if(n!==null)return n;
    }
    if(r.organic&&typeof r.organic==='object'){
      const n=rankNum(r.organic.totalRank??r.organic.rank??r.organic.organicRank??r.organic);
      if(n!==null)return n;
    }
    if(r.ranks&&typeof r.ranks==='object'&&!Array.isArray(r.ranks)){
      const n=rankNum(r.ranks.or??r.ranks.organic??r.ranks.organicRank);
      if(n!==null)return n;
    }
    if(typeof r.rank==='number'||typeof r.rank==='string')return num(r.rank);
    return null;
  }
  function organicShareOf(r){
    if(!r||typeof r!=='object')return null;
    const summary=r.trafficSummary||{};
    const rate=summary.trafficAcquisitionRate||r.trafficAcquisitionRate;
    if(rate&&typeof rate==='object')return num(rate.organic??rate.value);
    const n=scalar(rate);
    if(n!==null)return n;
    return scalar(r.organicTrafficAcquisitionRate||r.organicTrafficScoreRatio);
  }
  function asinKeywordRows(data){
    const out=[];
    const walk=(v,depth)=>{
      if(!v||depth>12)return;
      if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return;}
      if(typeof v!=='object')return;
      if(v.searchTerm!==undefined||v.keyword!==undefined){
        const term=readable(v.searchTerm||v.keyword||v.term);
        if(term){out.push(v);return;}
      }
      Object.keys(v).forEach(k=>{if(k!=='ranks'&&k!=='trends'&&k!=='periods')walk(v[k],depth+1);});
    };
    walk(data,0);
    return out;
  }
  const FEATURE_RULES=[
    ['温度控制',/temperature control|variable temp|precise temperature|±1|preset/i,/temperature control|variable temperature|temp control|temperature preset/i],
    ['鹅颈壶嘴',/gooseneck|pour.?over/i,/gooseneck|pour over/i],
    ['无塑料接触',/no plastic|plastic.?free|bpa.?free/i,/no plastic|plastic free|bpa free/i],
    ['不锈钢内胆',/stainless steel|steel interior/i,/stainless steel|steel kettle/i],
    ['玻璃壶体',/glass carafe|glass kettle|borosilicate/i,/glass kettle|glass electric kettle|borosilicate/i],
    ['保温',/keep warm|warming|hold temp/i,/keep warm|temperature hold/i],
    ['快速沸腾',/fast boil|rapid boil|1500w|1200w/i,/fast boil|rapid boil|1500w kettle/i],
    ['双层防烫',/double wall|cool touch/i,/double wall|cool touch/i],
    ['旅行便携',/travel|portable|compact|collapsible/i,/travel kettle|portable kettle|collapsible kettle/i],
    ['茶滤/泡茶',/tea infuser|tea maker|infuser/i,/tea infuser|tea maker/i],
    ['LED/可视交互',/led|display|touch screen|digital/i,/led kettle|digital kettle|touch screen kettle/i],
    ['智能连接',/smart|app control|wifi|alexa/i,/smart kettle|app controlled kettle|wifi kettle/i],
    ['安全断电',/auto shut.?off|boil.?dry|dry protection/i,/auto shut off|boil dry protection/i]
  ];
  function stepRows(steps,tool){const s=steps.find(x=>x.tool===tool&&x.status==='ok');if(!s)return [];let d=s.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return [];}}return findRows(d);}
  function productView(r){const a=r.asinInfo||r.productInfo||r;return {asin:readable(a.asin||a.primaryAsin||r.primaryAsin),brand:readable(a.brand||r.brand),title:readable(a.title||r.title),sales:scalar(r.metrics?.sales||r.sales),ratings:scalar(a.ratings||r.ratings),stars:scalar(a.stars||r.stars),price:scalar(a.price||r.price||a.priceDistribution?.value||r.priceDistribution?.value||a.priceDistribution?.weightedAvg||r.priceDistribution?.weightedAvg)};}
  function keywordView(r){return {term:readable(r.searchTerm||r.keyword||r.term),volume:scalar(r.searchVolume||r.categoryRelevantSearchVolume||r.weeklySearchVolume),cvr:scalar(r.adjustedClickConversionRate||r.clickConversionRate),difficulty:scalar(r.searchTermCompetitiveDifficulty||r.competitiveDifficulty),trends:Array.isArray(r.trends)?r.trends:[]};}
  async function featureReport(scene,steps){
    const primary=stepRows(steps,'get_category_primary_asins').map(productView),fresh=stepRows(steps,'get_category_new_release_ranking').map(productView),surging=stepRows(steps,'get_category_surging_ranking').map(productView),keywords=stepRows(steps,'get_category_keywords').map(keywordView).filter(k=>k.term);
    const records=FEATURE_RULES.map(([name,titleRe,kwRe])=>{
      const products=primary.filter(p=>titleRe.test(p.title)),newHits=fresh.filter(p=>titleRe.test(p.title)),surgeHits=surging.filter(p=>titleRe.test(p.title)),kw=keywords.filter(k=>kwRe.test(k.term));
      const volume=kw.reduce((a,k)=>a+(k.volume||0),0),productSales=[...newHits,...surgeHits].reduce((a,p)=>a+(p.sales||0),0);
      let rising=0,falling=0;
      kw.forEach(k=>{const pts=k.trends.map(t=>({d:t.localDate||t.date||t.month,v:scalar(t.searchVolume||t.categoryRelevantSearchVolume)})).filter(x=>x.d&&x.v!==null).sort((a,b)=>String(a.d).localeCompare(String(b.d)));if(pts.length>1){const delta=pts.at(-1).v-pts[0].v;if(delta>0)rising++;if(delta<0)falling++;}});
      const validation=(newHits.length||surgeHits.length)&&kw.length?'双重验证':(newHits.length||surgeHits.length)?'产品验证':kw.length?'流量验证':'待验证';
      return {name,products,newHits,surgeHits,kw,volume,productSales,rising,falling,validation};
    }).filter(x=>x.products.length||x.newHits.length||x.surgeHits.length||x.kw.length).sort((a,b)=>({双重验证:3,流量验证:2,产品验证:1,待验证:0}[b.validation]-({双重验证:3,流量验证:2,产品验证:1,待验证:0}[a.validation]))||b.volume-a.volume||b.productSales-a.productSales);
    const lines=records.slice(0,12).map(r=>'**'+r.name+'｜'+r.validation+'**：代表商品 '+r.products.length+' 个，新品榜 '+r.newHits.length+' 个，飙升榜 '+r.surgeHits.length+' 个；匹配关键词 '+r.kw.length+' 个'+(r.volume?'，合计搜索量口径 '+fmt(r.volume,0):'')+'。'+(r.kw.length?' 关键词：'+r.kw.slice(0,5).map(k=>k.term).join('、')+'。':'')+(r.newHits.length||r.surgeHits.length?' 产品：'+[...r.newHits,...r.surgeHits].filter((p,i,a)=>p.asin&&a.findIndex(x=>x.asin===p.asin)===i).slice(0,5).map(p=>(p.asin||p.brand)+(p.sales!==null?'（销量 '+fmt(p.sales,0)+'）':'')).join('、')+'。':''));
    const top=records.filter(r=>r.validation==='双重验证');
    const text=['## '+scene.name,'### 核心结论',
      '- 本次从 '+primary.length+' 个代表商品、'+fresh.length+' 个新品榜样本、'+surging.length+' 个飙升榜样本和 '+keywords.length+' 条关键词中交叉识别功能。来源：get_category_primary_asins、get_category_new_release_ranking、get_category_surging_ranking、get_category_keywords。',
      '- 获得产品与关键词双重验证的功能有 '+top.length+' 个：'+(top.map(x=>x.name).join('、')||'暂无')+'。双重验证只表示本次样本同时出现，仍需持续月份和购买份额确认。',
      '- 当前优先复核：'+(records.slice(0,5).map(x=>x.name+'（'+x.validation+'）').join('、')||'数据不足')+'。',
      '### 功能与特征交叉结果',...lines.map(x=>'- '+x),
      '### 分析过程',
      '**步骤 1 · 四路样本**','- 代表商品、新品榜、飙升榜、类目关键词交叉识别可见功能。',
      '**步骤 2 · 验证分层**','- 产品侧与关键词同时命中记双重验证；只一侧命中分别记产品验证或流量验证。',
      '**步骤 3 · 上升确认**','- 标题常见不等于需求在涨；没有趋势和购买份额时不升级为上升功能。',
      '**步骤 4 · 优先复核**','- 先拆双重验证功能对应的 ASIN、价格带和 Ratings。',
      '### 判断口径','- 双重验证：新品或飙升产品标题出现该特征，同时类目关键词存在对应需求。','- 产品验证：产品侧出现，但当前关键词样本没有匹配到流量证据。','- 流量验证：关键词存在需求，但新品或飙升榜标题没有匹配到该特征。','- 待验证：只有代表商品标题证据，不能认定为上升功能。',
      '### 行动建议','- P1：优先逐个复核双重验证功能对应的 ASIN、价格带、Ratings、上架时间和关键词趋势。','- P2：对只有产品验证的功能补查同义词；对只有流量验证的功能确认关键词是否被跨类目语义污染。',
      '### 结论边界','“所有功能”仅覆盖接口标题和预设同义词能识别的可见特征；接口未提供 Bullet、主图结构和完整 VOC，因此隐藏功能、外观差异与真实购买动机仍标为待验证。关键词搜索量不是订单量，标题出现也不证明该功能造成销量增长。'].join('\n');
    const featurePoints=records.slice(0,10).map(r=>({label:r.name,value:r.volume,ratio:0}));
    const productPoints=records.filter(r=>r.newHits.length||r.surgeHits.length).slice(0,10).map(r=>({label:r.name,value:r.productSales,ratio:0}));
    const featureCharts=[{title:'功能词搜索量（本次样本）',source:'get_category_keywords',kind:'bar',points:featurePoints,ratio:0,note:'同义功能词搜索量相加，仅用于本次样本内比较。'},{title:'采用该功能的新品/飙升产品销量合计',source:'get_category_new_release_ranking、get_category_surging_ranking',kind:'bar',points:productPoints,ratio:0,note:'新品榜与飙升榜可能包含同一 ASIN；该图用于候选排序，不代表功能因果贡献。'}].filter(c=>c.points.length);
    if(!featureCharts.length)featureCharts.push({title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:[{label:'代表商品',value:primary.length},{label:'新品榜',value:fresh.length},{label:'飙升榜',value:surging.length},{label:'关键词',value:keywords.length}],ratio:0,note:'没有识别到可交叉的功能时，仅展示样本覆盖。'});
    const lead=(top.length?'双重验证功能：'+top.map(x=>x.name).join('、')+'。':'本次没有双重验证功能。')+' 优先复核：'+(records.slice(0,3).map(x=>x.name).join('、')||'数据不足')+'。';
    return {text,lead,cards:[{label:'代表商品样本',value:String(primary.length)},{label:'新品榜样本',value:String(fresh.length)},{label:'飙升榜样本',value:String(surging.length)},{label:'关键词样本',value:String(keywords.length)},{label:'双重验证功能',value:String(top.length)}],charts:featureCharts};
  }
  function rankingProduct(r){
    const a=r.asinInfo||r.productInfo||r;
    const m=r.metrics||{};
    const last=(r.periods||[]).find(p=>p.period==='last30days')||(r.periods||[])[0]||{};
    return {
      asin:readable(a.primaryAsin||a.asin||r.primaryAsin||r.asin),
      brand:readable(a.brand||r.brand),
      title:readable(a.title||r.title),
      sales:scalar(m.sales||r.sales||last.sales),
      revenue:scalar(m.salesRevenue||r.salesRevenue||last.salesRevenue),
      ratings:scalar(a.ratings||r.ratings),
      stars:scalar(a.stars||r.stars),
      price:scalar(a.priceDistribution?.value||a.price||r.price),
      listedDays:scalar(a.listedDays||r.listedDays||m.listedDays),
      streetDate:readable(a.streetDate||r.streetDate)
    };
  }
  function rankingProducts(data){return findRows(data).map(rankingProduct).filter(p=>p.asin||p.brand||p.title);}
  function topNewAsins(data,n){
    return rankingProducts(data).filter(p=>p.asin&&p.listedDays!==null&&p.listedDays<=180&&p.sales>0)
      .sort((a,b)=>b.sales-a.sales).slice(0,n||6).map(p=>p.asin);
  }
  function sharedReview(p){return p.listedDays!==null&&p.listedDays<=180&&p.ratings!==null&&p.ratings>=800&&p.sales!==null&&p.ratings>0&&p.sales/p.ratings<2;}
  function titlePath(title){
    const t=title||'';
    if(/gooseneck/i.test(t)&&/(temperature|±\s*1|preset)/i.test(t))return '鹅颈+温控';
    if(/gooseneck|pour.?over/i.test(t))return '鹅颈基础款';
    if(/infuser|tea maker/i.test(t)&&/(temperature|±\s*1)/i.test(t))return '茶器温控';
    if(/keep warm|7 temp|5 preset|temperature control/i.test(t))return '温控+保温';
    if(/double wall|cool touch|retro/i.test(t))return '双层/复古';
    if(/no plastic|plastic.?free|stainless/i.test(t))return '标准快烧';
    return '待标注';
  }
  function trafficByAsin(steps){
    const rows=stepRows(steps,'get_asin_traffic');
    const map={};
    rows.forEach(r=>{
      const asin=readable(r.asin);
      if(!asin)return;
      map[asin]={org:scalar(r.organicTrafficScore),ads:scalar(r.advertisingTrafficScore),adsRatio:scalar(r.advertisingTrafficScoreRatio),orgGrowth:scalar(r.organicTrafficScoreGrowthRate),adsGrowth:scalar(r.advertisingTrafficScoreGrowthRate)};
    });
    return map;
  }
  async function newReleaseReport(scene,steps){
    const opp=stepRows(steps,'get_category_new_release_opportunity_trends');
    const ranked=rankingProducts(stepRows(steps,'get_category_new_release_ranking')).sort((a,b)=>(b.sales||0)-(a.sales||0));
    const surge=new Set(rankingProducts(stepRows(steps,'get_category_surging_ranking')).map(p=>p.asin).filter(Boolean));
    const traffic=trafficByAsin(steps);
    const recent=ranked.filter(p=>p.listedDays!==null&&p.listedDays<=180);
    const d90=recent.filter(p=>p.listedDays<=90&&p.sales>0);
    const d180=recent.filter(p=>p.sales>0);
    const cleaned=d180.filter(p=>!sharedReview(p));
    const dropped=d180.filter(sharedReview);
    const oppRoot=steps.find(s=>s.tool==='get_category_new_release_opportunity_trends'&&s.status==='ok');
    let root=oppRoot&&oppRoot.data;if(typeof root==='string'){try{root=JSON.parse(root);}catch(_){root={};}}root=root&&root.data||root||{};
    const summary=root.summary||{};
    const oppCount=scalar(summary.asinCount),oppCountPrev=num(summary.asinCount&&summary.asinCount.mom&&summary.asinCount.mom.previous);
    const oppSales=scalar(summary.sales),oppPrev=num(summary.sales&&summary.sales.mom&&summary.sales.mom.previous);
    const salesShare=scalar(summary.salesRatio);
    const countChange=oppCount!==null&&oppCountPrev?((oppCount-oppCountPrev)/Math.abs(oppCountPrev)):null;
    const salesChange=oppSales!==null&&oppPrev?((oppSales-oppPrev)/Math.abs(oppPrev)):null;
    const windowState=salesChange===null?'数据不足':salesChange<-0.15?'窗口在收':salesChange>0.15?'窗口在开':'窗口横盘';
    const top=cleaned.slice(0,8);
    const first=top[0];
    const only90=d90.filter(p=>!sharedReview(p));
    const conclusion=[
      '- 近 90 天仍有销量的清洗后新品 **'+(only90.length)+'** 个'+(only90[0]?'，代表是 '+(only90[0].brand||only90[0].asin)+' '+(only90[0].asin||'')+'，近 30 天销量 '+fmt(only90[0].sales,0)+'。':'。')+' 来源：get_category_new_release_ranking（streetDays 0–180，再按 ≤90 天切分）。',
      '- 近 180 天清洗后仍出量 **'+cleaned.length+'** 个；共享评价剔除 **'+dropped.length+'** 个。'+(first?'销量最高的清洗样本是 **'+(first.brand||'')+' '+(first.asin||'')+'**，'+fmt(first.sales,0)+' 件，'+titlePath(first.title)+'，约 $'+fmt(first.price,0)+'。':''),
      '- 新品窗口：**'+windowState+'**'+(salesChange===null?'。':'，新品销量环比 '+(salesChange>=0?'+':'')+(salesChange*100).toFixed(1)+'%，新品父体数环比 '+(countChange===null?'未知':((countChange>=0?'+':'')+(countChange*100).toFixed(1)+'%'))+'。')+(salesShare!==null?' 新品销量占类目 '+fmt(salesShare,1)+'。':'')+' 来源：get_category_new_release_opportunity_trends。'
    ];
    const lines=top.map(p=>{
      const t=traffic[p.asin];
      const ads=t&&t.adsRatio!==null?(t.adsRatio*100).toFixed(1)+'%':null;
      const verdict=t&&t.adsRatio!==null&&t.adsRatio>=0.7?'广告主导':t&&t.adsRatio!==null&&t.adsRatio<=0.2?'自然接住':t?'广告与自然双接':'流量未取';
      const ratio=p.sales!==null&&p.ratings? (p.sales/p.ratings).toFixed(1):'—';
      return '**'+(p.brand||'未标明')+' '+(p.asin||'')+'｜'+titlePath(p.title)+'｜'+verdict+'**：上架 '+(p.listedDays===null?'未提供':p.listedDays+' 天')+(p.streetDate?'（'+p.streetDate+'）':'')+'，近 30 天销量 '+fmt(p.sales,0)+'，约 $'+fmt(p.price,0)+'，Ratings '+fmt(p.ratings,0)+' / 星级 '+fmt(p.stars,0)+'，销评比 '+ratio+(ads?'，近 7 天广告流量占比 '+ads:'')+(surge.has(p.asin)?'；同时出现在飙升榜':'')+'。';
    });
    const dropLines=dropped.map(p=>'**'+(p.brand||'')+' '+(p.asin||'')+'**：上架 '+p.listedDays+' 天但 Ratings '+fmt(p.ratings,0)+'、销评比 '+(p.sales/p.ratings).toFixed(2)+'，按共享评价/老资产剔除，不当作从 0 起量。');
    const text=['## '+scene.name,'### 核心结论',...conclusion,
      '### 清洗后出量新品',...(lines.length?lines.map(x=>'- '+x):['- 近 180 天没有可识别的出量新品。若新品榜上架天数普遍超过 180 天，说明本次没有按 streetDays 筛选，前排是类目老品。']),
      ...(dropLines.length?['### 已剔除', ...dropLines.map(x=>'- '+x)]:[]),
      '### 分析过程',
      '**步骤 1 · 上架窗口**','- 新品榜按 streetDays 0–180 拉补充观察池，再切 ≤90 / ≤180。西柚新品榜不是官方 HNR。',
      '**步骤 2 · 共享评价清洗**','- 上架 ≤180 天且 Ratings≥800 且销评比<2，按老资产换 ASIN 剔除。',
      '**步骤 3 · 第一驱动**','- 近 7 天广告占比 ≥70% 记广告主导，≤20% 记自然接住；标题功能只作第二驱动。',
      '**步骤 4 · 窗口方向**','- 新品机会汇总的销量环比判断窗口开/收，缺值不补零。',
      '### 判断口径','- 近期：上架天数 ≤90 / ≤180。销量是接口近 30 天口径。','- 共享评价：上架 ≤180 天且 Ratings≥800 且销评比<2，视为老资产换 ASIN。','- 第一驱动看流量结构：广告占比≥70% 记广告主导，≤20% 记自然接住；标题功能只作第二驱动。','- 西柚新品榜不是官方 Amazon HNR 名次。',
      '### 行动建议','- P1：优先拆解清洗后销量最高、且不是广告主导的样本，核对其上架时间、价格和功能是否可复制。','- P2：对广告占比过高的样本，用后续自然流量是否接住再决定是否跟进。',
      '### 结论边界','没有官方 HNR、没有 VOC。流量得分不是曝光量。成活率只有当前截面，不能输出 90/180/365 天 cohort 百分比。'].join('\n');
    const salesChart=d180.slice(0,10).map(p=>({label:(p.brand||p.asin||'未标明')+(sharedReview(p)?'·剔除':''),value:p.sales||0}));
    const trafficChart=top.filter(p=>traffic[p.asin]&&traffic[p.asin].adsRatio!==null).map(p=>({label:p.brand||p.asin,value:traffic[p.asin].adsRatio}));
    const charts=[];
    if(salesChart.length)charts.push({title:'近 180 天新品的近 30 天销量',source:'get_category_new_release_ranking',kind:'bar',points:salesChart,ratio:0,note:'已按上架天数 ≤180 过滤；标注剔除的是共享评价样本。'});
    if(trafficChart.length)charts.push({title:'近 7 天广告流量占比',source:'get_asin_traffic',kind:'bar',points:trafficChart,ratio:1,note:'≥70% 视为广告主导；≤20% 视为自然接住。流量得分不是曝光次数。'});
    if(!charts.length)charts.push({title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:[{label:'机会趋势',value:opp.length},{label:'新品榜',value:ranked.length},{label:'飙升榜',value:surge.size},{label:'近180天出量',value:d180.length}],ratio:0,note:'缺少可比较销量时显示样本覆盖。'});
    const lead=(only90[0]?'近 90 天真正出量的新品只有 '+(only90[0].brand||'')+' / '+(only90[0].asin||'')+'。':'近 90 天没有清洗后仍出量的新品。')+' 近 180 天能算跑出来的，优先看清洗后销量前列，并分开广告主导与自然接住。Cosori 一类高 Ratings 新 ASIN 按共享评价剔除，不能当从 0 起量。';
    const tableRows=d180.slice(0,12).map(p=>{
      const t=traffic[p.asin];
      const ads=t&&t.adsRatio!==null?(t.adsRatio*100).toFixed(1)+'%':'未取';
      const ratio=p.sales!==null&&p.ratings?(p.sales/p.ratings).toFixed(2):'—';
      let verdict='保留 · 真正起量';
      if(sharedReview(p))verdict='剔除 · 共享评价';
      else if(t&&t.adsRatio!==null&&t.adsRatio>=0.7)verdict='降权 · 广告主导';
      else if(p.listedDays!==null&&Number(p.listedDays)<=90)verdict='保留 · 90天唯一';
      return [verdict,(p.asin||'')+' '+(p.brand||''),(p.listedDays===null?'—':p.listedDays+' 天')+(p.streetDate?' / '+p.streetDate:''),fmt(p.sales,0),p.price===null?'—':'$'+fmt(p.price,0),fmt(p.ratings,0)+' / '+fmt(p.stars,0),ratio,ads];
    });
    return {text,lead,cards:[
      {label:'近 90 天有销量的新品父体',value:String(only90.length)},
      {label:'近 180 天清洗后仍出量',value:String(cleaned.length)},
      {label:'新品销量占叶子类目',value:salesShare===null?'—':fmt(salesShare,1)},
      {label:'新品销量环比',value:salesChange===null?'—':((salesChange>=0?'+':'')+(salesChange*100).toFixed(1)+'%'),tone:salesChange!==null&&salesChange<0?'down':'up'}
    ],charts,tables:tableRows.length?[{title:'清洗后的有效新品',headers:['判定','ASIN / 品牌','上架','近 30 天销量','价格','Ratings / 星级','销评比','近 7 天广告流量占比'],rows:tableRows,note:'上架 ≤180 天；共享评价 = Ratings≥800 且销评比<2。西柚新品榜不是官方 HNR。'}]:[]};
  }
  function brandNames(list){return (list||[]).map(b=>clean(readable(typeof b==='object'&&b&&(b.brand||b.name)?(b.brand||b.name):b))).filter(Boolean);}
  function periodOf(r){return (r.periods||[]).find(p=>p.period==='last30days')||(r.periods||[])[0]||{};}
  function momRate(node){
    if(!node||typeof node!=='object')return null;
    const mom=node.mom;if(!mom)return null;
    const rate=num(mom.rate);if(rate!==null)return rate;
    const prev=num(mom.previous),cur=scalar(node);
    return cur!==null&&prev?((cur-prev)/Math.abs(prev)):null;
  }
  function parsePriceRows(steps){
    return stepRows(steps,'get_category_price_segment_trends').filter(r=>r&&PRICE_NAMES[r.priceType]).map(r=>{
      const period=periodOf(r);
      const min=num(r.min),max=num(r.max);
      const sales=scalar(period.sales??r.sales),revenue=scalar(period.salesRevenue??r.salesRevenue);
      const ratio=num(period.sales?.ratio??period.salesRatio?.value??r.sales?.ratio);
      return {
        priceType:r.priceType,short:PRICE_NAMES[r.priceType],
        label:PRICE_NAMES[r.priceType]+(min!==null&&max!==null?' $'+fmt(min,0)+'–'+fmt(max,0):''),
        min,max,sales,revenue,ratio,salesMom:momRate(period.sales||r.sales),
        ratings:num(r.avgRatings),stars:num(r.avgStars),brands:brandNames(r.brands).slice(0,8),
        asins:(r.asins||r.primaryAsins||r.asinList||[]).map(a=>readable(a)).filter(Boolean)
      };
    });
  }
  function topPriceType(data){
    const fake=[{tool:'get_category_price_segment_trends',status:'ok',data}];
    const ranked=parsePriceRows(fake).filter(r=>r.priceType!=='allPrice'&&r.sales!==null).sort((a,b)=>b.sales-a.sales);
    return ranked[0]?ranked[0].priceType:null;
  }
  function assignBand(p,bands){
    if(p.price===null)return null;
    const hits=bands.filter(b=>b.priceType!=='allPrice'&&b.min!==null&&b.max!==null&&p.price>=b.min&&p.price<=b.max);
    return hits.length===1?hits[0]:null;
  }
  async function priceBandReport(scene,form,steps){
    const bands=parsePriceRows(steps);
    const products=stepRows(steps,'get_category_primary_asins').map(r=>{
      const p=rankingProduct(r);
      if(p.price===null)p.price=scalar(r.priceDistribution?.weightedAvg||r.asinInfo?.priceDistribution?.weightedAvg);
      return p;
    }).filter(p=>p.asin||p.brand||p.title);
    const segments=bands.filter(b=>b.priceType!=='allPrice');
    products.forEach(p=>{p.band=assignBand(p,segments);});
    const ranked=segments.filter(r=>r.sales!==null).sort((a,b)=>b.sales-a.sales);
    const top=ranked[0]||null;
    const ownAsin=clean(form&&form.asin||'');
    const own=ownAsin?products.find(p=>p.asin===ownAsin)||{asin:ownAsin,brand:clean(form.brand||''),price:null,sales:null,ratings:null,stars:null,band:null}:null;
    if(own&&own.price!==null&&!own.band)own.band=assignBand(own,segments);
    const target=own&&own.band||top;
    const charts=[];
    if(bands.length){
      for(const [key,title,ratio] of [['sales','近 30 天销量',0],['revenue','近 30 天销售额',0],['ratio','销量份额',1]]){
        const points=bands.filter(r=>r[key]!==null).map(r=>({label:r.label,value:r[key]}));
        if(points.length>=2)charts.push({title,source:'get_category_price_segment_trends',kind:'bar',points,ratio,note:'按接口返回的价格区间分组；用于比较价格带，不代表利润。'});
      }
    }
    if(!charts.length&&products.length){
      const metric=products.some(p=>p.sales!==null)?'sales':'ratings';
      const grouped={};
      products.forEach(p=>{const k=p.brand||p.asin||'未标明';if(!grouped[k]||(p[metric]||0)>(grouped[k]||0))grouped[k]=p[metric]||0;});
      const points=Object.entries(grouped).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
      if(points.length)charts.push({title:metric==='sales'?'代表商品销量':'代表商品 Ratings',source:'get_category_primary_asins',kind:'bar',points:points.slice(0,10),ratio:0,note:'没有价格带接口时，用代表商品样本比较；不是全市场价格带。'});
    }
    if(!charts.length)charts.push({title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:[{label:'价格带',value:bands.length},{label:'代表商品',value:products.length}],ratio:0,note:'缺少可比较销量时显示样本覆盖。'});
    const occupant=target?products.filter(p=>p.band&&p.band.priceType===target.priceType).sort((a,b)=>(b.sales||0)-(a.sales||0)):products.filter(p=>p.sales!==null).sort((a,b)=>b.sales-a.sales);
    const conclusion=[];
    if(top)conclusion.push('- 销量最高的是 '+top.short+(top.min!==null?' $'+fmt(top.min,0)+'–'+fmt(top.max,0):'')+'，近 30 天销量 '+fmt(top.sales,0)+(top.ratio!==null?'，接口份额 '+fmt(top.ratio,1):'')+(top.salesMom!==null?'，环比 '+(top.salesMom>=0?'+':'')+(top.salesMom*100).toFixed(1)+'%':'')+'。（来源：get_category_price_segment_trends）');
    if(own){
      if(own.band)conclusion.push('- 主 ASIN **'+(own.asin||'')+'** 当前落在 **'+own.band.short+'**'+(own.price!==null?'，样本价格 $'+fmt(own.price,0):'')+'。该价带头部品牌：'+(own.band.brands.join('、')||'未提供')+'。（来源：get_category_price_segment_trends'+(own.price!==null?'、get_category_primary_asins':'')+'）');
      else conclusion.push('- 主 ASIN **'+(own.asin||'')+'** 未在代表商品中给出可归档价格，不能在本次接口里定位所在档。先按销量最大价带看谁占着。（来源：get_category_primary_asins）');
    }
    if(target)conclusion.push('- 观察档 **'+target.short+'** 区间为 '+(target.min!==null&&target.max!==null?'$'+fmt(target.min,0)+'–'+fmt(target.max,0):'接口未提供')+'；该价带头部品牌：'+(target.brands.join('、')||'未提供')+'。'+(occupant.length?'代表商品样本 '+occupant.length+' 个。':'')+'（来源：get_category_price_segment_trends）');
    while(conclusion.length<3)conclusion.push('- 本次没有更多可验证的价格带结论；缺失项未按零值处理。');
    const bandLines=bands.map(r=>r.label+'：销量 '+(r.sales===null?'未提供':fmt(r.sales,0))+'，销售额 '+(r.revenue===null?'未提供':fmt(r.revenue,0))+(r.ratio===null?'':'，销量份额 '+fmt(r.ratio,1))+(r.salesMom===null?'':'，环比 '+(r.salesMom>=0?'+':'')+(r.salesMom*100).toFixed(1)+'%')+'；价带内头部品牌：'+(r.brands.join('、')||'未提供')+'。');
    const occLines=(occupant.slice(0,8).map(p=>'**'+(p.brand||'未标明')+' '+(p.asin||'')+'**：'+(p.band?p.band.short:'未归档')+'，价格 '+(p.price===null?'未提供':'$'+fmt(p.price,0))+'，近 30 天销量 '+fmt(p.sales,0)+'，Ratings '+fmt(p.ratings,0)+' / 星级 '+fmt(p.stars,0)+'。'));
    const rec=own&&own.band&&top&&own.band.priceType===top.priceType?'继续在销量最大档测试，先核对成本能否覆盖该档头部价格。':own&&own.band&&top&&own.band.priceType!==top.priceType?'当前不在销量最大档；是否换档取决于成本、功能和该档头部品牌，不单看份额。':top?'先按销量最大档看占位品牌，再用自身成本决定能否进入。':'价格带数据不足，不能推荐卡位。';
    const lead=top?(own&&own.band?'主 ASIN 落在'+own.band.short+(own.price!==null?'（$'+fmt(own.price,0)+'）':'')+'，销量最大的是'+top.short+'。'+target.short+'现在主要被 '+(target.brands.slice(0,4).join('、')||'未标明品牌')+' 占着。':own?'主 ASIN 本次不能归档。销量最大的是'+top.short+'，该档头部品牌：'+(top.brands.slice(0,4).join('、')||'未提供')+'。':'销量最大的是'+top.short+'，该档头部品牌：'+(top.brands.slice(0,4).join('、')||'未提供')+'。')+' '+rec:'本次没有可用的低中高价格带，不能判断该定哪一档。';
    const text=['## '+scene.name,'### 核心结论',...conclusion,
      '### 价格带占位结构',...(bandLines.length?bandLines.map(x=>'- '+x):['- 未返回可识别的低中高价格带。']),
      ...(occLines.length?['### 该档代表商品',...occLines.map(x=>'- '+x)]:[]),
      '### 分析过程',
      '**步骤 1 · 三档区间**','- 以西柚 low/mid/high 边界为准，不自切分位。',
      '**步骤 2 · 主流档**','- 近 30 天销量最大的非全部档视为主流，用来对照自己该落在哪。',
      '**步骤 3 · 占位品牌**','- 代表商品只有价格落在唯一一档时才归入，避免跨档污染。',
      '**步骤 4 · 定价边界**','- 没有成本就不能输出应该卖多少钱。',
      '### 判断口径','- 价格带边界以西柚 low/mid/high 为准，不是自己切的分位。','- 代表商品只有价格落在唯一一档时才归入该档，避免跨档品牌污染。','- 份额和销量是接口近 30 天口径，不是利润，也不能单独决定定价。',
      '### 行动建议','- P1：'+rec,'- P2：对观察档头部品牌逐个核对其价格、Ratings 和变体铺法，再决定是贴着打还是让开。',
      '### 结论边界','没有成本、费用和净利，不能输出“应该卖多少钱”。高价带销量大不代表更好进入；品牌名单不是市占率。'].join('\n');
    const tableRows=bands.map(r=>[r.short,r.min===null?'—':'$'+fmt(r.min,0)+'–'+fmt(r.max,0),fmt(r.sales,0),r.ratio===null?'—':fmt(r.ratio,1),r.salesMom===null?'—':((r.salesMom>=0?'+':'')+(r.salesMom*100).toFixed(1)+'%'),fmt(r.ratings,0)+' / '+fmt(r.stars,0),r.brands.slice(0,5).join('、')||'未提供']);
    const occTable=occupant.slice(0,12).map(p=>[p.band?p.band.short:(own&&p.asin===own.asin?'主 ASIN 未归档':'未归档'),(p.asin||'')+' '+(p.brand||''),p.price===null?'—':'$'+fmt(p.price,0),fmt(p.sales,0),fmt(p.ratings,0)+' / '+fmt(p.stars,0)]);
    return {text,lead,cards:[
      {label:'销量最大价带',value:top?top.short:'—'},
      {label:'该档销量份额',value:top&&top.ratio!==null?fmt(top.ratio,1):'—'},
      {label:'主 ASIN 所在档',value:own&&own.band?own.band.short:(own?'未归档':'—')},
      {label:'观察档头部品牌',value:String((target&&target.brands.length)||0)}
    ],charts,tables:[
      ...(tableRows.length?[{title:'低中高价格带',headers:['价格带','区间','近 30 天销量','份额','销量环比','均 Ratings / 星级','头部品牌'],rows:tableRows,note:'来源 get_category_price_segment_trends；全部价格带若返回会一并列出但不作为卡位档。'}]:[]),
      ...(occTable.length?[{title:(target?target.short+'代表商品':'代表商品样本'),headers:['所在档','ASIN / 品牌','价格','近 30 天销量','Ratings / 星级'],rows:occTable,note:'只把价格落在唯一一档的代表商品算进该档；无价格的不跨档归入。'}]:[])
    ]};
  }
  function percentile(values,p){const a=values.filter(v=>v!==null).sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*p))]:null;}
  async function quickCategoryReport(scene,steps){
    const market=stepRows(steps,'get_category_market_size_trends'),price=stepRows(steps,'get_category_price_segment_trends'),products=stepRows(steps,'get_category_primary_asins').map(productView),keywords=stepRows(steps,'get_category_keywords').map(keywordView).filter(k=>k.term);
    const marketPoints=market.map((r,i)=>({label:readable(r.localDate||r.date||r.month)||'第 '+(i+1)+' 期',value:scalar(r.sales||r.salesRevenue),date:readable(r.localDate||r.date||r.month)})).filter(x=>x.value!==null).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const first=marketPoints[0],last=marketPoints.at(-1),yearAgo=last&&marketPoints.find(x=>String(x.date).slice(0,7)===String(Number(String(last.date).slice(0,4))-1)+String(last.date).slice(4,7));
    const base=yearAgo||first,growth=base&&last&&base.value?((last.value-base.value)/Math.abs(base.value)):null,growthBasis=yearAgo?'最新月份同比':'可比首末期';
    const direction=growth===null?'数据不足':growth>0.05?'增长':growth<-.05?'下降':'横盘';
    const priceRows=price.filter(r=>PRICE_NAMES[r.priceType]).map(r=>{const period=(r.periods||[]).find(x=>x.period==='last30days')||(r.periods||[])[0]||{};return {name:PRICE_NAMES[r.priceType],min:num(r.min),max:num(r.max),sales:scalar(period.sales||r.sales),revenue:scalar(period.salesRevenue||r.salesRevenue),ratio:num(period.sales?.ratio||period.salesRatio?.value),ratings:num(r.avgRatings),stars:num(r.avgStars),brands:(r.brands||[]).slice(0,10)};});
    const rankedPrice=priceRows.filter(x=>x.sales!==null).sort((a,b)=>b.sales-a.sales);
    const productSales=products.filter(p=>p.sales!==null).sort((a,b)=>b.sales-a.sales),head=productSales.slice(0,Math.max(5,Math.ceil(productSales.length*.25)));
    const ratingGate=percentile(head.map(p=>p.ratings),.25),starGate=percentile(head.map(p=>p.stars),.25);
    const featureRows=FEATURE_RULES.map(([name,titleRe,kwRe])=>{const ps=products.filter(p=>titleRe.test(p.title)),ks=keywords.filter(k=>kwRe.test(k.term)),volume=ks.reduce((a,k)=>a+(k.volume||0),0),cvrs=ks.map(k=>k.cvr).filter(v=>v!==null);return {name,products:ps.length,volume,cvr:cvrs.length?cvrs.reduce((a,b)=>a+b,0)/cvrs.length:null,terms:ks.map(k=>k.term)};}).filter(x=>x.volume||x.products).sort((a,b)=>b.volume-a.volume);
    const bestFeature=featureRows.filter(x=>x.volume&&x.cvr!==null).sort((a,b)=>b.cvr-a.cvr);
    const priceLines=priceRows.map(r=>r.name+' '+(r.min!==null&&r.max!==null?'$'+fmt(r.min,0)+'–'+fmt(r.max,0):'区间未提供')+'：销量 '+(r.sales===null?'未提供':fmt(r.sales,0))+(r.ratio!==null?'，份额 '+fmt(r.ratio,1):'')+'，平均 Ratings '+(r.ratings===null?'未提供':fmt(r.ratings,0))+'，平均星级 '+(r.stars===null?'未提供':fmt(r.stars,0))+'；品牌样本 '+(r.brands.join('、')||'未提供')+'。');
    const text=['## '+scene.name,'### 核心结论',
      '- 类目增长方向：**'+direction+'**'+(growth===null?'，缺少连续可比市场月份。':'，'+growthBasis+'变化 '+(growth>=0?'+':'')+(growth*100).toFixed(1)+'%。')+' 来源：get_category_market_size_trends。',
      '- 可见头部样本门槛：Ratings 约 **'+(ratingGate===null?'数据不足':fmt(ratingGate,0))+'**，星级约 **'+(starGate===null?'数据不足':fmt(starGate,0))+'**。口径为销量头部样本的下四分位，不是平台硬门槛。来源：get_category_primary_asins。',
      '- 用户销量最多的价格带：**'+(rankedPrice[0]?rankedPrice[0].name+' $'+fmt(rankedPrice[0].min,0)+'–'+fmt(rankedPrice[0].max,0)+'，销量 '+fmt(rankedPrice[0].sales,0):'数据不足')+'**。来源：get_category_price_segment_trends。',
      '### 分析过程',
      '**步骤 1 · 市场规模方向**','- 用 get_category_market_size_trends 的可比月份判断增长；有完整年同比用同比，否则用首末期。本次方向 **'+direction+'**。',
      '**步骤 2 · 可见进入门槛**','- 代表商品按销量取头部 25%，Ratings / 星级用下四分位，不是平台硬门槛。',
      '**步骤 3 · 价格带**','- 销量最大的低/中/高档视为主流卡位参考，不是利润最优档。',
      '**步骤 4 · 功能词**','- 标题特征与类目关键词交叉，只作细分候选，不把搜索量乘转化率当订单。',
      '### 价格格局与进入要求',...priceLines.map(x=>'- '+x),
      '### 功能细分与关键词转化证据',...(featureRows.slice(0,10).map(r=>'- **'+r.name+'**：代表商品覆盖 '+r.products+' 个；功能词搜索量 '+fmt(r.volume,0)+'；平均点击转化率 '+(r.cvr===null?'未提供':fmt(r.cvr,1))+'；关键词 '+(r.terms.slice(0,4).join('、')||'未匹配')+'。')),
      '### 优先验证的细分','- '+(bestFeature.length?'按本次关键词平均点击转化率，优先复核 '+bestFeature.slice(0,5).map(x=>x.name+'（'+fmt(x.cvr,1)+'）').join('、')+'。':'关键词缺少可用转化率，暂不能按转化率选择细分。'),
      '### 品牌与质量判断','- 价格带接口只返回品牌名单、平均 Ratings 与星级，未返回“有品牌/无品牌”对照转化率，因此不能把任何价格带判为对品牌有绝对要求。品牌数量少、平均 Ratings 高的价带只能标为品牌/质量门槛较高的待验证区。','- 功能质量要求以价带平均 Ratings、星级和功能词转化率共同观察；没有退货率、VOC 和同功能对照时，不将高客单价直接等同于高质量要求。',
      '### 行动建议','- P1：优先检查销量最大价格带与高转化功能细分的交集，再用具体 ASIN 的价格、Ratings 和销量验证。','- P2：对品牌依赖判断补充品牌词流量、品牌份额和同功能有无品牌的转化对照。',
      '### 结论边界','细分类结论按可识别功能词形成，尚未对每个 Amazon 叶子类目分别生成资源，因此不冒充叶子类目增长排名。转化率采用接口点击转化率口径；搜索量、点击转化率和销量来自不同层级，不能直接相乘为订单。'].join('\n');
    const charts=[];if(marketPoints.length>1)charts.push({title:'类目规模走势',source:'get_category_market_size_trends',kind:'line',points:marketPoints,ratio:0,note:'按接口日期排序，完整年同比优先于首末变化。'});if(priceRows.length)charts.push({title:'各价格带销量',source:'get_category_price_segment_trends',kind:'bar',points:priceRows.filter(x=>x.sales!==null).map(x=>({label:x.name+' $'+x.min+'–'+x.max,value:x.sales})),ratio:0,note:'按接口价格带比较。'});if(bestFeature.length)charts.push({title:'功能词点击转化率',source:'get_category_keywords',kind:'bar',points:bestFeature.slice(0,10).map(x=>({label:x.name,value:x.cvr})),ratio:1,note:'同功能匹配关键词的简单平均，仅用于候选排序。'});
    const lead='类目增长方向为 '+direction+'。'+(ratingGate===null?'可见 Ratings 门槛数据不足。':'可见头部 Ratings 门槛约 '+fmt(ratingGate,0)+'，星级约 '+(starGate===null?'不足':fmt(starGate,0))+'。')+(rankedPrice[0]?'销量最大价格带是 '+rankedPrice[0].name+'。':'价格带数据不足。');
    return {text,lead,cards:[{label:'增长方向',value:direction},{label:'Ratings 门槛',value:ratingGate===null?'—':fmt(ratingGate,0)},{label:'星级门槛',value:starGate===null?'—':fmt(starGate,0)},{label:'最大价格带',value:rankedPrice[0]?rankedPrice[0].name:'—'}],charts:charts.length?charts:[{title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:[{label:'市场趋势',value:market.length},{label:'价格带',value:priceRows.length},{label:'代表商品',value:products.length},{label:'关键词',value:keywords.length}],ratio:0,note:'缺少可比较指标时显示样本覆盖。'}]};
  }
  function monthlySalesRows(steps){
    return stepRows(steps,'get_category_market_size_trends').map(r=>{
      const date=readable(r.localDate||r.date||r.month);
      const month=String(date||'').slice(0,7);
      return {date,month,sales:scalar(r.sales),revenue:scalar(r.salesRevenue)};
    }).filter(x=>/^\d{4}-\d{2}$/.test(x.month)&&x.sales!==null).sort((a,b)=>a.month.localeCompare(b.month));
  }
  function completeYearGroups(rows){
    const by={};
    rows.forEach(r=>{
      const y=r.month.slice(0,4),i=Number(r.month.slice(5,7))-1;
      if(!by[y])by[y]=Array(12).fill(null);
      by[y][i]=r;
    });
    return Object.keys(by).sort().filter(y=>by[y].every(Boolean)).map(y=>({year:y,months:by[y]}));
  }
  function seasonBand(v,mean){
    if(mean<=0||v===null)return '数据不足';
    const r=v/mean;
    if(r>=1.1)return '旺';
    if(r<=0.85)return '淡';
    return '平';
  }
  async function seasonalityReport(scene,form,steps){
    const MONTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const rows=monthlySalesRows(steps);
    const years=completeYearGroups(rows);
    const seasonStep=steps.find(s=>s.tool==='get_category_seasonality'&&s.status==='ok');
    let seasonRoot=seasonStep&&seasonStep.data;if(typeof seasonRoot==='string'){try{seasonRoot=JSON.parse(seasonRoot);}catch(_){seasonRoot={};}}
    seasonRoot=seasonRoot&&seasonRoot.data!==undefined?seasonRoot.data:seasonRoot||{};
    const apiMonths=Array.isArray(seasonRoot.monthInfos)?seasonRoot.monthInfos.length:0;
    const apiFlag=seasonRoot.isSeasonal;
    const ranked=rankingProducts(stepRows(steps,'get_category_sales_ranking')).filter(p=>p.sales!==null).sort((a,b)=>b.sales-a.sales);
    if(rows.length<6){
      return {text:['## '+scene.name,'### 核心结论','- 本次没有足够的月度规模数据，不能排出旺淡季日历。来源：get_category_market_size_trends。','### 分析过程','**步骤 1 · 样本**','- 月度规模不足完整年，不能划分旺淡季，也不用首月末月变化冒充季节性。','### 行动建议','- P1：按月度高峰倒推生产、运输和入仓节点。','- P2：至少对照两个完整年度再确认季节性。','### 结论边界','季节性必须以完整月份销量验证；接口空值未按零补。'].join('\n'),
        lead:'月度规模数据不足，不能排出旺淡季日历。',
        cards:[{label:'完整年数',value:String(years.length)},{label:'月份样本',value:String(rows.length)}],
        charts:[{title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:[{label:'月份',value:rows.length},{label:'完整年',value:years.length},{label:'销量榜',value:ranked.length}],ratio:0,note:'缺少连续月份时只展示覆盖。'}],tables:[]};
    }
    const template=years.length?years:[];
    const avg=MONTHS.map((_,i)=>{
      const vals=template.map(y=>y.months[i].sales).filter(v=>v!==null);
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    });
    const usable=avg.filter(v=>v!==null);
    const mean=usable.length?usable.reduce((a,b)=>a+b,0)/usable.length:null;
    const peakIdx=avg.reduce((best,v,i)=>v!==null&&(best===null||v>avg[best])?i:best,null);
    const troughIdx=avg.reduce((best,v,i)=>v!==null&&(best===null||v<avg[best])?i:best,null);
    const ratio=peakIdx!==null&&troughIdx!==null&&avg[troughIdx]?avg[peakIdx]/avg[troughIdx]:null;
    const lastFull=years[years.length-1];
    const prevFull=years.length>1?years[years.length-2]:null;
    const yoyFull=lastFull&&prevFull?((lastFull.months.reduce((a,m)=>a+m.sales,0)-prevFull.months.reduce((a,m)=>a+m.sales,0))/Math.abs(prevFull.months.reduce((a,m)=>a+m.sales,0))):null;
    const latest=rows[rows.length-1];
    const asOf=/^\d{4}-\d{2}-\d{2}$/.test(form&&form.dateTo||'')?form.dateTo:(latest?latest.month+'-01':'');
    const asOfMonth=asOf.slice(0,7);
    const peakYear=String((asOfMonth&&Number(asOfMonth.slice(5,7))>=11)?Number(asOfMonth.slice(0,4)):Number((asOfMonth||'2026').slice(0,4)));
    const listedCutoff=peakYear+'-07-31';
    const shipFrom=peakYear+'-08-20',shipTo=peakYear+'-09-15';
    const adsFrom=peakYear+'-10-15',adsTo=peakYear+'-12-31';
    const shipClosed=asOfMonth && asOfMonth>peakYear+'-09';
    const byMonth={};rows.forEach(r=>{byMonth[r.month]=r;});
    const ytdYear=asOfMonth?asOfMonth.slice(0,4):'';
    const calendar=MONTHS.map((name,i)=>{
      const mm=String(i+1).padStart(2,'0');
      const a=avg[i];
      const band=seasonBand(a,mean);
      const last=lastFull?lastFull.months[i].sales:null;
      const prev=prevFull?prevFull.months[i].sales:null;
      const yoy=last!==null&&prev?((last-prev)/Math.abs(prev)):null;
      const ytd=byMonth[ytdYear+'-'+mm];
      return {name,band,avg:a,yoy,ytd:ytd?ytd.sales:null};
    });
    const peakNames=calendar.filter(x=>x.band==='旺').map(x=>x.name).join('、')||(peakIdx!==null?MONTHS[peakIdx]:'未定');
    const troughNames=calendar.filter(x=>x.band==='淡').map(x=>x.name).join('、')||(troughIdx!==null?MONTHS[troughIdx]:'未定');
    const apiEmpty=apiMonths===0||apiFlag===false;
    const lead=(years.length>=2?'这是冬旺夏淡类目，峰值在 '+peakNames+'，谷底在 '+troughNames+'。':years.length===1?'只有一个完整年，暂按 '+lastFull.year+' 年形态划分，需再补一年确认是否复现。':'月份不足两年，先按已有月份相对均值划分。')
      +(ratio!==null?' 峰值/谷底约 '+ratio.toFixed(1)+' 倍。':'')
      +(shipClosed?' 当前已过 '+shipTo+'，海运窗口基本关掉；11 月前到仓需空运，或主要吃 12 月。':' 头程应在 '+shipFrom+' 至 '+shipTo+' 发出，广告 '+adsFrom+' 起加到年底。')
      +(apiEmpty?' 季节性接口本次未给出月份划分，日历改用月度规模趋势。':'');
    const conclusion=[
      '- 旺季：**'+peakNames+'**；淡季：**'+troughNames+'**'+(ratio!==null?'；峰值/谷底 '+ratio.toFixed(1)+' 倍':'')+'。口径是'+(years.length>=2?years.map(y=>y.year).join(' 与 ')+' 两年月均相对两年总月均':'已有完整年的月销量相对均值')+'，旺≥110%，淡≤85%。来源：get_category_market_size_trends。',
      '- 完整年销量'+(yoyFull===null?'只有 '+((lastFull&&lastFull.year)||'一年')+'，不能算全年同比。':' '+lastFull.year+' 相对 '+prevFull.year+' '+(yoyFull>=0?'+':'')+(yoyFull*100).toFixed(1)+'%。不要用 '+ (rows[0]?rows[0].month:'首月')+' 对 '+latest.month+' 的首末变化判断萎缩，那会把旺季后的月份拿去对夏季。')+' 来源：get_category_market_size_trends。',
      '- 倒推节点（中国到美国 FBA 常见 70–90 天到仓，不是工厂实测）：上新截止 **'+listedCutoff+'**；头程 **'+shipFrom+' ~ '+shipTo+'**；广告加码 **'+adsFrom+' ~ '+adsTo+'**。'+(shipClosed?'以数据截止月 '+latest.month+' 看，海运窗口已过。':'')
    ];
    if(apiEmpty)conclusion.push('- get_category_seasonality 返回'+(apiFlag===false?' isSeasonal=false 且 ':' ')+'monthInfos 为空，不能据此说没有季节性。');
    const rankLines=ranked.slice(0,8).map((p,i)=>(i+1)+'. '+(p.brand||'未标明')+(p.asin?' '+p.asin:'')+'，近 30 天销量 '+fmt(p.sales,0)+(p.price!==null?'，约 $'+fmt(p.price,0):''));
    const text=['## '+scene.name,'### 核心结论',...conclusion,
      '### 12 个月节奏',...calendar.map(r=>'- **'+r.name+'｜'+r.band+'**：'+(years.length>=2?'两年月均 ':'月均 ')+(r.avg===null?'未提供':fmt(r.avg,0))+' 件'+(mean&&r.avg!==null?'，相对均值 '+((r.avg/mean)*100).toFixed(0)+'%':'')+(r.yoy===null?'':', 完整年同比 '+(r.yoy>=0?'+':'')+(r.yoy*100).toFixed(1)+'%')+(r.ytd===null?'':', '+ytdYear+' 实绩 '+fmt(r.ytd,0))+'。'),
      '### 三个倒推节点','- 上新截止 '+listedCutoff+'：峰值前 12–16 周，给 Reviews 和自然位时间。','- 头程发货 '+shipFrom+' ~ '+shipTo+'：10 月中要在 FBA。','- 广告加码 '+adsFrom+' ~ '+adsTo+'：10 月抢位，11–12 月吃高峰，2 月起按回落收。',
      ...(rankLines.length?['### 近 30 天销量榜头部（肩部，不是旺季榜）',...rankLines.map(x=>'- '+x)]:[]),
      '### 分析过程',
      '**步骤 1 · 完整年**','- 只用完整 12 个月的年份算日历月均，未完年不参与全年同比。',
      '**步骤 2 · 旺淡划分**','- 月均 ≥ 总月均 110% 记旺，≤85% 记淡，其余记平。',
      '**步骤 3 · 倒推节点**','- 按高峰月往前 70–90 天给头程/入仓建议，不是履约承诺。',
      '**步骤 4 · 验证**','- 至少对照两个完整年度，确认峰谷是否复现。',
      '### 判断口径','- 旺淡季用完整年的日历月均值，不用季节性接口空结果，也不用首月末月对比。','- 头程按常见 70–90 天到仓倒推，未含你们的生产周期、MOQ 和空运预算。','- 销量榜是接口 last30days，若落在 8–9 月只代表肩部占位。',
      '### 行动建议','- P1：按 '+peakNames+' 高峰倒推，核对当前货物是否已在海运或需改空运。','- P2：用下一完整年度再确认 11–12 月高峰、5–6 月谷底是否复现；'+ytdYear+' 年未完月份不参与全年同比。',
      '### 结论边界','没有工厂交期和 FBA 库龄，节点是日历建议不是履约承诺。季节性接口空值未当零处理。'].join('\n');
    const charts=[];
    if(rows.length>1)charts.push({title:'类目月销量',source:'get_category_market_size_trends',kind:'line',points:rows.map(r=>({label:r.month,value:r.sales})),ratio:0,note:'按接口月份排序；参考线含义在表中用相对均值表达，图中只画实际销量。'});
    if(calendar.every(r=>r.avg!==null))charts.push({title:(years.length>=2?years.map(y=>y.year).join('/')+' 日历月均销量':'完整年日历月销量'),source:'get_category_market_size_trends',kind:'bar',points:calendar.map(r=>({label:r.name+'·'+r.band,value:r.avg})),ratio:0,note:'用于比较 12 个月相对强弱，不是预测。'});
    const tableRows=calendar.map(r=>[r.name,r.band,r.avg===null?'—':fmt(r.avg,0),mean&&r.avg!==null?((r.avg/mean)*100).toFixed(0)+'%':'—',r.yoy===null?'—':((r.yoy>=0?'+':'')+(r.yoy*100).toFixed(1)+'%'),r.ytd===null?'尚未完整':fmt(r.ytd,0)]);
    const actionRows=[['上新截止',listedCutoff,'峰值前 12–16 周'],['头程发货',shipFrom+' ~ '+shipTo,'按 70–90 天到仓，10 月中要在 FBA'],['广告加码',adsFrom+' ~ '+adsTo,'10 月抢位，11–12 月吃高峰']];
    const rankTable=ranked.slice(0,10).map((p,i)=>[String(i+1),(p.asin||'')+' '+(p.brand||''),fmt(p.sales,0),p.price===null?'—':'$'+fmt(p.price,0),fmt(p.ratings,0)+' / '+fmt(p.stars,0)]);
    return {text,lead,cards:[
      {label:'旺季峰值',value:peakNames||'—'},
      {label:'淡季谷底',value:troughNames||'—'},
      {label:'峰值/谷底',value:ratio===null?'—':ratio.toFixed(1)+'×'},
      {label:'完整年销量同比',value:yoyFull===null?'—':((yoyFull>=0?'+':'')+(yoyFull*100).toFixed(1)+'%'),tone:yoyFull!==null&&yoyFull<0?'down':'up'}
    ],charts,tables:[
      {title:'12 个月节奏',headers:['月份','档','月均件','相对均值',(prevFull&&lastFull?lastFull.year+' vs '+prevFull.year:'完整年同比'),(ytdYear||'')+' 实绩'],rows:tableRows,note:'旺≥月均 110%，淡≤85%。来源 get_category_market_size_trends。'},
      {title:'三个倒推节点',headers:['节点','日历落点','依据'],rows:actionRows,note:'中国到美国 FBA 常见假设，不是工厂实测。'},
      ...(rankTable.length?[{title:'近 30 天销量榜前 10（肩部样本）',headers:['#','ASIN / 品牌','近 30 天销量','价格','Ratings / 星级'],rows:rankTable,note:'来源 get_category_sales_ranking；若窗口在 8–9 月，不是 11–12 月旺季榜。'}]:[])
    ]};
  }
  async function report(_cfg,scene,_form,steps){
    if(scene.id==='s1')return decorate(scene,_form,await quickCategoryReport(scene,steps));
    if(scene.id==='s2')return decorate(scene,_form,await newReleaseReport(scene,steps));
    if(scene.id==='s3')return decorate(scene,_form,await priceBandReport(scene,_form,steps));
    if(scene.id==='s4')return decorate(scene,_form,await seasonalityReport(scene,_form,steps));
    if(scene.id==='s25')return decorate(scene,_form,await featureReport(scene,steps));
    const extra=window.Analyst.sceneBuilders&&window.Analyst.sceneBuilders[scene.id];
    if(extra)return decorate(scene,_form,await extra(scene,_form,steps));
    const charts=[],cards=[],sections=[],seen=new Set();
    for(const step of steps){
      if(['search_market_insight_categories','generate_category_insight_resource'].includes(step.tool))continue;
      const heading=clean(step.cn||'指标分析');
      if(step.status!=='ok'){sections.push({heading,source:step.tool,lines:['本步骤未成功，暂不能据此给出结论。']});continue;}
      let data=step.data;if(typeof data==='string'){try{data=JSON.parse(data);}catch(_){data={};}}data=data?.data||data||{};
      const lines=[],local=[];
      Object.values(measures(data.summary||data)).slice(0,6).forEach(m=>cards.push({label:m.spec[0],value:fmt(m.value,m.spec[1])}));
      function collect(v,context='',parent='',depth=0){
        if(!v||typeof v!=='object'||depth>16)return;
        if(Array.isArray(v)){
          const rows=v.filter(x=>x&&typeof x==='object'),groups=new Map();
          rows.forEach((r,i)=>Object.entries(measures(r,parent)).forEach(([key,m])=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push({label:rowLabel(r,i),value:m.value,date:r.localDate||r.date||r.month,ratio:m.spec[1]});}));
          for(const [key,points] of groups){
            if(points.length<2||local.length>=3)continue;
            const temporal=points.every(p=>typeof p.date==='string'&&/^\d{4}-\d{2}/.test(p.date));
            const ordered=points.slice().sort(temporal?(a,b)=>a.date.localeCompare(b.date):(a,b)=>b.value-a.value);
            const title=(context?context+' · ':'')+METRICS[key][0],signature=step.tool+'|'+title+'|'+ordered.map(p=>p.label+':'+p.value).join(',');
            if(seen.has(signature))continue;seen.add(signature);
            local.push({title,source:step.tool,kind:temporal?'line':'bar',points:temporal?ordered:ordered.slice(0,10),ratio:METRICS[key][1],note:temporal?'按接口日期排序；缺失日期未补值。':'按本次返回值比较；最多展示前 10 项，不代表全市场排名。'});
            if(temporal){const first=ordered[0],last=ordered.at(-1),change=first.value!==0?(last.value-first.value)/Math.abs(first.value):null;lines.push(title+'：'+first.label+' 至 '+last.label+'，从 '+fmt(first.value,first.ratio)+' 变为 '+fmt(last.value,last.ratio)+(change===null?'。':'，首末变化 '+(change>=0?'+':'')+(change*100).toFixed(1)+'%。')+(/排名/.test(title)?' 排名数值下降表示位次靠前。':''));}
            else lines.push(title+'：本次样本中 '+ordered[0].label+' 最高，为 '+fmt(ordered[0].value,ordered[0].ratio)+'。');
          }
          rows.forEach((r,i)=>collect(r,rowLabel(r,i),parent,depth+1));return;
        }
        Object.entries(v).forEach(([key,x])=>{if(!['mom','yoy','path','priceDistribution','trafficAcquisitionRate'].includes(key)&&x&&typeof x==='object')collect(x,context,key,depth+1);});
      }
      collect(data);charts.push(...local);
      sections.push({heading,source:step.tool,lines:lines.slice(0,3).length?lines.slice(0,3):['当前返回缺少可识别的比较或趋势指标，暂不能形成趋势结论。']});
    }
    if(!charts.length){charts.push({title:'接口完成情况',source:'本次工作流',kind:'bar',points:steps.map((s,i)=>({label:clean(s.cn||s.tool||('步骤 '+(i+1))),value:s.status==='ok'?1:0,ratio:0})),ratio:0,note:'1 表示成功返回，0 表示未成功；仅用于展示数据覆盖。'});}
    const conclusions=sections.flatMap(s=>s.lines.map(l=>l+'（来源：'+s.source+'）')).slice(0,3);
    while(conclusions.length<3)conclusions.push('本次没有更多可验证的数据结论；缺失项未按零值处理。');
    const actions=ACTIONS[scene.id]||['先核验波动最大的指标，再结合自身经营数据制定动作。'];
    const text=['## '+clean(scene.name),'### 核心结论',...conclusions.map(x=>'- '+x),...sections.flatMap(s=>['### '+s.heading,...s.lines.map(x=>'- '+x),'来源：'+s.source+'。']),'### 行动建议',...actions.map((x,i)=>'- P'+(i+1)+'：'+x),'### 结论边界','分析仅使用本次接口已返回的数据，不补造缺失值。图表中的排名和份额只代表注明的样本范围；流量得分不是曝光量，推算订单不是实际订单。因果归因、盈利预算或进入决策需要额外经营证据。'].join('\n');
    return decorate(scene,_form,{text,charts:charts.slice(0,12),cards:cards.slice(0,8)});
  }
  function decorate(scene,form,result){
    result=result||{};
    const ungap=s=>String(s==null?'':s).replace(/数据不足/g,'未提供');
    const f=form||{};
    const bits=[f.site,f.category,f.brand,f.asin].filter(Boolean);
    const dates=f.dateFrom&&f.dateTo?f.dateFrom+' ~ '+f.dateTo:'';
    result.title=clean((scene&&scene.name)||result.title||'报告');
    result.goal=clean((scene&&scene.goal)||result.goal||'');
    result.kicker=clean((scene&&scene.mod)||result.kicker||'');
    result.meta={site:f.site||'',category:f.category||'',brand:f.brand||'',asin:f.asin||'',dateFrom:f.dateFrom||'',dateTo:f.dateTo||'',line:[bits.join(' · '),dates].filter(Boolean).join('  ·  ')};
    if(result.lead)result.lead=ungap(result.lead);
    if(result.text)result.text=ungap(result.text);
    if(Array.isArray(result.cards))result.cards=result.cards.map(c=>Object.assign({},c,{value:ungap(c.value)}));
    return result;
  }
  function displayTitle(result,scene){
    const heading=(String(result&&result.text||'').match(/^##\s+(.+)$/m)||[])[1];
    const raw=(result&&result.title)||heading||(scene&&scene.name)||'报告';
    return String(raw).replace(/\s*·\s*(专项分析报告|分析报告|决策结果|本地分析报告)\s*$/,'').trim()||'报告';
  }
  function bodyText(result){
    return String(result&&result.text||'').replace(/^##[^\n]+\n+/,'');
  }
  function renderVisual(result){
    result=result||{};
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const show=(v,r)=>r?(v*100).toFixed(1)+'%':v.toLocaleString('en-US',{maximumFractionDigits:2});
    const lead=result.lead?'<div class="report-lead"><strong>一句话结论</strong><p>'+esc(result.lead)+'</p></div>':'';
    const cards=(result.cards||[]).map(c=>'<div class="metric-card'+(c.tone?' '+esc(c.tone):'')+'"><strong>'+esc(c.value)+'</strong><span>'+esc(c.label)+'</span></div>').join('');
    const charts=(result.charts||[]).map(c=>{const pts=(c.points||[]).filter(p=>p&&typeof p==='object'&&p.value!==null&&p.value!==undefined);if(!pts.length)return '';let graphic='';
      if(c.kind==='line'){const min=Math.min(0,...pts.map(p=>p.value)),max=Math.max(1,...pts.map(p=>p.value)),xy=pts.map((p,i)=>[25+i/Math.max(1,pts.length-1)*550,160-(p.value-min)/(max-min||1)*135]);const first=pts[0],last=pts[pts.length-1]||first;graphic='<svg viewBox="0 0 600 195" role="img" aria-label="'+esc(c.title)+'"><line x1="25" y1="160" x2="575" y2="160" stroke="#cbd5e1"/><polyline points="'+xy.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#b42318" stroke-width="3"/>'+pts.map((p,i)=>'<circle cx="'+xy[i][0]+'" cy="'+xy[i][1]+'" r="3" fill="#b42318"><title>'+esc((p.label||'')+'：'+show(p.value,c.ratio))+'</title></circle>').join('')+'<text x="25" y="185" font-size="12">'+esc((first&&first.label)||'')+'</text><text x="575" y="185" text-anchor="end" font-size="12">'+esc((last&&last.label)||'')+'</text></svg>';}
      else {const max=Math.max(1,...pts.map(p=>Math.abs(p.value)));graphic=pts.map(p=>'<div class="chart-row"><span title="'+esc(p.label||'')+'">'+esc(p.label||'')+'</span><div class="chart-track"><i style="width:'+Math.abs(p.value)/max*100+'%"></i></div><b>'+esc(show(p.value,c.ratio))+'</b></div>').join('');}
      return '<figure class="report-chart"><h4>'+esc(c.title)+'</h4>'+graphic+'<figcaption>'+esc(c.note)+' 来源：'+esc(c.source)+'</figcaption></figure>';}).join('');
    const tables=(result.tables||[]).map(t=>{
      const head='<tr>'+(t.headers||[]).map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr>';
      const body=(t.rows||[]).map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('');
      return '<figure class="report-table"><h4>'+esc(t.title)+'</h4><div class="tablewrap"><table class="findings"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+(t.note?'<figcaption>'+esc(t.note)+'</figcaption>':'')+'</figure>';
    }).join('');
    const text=bodyText(result);
    const split=text.indexOf('### 行动建议');
    const intro=split<0?text:text.slice(0,split);
    const rest=split<0?'':text.slice(split);
    const md=src=>window.Analyst.md(src,0);
    const chartBlock=charts?'<h3>图表分析</h3><div class="report-charts">'+charts+'</div>':'';
    if(lead||tables)return lead+'<div class="report-metrics">'+cards+'</div>'+chartBlock+tables+md(intro)+(rest?md(rest):'');
    return '<div class="report-metrics">'+cards+'</div>'+md(intro)+chartBlock+(rest?md(rest):'');
  }
  function renderPreview(result){
    result=result||{};
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const lead=result.lead?esc(result.lead):'报告已生成。点右侧全屏阅读查看完整结论、图表和表格。';
    const cards=(result.cards||[]).slice(0,4).map(c=>'<div class="metric-card'+(c.tone?' '+esc(c.tone):'')+'"><strong>'+esc(c.value)+'</strong><span>'+esc(c.label)+'</span></div>').join('');
    return '<p class="report-preview-lead">'+lead+'</p>'+(cards?'<div class="report-metrics">'+cards+'</div>':'');
  }
  function renderDocument(result,scene){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const title=displayTitle(result,scene);
    const goal=(result&&result.goal)||(scene&&scene.goal)||'';
    const kicker=(result&&result.kicker)||(scene&&scene.mod)||'';
    const meta=(result&&result.meta&&result.meta.line)||'';
    return '<header class="report-doc-hd">'
      +(kicker?'<div class="report-kicker">'+esc(kicker)+'</div>':'')
      +'<h1>'+esc(title)+'</h1>'
      +(goal?'<p class="report-doc-goal">'+esc(goal)+'</p>':'')
      +(meta?'<p class="report-doc-meta">'+esc(meta)+'</p>':'')
      +'</header>'+renderVisual(result||{});
  }
  window.Analyst.ACTIONS=ACTIONS;
  window.Analyst.U={num,scalar,clean,fmt,readable,findRows,stepRows,organicRankOf,organicShareOf,asinKeywordRows,productView,keywordView,rankingProduct,rankingProducts,sharedReview,trafficByAsin,titlePath,PRICE_NAMES,brandNames,periodOf,momRate,parsePriceRows,parseKeywords};
  window.Analyst.report=report;
  window.Analyst.renderVisual=renderVisual;
  window.Analyst.renderPreview=renderPreview;
  window.Analyst.renderDocument=renderDocument;
  window.Analyst.displayTitle=displayTitle;
  window.Analyst.topNewAsins=topNewAsins;
  window.Analyst.topPriceType=topPriceType;
})();
