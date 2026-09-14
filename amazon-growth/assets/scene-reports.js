(function(){
  'use strict';
  function U(){return window.Analyst.U||{};}
  function actions(id){return (window.Analyst.ACTIONS||{})[id]||['先核验本次返回的关键指标。','结合自身经营数据后再动作。'];}
  function signed(r){return r===null||r===undefined?'—':((r>=0?'+':'')+(r*100).toFixed(1)+'%');}
  function median(a){const x=(a||[]).filter(v=>v!==null&&v!==undefined).sort((i,j)=>i-j);return x.length?x[Math.floor((x.length-1)/2)]:null;}
  function cover(points){return {title:'专项数据覆盖',source:'本次工作流',kind:'bar',points:points,ratio:0,note:'缺少可比较序列时只展示覆盖，不补零。'};}
  function pack(scene,opts){
    const u=U(),fmt=u.fmt,ok=opts.ok||0;
    const conclusion=opts.conclusion&&opts.conclusion.length?opts.conclusion:['本次缺少该场景所需的接口返回，不能形成专项结论。'];
    const act=opts.actions||actions(scene.id);
    const charts=(opts.charts&&opts.charts.length)?opts.charts:[cover(opts.cover||[{label:'成功步骤',value:ok}])];
    const cards=(opts.cards&&opts.cards.length)?opts.cards:[{label:'成功步骤',value:String(ok)}];
    const process=opts.process?(String(opts.process).indexOf('### 分析过程')===0?opts.process:['### 分析过程'].concat(Array.isArray(opts.process)?opts.process:[opts.process]).join('\n')):'';
    const extra=[process,opts.extra||''].filter(Boolean).join('\n');
    const ungap=s=>String(s==null?'':s).replace(/数据不足/g,'未提供');
    const text=ungap(['## '+scene.name,'### 核心结论',...conclusion.map(x=>x.startsWith('-')?x:'- '+x),extra,
      '### 行动建议',...act.map((a,i)=>'- P'+(i+1)+'：'+a),
      '### 结论边界',opts.boundary||'分析仅使用本次接口已返回的数据，不补造缺失值。流量得分不是曝光量，推算订单不是实际订单。'].filter(Boolean).join('\n'));
    return {text,lead:ungap(opts.lead||'本次专项还缺关键返回，先看下方已成功的步骤。'),cards:cards.map(c=>({label:c.label,value:ungap(c.value)})),charts,tables:opts.tables||[]};
  }
  function okCount(steps){return (steps||[]).filter(s=>s.status==='ok').length;}
  function isoDay(v){
    const s=String(v==null?'':v);
    const d=s.match(/(\d{4}-\d{2}-\d{2})/);
    if(d)return d[1];
    const m=s.match(/(\d{4}-\d{2})/);
    return m?m[1]:'';
  }
  function dateOf(r){
    if(!r||typeof r!=='object')return '';
    const u=U();
    const direct=u.readable(r.localDate||r.date||r.month||r.week||r.reportDate||r.statDate||r.periodEndDate||r.period||r.day||r.dt||'');
    const hit=isoDay(direct);
    if(hit)return hit;
    if(r.date&&typeof r.date==='object'&&!Array.isArray(r.date)){
      const nested=isoDay(r.date.startDate||r.date.endDate||r.date.value||r.date.localDate);
      if(nested)return nested;
    }
    if(r.rankTime)return isoDay(r.rankTime);
    if(Array.isArray(r.ranks)){
      for(const x of r.ranks){const t=isoDay(x&&x.rankTime);if(t)return t;}
    }
    return '';
  }
  function pickOrganicCount(r){
    const u=U();
    const fromObj=v=>{
      if(v===null||v===undefined||v==='')return null;
      if(typeof v!=='object')return u.scalar(v);
      return u.scalar(v.organic)??u.scalar(v.or)??u.scalar(v.natural)??u.scalar(v.count)??u.scalar(v.total)??u.scalar(v.value)??u.scalar(v.organicKeywordCount)??null;
    };
    const hits=[
      r.organicKeywordCount,r.organicSearchTermCount,r.nfKeywordCnt,r.nfKeywordCount,r.orKeywordCount,r.naturalKeywordCount,
      r.keywordCount&&typeof r.keywordCount==='object'?r.keywordCount.organic:r.keywordCount,
      r.counts&&r.counts.organic,r.counts,
      r.summary&&(r.summary.organicKeywordCount||r.summary.organic),
      r.organic&&typeof r.organic==='object'?(r.organic.keywordCount||r.organic.count):r.organic,
      r.searchTermCount,r.totalKeywordCount
    ];
    for(const v of hits){const n=fromObj(v);if(n!==null)return n;}
    return null;
  }
  function datedTerms(data){
    const u=U();
    const out=[];
    const walk=(v,inherited,depth)=>{
      if(!v||depth>12)return;
      if(Array.isArray(v)){v.forEach(x=>walk(x,inherited,depth+1));return;}
      if(typeof v!=='object')return;
      const d=dateOf(v)||inherited;
      if(v.searchTerm!==undefined||v.keyword!==undefined){
        const term=u.readable(v.searchTerm||v.keyword||v.term);
        if(term){out.push({term,day:d,rank:u.organicRankOf?u.organicRankOf(v):null});return;}
      }
      Object.keys(v).forEach(k=>{if(k!=='ranks')walk(v[k],d||inherited,depth+1);});
    };
    walk(data,'',0);
    return out;
  }
  function stepPayload(steps,tool){
    const s=(steps||[]).find(x=>x.tool===tool&&x.status==='ok');
    if(!s)return null;
    let d=s.data;
    if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return null;}}
    return d;
  }
  function pickKwTraffic(r,kind){
    const u=U();
    const sum=r.summaryTraffic||r.summary||r.trafficSummary||r.traffic||{};
    const pos=r.positionTraffic||{};
    if(kind==='organic'){
      if(sum&&sum.organic!==undefined&&sum.organic!==null&&sum.organic!=='')return u.scalar(sum.organic);
      if(pos&&pos.or!==undefined&&pos.or!==null&&pos.or!=='')return u.scalar(pos.or);
      return u.scalar(r.organicTrafficScore??r.organicTraffic??r.organic);
    }
    if(sum&&sum.advertising!==undefined&&sum.advertising!==null&&sum.advertising!=='')return u.scalar(sum.advertising);
    const parts=['sp','sb','sbv','sor'].map(k=>u.scalar(pos[k])).filter(v=>v!==null);
    if(parts.length)return parts.reduce((a,b)=>a+b,0);
    return u.scalar(r.advertisingTrafficScore??r.advertisingTraffic??r.advertising);
  }
  function isOrPos(p){p=String(p||'').toLowerCase();return p==='or'||p==='organic'||p==='organicrank'||p==='natural';}
  function posCode(x){return String((x&&(x.displayPosition||x.position||x.pos||x.type||x.slot))||'').toLowerCase();}
  function pickKwRank(r,pos){
    const u=U();
    const want=String(pos||'or').toLowerCase();
    const match=p=>want==='or'?isOrPos(p):p===want;
    const rankNum=x=>{
      if(!x||typeof x!=='object')return u.scalar(x);
      return u.scalar(x.totalRank??x.organicRank??x.rank??x.pageRank??x.value);
    };
    const list=r.displayPositions||r.ranks||r.positions;
    if(Array.isArray(list)){
      const hit=list.find(x=>x&&match(posCode(x)));
      const n=rankNum(hit);
      if(n!==null)return n;
    }
    if(match(posCode(r))){
      const n=rankNum(r);
      if(n!==null)return n;
    }
    if(want==='or')return (u.organicRankOf&&u.organicRankOf(r))||u.scalar(r.organicRank??r.orRank);
    if(want==='sp')return u.scalar(r.advertisingRank??r.sponsoredRank??r.spRank);
    return null;
  }
  function keywordOfStep(s){
    const u=U();
    return u.clean((s&&(s.targetKeyword||(s.args&&(s.args.keyword||s.args.search_term||s.args.searchTerm||s.args.query))))||'');
  }
  function keywordsOf(form,steps){
    const u=U();
    const fromForm=u.parseKeywords?u.parseKeywords((form&&form.keyword)||'',-1).slice(0,8):String((form&&form.keyword)||'').split(/[\n\r,，;；]+/).map(s=>s.trim()).filter(Boolean).slice(0,8);
    if(fromForm.length)return fromForm;
    const seen=[];
    (steps||[]).forEach(s=>{
      const t=keywordOfStep(s);if(!t)return;
      if(seen.some(x=>x.toLowerCase()===t.toLowerCase()))return;
      seen.push(t);
    });
    return seen;
  }
  function rowsForKeyword(steps,tool,word){
    const u=U();
    const ok=(steps||[]).filter(s=>s.tool===tool&&s.status==='ok');
    if(!ok.length)return [];
    const needle=String(word||'').trim().toLowerCase();
    const tagged=needle?ok.filter(s=>keywordOfStep(s).toLowerCase()===needle):[];
    const untagged=ok.filter(s=>!keywordOfStep(s));
    const use=tagged.length?tagged:(untagged.length?untagged:ok);
    return use.flatMap(s=>u.stepRows([s],tool));
  }
  function firstRowForKeyword(steps,tool,word){
    const rows=rowsForKeyword(steps,tool,word);
    if(rows.length)return rows[0];
    const ok=(steps||[]).find(s=>s.tool===tool&&s.status==='ok'&&(!word||keywordOfStep(s).toLowerCase()===String(word).toLowerCase()||!keywordOfStep(s)));
    if(!ok)return {};
    let d=ok.data;
    if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return {};}}
    d=d&&d.data!==undefined?d.data:d;
    return d&&typeof d==='object'&&!Array.isArray(d)?d:{};
  }
  function okStepForKeyword(steps,tool,word){
    const ok=(steps||[]).filter(s=>s.tool===tool&&s.status==='ok');
    if(!ok.length)return null;
    const needle=String(word||'').trim().toLowerCase();
    return (needle?ok.find(s=>keywordOfStep(s).toLowerCase()===needle):null)||ok.find(s=>!keywordOfStep(s))||ok[0];
  }
  function series(rows,pick){
    const u=U();
    return (rows||[]).filter(r=>r&&typeof r==='object').map((r,i)=>{const d=dateOf(r);const v=pick(r);return {label:d||('第 '+(i+1)+' 期'),value:v,date:d};}).filter(p=>p.value!==null).sort((a,b)=>String(a.date||a.label).localeCompare(String(b.date||b.label)));
  }
  function slope(points){
    const pts=(points||[]).filter(p=>p&&p.value!==null&&p.value!==undefined);
    if(!pts.length)return {dir:'没有可比点',change:null,first:null,last:null};
    const first=pts[0],last=pts[pts.length-1];
    if(pts.length<2)return {dir:'仅 1 个点',change:null,first,last};
    const change=first.value!==0?((last.value-first.value)/Math.abs(first.value)):(last.value===first.value?0:null);
    const dir=last.value===first.value||(change!==null&&Math.abs(change)<=0.05)?'走平':last.value>first.value?'上升':'下降';
    return {dir,change,first,last};
  }
  function trafficView(r){
    const u=U();
    return {asin:u.readable(r.asin||r.primaryAsin),org:u.scalar(r.organicTrafficScore||r.organic),ads:u.scalar(r.advertisingTrafficScore||r.advertising),adsRatio:u.scalar(r.advertisingTrafficScoreRatio),orgGrowth:u.scalar(r.organicTrafficScoreGrowthRate),adsGrowth:u.scalar(r.advertisingTrafficScoreGrowthRate),kw:u.scalar(r.keywordCount||r.searchTermCount)};
  }
  function infoView(r){
    const u=U();const a=r.asinInfo||r.productInfo||r;
    return {asin:u.readable(a.asin||a.primaryAsin||r.asin),title:u.readable(a.title||r.title),brand:u.readable(a.brand||r.brand),price:u.scalar(a.price||a.priceDistribution||r.price),stars:u.scalar(a.stars||r.stars),ratings:u.scalar(a.ratings||r.ratings)};
  }
  function kwTerm(r){const u=U();return u.keywordView(r);}
  function asinsOf(form){
    const u=U();
    const one=u.clean((form&&form.asin)||'');
    const extra=String((form&&form.asins)||'').split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
    const list=extra.slice();
    if(one&&!list.includes(one))list.unshift(one);
    return list;
  }
  function firstRow(steps,tool){
    const u=U();
    const rows=u.stepRows(steps,tool);
    if(rows.length)return rows[0];
    const s=(steps||[]).find(x=>x.tool===tool&&x.status==='ok');
    if(!s)return {};
    let d=s.data;
    if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return {};}}
    d=d&&d.data!==undefined?d.data:d;
    return d&&typeof d==='object'&&!Array.isArray(d)?d:{};
  }

  function pickRatio(r){
    const u=U();
    const candidates=[r.salesRatio,r.sales&&r.sales.ratio,r.ratio,r.metrics&&r.metrics.salesRatio];
    for(const c of candidates){
      const n=u.scalar(c);
      if(n!==null)return n;
      const m=u.num(c);
      if(m!==null)return m;
    }
    return null;
  }
  function concentration(brands,n){
    const take=Math.min(n,(brands||[]).length);
    const head=(brands||[]).slice(0,take);
    const ratioOk=take>0&&head.every(b=>b.ratio!==null);
    const ratioSum=ratioOk?head.reduce((s,b)=>s+b.ratio,0):null;
    const headSalesOk=take>0&&head.every(b=>b.sales!==null);
    const allSalesOk=(brands||[]).length&&brands.every(b=>b.sales!==null);
    const headSales=headSalesOk?head.reduce((s,b)=>s+b.sales,0):null;
    const allSales=allSalesOk?brands.reduce((s,b)=>s+b.sales,0):null;
    const salesShare=(headSales!==null&&allSales)?headSales/allSales:null;
    const value=ratioSum!==null?ratioSum:salesShare;
    const method=ratioSum!==null?(take<n?'名单不足 '+n+' 个，按已有份额相加':'接口份额相加'):(salesShare!==null?(take<n?'名单不足 '+n+' 个，按已有销量占比':'样本内销量占比'):'无法计算');
    return {n,head,value,method,ratioSum,salesShare,headSales,allSales};
  }
  function parseStamp(label){
    const s=String(label||'');
    if(/^\d{4}-\d{2}$/.test(s))return Date.parse(s+'-01T00:00:00Z');
    const t=Date.parse(s);
    return Number.isFinite(t)?t:null;
  }
  function windowAvg(points,days){
    const ordered=(points||[]).filter(p=>p&&p.value!==null&&parseStamp(p.date||p.label)!==null)
      .sort((a,b)=>parseStamp(a.date||a.label)-parseStamp(b.date||b.label));
    if(!ordered.length)return {avg:null,n:0,from:'',to:''};
    const last=parseStamp(ordered[ordered.length-1].date||ordered[ordered.length-1].label);
    const cut=last-days*86400000;
    const slice=ordered.filter(p=>parseStamp(p.date||p.label)>=cut);
    if(!slice.length)return {avg:null,n:0,from:'',to:''};
    const sum=slice.reduce((s,p)=>s+p.value,0);
    return {avg:sum/slice.length,n:slice.length,from:slice[0].label||slice[0].date,to:slice[slice.length-1].label||slice[slice.length-1].date};
  }
  function topShare(rows,pick,n){
    const scored=(rows||[]).map(r=>({row:r,v:pick(r)})).filter(x=>x.v!==null).sort((a,b)=>b.v-a.v);
    if(!scored.length)return {value:null,n:0,head:[]};
    const head=scored.slice(0,n);
    return {value:head.reduce((s,x)=>s+x.v,0),n:head.length,head};
  }
  function convBand(v){
    if(v===null)return {label:'数据不足',avoid:false};
    if(v>=0.8)return {label:'垄断严重，新手极难切入',avoid:true};
    if(v>0.6)return {label:'转化集中度超过 60%，新手建议回避',avoid:true};
    if(v>=0.4)return {label:'前三占 40%–60%，市场相对分散，有切入空间',avoid:false};
    return {label:'前三低于 40%，转化更分散',avoid:false};
  }
  function keywordVolumeSeries(steps,seed){
    const u=U();
    const kws=u.stepRows(steps,'get_category_keywords').map(r=>u.keywordView(r)).filter(k=>k.term);
    const needle=String(seed||'').trim().toLowerCase();
    let use=kws;
    if(needle){
      const exact=kws.filter(k=>(k.term||'').toLowerCase()===needle);
      const loose=kws.filter(k=>{const t=(k.term||'').toLowerCase();return t.includes(needle)||needle.includes(t);});
      if(exact.length)use=exact;
      else if(loose.length)use=loose;
    }
    const by={};
    use.forEach(k=>(k.trends||[]).forEach(t=>{
      const raw=u.readable(t.localDate||t.date||t.month||t.week);
      const stamp=parseStamp(raw);
      if(stamp===null)return;
      const label=String(raw).length>=7?String(raw).slice(0,10):String(raw);
      const v=u.scalar(t.searchVolume||t.categoryRelevantSearchVolume||t.weeklySearchVolume);
      if(v===null)return;
      by[label]=(by[label]||0)+v;
    }));
    return Object.keys(by).sort().map(k=>({label:k,date:k,value:by[k]}));
  }
  function supplySeries(steps){
    const u=U();
    const rows=u.stepRows(steps,'get_category_new_release_opportunity_trends');
    const fromRows=series(rows,r=>u.scalar(r.asinCount||r.newAsinCount||r.primaryAsinCount||r.productCount));
    if(fromRows.length)return fromRows;
    const root=firstRow(steps,'get_category_new_release_opportunity_trends');
    const summary=root.summary||root;
    const list=Array.isArray(summary.trends)?summary.trends:Array.isArray(root.trends)?root.trends:[];
    const fromTrend=series(list,r=>u.scalar(r.asinCount||r.newAsinCount||r.primaryAsinCount||r.productCount||r.value));
    if(fromTrend.length)return fromTrend;
    return [];
  }
  function brandReport(scene,form,steps){
    const u=U(),fmt=u.fmt,PRICE=u.PRICE_NAMES||{};
    const raw=u.stepRows(steps,'get_category_brand_market_size').map(r=>{
      const name=u.readable(r.brand||r.brandName||r.name);
      const priceType=r.priceType||r.priceBand||'';
      return {name,sales:u.scalar(r.sales||(r.metrics&&r.metrics.sales)),ratio:pickRatio(r),ratings:u.scalar(r.avgRatings||r.ratings),stars:u.scalar(r.avgStars||r.stars),priceType,band:PRICE[priceType]||u.readable(priceType)};
    }).filter(b=>b.name);
    const bands=[...new Set(raw.map(b=>b.priceType).filter(Boolean))];
    const allBand=raw.filter(b=>b.priceType==='allPrice');
    const brands=(allBand.length?allBand:raw).slice().sort((a,b)=>(b.sales||0)-(a.sales||0)||(b.ratio||0)-(a.ratio||0));
    const sampleNote=allBand.length?'接口同时返回了价格带，集中度只用全部价格带（allPrice）这一层，避免把低中高三档品牌重复加总。':(bands.length?'名单带价格带字段，但没有 allPrice 层，按返回行直接排序。':'按接口返回的品牌名单排序。');
    const cr1=concentration(brands,1),cr3=concentration(brands,3),cr5=concentration(brands,5);
    const listedRatio=brands.every(b=>b.ratio!==null)&&brands.length?brands.reduce((s,b)=>s+b.ratio,0):null;
    const residual=cr5.value===null?null:Math.max(0,1-cr5.value);
    const amazon=brands.filter(b=>/amazon|basics/i.test(b.name));
    const targetName=u.clean((form&&form.brand)||'');
    const targetIndex=targetName?brands.findIndex(b=>b.name.toLowerCase()===targetName.toLowerCase()):-1;
    const target=targetIndex>=0?brands[targetIndex]:null;
    const trend=series(u.stepRows(steps,'get_category_brand_sales_trends'),r=>u.scalar(r.sales||r.salesRevenue));
    const sl=slope(trend);
    const structure=cr5.value===null?'数据不足':cr5.value>=0.6?'巨头锁死':cr5.value>=0.4?'头部偏集中':'长尾可入';
    const seam=cr5.value===null?'不能判断缝宽窄':cr5.value>=0.6?'缝窄：剩余份额被压在头部之外，新品不宜正面刚 TOP5':cr5.value>=0.4?'有缝但不宽：避开 TOP 品牌正面，打剩余份额里的差异点':'缝在长尾：集中度低，速度和差异化比硬刚品牌更重要';
    const addUp=head=>head.map(b=>b.name+' '+(b.ratio===null?(b.sales===null?'无销量':fmt(b.sales,0)+' 件'):fmt(b.ratio,1))).join(' + ');
    const crLine=(c,label)=>label+'：'+(c.value===null?'无法计算':fmt(c.value,1))+'。算法 **'+c.method+'**'+(c.head.length?('。加总：'+addUp(c.head)):'')+(c.method==='样本内销量占比'&&c.headSales!==null&&c.allSales?' = '+fmt(c.headSales,0)+' / '+fmt(c.allSales,0):'')+'。';

    const searchPts=keywordVolumeSeries(steps,form&&form.keyword);
    const search90=windowAvg(searchPts,90),search360=windowAvg(searchPts,360);
    const searchRate=(search90.avg!==null&&search360.avg)?((search90.avg-search360.avg)/Math.abs(search360.avg)):null;
    const searchDir=searchRate===null?'数据不足':searchRate>0.05?'在涨':searchRate<-0.05?'在跌':'走平';
    const supplyPts=supplySeries(steps);
    const supply90=windowAvg(supplyPts,90),supply360=windowAvg(supplyPts,360);
    const supplyRate=(supply90.avg!==null&&supply360.avg)?((supply90.avg-supply360.avg)/Math.abs(supply360.avg)):null;
    const supplyDir=supplyRate===null?'数据不足':Math.abs(supplyRate)<0.1?'没怎么变':supplyRate>0?'供给在增':'供给在减';
    const golden=searchDir==='在涨'&&supplyDir==='没怎么变';
    const gapLabel=golden?'黄金信号：搜索量在涨，商品数量没怎么变，供需缺口是机会':(searchRate===null||supplyRate===null?'供需对照数据不足':searchDir==='在涨'&&supplyDir==='供给在增'?'需求和供给一起动，缺口不成立':searchDir==='在跌'?'搜索量没涨，不能当缺口':'尚未形成黄金信号');

    const asins=u.stepRows(steps,'get_keyword_asin_analysis').map(r=>{
      const info=r.asinInfo||r.productInfo||r;
      return {asin:u.readable(info.asin||info.primaryAsin||r.asin||r.primaryAsin),brand:u.readable(info.brand||r.brand),click:u.scalar(r.clickShare||r.clickShareRatio||r.trafficShare||info.clickShare||info.trafficShare||r.trafficAcquisitionRate),conv:u.scalar(r.conversionShare||r.purchaseShare||r.conversionShareRatio||info.conversionShare||info.purchaseShare)};
    }).filter(a=>a.asin||a.brand||a.click!==null||a.conv!==null);
    const clickTop=topShare(asins,a=>a.click,3),convTop=topShare(asins,a=>a.conv,3);
    const convJudge=convBand(convTop.value);
    const clickDisp=clickTop.value!==null&&clickTop.value<0.6;
    const convConc=convTop.value!==null&&convTop.value>=0.6;
    const bothDisp=clickTop.value!==null&&convTop.value!==null&&clickTop.value<0.6&&convTop.value<0.6;
    const bothConc=clickTop.value!==null&&convTop.value!==null&&clickTop.value>=0.6&&convTop.value>=0.6;
    const clickBuy=bothDisp?'点击和购买都分散，真正的蓝海，值得深挖':(clickDisp&&convConc?'点击分散但购买集中：用户在比较，最终只买头部':bothConc?'点击和购买都集中，头部锁死':(clickTop.value===null||convTop.value===null)?'点击/购买集中度数据不足':'点击更集中、购买更散，需核验是否广告引流未转化');

    const priceRows=typeof u.parsePriceRows==='function'?u.parsePriceRows(steps):[];
    const mainBand=(priceRows.filter(b=>b.priceType!=='allPrice'&&b.sales!==null).sort((a,b)=>b.sales-a.sales)[0])||null;
    const own=infoView(firstRow(steps,'get_asin_info'));
    const mid=mainBand&&mainBand.min!==null&&mainBand.max!==null?(mainBand.min+mainBand.max)/2:null;
    const inBand=own.price!==null&&mainBand&&mainBand.min!==null&&mainBand.max!==null&&own.price>=mainBand.min&&own.price<=mainBand.max;
    const priceDev=own.price!==null&&mid?Math.abs(own.price-mid)/Math.abs(mid):null;
    const priceLabel=own.price===null||!mainBand?'价格带对照数据不足':inBand?'主 ASIN 落在主流价格带内':(priceDev!==null&&priceDev>0.3?'偏离主流价格带超过 30%，需要明确差异化理由':'在主流带边缘，尚未超过 30% 偏离');

    const structureLead=brands.length?(structure+'。CR5 '+(cr5.value===null?'无法计算':fmt(cr5.value,1))+(residual!==null?'，剔除 TOP5 后剩余 '+fmt(residual,1):'')+'。'+seam+'。'+(target?'目标品牌 '+target.name+' 排第 '+(targetIndex+1)+(target.ratio!==null?'，份额 '+fmt(target.ratio,1):'')+'。':'目标品牌 '+(targetName||'未填')+' 未出现在本次名单。')):'本次没有品牌规模名单，不能判断品牌集中度。';
    const lead=structureLead+(golden?' '+gapLabel+'。':'')+(convJudge.avoid?' '+convJudge.label+'。':'')+(priceLabel.indexOf('超过 30%')>=0?' '+priceLabel+'。':'')+((bothDisp||(clickDisp&&convConc))?' '+clickBuy+'。':'');
    const conclusion=[
      '- 品牌结构：**'+structure+'**。CR1 '+(cr1.value===null?'无法计算':fmt(cr1.value,1))+'，CR3 '+(cr3.value===null?'无法计算':fmt(cr3.value,1))+'，CR5 '+(cr5.value===null?'无法计算':fmt(cr5.value,1))+'（'+cr5.method+'）。来源：get_category_brand_market_size。',
      '- 供需缺口：**'+gapLabel+'**。近 90 天词表搜索量均值为 '+(search90.avg===null?'未提供':fmt(search90.avg,0))+'，近 360 天均值为 '+(search360.avg===null?'未提供':fmt(search360.avg,0))+(searchRate===null?'。':'，90 天相对 360 天 '+signed(searchRate)+'。')+' 同期商品数量 '+supplyDir+'。来源：get_category_keywords、get_category_new_release_opportunity_trends。',
      '- 搜索转化集中度：前三名转化份额 '+(convTop.value===null?'无法计算':fmt(convTop.value,1))+'。**'+convJudge.label+'**。来源：get_keyword_asin_analysis。',
      '- 价格带：'+(mainBand?('主流是 '+mainBand.short+(mainBand.min!==null?' $'+fmt(mainBand.min,0)+'–'+fmt(mainBand.max,0):'')):'未取到低中高价格带')+'。主 ASIN 价格 '+(own.price===null?'未提供':'$'+fmt(own.price,0))+'。**'+priceLabel+'**。来源：get_category_price_segment_trends、get_asin_info。',
      '- 点击 vs 购买：**'+clickBuy+'**。点击前三 '+(clickTop.value===null?'无法计算':fmt(clickTop.value,1))+'，购买/转化前三 '+(convTop.value===null?'无法计算':fmt(convTop.value,1))+'。',
      '- 目标品牌 '+(targetName||'未填')+(target?'：第 '+(targetIndex+1)+' 名'+(target.ratio!==null?'，份额 '+fmt(target.ratio,1):'')+(targetIndex<5?'，落在 TOP5 内。':'，落在剩余市场。'):'：本次名单未命中。')+(sl.first&&sl.last?' 月度销量 '+sl.first.label+' 至 '+sl.last.label+'，'+sl.dir+(sl.change===null?'。':' '+signed(sl.change)+'。'):'')
    ];
    const process=[
      '### 分析过程',
      '**步骤 1 · 样本与来源**',
      '- get_category_brand_market_size 返回 **'+raw.length+'** 行，去重用于集中度的品牌 **'+brands.length+'** 个。'+sampleNote,
      '- 有接口份额的 '+brands.filter(b=>b.ratio!==null).length+' 个，有销量的 '+brands.filter(b=>b.sales!==null).length+' 个。'+(listedRatio!==null?' 名单份额合计 '+fmt(listedRatio,1)+'，不是 100% 时说明还有未返回品牌或口径不是全市场。':' 份额字段不全时，不把缺项当 0。'),
      '**步骤 2 · 品牌集中度怎么加总**',
      '- 先按销量排序，销量并列时按份额。不编造缺值。',
      '- '+crLine(cr1,'CR1（第 1 名）'),
      '- '+crLine(cr3,'CR3（前 3 名）'),
      '- '+crLine(cr5,'CR5（前 5 名）'),
      '- 结构阈值：CR5≥60% 记巨头锁死；40%–60% 记头部偏集中；<40% 记长尾可入。缺 CR5 时结构记数据不足，不默认长尾。',
      '**步骤 3 · 剔除 TOP5 后的剩余**',
      '- 剩余份额 = 1 − CR5 = '+(residual===null?'无法计算':fmt(residual,1))+'。这是头部之外的空间，不是保证可进入。',
      '**步骤 4 · Amazon / 自营**',
      '- 名单中名称含 Amazon / Basics 的：'+(amazon.length?amazon.map(b=>b.name+(b.ratio!==null?' '+fmt(b.ratio,1):'')).join('、'):'未出现')+'。',
      '**步骤 5 · 目标品牌位置**',
      '- 表单品牌 **'+(targetName||'未填')+'**'+(target?'命中第 '+(targetIndex+1)+' 名。':'未命中。'),
      '**步骤 6 · 细分搜索量 360 天 vs 90 天**',
      '- 把类目词表每期搜索量加总，再取最近 90 天均值对比最近 360 天均值。'+(form&&form.keyword?'优先匹配细分词「'+u.clean(form.keyword)+'」，没有命中再用整表。':'未填细分词，用整表加总。')+' 词表 '+searchPts.length+' 个时间点。90 天窗口 '+(search90.n?search90.from+' ~ '+search90.to+'，均值 '+(search90.avg===null?'—':fmt(search90.avg,0)):'不足')+'；360 天窗口 '+(search360.n?search360.from+' ~ '+search360.to+'，均值 '+(search360.avg===null?'—':fmt(search360.avg,0)):'不足')+'。',
      '- 搜索方向 **'+searchDir+'**'+(searchRate===null?'。':'（'+signed(searchRate)+'）。')+' 上涨阈值：90 天均值比 360 天均值高 5% 以上。来源：get_category_keywords 的 trends。',
      '**步骤 7 · 商品数量有没有跟上**',
      '- 同期用新品机会里的父体/商品数量序列：'+supplyPts.length+' 个点。90 天 '+(supply90.avg===null?'不足':fmt(supply90.avg,0))+'，360 天 '+(supply360.avg===null?'不足':fmt(supply360.avg,0))+'。方向 **'+supplyDir+'**。变化落在 ±10% 内记「没怎么变」。来源：get_category_new_release_opportunity_trends。这是机会接口的供给口径，不是全类目在架 SKU 普查。',
      '- 黄金信号只在「搜索在涨」且「商品数量没怎么变」同时成立时点亮：**'+(golden?'是':'否')+'**。',
      '**步骤 8 · 搜索转化率集中度**',
      '- 细分词竞争 ASIN 按转化/购买份额排序，前三相加。样本 '+asins.length+' 个，转化前三 '+(convTop.value===null?'无法计算':fmt(convTop.value,1))+(convTop.head.length?'：'+convTop.head.map(x=>(x.row.asin||x.row.brand||'')+' '+fmt(x.v,1)).join('、'):'')+'。',
      '- 阈值：≥80% 垄断严重；>60% 新手回避；40%–60% 有切入空间。当前 **'+convJudge.label+'**。缺转化份额时不把点击份额冒充转化。',
      '**步骤 9 · 平均价格与价格区间**',
      '- 销量最大的非「全部」价格带视为主流。当前主流 '+(mainBand?mainBand.short+' $'+fmt(mainBand.min,0)+'–'+fmt(mainBand.max,0)+'，中位约 $'+(mid===null?'—':fmt(mid,0)):'未取到')+'。',
      '- 主 ASIN 价格 '+(own.price===null?'未提供':'$'+fmt(own.price,0))+(priceDev===null?'':('，相对主流中位偏离 '+fmt(priceDev,1)))+'。偏离 >30% 且落在带外，需要明确差异化理由。',
      '**步骤 10 · 点击集中度 vs 购买集中度**',
      '- 点击前三 '+(clickTop.value===null?'无法计算':fmt(clickTop.value,1))+'，购买/转化前三 '+(convTop.value===null?'无法计算':fmt(convTop.value,1))+'。点击 <60% 记分散，购买 ≥60% 记集中。',
      '- **'+clickBuy+'**。'
    ].join('\n');
    const charts=[];
    if(brands.filter(b=>b.ratio!==null).length>=2)charts.push({title:'品牌销量份额',source:'get_category_brand_market_size',kind:'bar',points:brands.filter(b=>b.ratio!==null).slice(0,10).map(b=>({label:b.name,value:b.ratio})),ratio:1,note:'接口份额；合计不必等于 100%。'});
    else if(brands.filter(b=>b.sales!==null).length)charts.push({title:'品牌销量（本次样本）',source:'get_category_brand_market_size',kind:'bar',points:brands.filter(b=>b.sales!==null).slice(0,10).map(b=>({label:b.name,value:b.sales})),ratio:0,note:'缺份额时用销量排序，不是官方市占。'});
    if(searchPts.length>1)charts.push({title:'细分词表搜索量',source:'get_category_keywords',kind:'line',points:searchPts,ratio:0,note:'同类目高相关词搜索量加总；用于 90 天 vs 360 天对照。'});
    if(supplyPts.length>1)charts.push({title:'机会接口商品数量',source:'get_category_new_release_opportunity_trends',kind:'line',points:supplyPts,ratio:0,note:'新品/代表父体数量，不是全类目在架 SKU。'});
    if(trend.length>1)charts.push({title:'目标品牌月销量',source:'get_category_brand_sales_trends',kind:'line',points:trend,ratio:0,note:'按接口月份排序；首末方向不是季节性判断。'});
    const mixPts=[];
    if(clickTop.value!==null)mixPts.push({label:'点击前三',value:clickTop.value});
    if(convTop.value!==null)mixPts.push({label:'转化前三',value:convTop.value});
    if(mixPts.length)charts.push({title:'点击 vs 购买前三集中度',source:'get_keyword_asin_analysis',kind:'bar',points:mixPts,ratio:1,note:'缺一列就不画，不补零。'});
    const calcRows=[
      ['品牌 CR5',cr5.method,addUp(cr5.head)||'—',cr5.value===null?'—':fmt(cr5.value,1)],
      ['搜索 90 天均值',search90.n?search90.from+' ~ '+search90.to:'窗口不足',String(search90.n||0)+' 点',search90.avg===null?'—':fmt(search90.avg,0)],
      ['搜索 360 天均值',search360.n?search360.from+' ~ '+search360.to:'窗口不足',String(search360.n||0)+' 点',search360.avg===null?'—':fmt(search360.avg,0)],
      ['供需缺口',golden?'黄金信号':'未点亮',searchDir+' / '+supplyDir,gapLabel],
      ['转化前三',convTop.n?('样本 '+asins.length+'，取前 '+convTop.n):'无转化份额',convTop.head.map(x=>x.row.asin||x.row.brand||'').join('、')||'—',convTop.value===null?'—':fmt(convTop.value,1)],
      ['点击前三',clickTop.n?('样本 '+asins.length+'，取前 '+clickTop.n):'无点击份额',clickTop.head.map(x=>x.row.asin||x.row.brand||'').join('、')||'—',clickTop.value===null?'—':fmt(clickTop.value,1)],
      ['主流价格带',mainBand?mainBand.short:'未取到',mainBand&&mainBand.min!==null?'$'+fmt(mainBand.min,0)+'–'+fmt(mainBand.max,0):'—',priceLabel],
      ['主 ASIN 价格',own.asin||(form&&form.asin)||'未填',own.price===null?'—':'$'+fmt(own.price,0),priceDev===null?'—':fmt(priceDev,1)]
    ];
    const rankRows=brands.slice(0,10).map((b,i)=>[String(i+1),b.name,fmt(b.sales,0),b.ratio===null?'—':fmt(b.ratio,1),fmt(b.ratings,0)+' / '+fmt(b.stars,0),i<5?'TOP5':'剩余']);
    const asinRows=asins.slice().sort((a,b)=>(b.conv||0)-(a.conv||0)||(b.click||0)-(a.click||0)).slice(0,8).map((a,i)=>[String(i+1),(a.asin||'')+' '+(a.brand||''),a.click===null?'—':fmt(a.click,1),a.conv===null?'—':fmt(a.conv,1)]);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'市场结构',value:structure},{label:'供需缺口',value:golden?'黄金信号':(searchRate===null?'—':searchDir)},{label:'转化前三',value:convTop.value===null?'—':fmt(convTop.value,1),tone:convJudge.avoid?'down':''},{label:'价格带',value:inBand?'在主流':(priceDev!==null&&priceDev>0.3?'偏离>30%':(mainBand?mainBand.short:'—'))}
    ],charts,tables:[
      {title:'集中度计算过程',headers:['指标','算法 / 窗口','加总项','结果'],rows:calcRows,note:'份额优先；缺项不补零。转化前三 >60% 时新手回避。'},
      ...(rankRows.length?[{title:'品牌份额前 10',headers:['#','品牌','销量','份额','Ratings / 星级','位置'],rows:rankRows,note:'排序：销量优先，并列看份额。来源 get_category_brand_market_size。'}]:[]),
      ...(asinRows.length?[{title:'细分词竞争 ASIN 点击 / 转化份额',headers:['#','ASIN / 品牌','点击份额','转化份额'],rows:asinRows,note:'来源 get_keyword_asin_analysis；点击分散但转化集中表示比较后仍买头部。'}]:[])
    ],extra:process+'\n### 判断口径\n- 品牌 CR5≥60% 巨头锁死；40%–60% 头部偏集中；<40% 长尾可入。\n- 黄金信号：近 90 天搜索量均值比近 360 天高 5% 以上，且商品数量变化在 ±10% 内。\n- 转化前三 ≥80% 垄断严重；>60% 新手回避；40%–60% 有切入空间。\n- 价格落在销量最大档区间内算主流；相对该档中位偏离 >30% 且在带外，需要差异化理由。\n- 点击前三 <60% 且转化前三 ≥60%：比较后买头部。两者都 <60%：蓝海。',boundary:'品牌名单、词表和机会接口都是西柚抽样，不是平台官方市占或全量 SKU。转化份额不是成交转化率。没有逐 ASIN 排除集，不能输出剩余市场 CVR。'});
  }

  function demandReport(scene,_form,steps){
    const u=U(),fmt=u.fmt;
    const kws=u.stepRows(steps,'get_category_keywords').map(kwTerm).filter(k=>k.term);
    const vols=kws.map(k=>k.volume).filter(v=>v!==null),difs=kws.map(k=>k.difficulty).filter(v=>v!==null),cvrs=kws.map(k=>k.cvr).filter(v=>v!==null);
    const vMed=median(vols),dMed=median(difs),cMed=median(cvrs);
    const groups={highHard:[],highEasy:[],longCvr:[]};
    kws.forEach(k=>{
      if(k.volume!==null&&vMed!==null&&k.volume>=vMed&&k.difficulty!==null&&dMed!==null&&k.difficulty>=dMed)groups.highHard.push(k);
      else if(k.volume!==null&&vMed!==null&&k.volume>=vMed&&k.difficulty!==null&&dMed!==null&&k.difficulty<dMed)groups.highEasy.push(k);
      else if(k.cvr!==null&&cMed!==null&&k.cvr>=cMed&&(k.volume===null||vMed===null||k.volume<vMed))groups.longCvr.push(k);
    });
    const pick=[...groups.highEasy,...groups.longCvr,...groups.highHard].filter((k,i,a)=>a.findIndex(x=>x.term===k.term)===i).slice(0,15);
    const lead=kws.length?('高量低难 '+groups.highEasy.length+' 个，高量高难 '+groups.highHard.length+' 个，长尾高转化 '+groups.longCvr.length+' 个。首批优先看高量低难，再补长尾高转化。'):'本次没有类目词表，不能分组。';
    const conclusion=[
      '- 词表样本 **'+kws.length+'** 个。高量低难 **'+groups.highEasy.length+'**，高量高难 **'+groups.highHard.length+'**，长尾高转化 **'+groups.longCvr.length+'**。口径：搜索量/难度/转化率相对本次中位数。来源：get_category_keywords。',
      '- 搜索量中位数 '+(vMed===null?'未提供':fmt(vMed,0))+'，难度中位数 '+(dMed===null?'未提供':fmt(dMed,0))+'，点击转化率中位数 '+(cMed===null?'未提供':fmt(cMed,1))+'。',
      '- 首批候选：'+(pick.slice(0,8).map(k=>k.term).join('、')||'数据不足')+'。'
    ];
    const charts=[];
    if(groups.highEasy.concat(groups.longCvr).filter(k=>k.volume).length)charts.push({title:'优先词搜索量',source:'get_category_keywords',kind:'bar',points:pick.filter(k=>k.volume!==null).slice(0,10).map(k=>({label:k.term,value:k.volume})),ratio:0,note:'按本次样本内搜索量，不是订单。'});
    const rows=pick.map(k=>[k.term,k.volume===null?'—':fmt(k.volume,0),k.difficulty===null?'—':fmt(k.difficulty,0),k.cvr===null?'—':fmt(k.cvr,1),groups.highEasy.includes(k)?'高量低难':groups.longCvr.includes(k)?'长尾高转化':'高量高难']);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'词表样本',value:String(kws.length)},{label:'高量低难',value:String(groups.highEasy.length)},{label:'高量高难',value:String(groups.highHard.length)},{label:'长尾高转化',value:String(groups.longCvr.length)}
    ],charts,tables:[
      {title:'需求分组过程',headers:['指标','算法','结果'],rows:[['搜索量中位','本次词表中位数',vMed===null?'—':fmt(vMed,0)],['难度中位','本次词表中位数',dMed===null?'—':fmt(dMed,0)],['转化率中位','点击转化率中位数',cMed===null?'—':fmt(cMed,1)],['高量低难','量≥中位且难度<中位',String(groups.highEasy.length)],['长尾高转化','转化≥中位且量<中位',String(groups.longCvr.length)]],note:'换一个月中位数会变。'},
      ...(rows.length?[{title:'首批 10–15 个候选词',headers:['词','搜索量','难度','点击转化率','分组'],rows:rows,note:'分组相对本次中位数。'}]:[])
    ],process:[
      '**步骤 1 · 词表样本**','- get_category_keywords 返回 **'+kws.length+'** 个词。缺搜索量或难度的词不进对应分组，不补零。',
      '**步骤 2 · 中位数**','- 搜索量中位 '+(vMed===null?'无法计算':fmt(vMed,0))+'，难度中位 '+(dMed===null?'无法计算':fmt(dMed,0))+'，点击转化率中位 '+(cMed===null?'无法计算':fmt(cMed,1))+'。',
      '**步骤 3 · 三组**','- 高量低难先做首批；长尾高转化作补充；高量高难只观察。',
      '**步骤 4 · 边界**','- 点击转化率不是成交转化率。相关性未核验时不能直接投放。'
    ],extra:'### 判断口径\n- 高量：搜索量 ≥ 本次中位数。低难：难度 < 本次中位数。长尾高转化：转化率 ≥ 中位数且搜索量低于中位数。\n- 点击转化率不是成交转化率。'});
  }

  function growthMap(steps,tool){
    const u=U(),map={};
    u.stepRows(steps,tool).forEach(r=>{
      const p=u.rankingProduct(r);
      if(!p.asin)return;
      const m=r.metrics||{},last=(r.periods||[]).find(x=>x.period==='last30days')||{};
      const g=u.scalar(m.salesGrowthRate||m.salesGrowth||r.salesGrowthRate||r.growthRate);
      const mom=typeof u.momRate==='function'?(u.momRate(m.sales)||u.momRate(last.sales)):null;
      const v=g!==null?g:mom;
      if(v!==null)map[p.asin]=v;
    });
    return map;
  }
  function darkHorseReport(scene,_form,steps){
    const u=U(),fmt=u.fmt,pathTitle=typeof u.titlePath==='function'?u.titlePath:t=>t||'待标注';
    const sales=u.rankingProducts(u.stepRows(steps,'get_category_sales_ranking'));
    const fresh=u.rankingProducts(u.stepRows(steps,'get_category_new_release_ranking'));
    const surge=u.rankingProducts(u.stepRows(steps,'get_category_surging_ranking'));
    const salesSet=new Set(sales.map(p=>p.asin).filter(Boolean));
    const surgeSet=new Set(surge.map(p=>p.asin).filter(Boolean));
    const freshSet=new Set(fresh.map(p=>p.asin).filter(Boolean));
    const bands=typeof u.parsePriceRows==='function'?u.parsePriceRows(steps):[];
    const mainBand=(bands.filter(b=>b.priceType!=='allPrice'&&b.sales!==null).sort((a,b)=>b.sales-a.sales)[0])||null;
    const reviewRoot=firstRow(steps,'get_category_review_analysis');
    const catAvgRatings=u.scalar(reviewRoot.avgRatings||reviewRoot.averageRatings||reviewRoot.ratings);
    const catAvgStars=u.scalar(reviewRoot.avgStars||reviewRoot.averageStars||reviewRoot.stars);
    const traffic=typeof u.trafficByAsin==='function'?u.trafficByAsin(steps):{};
    const surgeGrowth=growthMap(steps,'get_category_surging_ranking');
    const byAsin={};
    [...sales,...fresh,...surge].forEach(p=>{
      if(!p.asin)return;
      if(!byAsin[p.asin])byAsin[p.asin]=Object.assign({},p);
      else{
        const o=byAsin[p.asin];
        ['sales','ratings','stars','price','listedDays','title','brand','streetDate'].forEach(k=>{if((o[k]===null||o[k]==='')&&p[k]!==null&&p[k]!=='')o[k]=p[k];});
      }
    });
    const mature=sales.filter(p=>p.ratings!==null).sort((a,b)=>b.ratings-a.ratings);
    const matureHead=mature.slice(0,Math.max(5,Math.ceil(mature.length*0.25)));
    const ratingGate=median(matureHead.map(p=>p.ratings));
    const bandMed={};
    bands.filter(b=>b.priceType!=='allPrice'&&b.min!==null&&b.max!==null).forEach(b=>{
      const xs=Object.values(byAsin).filter(p=>p.price!==null&&p.price>=b.min&&p.price<=b.max&&p.ratings!==null).map(p=>p.ratings);
      bandMed[b.priceType]=median(xs);
    });
    const freshRecent=fresh.filter(p=>p.listedDays!==null&&p.listedDays<=180);
    const freshOld=fresh.filter(p=>p.listedDays!==null&&p.listedDays>180);
    const freshMissing=fresh.filter(p=>p.listedDays===null);
    const integrity=fresh.length===0?'新品榜未返回':(freshRecent.length===0&&freshOld.length)?'前排更像畅销老品，不能当官方 HNR 或近 180 天新品池':(freshMissing.length>fresh.length*0.5)?'上架天数缺失过多，完整性不足':'西柚补充观察池（streetDays 0–180），不是官方 Amazon HNR';
    const integrityBad=integrity.indexOf('老品')>=0||integrity.indexOf('不足')>=0||integrity.indexOf('未返回')>=0;
    const cands=Object.values(byAsin).map(p=>{
      const newHit=freshSet.has(p.asin),surgeHit=surgeSet.has(p.asin),salesHit=salesSet.has(p.asin);
      const band=p.price===null?null:bands.filter(b=>b.priceType!=='allPrice'&&b.min!==null&&b.max!==null).find(b=>p.price>=b.min&&p.price<=b.max)||null;
      const bandGate=band&&bandMed[band.priceType]!==null&&bandMed[band.priceType]!==undefined?bandMed[band.priceType]:null;
      const lowGate=ratingGate!==null&&p.ratings!==null&&p.ratings<ratingGate;
      const lowBand=bandGate!==null&&p.ratings!==null&&p.ratings<=bandGate*0.4;
      const low=lowGate||lowBand;
      const oldOnNew=newHit&&p.listedDays!==null&&p.listedDays>180;
      const recent=p.listedDays===null?null:p.listedDays<=180;
      const share=u.sharedReview(p);
      const eff=p.sales!==null&&p.ratings?p.sales/p.ratings:null;
      const t=traffic[p.asin];
      const ads=t&&t.adsRatio!==null?t.adsRatio:null;
      const driver=ads===null?'流量未取':ads>=0.7?'广告主导':ads<=0.2?'自然接住':'广告与自然双接';
      const feat=pathTitle(p.title);
      let type='待验证';
      if(share)type='共享评价嫌疑';
      else if(oldOnNew)type='新品榜老品';
      else if(newHit&&surgeHit&&low)type='高置信黑马';
      else if(newHit&&surgeHit)type='新品+飙升';
      else if(surgeHit&&low)type='飙升+低评';
      else if(newHit&&low)type='新品+低评';
      else if(surgeHit)type='仅飙升榜';
      else if(newHit)type='仅新品榜';
      return Object.assign({},p,{newHit,surgeHit,salesHit,low,lowGate,lowBand,oldOnNew,recent,share,eff,band,driver,ads,feat,growth:surgeGrowth[p.asin]??null,type});
    }).filter(p=>p.newHit||p.surgeHit).sort((a,b)=>{
      const rank=t=>t==='高置信黑马'?0:t==='新品+飙升'?1:t==='飙升+低评'?2:t==='新品+低评'?3:t==='共享评价嫌疑'?8:t==='新品榜老品'?9:6;
      return rank(a.type)-rank(b.type)||(b.sales||0)-(a.sales||0);
    });
    const strong=cands.filter(p=>p.type==='高置信黑马');
    const keep=cands.filter(p=>['高置信黑马','新品+飙升','飙升+低评','新品+低评'].includes(p.type));
    const shareN=cands.filter(p=>p.type==='共享评价嫌疑').length;
    const oldN=cands.filter(p=>p.type==='新品榜老品').length;
    const both=cands.filter(p=>p.newHit&&p.surgeHit&&p.type!=='共享评价嫌疑'&&p.type!=='新品榜老品');
    const amazon=cands.filter(p=>/amazon|basics/i.test(p.brand||''));
    const top=strong[0]||keep[0]||null;
    const lead=(integrityBad?integrity+'。':'')+(strong.length?('高置信黑马 '+strong.length+' 个，优先拆解 '+(top.brand||'')+' '+(top.asin||'')+'（'+top.feat+'，'+top.driver+'）。'):keep.length?('还没有高置信黑马，清洗后候选 '+keep.length+' 个，先当待验证。代表：'+(top.brand||'')+' '+(top.asin||'')+'。'):cands.length?('有榜单命中 '+cands.length+' 个，但达不到黑马口径，先当待验证。'):'本次没有新品榜或飙升榜可交叉的产品。')+' 西柚新品榜不是官方 HNR。';
    const conclusion=[
      '- 三榜样本：销量榜 **'+sales.length+'**，新品榜 **'+fresh.length+'**（近 180 天 '+freshRecent.length+'，超过 180 天 '+freshOld.length+'，上架天数缺失 '+freshMissing.length+'），飙升榜 **'+surge.length+'**。新品榜完整性：**'+integrity+'**。来源：get_category_sales_ranking、get_category_new_release_ranking、get_category_surging_ranking。',
      '- 成熟 Ratings 门槛约 '+(ratingGate===null?'数据不足':fmt(ratingGate,0))+'（销量榜评价最高的前 25% 中位数，至少 5 个）。类目评价接口均 Ratings '+(catAvgRatings===null?'未提供':fmt(catAvgRatings,0))+'，均星级 '+(catAvgStars===null?'未提供':fmt(catAvgStars,0))+'。低评=低于该门槛，或低于所在价格带 Ratings 中位数的 40%。',
      '- 清洗后高置信黑马 **'+strong.length+'** 个（新品∩飙升∩低评，且不是共享评价、不是上架>180 天）。清洗后候选 **'+keep.length+'** 个；共享评价嫌疑 '+shareN+' 个；新品榜老品 '+oldN+' 个。',
      ...(strong.length?strong.slice(0,5).map((p,i)=>'- '+(i===0?'优先样本':'高置信')+'：**'+(p.brand||'未标明')+' '+(p.asin||'')+'｜'+p.feat+'｜'+p.type+'｜'+p.driver+'**。上架 '+(p.listedDays===null?'未提供':p.listedDays+' 天')+(p.streetDate?'（'+p.streetDate+'）':'')+'，近 30 天销量 '+fmt(p.sales,0)+'，约 $'+fmt(p.price,0)+'，Ratings '+fmt(p.ratings,0)+' / '+fmt(p.stars,0)+'，销评比 '+(p.eff===null?'—':p.eff.toFixed(2))+(p.band?'，落在 '+p.band.short:'')+(p.growth!==null?'，飙升榜增速 '+signed(p.growth):'')+'。'):[top?('- 优先样本：**'+(top.brand||'未标明')+' '+(top.asin||'')+'｜'+top.feat+'｜'+top.type+'｜'+top.driver+'**。上架 '+(top.listedDays===null?'未提供':top.listedDays+' 天')+'，近 30 天销量 '+fmt(top.sales,0)+'。'):'- 没有可优先拆解的清洗后样本。']),
      '- 榜单交集不直接等于长期成功。成活率只有当前截面，不能输出 90/180/365 天 cohort 百分比。'
    ];
    const process=[
      '### 分析过程',
      '**步骤 1 · 三榜样本**',
      '- 销量榜用来建立成熟头部，不当黑马池。新品榜用来找上架较短且已出量的产品。飙升榜用来找正在加速的产品。',
      '- 销量榜 '+sales.length+' 行，新品榜 '+fresh.length+' 行，飙升榜 '+surge.length+' 行。去重后进入交叉的 ASIN **'+Object.keys(byAsin).length+'** 个。',
      '**步骤 2 · 新品榜完整性（非官方 HNR）**',
      '- 西柚新品榜按 streetDays 0–180 拉补充观察池，**不是** Amazon 官方 Hot New Releases 名次，不得回填官方 HNR 渗透率。',
      '- 近 180 天 '+freshRecent.length+' 个，超过 180 天 '+freshOld.length+' 个，上架天数缺失 '+freshMissing.length+' 个。判定：**'+integrity+'**。',
      '- 若上架天数普遍超过 180 天或缺失，前排按类目畅销老品处理，不进入高置信黑马。',
      '**步骤 3 · 成熟 Ratings 门槛**',
      '- 销量榜有 Ratings 的 '+mature.length+' 个，取评价最高的前 25%（至少 5 个）共 '+matureHead.length+' 个，中位数 '+(ratingGate===null?'无法计算':fmt(ratingGate,0))+'。',
      '- 这是可见头部样本门槛，不是平台硬门槛。来源：get_category_sales_ranking'+(catAvgRatings===null?'。':'；类目评价分布均 Ratings '+fmt(catAvgRatings,0)+'，来源 get_category_review_analysis。'),
      '**步骤 4 · 三榜交叉**',
      '- 新品∩飙升（已去掉共享评价和老品）**'+both.length+'** 个。同时出现在销量榜的 '+cands.filter(p=>p.salesHit&&(p.newHit||p.surgeHit)).length+' 个，只说明已经打进畅销样本，不自动升级为黑马。',
      '**步骤 5 · 共享评价清洗**',
      '- 规则与新品扫描相同：上架 ≤180 天且 Ratings≥800 且销评比<2，视为老资产换 ASIN，不当从 0 起量。本次剔除 **'+shareN+'** 个。',
      '**步骤 6 · 价格带**',
      '- 销量最大的非「全部」价格带视为主流。当前主流 '+(mainBand?mainBand.short+(mainBand.min!==null?' $'+fmt(mainBand.min,0)+'–'+fmt(mainBand.max,0):''):'未取到')+'。',
      '- 候选按自身价格落入低/中/高档。价带内 Ratings 中位数的 40% 作为第二条低评线（Gem 价带黑马口径）。',
      '**步骤 7 · 突破类型与第一驱动**',
      '- 标题功能只作第二驱动：鹅颈+温控 / 鹅颈基础款 / 温控+保温等。第一驱动看近 7 天广告流量占比：≥70% 广告主导，≤20% 自然接住。缺流量就写流量未取，不编造。',
      '- 基础安全、常规容量/功率等通用门槛不得写成黑马突破。Amazon / Basics 命中：'+(amazon.length?amazon.map(p=>p.brand+' '+(p.asin||'')).join('、'):'未出现')+'。',
      '**步骤 8 · 成活率边界**',
      '- 当前只有截面榜单，没有按上架月份建立的去重父体 cohort，**无法计算** 90/180/365 天在售或商业成活率。'
    ].join('\n');
    const charts=[];
    const coverPts=[{label:'销量榜',value:sales.length},{label:'新品榜',value:fresh.length},{label:'飙升榜',value:surge.length},{label:'新品∩飙升',value:both.length}].filter(p=>p.value);
    if(coverPts.length)charts.push({title:'三榜覆盖与交集',source:'get_category_sales_ranking、get_category_new_release_ranking、get_category_surging_ranking',kind:'bar',points:coverPts,ratio:0,note:'交集已去掉共享评价和上架>180 天的老品。'});
    if(keep.filter(p=>p.sales!==null).length)charts.push({title:'清洗后候选近 30 天销量',source:'get_category_new_release_ranking、get_category_surging_ranking',kind:'bar',points:keep.filter(p=>p.sales!==null).slice(0,10).map(p=>({label:p.brand||p.asin,value:p.sales})),ratio:0,note:'只含高置信和高一档待验证，不含共享评价与老品。'});
    const adsPts=keep.filter(p=>p.ads!==null).map(p=>({label:p.brand||p.asin,value:p.ads}));
    if(adsPts.length)charts.push({title:'候选近 7 天广告流量占比',source:'get_asin_traffic',kind:'bar',points:adsPts,ratio:1,note:'≥70% 广告主导；≤20% 自然接住。流量得分不是曝光次数。'});
    if(mainBand&&bands.filter(b=>b.sales!==null).length)charts.push({title:'各价格带销量',source:'get_category_price_segment_trends',kind:'bar',points:bands.filter(b=>b.sales!==null&&b.priceType!=='allPrice').map(b=>({label:b.short+' $'+fmt(b.min,0)+'–'+fmt(b.max,0),value:b.sales})),ratio:0,note:'用于把候选放回主流价格带，不代表利润。'});
    const calcRows=[
      ['新品榜完整性','streetDays 0–180，非官方 HNR','近180 / 超180 / 缺天数 = '+freshRecent.length+' / '+freshOld.length+' / '+freshMissing.length,integrity],
      ['成熟 Ratings 门槛','销量榜评价最高前 25% 中位数，至少 5 个',matureHead.map(p=>(p.brand||p.asin)+' '+fmt(p.ratings,0)).slice(0,5).join('、')||'—',ratingGate===null?'—':fmt(ratingGate,0)],
      ['高置信黑马','新品∩飙升∩低评，且非共享评价、非>180 天',strong.map(p=>p.asin||p.brand).slice(0,5).join('、')||'—',String(strong.length)],
      ['共享评价','上架≤180 且 Ratings≥800 且销评比<2',String(shareN)+' 个',shareN?'已剔除':'未触发'],
      ['主流价格带','销量最大的低/中/高档',mainBand?mainBand.short+(mainBand.min!==null?' $'+fmt(mainBand.min,0)+'–'+fmt(mainBand.max,0):''):'未取到',mainBand?'对照用':'—']
    ];
    const candRows=cands.slice(0,15).map(p=>[p.type,(p.asin||'')+' '+(p.brand||''),p.listedDays===null?'—':String(p.listedDays),fmt(p.sales,0),p.price===null?'—':'$'+fmt(p.price,0),p.band?p.band.short:'—',fmt(p.ratings,0)+' / '+fmt(p.stars,0),p.eff===null?'—':p.eff.toFixed(2),p.feat,p.driver]);
    const dropRows=cands.filter(p=>p.type==='共享评价嫌疑'||p.type==='新品榜老品').map(p=>[p.type,(p.asin||'')+' '+(p.brand||''),p.listedDays===null?'—':String(p.listedDays),fmt(p.ratings,0),p.eff===null?'—':p.eff.toFixed(2),p.type==='共享评价嫌疑'?'老资产换 ASIN':'上架超过 180 天']);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'高置信黑马',value:String(strong.length),tone:strong.length?'up':''},{label:'Ratings 门槛',value:ratingGate===null?'—':fmt(ratingGate,0)},{label:'新品∩飙升',value:String(both.length)},{label:'完整性',value:integrityBad?'不足':'补充池'}
    ],charts,tables:[
      {title:'黑马计算过程',headers:['指标','算法 / 窗口','加总项','结果'],rows:calcRows,note:'缺项不补零。西柚新品榜不是官方 HNR。'},
      ...(candRows.length?[{title:'黑马候选与待验证',headers:['判定','ASIN / 品牌','上架天','近 30 天销量','价格','价格带','Ratings / 星级','销评比','功能','第一驱动'],rows:candRows,note:'高置信=新品∩飙升∩低评。销评比只用于排序，不是因果。'}]:[]),
      ...(dropRows.length?[{title:'已剔除',headers:['原因','ASIN / 品牌','上架天','Ratings','销评比','说明'],rows:dropRows,note:'共享评价与新品榜老品不进入高置信。'}]:[])
    ],extra:process+'\n### 判断口径\n- 高置信黑马：同时进新品榜和飙升榜，Ratings 低于成熟门槛或低于所在价带中位数的 40%，且不是共享评价、上架不超过 180 天。\n- 共享评价：上架 ≤180 天且 Ratings≥800 且销评比<2。\n- 第一驱动看广告流量占比；标题功能只作第二驱动。\n- 西柚新品榜不是官方 Amazon HNR。成活率无法从当前截面算出。',boundary:'西柚三张榜都是抽样，不是平台官方市占或官方 HNR。流量得分不是曝光量。没有逐父体上架队列，不能输出新品成活率百分比。榜单交集不冒充长期成功。'});
  }

  const DOSSIER_FEATS=[
    ['鹅颈壶嘴',/gooseneck|pour.?over|鹅颈|手冲/i],
    ['温控',/temperature control|variable temp|preset|温控/i],
    ['不锈钢',/stainless|steel/i],
    ['快速沸腾',/\b(1000|1200|1500)\s*w\b|fast boil|rapid/i],
    ['保温',/keep warm|保温/i],
    ['茶滤',/tea infuser|infuser|茶滤/i]
  ];
  function dossierInfo(r){
    const u=U();
    const a=(r&&(r.asinInfo||r.productInfo))||r||{};
    const dist=a.priceDistribution||r.priceDistribution;
    const price=u.scalar(a.price||a.listingPrice||a.dealPrice||r.price);
    return {
      asin:u.readable(a.asin||a.primaryAsin||r.asin),
      title:u.readable(a.title||r.title),
      brand:u.readable(a.brand||r.brand),
      price:price!==null?price:u.scalar(dist&&(dist.value||dist.weightedAvg||dist.avg)),
      stars:u.scalar(a.stars||a.star||a.avgStars||r.stars),
      ratings:u.scalar(a.ratings||a.ratingCount||a.reviews||r.ratings),
      category:u.readable(a.categoryName||a.category||a.nodeLabelPath||a.titlePath||r.categoryName),
      parent:u.readable(a.parentAsin||r.parentAsin),
      listed:u.scalar(a.listedDays||a.availableDays||r.listedDays),
      seller:u.readable(a.sellerName||a.soldBy||r.sellerName),
      fulfill:u.readable(a.fulfillment||a.deliveryType||r.fulfillment)
    };
  }
  function shortProductName(title,brand){
    const t=String(title||'').replace(/\s+/g,' ').trim();
    if(!t)return brand||'该 ASIN';
    let first=t.split('|')[0].trim();
    first=first.replace(/\s+for\s+Home\b.*/i,'').trim();
    return first.length>40?first.slice(0,38)+'…':first;
  }
  function titleFeats(title){
    const t=String(title||'');
    const out=DOSSIER_FEATS.filter(x=>x[1].test(t)).map(x=>x[0]);
    const w=t.match(/(\d{3,4})\s*W/i);
    if(w&&!out.some(x=>x.indexOf('W')>=0))out.push(w[1]+'W');
    const cap=t.match(/(\d+(?:\.\d+)?)\s*L\b/i);
    if(cap)out.push(cap[1]+'L');
    return out;
  }
  function pickNamedNumber(obj,names){
    const u=U();
    if(!obj||typeof obj!=='object')return null;
    for(const name of names){
      if(obj[name]===undefined||obj[name]===null||obj[name]==='')continue;
      const n=u.scalar(obj[name]);
      if(n!==null)return n;
    }
    if(obj.metrics&&typeof obj.metrics==='object'){
      for(const name of names){
        if(obj.metrics[name]===undefined||obj.metrics[name]===null||obj.metrics[name]==='')continue;
        const n=u.scalar(obj.metrics[name]);
        if(n!==null)return n;
      }
    }
    return null;
  }
  function pickOrderCount(steps){
    const u=U();
    const names=['orderCount','orders','estimatedOrders','estOrders','order_count','last30DayOrders','last30DaysOrders'];
    const raw=stepPayload(steps,'get_asin_orders_last_30_days');
    const root=raw&&raw.data!==undefined&&typeof raw.data==='object'&&!Array.isArray(raw.data)?raw.data:raw;
    let n=pickNamedNumber(root,names);
    if(n!==null)return n;
    if(root&&typeof root==='object'&&!Array.isArray(root)&&root.value!==undefined&&!root.trends&&!root.ranks){
      n=u.scalar(root.value);
      if(n!==null)return n;
    }
    const rows=u.stepRows(steps,'get_asin_orders_last_30_days');
    for(const r of rows){
      n=pickNamedNumber(r,names);
      if(n!==null)return n;
    }
    return pickNamedNumber(firstRow(steps,'get_asin_orders_last_30_days'),names);
  }
  function attrOf(c){
    const u=U();
    if(!c||typeof c!=='object')return '';
    const direct=u.readable(c.variationAttributes||c.attributes||c.color||c.size||c.style||c.variationTheme||c.name||'');
    if(direct)return String(direct);
    const bag=c.variationAttributes||c.attributes;
    if(bag&&typeof bag==='object'&&!Array.isArray(bag)){
      return Object.keys(bag).map(k=>k+':'+u.readable(bag[k])).filter(x=>x&&x.indexOf(':')<20).join(' / ');
    }
    return '';
  }
  function flattenVariations(steps){
    const u=U();
    const out=[];
    const seen=new Set();
    function push(c,attr){
      let asin='',price=null,extra='';
      if(typeof c==='string')asin=c;
      else if(c&&typeof c==='object'){
        asin=u.readable(c.asin||c.childAsin||c.child_asin||c.variationAsin||c.primaryAsin||'');
        extra=attrOf(c);
        price=u.scalar(c.price||c.listingPrice);
      }
      asin=String(asin||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{10}$/.test(asin)||seen.has(asin))return;
      seen.add(asin);
      out.push({asin,attr:attr||extra||'',price});
    }
    function walk(v,depth){
      if(!v||depth>8)return;
      if(typeof v==='string'){push(v);return;}
      if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return;}
      if(typeof v!=='object')return;
      ['asin','childAsin','child_asin','variationAsin','primaryAsin'].forEach(k=>{if(v[k]!=null)push(v[k]&&typeof v[k]==='object'?v[k]:v);});
      ['data','list','items','result','children','childAsins','childAsinList','child_asins','variations','variationList','childList','asins'].forEach(k=>{if(v[k]!=null)walk(v[k],depth+1);});
    }
    walk(stepPayload(steps,'get_asin_variations'),0);
    (u.stepRows(steps,'get_asin_variations')||[]).forEach(r=>walk(r,0));
    (u.stepRows(steps,'get_parent_asin_keywords')||[]).forEach(r=>{
      const child=u.readable(r.asin||r.childAsin||r.child_asin||r.variationAsin||'');
      if(child)push(child,attrOf(r));
    });
    return out;
  }
  function parentKwView(r){
    const u=U();
    const k=kwTerm(r);
    k.child=String(u.readable(r.asin||r.childAsin||r.child_asin||r.variationAsin||r.child||'')).toUpperCase();
    if(!/^[A-Z0-9]{10}$/.test(k.child))k.child='';
    k.org=u.scalar(r.organicTrafficScore??r.organic);
    k.ads=u.scalar(r.advertisingTrafficScore??r.advertising);
    k.rel=u.scalar(r.relevance??r.relevanceScore??r.categoryRelevance);
    k.rank=u.organicRankOf?u.organicRankOf(r):u.scalar(r.organicRank??r.orRank??r.rank);
    if(k.volume===null)k.volume=k.org;
    return k;
  }
  function bsrLatestByCat(rows){
    const u=U();
    const map={};
    (rows||[]).forEach(r=>{
      const cat=u.readable(r.categoryName||r.category||r.nodeLabel||r.titlePath||'')||'BSR';
      const v=u.scalar(r.bsr||r.rank||r.totalRank);
      if(v===null)return;
      const d=dateOf(r);
      const prev=map[cat];
      if(!prev||String(d)>String(prev.date))map[cat]={cat,value:v,date:d};
    });
    return Object.values(map);
  }
  function dossierReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const info=dossierInfo(firstRow(steps,'get_asin_info'));
    const traf=trafficView(firstRow(steps,'get_asin_traffic'));
    const orders=pickOrderCount(steps);
    const bsrRows=u.stepRows(steps,'get_asin_bsr_trends');
    const bsr=series(bsrRows,r=>u.scalar(r.bsr||r.rank||r.totalRank));
    const bsrCats=bsrLatestByCat(bsrRows);
    const children=flattenVariations(steps);
    const varOk=(steps||[]).some(s=>s.tool==='get_asin_variations'&&s.status==='ok');
    const adsShare=traf.adsRatio;
    const mix=adsShare===null?'流量结构未取':adsShare>=0.7?'广告主导':adsShare<=0.2?'自然接住':'自然与广告双接';
    const sources=[];
    if(adsShare!==null&&adsShare>=0.5)sources.push('广告（近 7 天占比 '+fmt(adsShare,1)+'）');
    if(traf.org!==null&&(adsShare===null||adsShare<0.8))sources.push('自然流量');
    if(traf.kw!==null)sources.push('词覆盖 '+fmt(traf.kw,0));
    const rankDir=bsr.length<2?'点不足，不能比方向':(bsr[bsr.length-1].value<bsr[0].value?'名次靠前':(bsr[bsr.length-1].value>bsr[0].value?'名次退后':'名次走平'));
    const suspect=orders!==null&&info.ratings!==null&&info.ratings>0&&((orders/info.ratings)>150||(orders>=10000&&info.ratings<200));
    const feats=titleFeats(info.title);
    const short=shortProductName(info.title,info.brand);
    const asin=info.asin||(form&&form.asin)||'';
    const who=(info.brand?info.brand+' ':'')+short+(asin?'（'+asin+'）':'');
    const sellWhat=feats.length?feats.slice(0,3).join('、'):'标题未拆出功能点';
    const orderTxt=orders===null?'近 30 天推算订单未提供':('近 30 天推算订单 '+fmt(orders,0)+(suspect?'（和 Ratings 对不上，待核）':''));
    const varTxt=!varOk&&!children.length?'变体未取到':(children.length?('变体 '+children.length+' 个'):'单 ASIN，无子体');
    const lead=who+'：卖什么是 '+sellWhat+'，售价 '+(info.price===null?'未提供':'$'+fmt(info.price,0))+'，'+orderTxt+'，近 7 天 **'+mix+'**'+(adsShare===null?'':'，广告占比 '+fmt(adsShare,1))+'，'+varTxt+'。最依赖：'+(sources.slice(0,3).join(' / ')||'流量结构未取到')+'。';
    const conclusion=[
      '- 卖什么：**'+(info.brand||'未标明品牌')+'** '+short+(feats.length?'，功能点 '+feats.join('、'):'')+'。完整标题不进一句话结论。价格 '+(info.price===null?'未提供':'$'+fmt(info.price,0))+'，'+ (info.stars===null?'星级未提供':fmt(info.stars,0)+' 星')+' / Ratings '+(info.ratings===null?'未提供':fmt(info.ratings,0))+(info.category?'，类目 '+info.category:'')+'。来源：get_asin_info。',
      '- 卖多少：'+orderTxt+'。推算订单不是后台实单，只看量级，不算利润。'+(suspect?' Ratings 只有 '+(info.ratings===null?'未提供':fmt(info.ratings,0))+'，这个单量先核字段，不要当爆款。':'')+' 来源：get_asin_orders_last_30_days。',
      '- 靠什么：**'+mix+'**。自然得分 '+(traf.org===null?'未提供':fmt(traf.org,0))+'，广告得分 '+(traf.ads===null?'未提供':fmt(traf.ads,0))+(adsShare!==null?'，广告占比 '+fmt(adsShare,1):'')+(traf.kw!==null?'，词覆盖 '+fmt(traf.kw,0):'')+'。最依赖：'+(sources.slice(0,3).join(' / ')||'未取到')+'。来源：get_asin_traffic。',
      '- 变体：'+varTxt+'。记录数不是走量子体数，主推子体要另跑变体矩阵。'+(info.parent?' 父体 '+info.parent+'。':'')+' 来源：get_asin_variations。',
      '- BSR 样本 '+bsr.length+' 点，方向 **'+rankDir+'**（数值下降=位次靠前）。'+(bsrCats.length?('最新：'+bsrCats.slice(0,3).map(x=>x.cat+' #'+fmt(x.value,0)).join('；')+'。'):'')+' 来源：get_asin_bsr_trends。'
    ];
    const mixPts=[];
    if(traf.org!==null)mixPts.push({label:'自然',value:traf.org});
    if(traf.ads!==null)mixPts.push({label:'广告',value:traf.ads});
    const charts=[];
    if(mixPts.length)charts.push({title:'近 7 天流量得分',source:'get_asin_traffic',kind:'bar',points:mixPts,ratio:0,note:'相对得分不是曝光次数。缺一列不画。'});
    if(bsr.length>1)charts.push({title:'BSR 走势',source:'get_asin_bsr_trends',kind:'line',points:bsr,ratio:0,note:'数值越小位次越靠前。'});
    const tables=[
      {title:'商品底稿',headers:['字段','值'],rows:[
        ['ASIN',asin||'未提供'],
        ['品牌',info.brand||'未提供'],
        ['短标题',short],
        ['功能点',feats.join('、')||'未从标题拆出'],
        ['售价',info.price===null?'未提供':'$'+fmt(info.price,0)],
        ['星级 / Ratings',(info.stars===null?'未提供':fmt(info.stars,0))+' / '+(info.ratings===null?'未提供':fmt(info.ratings,0))],
        ['类目',info.category||'未提供'],
        ['履约 / 卖家',[info.fulfill||'',info.seller||''].filter(Boolean).join(' · ')||'未提供'],
        ['上架天数',info.listed===null?'未提供':fmt(info.listed,0)]
      ],note:'完整标题只留在底稿，不进一句话结论。缺字段写未提供。'},
      {title:'档案计算过程',headers:['指标','算法','结果'],rows:[
        ['卖什么','标题按功能词典打标，不把整段 Listing 标题当结论',sellWhat],
        ['订单字段','只读 orderCount / orders，不把 trends.value 或其它 value 当单量',orders===null?'未提供':fmt(orders,0)+(suspect?' 待核':'')],
        ['流量结构','广告占比≥70% 广告主导，≤20% 自然接住，中间双接',mix],
        ['广告占比','get_asin_traffic.advertisingTrafficScoreRatio',adsShare===null?'未提供':fmt(adsShare,1)],
        ['BSR 方向','窗口最后一天 vs 第一天，数值下降=靠前',rankDir],
        ['变体','get_asin_variations 子体去重；没有列表则单 ASIN',varTxt],
        ['依赖来源','广告≥50% / 自然仍在 / 词覆盖',sources.join('；')||'未识别']
      ],note:'推算订单不是实际订单。数量级和 Ratings 对不上时标待核。'}
    ];
    if(children.length)tables.splice(1,0,{title:'变体矩阵',headers:['子体 ASIN','属性','价格'],rows:children.slice(0,20).map(c=>[c.asin,c.attr||'—',c.price===null?'—':'$'+fmt(c.price,0)]),note:'记录数不是走量款数。主推子体另跑变体矩阵场景。'});
    if(bsrCats.length)tables.splice(tables.length-1,0,{title:'BSR 最新位次',headers:['类目','排名','日期'],rows:bsrCats.slice(0,8).map(x=>[x.cat,fmt(x.value,0),x.date||'—']),note:'数值越小位次越靠前。缺日期仍保留最新点。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'卖什么',value:feats.slice(0,2).join(' · ')||short},
      {label:'近30天推算订单',value:orders===null?'未提供':(suspect?fmt(orders,0)+' 待核':fmt(orders,0))},
      {label:'流量结构',value:mix},
      {label:'变体',value:!varOk&&!children.length?'未提供':(children.length?String(children.length):'单ASIN')}
    ],charts,tables,process:[
      '**步骤 1 · 卖什么**','- 用品牌、短标题、价格、星级、Ratings 建底稿。功能点从标题词典拆，不把整段英文标题贴进一句话结论。',
      '**步骤 2 · 卖多少**','- 近 30 天只读订单字段。接口里若夹了走势 value，不当单量。和 Ratings 数量级对不上就标待核，不拿去算利润。',
      '**步骤 3 · 靠什么流量**','- 近 7 天广告占比定结构：≥70% 广告主导，≤20% 自然接住，中间双接。得分不是曝光。',
      '**步骤 4 · 几个变体**','- 子体去重计数。没有列表就写单 ASIN。记录数不是走量款，主推要另跑变体矩阵。',
      '**步骤 5 · 排名与依赖**','- BSR 数值越小越靠前。最依赖来源只根据本次占比和词覆盖列 2–3 个，不编造关联流量。'
    ],extra:'### 判断口径\n- 一句话结论只保留短标题和四件事：卖什么、卖多少、靠什么、几个变体。\n- 广告主导不等于可复制，还要看花费。\n- 推算订单不是实际订单；待核单量不能当爆款。',boundary:'流量得分不是曝光量。没有花费、库存和 VOC，不能判断它能不能被打死。待核订单不能当备货依据。'});
  }

  function posScore(r,aliases){
    const u=U();
    const bags=[r,r.metrics,r.scores,r.positionScores,r.trafficScores,r.positions,r.locationScores].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
    for(const bag of bags){
      for(const k of aliases){
        const v=u.scalar(bag[k]);
        if(v!==null)return v;
      }
      const keys=Object.keys(bag);
      for(const k of aliases){
        const needle=k.toLowerCase().replace(/_/g,'');
        const hit=keys.find(x=>x.toLowerCase().replace(/_/g,'')===needle);
        if(hit){const v=u.scalar(bag[hit]);if(v!==null)return v;}
      }
    }
    return null;
  }
  function meanPos(rows,aliases){
    const vs=(rows||[]).map(r=>posScore(r,aliases)).filter(v=>v!==null);
    return vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null;
  }
  function trafficMixReport(scene,_form,steps){
    const u=U(),fmt=u.fmt;
    const base=trafficView(firstRow(steps,'get_asin_traffic'));
    const daily=u.stepRows(steps,'get_asin_traffic_trends');
    const weekly=u.stepRows(steps,'get_asin_traffic_trends_weekly');
    const kwc=u.stepRows(steps,'get_asin_keyword_count_trends');
    const orderRow=firstRow(steps,'get_asin_orders_last_30_days');
    const orders=u.scalar(orderRow.orderCount||orderRow.orders||orderRow.value);
    const orgS=series(daily,r=>u.scalar(r.organicTrafficScore||r.organic));
    const adsS=series(daily,r=>u.scalar(r.advertisingTrafficScore||r.advertising));
    let mix=base.adsRatio;
    if(mix===null&&base.org!==null&&base.ads!==null&&(base.org+base.ads)>0)mix=base.ads/(base.org+base.ads);
    const weekMix=series(weekly,r=>u.scalar(r.advertisingTrafficScoreRatio||r.advertisingRatio));
    const weekLast=weekMix.length?weekMix[weekMix.length-1].value:null;
    const split=weekLast!==null?weekLast:mix;
    const style=split===null?'数据不足':split>=0.7?'广告主导':split<=0.3?'自然主导':'自然与广告双接';
    const orgShare=split===null?null:Math.max(0,1-split);
    const orgOrders=orders!==null&&orgShare!==null?orders*orgShare:null;
    const adsOrders=orders!==null&&split!==null?orders*split:null;
    const stable=weekMix.length>=2&&weekMix[0].value!==null&&weekMix[weekMix.length-1].value!==null&&Math.abs(weekMix[weekMix.length-1].value-weekMix[0].value)<0.1;
    const or=meanPos(daily,['orTrafficScore','organicRankScore','orScore','OR']);
    const sp=meanPos(daily,['spTrafficScore','sponsoredProductsScore','spScore','SP']);
    const sb=meanPos(daily,['sbTrafficScore','sponsoredBrandScore','sbScore','SB']);
    const sbv=meanPos(daily,['sbvTrafficScore','sponsoredBrandVideoScore','sbvScore','SBV']);
    const oor=meanPos(daily,['oorTrafficScore','oorScore','OOR']);
    const sor=meanPos(daily,['sorTrafficScore','sorScore','SOR']);
    const pos={OR:or,SP:sp,SB:sb,SBV:sbv,OOR:oor,SOR:sor};
    const adPos=[sp,sb,sbv].filter(v=>v!==null);
    const adPosSum=adPos.length?adPos.reduce((a,b)=>a+b,0):null;
    const brandAds=(sb!==null||sbv!==null)?((sb||0)+(sbv||0)):null;
    const brandShare=brandAds!==null&&adPosSum?brandAds/adPosSum:null;
    const sbProp=brandShare!==null&&brandShare>=0.4;
    const lastKw=kwc[kwc.length-1]||{};
    const natKw=u.scalar(lastKw.organicKeywordCount||lastKw.organic);
    const adKw=u.scalar(lastKw.advertisingKeywordCount||lastKw.advertising);
    let copy='数据不足，不能判断能不能复制';
    if(style==='自然主导'&&(weekMix.length<2||stable))copy='自然结构更稳，值得研究词和转化，不是直接抄广告';
    else if(style==='广告主导'&&sbProp)copy='主要靠 SB/SBV 撑量，缺花费和利润，不能说可复制';
    else if(style==='广告主导'&&sp!==null&&(brandShare===null||brandShare<0.4))copy='更像常规 SP 投放，可小预算试，必须自己算 ACOS';
    else if(style==='自然与广告双接'&&weekMix.length>=2&&stable)copy='混合结构且周配比稳定，复制成本未知';
    else if(weekMix.length>=2&&!stable)copy='周配比在晃，更像短期动作，不要当稳态打法';
    else if(style!=='数据不足')copy='有配比但缺花费，只能判断结构，不能判断能不能复制';
    const splitLead=orgOrders===null&&adsOrders===null?'还没有推算订单，不能把配比换成单量。':('近 30 天推算订单 '+fmt(orders,0)+' 里，按流量占比分摊：自然约 '+(orgOrders===null?'—':fmt(orgOrders,0))+'，广告约 '+(adsOrders===null?'—':fmt(adsOrders,0))+'。');
    const lead=style==='数据不足'?'近 7 天流量结构未取到，不能拆自然/广告单量。':('近 7 天/周结构是 **'+style+'**，广告流量占比 '+(split===null?'未提供':fmt(split,1))+'。'+splitLead+(sbProp?' 广告侧 SB/SBV 占比 '+fmt(brandShare,1)+'，更像品牌广告撑量。':'')+' 复制判断：'+copy);
    const conclusion=[
      '- 流量配比：**'+style+'**。广告占比 '+(split===null?'未提供':fmt(split,1))+'，自然占比 '+(orgShare===null?'未提供':fmt(orgShare,1))+'。优先用最近一周占比，没有周数据再用近 7 天。来源：get_asin_traffic、get_asin_traffic_trends_weekly。',
      '- 推算单量拆分：近 30 天订单 '+(orders===null?'未提供':fmt(orders,0))+'。自然约 '+(orgOrders===null?'无法计算':fmt(orgOrders,0))+'，广告约 '+(adsOrders===null?'无法计算':fmt(adsOrders,0))+'。这是用流量得分占比去分摊推算订单，**不是**后台归因单量。来源：get_asin_orders_last_30_days。',
      '- 广告坑位（日均有值才算）：OR '+(or===null?'未提供':fmt(or,0))+'，SP '+(sp===null?'未提供':fmt(sp,0))+'，SB '+(sb===null?'未提供':fmt(sb,0))+'，SBV '+(sbv===null?'未提供':fmt(sbv,0))+'，OOR '+(oor===null?'未提供':fmt(oor,0))+'，SOR '+(sor===null?'未提供':fmt(sor,0))+'。SB/SBV 占已识别广告坑位 '+(brandShare===null?'无法计算':fmt(brandShare,1))+(sbProp?'，判定为品牌广告撑量。':'。')+' 来源：get_asin_traffic_trends。',
      '- 周配比 '+(weekMix.length?(stable?'稳定，更像结构':'波动，更像短期动作'):'样本不足')+'。自然词 '+(natKw===null?'未提供':fmt(natKw,0))+'，广告词 '+(adKw===null?'未提供':fmt(adKw,0))+'。',
      '- 打法复制：**'+copy+'**。没有花费和利润，不能输出广告利润或必投结论。'
    ];
    const charts=[];
    if(orgS.length>1)charts.push({title:'日自然流量得分',source:'get_asin_traffic_trends',kind:'line',points:orgS,ratio:0,note:'相对得分，不是订单。'});
    if(adsS.length>1)charts.push({title:'日广告流量得分',source:'get_asin_traffic_trends',kind:'line',points:adsS,ratio:0,note:'相对得分，不是订单。'});
    const posPts=Object.keys(pos).map(k=>({label:k,value:pos[k]})).filter(p=>p.value!==null);
    if(posPts.length)charts.push({title:'日均位置得分',source:'get_asin_traffic_trends',kind:'bar',points:posPts,ratio:0,note:'只画有返回的坑位，不补零。'});
    if(orgOrders!==null||adsOrders!==null){
      const orderPts=[];
      if(orgOrders!==null)orderPts.push({label:'推算自然单量',value:orgOrders});
      if(adsOrders!==null)orderPts.push({label:'推算广告单量',value:adsOrders});
      charts.push({title:'近 30 天推算单量拆分',source:'get_asin_orders_last_30_days × 流量占比',kind:'bar',points:orderPts,ratio:0,note:'按流量占比分摊，不是归因订单。'});
    }
    const calcRows=[
      ['广告流量占比',weekLast!==null?'最近一周 advertisingTrafficScoreRatio':'近 7 天 advertisingTrafficScoreRatio',split===null?'—':fmt(split,1)],
      ['自然流量占比','1 − 广告占比',orgShare===null?'—':fmt(orgShare,1)],
      ['近 30 天推算订单','get_asin_orders_last_30_days',orders===null?'—':fmt(orders,0)],
      ['推算自然单量','订单 × 自然占比',orgOrders===null?'—':fmt(orgOrders,0)],
      ['推算广告单量','订单 × 广告占比',adsOrders===null?'—':fmt(adsOrders,0)],
      ['SB/SBV 撑量','(SB+SBV) / (SP+SB+SBV) ≥40%',brandShare===null?'坑位不足':(sbProp?'是 '+fmt(brandShare,1):'否 '+fmt(brandShare,1))],
      ['周配比','周末 vs 周首绝对值 <10%',weekMix.length?(stable?'稳定':'波动'):'不足'],
      ['打法复制',style+' + 坑位 + 周稳态',copy]
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'推算自然单量',value:orgOrders===null?'—':fmt(orgOrders,0)},{label:'推算广告单量',value:adsOrders===null?'—':fmt(adsOrders,0),tone:style==='广告主导'?'down':''},{label:'广告占比',value:split===null?'—':fmt(split,1)},{label:'复制判断',value:copy.slice(0,8)}
    ],charts,tables:[{title:'单量与坑位计算过程',headers:['指标','算法','结果'],rows:calcRows,note:'流量得分占比 ≠ 后台归因。推算订单不是实际订单。缺坑位不补零。'}],process:[
      '**步骤 1 · 流量配比**','- 近 7 天广告得分占比作基线。有周趋势时，用最近一周占比代表结构，避免单周促销污染。',
      '**步骤 2 · 单量怎么拆**','- 近 30 天推算订单 × 自然占比 = 推算自然单量；× 广告占比 = 推算广告单量。这是分摊，不是亚马逊告诉你每一单从哪来。没有订单或没有占比，就写无法计算。',
      '**步骤 3 · 广告花在哪些坑位**','- 日趋势里读 OR / SP / SB / SBV / OOR / SOR，只对有值的天求均值。SB+SBV 占已识别广告坑位 ≥40% 记品牌广告撑量。',
      '**步骤 4 · 稳态还是动作**','- 周占比首尾变化 <10% 记稳定结构，否则更像短期投放动作。',
      '**步骤 5 · 能不能复制**','- 自然主导且稳态：研究词和转化。广告主导且 SB/SBV 撑：缺花费不能复制。常规 SP：可小预算试。没有花费一律不算利润。'
    ],extra:'### 判断口径\n- 广告占比 ≥70% 广告主导；≤30% 自然主导。\n- 单量拆分 = 推算订单 × 流量占比，不是归因订单。\n- SB/SBV 撑量门槛：占已识别广告坑位 ≥40%。\n- 没有花费不能判断可复制，更不能算 ACOS。',boundary:'西柚流量得分不是曝光次数，推算订单不是实际订单。7 天/周流量结构套到 30 天订单上会有窗口错位。没有花费、转化率和库存，不能输出广告利润或必投结论。'});
  }

  function dayTraffic(r){
    const u=U();
    const org=pickKwTraffic(r,'organic');
    const ads=pickKwTraffic(r,'ads');
    const tot=u.scalar(r.totalTrafficScore||r.total||(r.summaryTraffic&&r.summaryTraffic.total)||(r.summary&&r.summary.total));
    return {org,ads,total:(org===null&&ads===null)?tot:((org||0)+(ads||0))};
  }
  function validIsoDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'');}
  function nearDays(day,span){
    if(!validIsoDay(day))return [];
    const t=Date.parse(day+'T00:00:00Z');
    if(!Number.isFinite(t))return [];
    const out=[];
    for(let i=-(span||1);i<=(span||1);i++)out.push(new Date(t+i*864e5).toISOString().slice(0,10));
    return out;
  }
  function spikeEvents(steps){
    const u=U(),fmt=u.fmt;
    function dayOf(r){const d=String(dateOf(r)).slice(0,10);return validIsoDay(d)?d:'';}
    const listing=u.stepRows(steps,'get_asin_info_change_trends').filter(r=>r&&typeof r==='object').map(r=>{
      const field=String(u.readable(r.field||r.changeType||r.name||r.title||'')).toLowerCase();
      const kind=/image|main.?image|主图|图片/.test(field)?'主图':/title|标题/.test(field)?'标题':/bullet|五点|描述|desc/.test(field)?'文案':'Listing';
      return {day:dayOf(r),family:'listing',kind,what:u.readable(r.field||r.changeType||r.name||r.title||kind)};
    }).filter(x=>x.day);
    const info=u.stepRows(steps,'get_asin_info_trends').filter(r=>r&&typeof r==='object').map(r=>({day:dayOf(r),price:u.scalar(r.price||r.listingPrice||r.dealPrice||r.promoPrice)})).filter(x=>x.day).sort((a,b)=>a.day.localeCompare(b.day));
    const price=[];
    for(let i=1;i<info.length;i++){
      const prev=info[i-1],cur=info[i];
      if(prev.price===null||cur.price===null||!Math.abs(prev.price))continue;
      const ch=(cur.price-prev.price)/Math.abs(prev.price);
      if(Math.abs(ch)<0.05)continue;
      price.push({day:cur.day,family:'price',kind:ch<=-0.05?'降价':'提价',what:'$' +fmt(prev.price,0)+' → $'+fmt(cur.price,0),change:ch});
    }
    const ads=u.stepRows(steps,'get_asin_ad_change_trends').filter(r=>r&&typeof r==='object').map(r=>({day:dayOf(r),family:'ad',kind:'新广告',what:u.readable(r.name||r.campaignName||r.adType||r.type||'广告活动')})).filter(x=>x.day);
    return {listing,price,ads,all:[...listing,...price,...ads].sort((a,b)=>a.day.localeCompare(b.day)||a.family.localeCompare(b.family))};
  }
  // Adapted from ASINSCOPE's deterministic detector: causal 7-day log BSR
  // smoothing, 3-7 day anomaly windows, 1.4x magnitude and 14-day sustain.
  function detectBsrBreakouts(rows){
    const u=U();
    const points=(rows||[]).map((r,i)=>({
      date:String(dateOf(r)||'').slice(0,10), value:bsrValue(r),
      reviews:u.scalar(r.reviewCount??r.ratingsCount??r.ratings),
      variations:u.scalar(r.variationCount??r.variationsCount??r.childCount)
    })).filter(p=>validIsoDay(p.date)&&p.value>0).sort((a,b)=>a.date.localeCompare(b.date));
    if(points.length<14)return {status:'insufficient',points,breakouts:[],excluded:[],need:14};
    const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
    const sd=(a,m)=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1));
    const logs=points.map(p=>Math.log(p.value));
    const smooth=logs.map((_,i)=>i<6?null:mean(logs.slice(i-6,i+1)));
    const rates=[];
    for(let i=1;i<smooth.length;i++)if(smooth[i]!==null&&smooth[i-1]!==null)rates.push({idx:i,value:smooth[i-1]-smooth[i]});
    const candidates=[];
    for(let s=0;s<rates.length;s++){
      const base=rates.slice(0,s).map(x=>x.value); if(base.length<3)continue;
      const m=mean(base),sigma=sd(base,m);
      for(let len=3;len<=7&&s+len<=rates.length;len++){
        const gain=rates.slice(s,s+len).reduce((n,x)=>n+x.value,0);
        const threshold=len*m+2.5*sigma*Math.sqrt(len);
        if(gain>threshold+1e-9)candidates.push({start:rates[s].idx,end:rates[s+len-1].idx,score:gain-threshold});
      }
    }
    candidates.sort((a,b)=>a.start-b.start||b.score-a.score);
    const merged=[];
    candidates.forEach(c=>{const last=merged[merged.length-1];if(last&&c.start<=last.end+7){last.end=Math.max(last.end,c.end);last.score=Math.max(last.score,c.score);}else merged.push({...c});});
    const excluded=[],breakouts=[];
    merged.forEach(w=>{
      const jump=points.findIndex((p,i)=>i>0&&i>=w.start-7&&i<=w.end+7&&((p.variations!==null&&points[i-1].variations!==null&&p.variations!==points[i-1].variations)||(p.reviews>0&&points[i-1].reviews>0&&Math.max(p.reviews/points[i-1].reviews,points[i-1].reviews/p.reviews)>=5)));
      if(jump>=0){excluded.push({date:points[jump].date,reason:'评论或变体数量跳变'});return;}
      const anchor=Math.max(0,w.start-3),from=points[Math.max(0,anchor-1)].value;
      const to=Math.min(...points.slice(w.start,Math.min(points.length,w.end+8)).map(p=>p.value));
      const magnitude=from/to; if(magnitude<1.4)return;
      const si=Math.min(points.length-1,w.end+14),sustained=si>w.end&&points[si].value<=from*0.7;
      breakouts.push({date:points[anchor].date,from,to,magnitude,sustained,confidence:magnitude>=1.8&&sustained?'高':magnitude>=1.8||sustained?'中':'低'});
    });
    return {status:'ok',points,breakouts:breakouts.slice(0,3),excluded,need:14};
  }
  function spikeReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const traf=u.stepRows(steps,'get_asin_traffic_trends');
    const scored=traf.filter(r=>r&&typeof r==='object').map((r,i)=>{
      const d=dateOf(r);
      const t=dayTraffic(r);
      return {label:d||('第 '+(i+1)+' 日'),date:d,org:t.org,ads:t.ads,value:t.total};
    }).filter(p=>p.value!==null).sort((a,b)=>String(a.date||a.label).localeCompare(String(b.date||b.label)));
    const orgPts=scored.filter(p=>p.org!==null).map(p=>({label:p.label,value:p.org,date:p.date}));
    const adsPts=scored.filter(p=>p.ads!==null).map(p=>({label:p.label,value:p.ads,date:p.date}));
    const jumps=[];
    for(let i=1;i<scored.length;i++){
      const prev=scored[i-1],cur=scored[i];
      const orgJump=(prev.org>0&&cur.org!==null)?(cur.org-prev.org)/Math.abs(prev.org):null;
      const adsJump=(prev.ads>0&&cur.ads!==null)?(cur.ads-prev.ads)/Math.abs(prev.ads):null;
      if(prev.value<=0){
        if(cur.value>0)jumps.push({day:cur.label,jump:null,from:prev.value,to:cur.value,kind:'fromZero',orgJump,adsJump});
        continue;
      }
      const jump=(cur.value-prev.value)/Math.abs(prev.value);
      jumps.push({day:cur.label,jump,from:prev.value,to:cur.value,kind:jump>=0.3?'hard':jump>=0.15?'soft':'small',orgJump,adsJump});
    }
    const ranked=jumps.slice().sort((a,b)=>(b.jump===null?2:(b.jump||0))-(a.jump===null?2:(a.jump||0)));
    const hard=ranked.filter(j=>j.kind==='hard'||j.kind==='fromZero')[0]||null;
    const soft=ranked.filter(j=>j.kind==='soft')[0]||null;
    const maxJump=ranked[0]||null;
    const focus=hard||soft||maxJump;
    const bsrAudit=detectBsrBreakouts(U().stepRows(steps,'get_asin_bsr_trends'));
    const bsrHit=bsrAudit.breakouts[0]||null;
    const ev=spikeEvents(steps);
    const anchorDay=bsrHit?bsrHit.date:(focus?focus.day:'');
    const focusDays=anchorDay?nearDays(anchorDay,3):[];
    const hit=list=>list.filter(x=>focusDays.includes(x.day));
    const adHit=hit(ev.ads),listHit=hit(ev.listing),priceHit=hit(ev.price);
    const terms=datedTerms(stepPayload(steps,'get_asin_keywords_daily'));
    const termDays=[...new Set(terms.map(t=>t.day).filter(validIsoDay))].sort();
    function termsOn(day){return new Set(terms.filter(t=>t.day===day).map(t=>t.term).filter(Boolean));}
    const prevDay=anchorDay&&validIsoDay(anchorDay)?termDays.filter(d=>d<anchorDay).pop():'';
    const onTerms=anchorDay?termsOn(anchorDay):new Set();
    const beforeTerms=prevDay?termsOn(prevDay):new Set();
    const added=[...onTerms].filter(t=>!beforeTerms.has(t));
    const dropped=[...beforeTerms].filter(t=>!onTerms.has(t));
    const hypotheses=[
      {name:'广告放量',status:adHit.length?'支持':(anchorDay?'不支持':'无法验证'),weight:adHit.length?30:0,evidence:adHit.length?anchorDay+' 前后有 '+adHit.length+' 条新广告':'拐点窗口未观测到新广告'},
      {name:'关键词承接',status:added.length?'支持':(termDays.length>=2?'不支持':'无法验证'),weight:added.length?20:0,evidence:added.length?'新增 '+added.length+' 个日级词':'缺少可比日词或未见新增词'},
      {name:'降价促销',status:priceHit.some(x=>x.kind==='降价')?'支持':(anchorDay?'不支持':'无法验证'),weight:priceHit.some(x=>x.kind==='降价')?15:0,evidence:priceHit.length?priceHit.map(x=>x.what).join('；'):'拐点窗口未观测到 ≥5% 降价'},
      {name:'Listing 改版',status:listHit.length?'支持':(anchorDay?'不支持':'无法验证'),weight:listHit.length?15:0,evidence:listHit.length?listHit.map(x=>x.kind).join('、'):'拐点窗口未观测到改版'}
    ];
    const weightTotal=hypotheses.reduce((s,h)=>s+h.weight,0);
    hypotheses.forEach(h=>{h.share=weightTotal?Math.round(h.weight/weightTotal*100):0;});
    const sl=slope(scored);
    const winFrom=(form&&validIsoDay(form.dateFrom)?form.dateFrom:(scored[0]&&scored[0].date))||'';
    const winTo=(form&&validIsoDay(form.dateTo)?form.dateTo:(scored[scored.length-1]&&scored[scored.length-1].date))||'';
    const winLabel=(winFrom&&winTo)?winFrom+' ~ '+winTo:'本窗口';
    const winState=sl.dir==='上升'?'在爬':sl.dir==='下降'?'在掉':sl.dir==='走平'?'走平':sl.dir;
    let verdict='无爆单';
    if(hard)verdict=hard.kind==='fromZero'?'从零起量':'单日爆单';
    else if(soft)verdict='有起量未爆';
    else if(scored.length>=2)verdict='无单日爆单';
    else verdict='日点不足';
    function whichSide(j){
      if(!j)return '';
      if(j.orgJump!==null&&j.adsJump!==null){
        if(j.adsJump-j.orgJump>=0.15)return '广告得分涨得更猛';
        if(j.orgJump-j.adsJump>=0.15)return '自然得分涨得更猛';
        return '自然和广告一起动';
      }
      if(j.adsJump!==null&&j.orgJump===null)return '主要看见广告得分';
      if(j.orgJump!==null)return '主要看见自然得分';
      return '';
    }
    let cause='窗口内没有可对齐的单日爆单';
    let causeCard='无爆单';
    if(anchorDay&&(hard||soft||bsrHit)){
      const sides=[adHit.length?'新广告':'',listHit.length?'改版':'',priceHit.some(x=>x.kind==='降价')?'降价':'',priceHit.some(x=>x.kind==='提价')?'提价':''].filter(Boolean);
      if(sides.length>=2){cause='±1 天同时有 '+sides.join(' + ')+'，不能拆成单一主因';causeCard='不能拆开';}
      else if(adHit.length){cause='±1 天只有新广告，更像新广告活动';causeCard='新广告';}
      else if(listHit.length){cause='±1 天只有 Listing 变更，更像改版';causeCard='改版';}
      else if(priceHit.some(x=>x.kind==='降价')){cause='±1 天只有降价，更像促销';causeCard='降价';}
      else if(added.length&&!dropped.length){cause='未见广告/改版/降价，当天多了 '+added.length+' 个词，倾向自然词变化，仍需对照期';causeCard='偏自然词';}
      else {cause='±1 天没有广告、改版或降价，不能指定主因';causeCard='主因未定';}
    } else if(ev.all.length){
      cause='没有单日爆单，窗口动作是 '+(ev.ads.length?'广告 '+ev.ads.length:'无新广告')+'、'+(ev.listing.length?'改版 '+ev.listing.length:'无改版')+'、'+(ev.price.filter(x=>x.kind==='降价').length?'降价 '+ev.price.filter(x=>x.kind==='降价').length:'无降价');
      causeCard='平稳投放';
    }
    const jumpTxt=focus?(focus.jump===null?focus.day+' 从 '+fmt(focus.from,0)+' 起到 '+fmt(focus.to,0):(focus.day+' 相对前一日 '+(focus.jump>=0?'+':'')+(focus.jump*100).toFixed(0)+'%')):'没有可比相邻日';
    let lead=scored.length<2
      ?winLabel+' 日流量趋势没有可比点，不能定位跳升日。窗口内广告 '+ev.ads.length+'、改版 '+ev.listing.length+'、价格动作 '+ev.price.length+'。没有日点就不能做爆单溯源。'
      :(hard
        ?(winLabel+' 在 '+jumpTxt+'，达到单日爆单门槛（≥30% 或从零起量）。'+whichSide(hard)+(whichSide(hard)?'。':'')+cause+'。相关不等于因果。')
        :(winLabel+' 没有 ≥30% 的单日爆单，不能写成突然起量。最大一跳 '+jumpTxt+(soft?'，只算有起量未爆':'')+'。窗口流量 '+winState+(sl.change===null?'':('（两端 '+signed(sl.change)+'）'))+'。'+cause+'。'));
    if(bsrAudit.status==='insufficient')lead='BSR 只有 '+bsrAudit.points.length+' 个有效点，未达到 14 点拐点检测门槛；当前降级使用流量判断。'+lead;
    else if(bsrHit)lead='检测到可信 BSR 拐点 '+bsrHit.date+'：'+fmt(bsrHit.from,0)+' → '+fmt(bsrHit.to,0)+'，改善 '+bsrHit.magnitude.toFixed(1)+'×，'+(bsrHit.sustained?'持续至少 14 天':'尚未通过 14 天持续性验证')+'，置信度 '+bsrHit.confidence+'。'+lead;
    else lead='BSR 有 '+bsrAudit.points.length+' 个有效点，但没有达到 1.4× 的可信爆发；'+lead;
    const conclusion=[
      '- 窗口 **'+winLabel+'**，日流量点 '+scored.length+' 个，窗口 '+winState+(sl.change===null?'。':'（两端 '+signed(sl.change)+'）。')+' 来源：get_asin_traffic_trends。',
      '- 爆单判断：**'+verdict+'**。≥30% 或从 0 起量才叫单日爆单；15%–30% 只记有起量。最大一跳 '+jumpTxt+(whichSide(focus)?'，'+whichSide(focus):'')+'。流量得分不是订单。',
      '- 对齐日 '+(focus?focus.day+' ±1 天':'未定')+'：新广告 '+adHit.length+'，改版 '+listHit.length+'，价格动作 '+priceHit.length+'。整窗广告 '+ev.ads.length+'、改版 '+ev.listing.length+'、价格动作 '+ev.price.length+'。来源：get_asin_ad_change_trends、get_asin_info_change_trends、get_asin_info_trends。',
      '- 日级词：可比日期 '+termDays.length+' 个。对齐日新增 '+added.length+'，相对前一日掉出 '+dropped.length+'。来源：get_asin_keywords_daily。',
      '- **'+cause+'**。相关不等于因果，要用对照期再验。'
    ];
    conclusion.unshift('- BSR 检测：'+(bsrHit?('**'+bsrHit.date+'，'+bsrHit.magnitude.toFixed(1)+'×，置信度 '+bsrHit.confidence+'**。'):(bsrAudit.status==='insufficient'?('有效点 '+bsrAudit.points.length+'/14，降级分析。'):'没有通过 1.4× 门槛的可信拐点。'))+' 排除伪爆发 '+bsrAudit.excluded.length+' 个。来源：get_asin_bsr_trends。');
    const charts=[];
    if(scored.length>1)charts.push({title:'日流量得分（自然+广告）',source:'get_asin_traffic_trends',kind:'line',points:scored.map(p=>({label:p.label,value:p.value})),ratio:0,note:'用于找跳升日，不是订单。'});
    if(bsrAudit.points.length>1)charts.unshift({title:'BSR 拐点检测',source:'get_asin_bsr_trends',kind:'line',points:bsrAudit.points.map(p=>({label:p.date,value:p.value})),ratio:0,note:'BSR 越低越好；使用 7 日因果平滑判断，图中显示原始值。'});
    if(orgPts.length>1&&adsPts.length>1)charts.push({title:'日广告流量得分',source:'get_asin_traffic_trends',kind:'line',points:adsPts,ratio:0,note:'和合计线对照，看跳升是不是广告托起来的。'});
    const actPts=[{label:'新广告',value:ev.ads.length},{label:'改版',value:ev.listing.length},{label:'价格动作',value:ev.price.length}].filter(p=>p.value);
    if(actPts.length)charts.push({title:'窗口动作条数',source:'广告/改版/价格接口',kind:'bar',points:actPts,ratio:0,note:'条数不是影响幅度。'});
    const tables=[
      {title:'溯源计算过程',headers:['检查项','算法','结果'],rows:[
        ['窗口',winLabel+'，日点 '+scored.length,winState],
        ['爆单门槛','相邻日合计流量得分 ≥30% 或从 0 起量',verdict],
        ['最大一跳',focus?(fmt(focus.from,0)+' → '+fmt(focus.to,0)):'没有相邻日',jumpTxt],
        ['对齐窗口',focus?focus.day+' ±1 天':'未定',(adHit.length+listHit.length+priceHit.length)+' 条动作'],
        ['主因规则','只在单侧证据时下判断，双侧记不能拆开',cause],
        ['词变化',prevDay?('相对 '+prevDay):'没有前一日词表',added.length+' 增 / '+dropped.length+' 掉']
      ],note:'相关不等于因果。流量得分不是订单。'}
    ];
    if(ranked.length)tables.push({title:'最大跳升候选',headers:['日期','幅度','从','到','级别'],rows:ranked.slice(0,8).map(j=>[j.day,j.jump===null?'从0起量':((j.jump>=0?'+':'')+(j.jump*100).toFixed(0)+'%'),fmt(j.from,0),fmt(j.to,0),j.kind==='hard'?'爆单':j.kind==='fromZero'?'从零':j.kind==='soft'?'起量':'普通']),note:'按涨幅排序。没有 ≥30% 不等于窗口无事发生。'});
    if(ev.all.length)tables.push({title:'窗口动作时间轴',headers:['日期','类型','内容','是否对齐'],rows:ev.all.slice(0,30).map(e=>[e.day,e.kind,e.what||'—',focusDays.includes(e.day)?'对齐日±1':'窗口内']),note:'价格动作门槛：相邻日 |Δ|≥5%。'});
    if(added.length||dropped.length)tables.push({title:'对齐日词变化',headers:['变化','词'],rows:added.slice(0,10).map(t=>['新增',t]).concat(dropped.slice(0,10).map(t=>['掉出',t])),note:'只比较对齐日和最近前一日，不是全窗口。'});
    tables.unshift({title:'爆发真实性与归因矩阵',headers:['假设','结论','归因权重','证据'],rows:hypotheses.map(h=>[h.name,h.status,h.status==='支持'?h.share+'%':'—',h.evidence]).concat(bsrAudit.excluded.map(x=>['变体/评论跳变','已排除','—',x.date+'：'+x.reason])),note:'权重只在本次有支持证据的假设间归一化；时序相关不等于因果。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'窗口判断',value:verdict},
      {label:'分析模式',value:bsrAudit.status==='insufficient'?'流量降级':'BSR归因'},
      {label:'可信拐点',value:bsrHit?bsrHit.date:'未检出'},
      {label:'BSR改善',value:bsrHit?bsrHit.magnitude.toFixed(1)+'×':'—'},
      {label:'置信度',value:bsrHit?bsrHit.confidence:(anchorDay?'低':'未定')}
    ],charts,tables,process:[
      '**步骤 1 · 检测 BSR 拐点**','- 至少 14 个有效点；用 7 日后向平滑、3–7 日异常窗口和 1.4× 改善门槛，避免用单日噪声定爆发。',
      '**步骤 2 · 排除伪爆发**','- 评论倍数跳变或变体数量变化命中拐点窗口时排除。只有当前变体列表而没有历史时，明确写无法验证。',
      '**步骤 3 · 验证持续性**','- 拐点后 14 天 BSR 仍低于起点 70% 才记持续；否则降低置信度。',
      '**步骤 4 · 对齐驱动**','- 在拐点前后 3 天核对广告、日级词、Listing 和 ≥5% 降价，分别写支持、不支持或无法验证。',
      '**步骤 5 · 归一权重**','- 只对有支持证据的驱动分配相对权重；没有支持证据时不硬给主因。'
    ],extra:'### 判断口径\n- BSR 改善 ≥1.4× 才进入爆发候选。\n- 流量单日 ≥30% 或从 0 起量只作为辅助证据。\n- 归因权重是本地规则分配，不是平台字段。\n- 相关不等于因果。',boundary:'BSR 跨类目不可直接比较。当前西柚数据若没有类目节点、断货与历史变体字段，对换类目、OOS恢复和父子体合并只能写无法验证。广告变更是新增观测，不代表完整花费或停投记录。'});
  }

  function variantReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const self=String((form&&form.asin)||'').toUpperCase();
    const children=flattenVariations(steps);
    const varOk=(steps||[]).some(s=>s.tool==='get_asin_variations'&&s.status==='ok');
    const parentKw=(u.stepRows(steps,'get_parent_asin_keywords')||[]).map(parentKwView).filter(k=>k.term);
    const cmp=u.stepRows(steps,'get_multi_asin_keyword_comparison');
    const byChild={};
    function addCover(asin,term,volume){
      if(!asin)return;
      if(!byChild[asin])byChild[asin]={asin,terms:0,volume:0,words:[]};
      byChild[asin].terms++;
      byChild[asin].volume+=(volume||0);
      if(term&&byChild[asin].words.length<8)byChild[asin].words.push(term);
    }
    cmp.forEach(r=>{
      const term=u.readable(r.searchTerm||r.keyword);
      const asin=String(u.readable(r.asin||r.primaryAsin||r.childAsin||'')).toUpperCase();
      if(!/^[A-Z0-9]{10}$/.test(asin))return;
      addCover(asin,term,u.scalar(r.searchVolume||r.organicTrafficScore)||0);
    });
    const cmpUsed=Object.keys(byChild).length>0;
    if(!cmpUsed){
      parentKw.forEach(k=>addCover(k.child,k.term,k.volume||0));
    }
    const ranked=Object.values(byChild).sort((a,b)=>b.terms-a.terms||b.volume-a.volume);
    const main=ranked.length>1?ranked[0]:(ranked.length===1&&ranked[0].asin!==self?ranked[0]:null);
    const split=ranked.length>=2;
    const coverSrc=cmpUsed?'多 ASIN 词对比':(ranked.length?'父体反查里的子体字段':'未拆到子体');
    let lead;
    if(children.length&&main){
      lead='共 '+children.length+' 个子体。词覆盖最集中的是 '+main.asin+'（'+main.terms+' 个词'+(main.volume?('，流量/搜索量合计 '+fmt(main.volume,0)):'')+'），更像主推款。来源：'+coverSrc+'。记录数不是走量款。';
    } else if(children.length){
      lead='拆出 '+children.length+' 个子体，但词还没按子体分开，不能判定主推。父体近 7 天吃了 '+parentKw.length+' 个词。把这些子体重新跑一遍对比，或看下面的父体吃词表。';
    } else if(parentKw.length){
      lead='变体接口没有拆出子体列表（字符串 ASIN 现在会读；若仍是 0，就是单 ASIN 或字段对不上）。父体近 7 天仍吃了 '+parentKw.length+' 个词，先当这份 Listing 的吃词底稿，不写成“没数据”。主推子体还不能定。';
    } else {
      lead='变体列表和父体词都没有可展示的行。先确认主 ASIN 是否父体；单 ASIN 没有子体是结果，不是失败。';
    }
    const conclusion=[
      '- 子体 **'+children.length+'** 个'+(varOk?'（变体步骤已成功）':'（变体步骤未成功）')+'。记录数不是走量款。来源：get_asin_variations，必要时用父体词上的子体 ASIN 补。',
      '- 父体反查词 **'+parentKw.length+'** 个，其中标明子体的 '+parentKw.filter(k=>k.child).length+' 个。来源：get_parent_asin_keywords。',
      '- '+(main?('主推候选 **'+main.asin+'**，词覆盖 '+main.terms+'。其余更像占位。来源：'+coverSrc+'。'):(split?'有多个子体但覆盖一样，还不能定主推。':(children.length?'只有子体名单，没有按子体拆开的词，不能定主推。':'没有子体名单，不能定主推。')))+' 词覆盖不是销量。',
      '- 多 ASIN 对比 '+(cmpUsed?'已按子体汇总。':'没有按 ASIN 拆开。下次运行会把子体自动灌进对比，不必先手工填对比 ASIN。')
    ];
    const charts=[];
    if(ranked.length>1)charts.push({title:'子体词覆盖数',source:cmpUsed?'get_multi_asin_keyword_comparison':'get_parent_asin_keywords',kind:'bar',points:ranked.slice(0,10).map(c=>({label:c.asin,value:c.terms})),ratio:0,note:'覆盖数不是销量。'});
    const volPts=parentKw.filter(k=>k.volume!==null).sort((a,b)=>b.volume-a.volume).slice(0,10).map(k=>({label:k.term,value:k.volume}));
    if(volPts.length)charts.push({title:'父体吃词（搜索量/自然得分）',source:'get_parent_asin_keywords',kind:'bar',points:volPts,ratio:0,note:'父体词，不一定拆到某个子体。'});
    const tables=[];
    if(children.length)tables.push({title:'变体矩阵',headers:['子体 ASIN','属性','价格','词覆盖','样例词'],rows:children.slice(0,20).map(c=>{const hit=byChild[c.asin];return [c.asin,c.attr||'—',c.price===null?'—':'$'+fmt(c.price,0),hit?String(hit.terms):'—',hit&&hit.words.length?hit.words.slice(0,3).join('、'):'—'];}),note:'记录数不是走量款。词覆盖不是销量。'});
    if(parentKw.length)tables.push({title:'父体吃词表',headers:['词','子体','搜索量/得分','自然位'],rows:parentKw.slice().sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,20).map(k=>[k.term,k.child||'未拆到子体',k.volume===null?'—':fmt(k.volume,0),k.rank===null?'—':fmt(k.rank,0)]),note:'这 20 个词是父体近 7 天反查，不是类目大盘词。'});
    tables.push({title:'矩阵计算过程',headers:['指标','算法','结果'],rows:[
      ['子体名单','读 children / childAsins，包括字符串 ASIN；再用父体词上的子体补',children.length?children.map(c=>c.asin).join('、'):'未拆出'],
      ['父体词', 'get_parent_asin_keywords 去重前行数', String(parentKw.length)],
      ['覆盖来源', cmpUsed?'多 ASIN 对比按 ASIN 计数':'父体词按 childAsin 计数', coverSrc],
      ['主推', '词覆盖最多且至少能和另一个子体/父体区分', main?main.asin:'未定']
    ],note:'没有子体时先看吃词表，不要整页停写。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'子体',value:children.length?String(children.length):(varOk?'单ASIN/未拆出':'未提供')},
      {label:'父体词',value:String(parentKw.length)},
      {label:'主推候选',value:main?main.asin:'未定'},
      {label:'覆盖来源',value:coverSrc}
    ],charts,tables,process:[
      '**步骤 1 · 子体清单**','- 变体接口读 children / childAsins，字符串 ASIN 也算。找不到再用父体词上的子体 ASIN。记录数不是走量款。',
      '**步骤 2 · 父体吃词**','- 父体近 7 天反查词先成表。没有子体也不能把这页写成空。',
      '**步骤 3 · 按子体计覆盖**','- 优先用多 ASIN 对比；没有对比时，用父体词上的 childAsin。词最多的当主推候选。',
      '**步骤 4 · 自动灌对比**','- 下次运行会把子体自动放进对比 ASIN，不必先手工填一遍。',
      '**步骤 5 · 边界**','- 只有一个 ASIN、或词没拆到子体时，不能定主推。词覆盖不是销量。'
    ],extra:'### 判断口径\n- 主推看词覆盖集中度，不是价格最低。\n- 父体词是近 7 天反查，不是类目大盘。\n- 单 ASIN 无子体是结果，不是失败。',boundary:'变体接口字段名不统一；字符串 ASIN 现在会读。没有按子体拆开的词时，不能指定主推款。词覆盖不是订单。'});
  }

  function changeReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    function validDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'');}
    function dayOf(r){const d=String(dateOf(r)).slice(0,10);return validDay(d)?d:'';}
    function mondayOf(day){
      const d=new Date(day+'T00:00:00Z');
      const wd=d.getUTCDay();
      d.setUTCDate(d.getUTCDate()-(wd===0?6:wd-1));
      return d.toISOString().slice(0,10);
    }
    function spanOf(from,to){
      if(!validDay(from)||!validDay(to))return null;
      return Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/864e5)+1;
    }
    const listing=u.stepRows(steps,'get_asin_info_change_trends').filter(r=>r&&typeof r==='object').map(r=>{
      const field=String(u.readable(r.field||r.changeType||r.name||r.title||'')).toLowerCase();
      const kind=/image|main.?image|主图|图片/.test(field)?'主图':/title|标题/.test(field)?'标题':/bullet|五点|描述|desc/.test(field)?'文案':'Listing';
      return {day:dayOf(r),family:'listing',kind,what:u.readable(r.field||r.changeType||r.name||r.title||'Listing'),before:u.readable(r.before||r.oldValue||r.previous),after:u.readable(r.after||r.newValue||r.current)};
    }).filter(x=>x.day);
    const info=u.stepRows(steps,'get_asin_info_trends').filter(r=>r&&typeof r==='object').map(r=>({day:dayOf(r),price:u.scalar(r.price||r.listingPrice||r.dealPrice||r.promoPrice)})).filter(x=>x.day).sort((a,b)=>a.day.localeCompare(b.day));
    const priceEvents=[];
    for(let i=1;i<info.length;i++){
      const prev=info[i-1],cur=info[i];
      if(prev.price===null||cur.price===null||!Math.abs(prev.price))continue;
      const ch=(cur.price-prev.price)/Math.abs(prev.price);
      if(Math.abs(ch)<0.05)continue;
      priceEvents.push({day:cur.day,family:'price',kind:ch<=-0.05?'降价':'提价',what:'价格',before:fmt(prev.price,0),after:fmt(cur.price,0),change:ch});
    }
    const ads=u.stepRows(steps,'get_asin_ad_change_trends').filter(r=>r&&typeof r==='object').map(r=>({day:dayOf(r),family:'ad',kind:'新广告',what:u.readable(r.name||r.campaignName||r.adType||'广告活动'),before:'',after:u.readable(r.adType||r.type||'')})).filter(x=>x.day);
    const events=[...listing,...priceEvents,...ads].sort((a,b)=>a.day.localeCompare(b.day)||a.family.localeCompare(b.family));
    const formFrom=form&&validDay(form.dateFrom)?form.dateFrom:'';
    const formTo=form&&validDay(form.dateTo)?form.dateTo:'';
    const eventDays=events.map(x=>x.day);
    const winFrom=formFrom||eventDays[0]||'';
    const winTo=formTo||eventDays[eventDays.length-1]||'';
    const spanDays=spanOf(winFrom,winTo);
    const horizon=spanDays===null?'窗口未知':spanDays>=90?'长期观察':spanDays>=60?'中期观察':'近期观察';
    const useMonth=spanDays!==null&&spanDays>=60;
    function bucketOf(day){return useMonth?day.slice(0,7):mondayOf(day);}
    const bucketMap={};
    events.forEach(e=>{
      const key=bucketOf(e.day);
      if(!bucketMap[key])bucketMap[key]={key,listing:0,ads:0,cut:0,up:0};
      if(e.family==='listing')bucketMap[key].listing++;
      else if(e.family==='ad')bucketMap[key].ads++;
      else if(e.kind==='降价')bucketMap[key].cut++;
      else if(e.kind==='提价')bucketMap[key].up++;
    });
    const buckets=Object.keys(bucketMap).sort().map(k=>bucketMap[k]);
    const promoN=buckets.filter(b=>b.cut&&b.ads).length;
    const listingN=buckets.filter(b=>b.listing).length;
    const adN=buckets.filter(b=>b.ads).length;
    const cutN=buckets.filter(b=>b.cut).length;
    const upN=buckets.filter(b=>b.up).length;
    let playbook='窗口内没有可识别策略动作';
    if(promoN>=2)playbook='反复促销冲量';
    else if(listingN>=3)playbook='持续测 Listing';
    else if(adN>=3&&promoN<2)playbook='持续加投';
    else if(cutN>=2&&adN<2)playbook='反复价格试探';
    else if(upN>=2&&!cutN)playbook='窗口内多次提价';
    else if(promoN===1)playbook='近期一次促销冲量';
    else if(listing.length>=3)playbook='窗口内连续改 Listing，更像测标题/主图';
    else if(ads.length&&!listing.length&&!priceEvents.length)playbook='窗口内只动广告';
    else if(priceEvents.length===1&&!ads.length)playbook=priceEvents[0].kind==='降价'?'窗口内一次价格试探':'窗口内一次提价';
    else if(events.length)playbook='有零散变更，尚未形成可重复打法';
    const shortWin=spanDays!==null&&spanDays<60;
    const archive=shortWin?playbook+'。窗口不足 60 天，只能当近期节奏，不能当长期档案':playbook;
    let next='下一周期用同一 ASIN 再拉一遍，对照有没有重复动作';
    if(shortWin)next='把起始日往前拉到至少 90 天，再跑一遍才能当长期档案';
    else if(playbook.indexOf('促销冲量')>=0)next='下周期看降价+开广告会不会再来，以及降完有没有回价';
    else if(playbook.indexOf('Listing')>=0)next='把每次标题/主图方向记进档案，不要当天抄';
    else if(playbook.indexOf('加投')>=0)next='记下新广告类型和间隔，下周期对照是不是固定节奏';
    else if(playbook.indexOf('价格')>=0)next='下周期对照它会不会再调价，以及有没有配广告';
    else if(playbook.indexOf('没有')>=0)next='下周期用同一区间对照，确认是真安静还是漏观测';
    const uniqueDays=[...new Set(eventDays)].sort();
    let cadence=null;
    if(uniqueDays.length>=2){
      const gaps=[];
      for(let i=1;i<uniqueDays.length;i++)gaps.push(spanOf(uniqueDays[i-1],uniqueDays[i])-1);
      const mid=gaps.slice().sort((a,b)=>a-b)[Math.floor((gaps.length-1)/2)];
      cadence=mid;
    }
    const priceSeries=info.filter(r=>r.price!==null).map(r=>({label:r.day,value:r.price,date:r.day}));
    const priceSl=slope(priceSeries);
    const lead=events.length
      ?((winFrom&&winTo?winFrom+' ~ '+winTo+'（'+horizon+(spanDays!==null?' '+spanDays+' 天':'')+'）':'本窗口')+'识别 **'+events.length+'** 条策略动作：改 Listing '+listing.length+'，价格动作 '+priceEvents.length+'，新广告 '+ads.length+'。打法结论：**'+archive+'**。下一周期：'+next+'。')
      :((winFrom&&winTo?winFrom+' ~ '+winTo+' ':'')+'窗口内没有可识别的 Listing、价格或广告动作，不能汇总打法。'+(shortWin?'先把区间拉到 90 天再看。':''));
    const conclusion=[
      '- 观察窗口：'+(winFrom&&winTo?winFrom+' ~ '+winTo:'未提供')+'，**'+horizon+'**'+(spanDays===null?'。':'，'+spanDays+' 天。')+' 建议周期回看，日期跨度 ≥90 天才当长期档案。本场景不输出当天跟不跟。',
      '- 策略动作 **'+events.length+'** 条：Listing '+listing.length+'，价格动作 '+priceEvents.length+'（相邻日 |Δ|≥5% 才记），新广告 '+ads.length+'。有动作的 '+(useMonth?'月':'周')+' '+buckets.length+' 段。动作间隔中位 '+(cadence===null?'不足':cadence+' 天')+'。来源：get_asin_info_change_trends、get_asin_info_trends、get_asin_ad_change_trends。',
      '- 价格序列 '+priceSl.dir+(priceSl.change===null?'。':'（窗口两端 '+signed(priceSl.change)+'）。')+' 日快照 '+info.length+' 条只用来找价格动作，评分变化不计入打法。',
      '- 打法结论：**'+archive+'**。促销冲量段 '+promoN+'，改 Listing 段 '+listingN+'，加投段 '+adN+'。反复/持续要跨至少 2 个'+(useMonth?'月':'周')+'。',
      '- 下一周期：**'+next+'**。本链路没有流量和订单，不能声称这些动作带来了销量。'
    ];
    const typePts=[{label:'改 Listing',value:listing.length},{label:'价格动作',value:priceEvents.length},{label:'新广告',value:ads.length}].filter(p=>p.value);
    const periodPts=buckets.map(b=>({label:b.key,value:b.listing+b.ads+b.cut+b.up})).filter(p=>p.value);
    const charts=[];
    if(priceSeries.length>1)charts.push({title:'窗口内价格',source:'get_asin_info_trends',kind:'line',points:priceSeries,ratio:0,note:'日快照，不是每一次都算策略动作。'});
    if(periodPts.length)charts.push({title:(useMonth?'月':'周')+'策略动作次数',source:'三类变更接口',kind:'bar',points:periodPts,ratio:0,note:'只统计识别出的策略动作，不是影响幅度。'});
    if(typePts.length)charts.push({title:'动作类型计数',source:'get_asin_info_change_trends、get_asin_info_trends、get_asin_ad_change_trends',kind:'bar',points:typePts,ratio:0,note:'条数不是影响幅度。'});
    const periodRows=buckets.map(b=>[b.key,String(b.listing),String(b.cut),String(b.up),String(b.ads),b.cut&&b.ads?'促销冲量':(b.listing?'测 Listing':(b.ads?'加投':(b.cut||b.up?'调价':'安静')))]);
    const axis=events.slice(0,40).map(r=>[r.day,r.kind,r.what||'—',r.before||'—',r.after||'—']);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'观察跨度',value:spanDays===null?'—':spanDays+' 天'},{label:'打法结论',value:playbook.slice(0,8)},{label:'策略动作',value:String(events.length)},{label:'下一周期',value:shortWin?'拉到90天':(playbook.indexOf('促销')>=0?'看会否再降':playbook.indexOf('没有')>=0?'对照安静':'继续回看')}
    ],tables:[
      {title:'改版监控计算过程',headers:['指标','算法','结果'],rows:[
        ['观察窗口',(winFrom&&winTo?winFrom+' ~ '+winTo:'未提供')+'；≥90 天=长期，≥60 天按月汇总，否则按周',horizon],
        ['价格动作','info_trends 相邻日 |Δ|≥5%，不把每日快照都算进去',String(priceEvents.length)],
        ['反复促销','有降价且有新广告的 '+(useMonth?'月':'周')+' ≥2',promoN>=2?'是 '+promoN:'否 '+promoN],
        ['打法结论','先看跨段反复，再看单次冲量/测 Listing/加投',archive],
        ['下一周期','周期档案，不是当天跟不跟',next]
      ],note:'未观测到不等于没有改。条数不是影响幅度。'},
      ...(periodRows.length?[{title:'周期动作汇总',headers:[useMonth?'月份':'周起始（周一）','改 Listing','降价','提价','新广告','该段判断'],rows:periodRows,note:'同一段里降价+新广告记促销冲量。'}]:[]),
      ...(axis.length?[{title:'动作时间轴',headers:['日期','类型','项目','变更前','变更后'],rows:axis,note:'最多 40 条。同日多项不能拆单一因果。'}]:[])
    ],charts,process:[
      '**步骤 1 · 划观察窗口**','- 用填写的起始日到结束日当一期档案。≥90 天才能下长期打法；不足 60 天只写近期节奏。',
      '**步骤 2 · 三类动作入账**','- Listing 变更、新广告各记一条。价格只在相邻日涨跌 ≥5% 时记动作，日快照和评分变化不算打法。',
      '**步骤 3 · 按周期汇总**','- 窗口 ≥60 天按月，否则按周（周一起始）。每一段分别数改 Listing、降价、提价、新广告。',
      '**步骤 4 · 汇总打法**','- 至少 2 段同时降价+开广告 = 反复促销冲量；至少 3 段改 Listing = 持续测 Listing；至少 3 段只加广告 = 持续加投。只有 1 段冲量就写近期一次，不当长期打法。',
      '**步骤 5 · 下一周期**','- 结论是它在用什么节奏，以及下一次回看盯什么。不是当天跟不跟。本链路没有流量和订单，不能归因销量。'
    ],extra:'### 判断口径\n- 价格动作门槛：相邻日 |Δ|≥5%。\n- 反复/持续必须跨至少 2 个周或月。\n- 本场景是周期档案，不输出跟不跟。',boundary:'变更接口是西柚观测到的前后记录，不是卖家后台操作日志。未观测到不等于没有改。窗口短只能看近期节奏。没有流量和订单，不能声称动作带来了销量。'});
  }

  function bsrValue(r){
    const u=U();
    const direct=u.scalar(r.bsr??r.rank??r.totalRank??r.categoryRank??r.bsrRank);
    if(direct!==null)return direct;
    const list=Array.isArray(r.ranks)?r.ranks:[];
    for(const x of list){
      const n=u.scalar(x&&(x.bsr??x.rank??x.totalRank??x.categoryRank));
      if(n!==null)return n;
    }
    return null;
  }
  function bsrSeriesByCat(rows){
    const u=U();
    const by={};
    (rows||[]).forEach((r,i)=>{
      const v=bsrValue(r);
      if(v===null)return;
      const cat=u.readable(r.categoryName||r.category||r.nodeLabel||r.titlePath||'')||'BSR';
      const d=dateOf(r);
      if(!by[cat])by[cat]=[];
      by[cat].push({label:d||('第 '+(i+1)+' 期'),value:v,date:d});
    });
    Object.keys(by).forEach(k=>by[k].sort((a,b)=>String(a.date||a.label).localeCompare(String(b.date||b.label))));
    const key=Object.keys(by).sort((a,b)=>by[b].length-by[a].length)[0];
    return {cat:key||'',points:key?by[key]:[],by};
  }
  function trendReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const orderRows=u.stepRows(steps,'get_asin_order_trends');
    const orders=series(orderRows,r=>u.scalar(r.orders??r.orderCount??r.sales??r.estimatedOrders??(r.metrics&&(r.metrics.orders||r.metrics.sales))));
    const last30=pickOrderCount(steps);
    const bsrPack=bsrSeriesByCat(u.stepRows(steps,'get_asin_bsr_trends'));
    const bsr=bsrPack.points;
    const monthRows=u.stepRows(steps,'get_asin_traffic_trends_monthly');
    const traf=series(monthRows,r=>pickKwTraffic(r,'organic'));
    const ads=series(monthRows,r=>pickKwTraffic(r,'ads'));
    const os=slope(orders),ts=slope(traf),as=slope(ads);
    const rankBetter=bsr.length>=2&&bsr[bsr.length-1].value<bsr[0].value;
    const rankDir=bsr.length<2?'点不足，不能比方向':(bsr[bsr.length-1].value===bsr[0].value?'名次走平':(rankBetter?'名次靠前':'名次退后'));
    const canTrend=orders.length>=2;
    const state=canTrend?(os.dir==='上升'?'爬坡':os.dir==='下降'?'掉队':os.dir==='走平'?'走平':os.dir):'不能定趋势';
    let driver='月线不够，先不写驱动';
    if(canTrend){
      if(ts.dir==='没有可比点'||ts.dir==='仅 1 个点')driver=as.dir==='没有可比点'||as.dir==='仅 1 个点'?'流量月线点太少，驱动未定':(as.dir===os.dir?'更像广告在托':'广告月线与销量方向不一致');
      else if(os.dir===ts.dir)driver='自然流量与销量同向';
      else if(ads.length>=2&&as.dir===os.dir)driver='更像广告在托';
      else driver='销量与流量方向不一致';
    }
    const winFrom=(form&&form.dateFrom)||'';
    const winTo=(form&&form.dateTo)||'';
    const winLabel=(winFrom&&winTo)?winFrom+' ~ '+winTo:'本窗口';
    const latestOrder=orders.length?orders[orders.length-1]:null;
    const latestTxt=latestOrder?(latestOrder.label+' 推算订单 '+fmt(latestOrder.value,0)):(last30===null?'近月订单未提供':('近 30 天推算订单 '+fmt(last30,0)));
    let lead;
    if(!orders.length&&last30===null&&bsr.length<2&&traf.length<2){
      lead=winLabel+' 没有月订单、近 30 天订单和可比 BSR，不能判断爬坡还是掉队。';
    } else if(!canTrend){
      lead=winLabel+' 的月订单只有 '+(latestOrder?latestOrder.label:'1 个月')+' **一个点**'+(latestOrder?'（'+fmt(latestOrder.value,0)+'）':'')+'。这是短窗口的预期结果，不能判断爬坡或掉队。'+(last30!==null?'近 30 天推算订单 '+fmt(last30,0)+'。':'')+(bsr.length>=2?'BSR（'+(bsrPack.cat||'主类目')+'）窗口内 '+rankDir+'。':'BSR 也不足以比方向。')+' 把起始日提前到 6 个月前重新运行，月订单和流量会自动补满。';
    } else {
      lead='月订单 '+os.first.label+' 至 '+os.last.label+' 为 **'+state+'**'+(os.change!==null?'（'+signed(os.change)+'）':'')+'。'+driver+'。BSR '+rankDir+'。';
    }
    const conclusion=[
      '- 订单：**'+state+'**。'+(canTrend?(os.first.label+' 到 '+os.last.label+(os.change===null?'。':' '+signed(os.change)+'。')):('只有 '+(orders.length||0)+' 个月点，'+latestTxt+'。不下爬坡/掉队。'))+' 推算订单不是后台实单。来源：get_asin_order_trends'+(last30!==null?'、get_asin_orders_last_30_days':'')+'。',
      '- BSR '+(bsrPack.cat?('类目 '+bsrPack.cat+'，'):'')+bsr.length+' 点，**'+rankDir+'**（数值下降=位次靠前）。来源：get_asin_bsr_trends。',
      '- 月自然流量 '+ts.dir+'，月广告流量 '+as.dir+'。驱动：'+driver+'。来源：get_asin_traffic_trends_monthly。',
      '- '+(canTrend?'连续月份才能看拐点，单月跳一下不算趋势。':'表单不到两个整月时，月线接口以前只回 1 个点；下次会自动往前补 6 个月。')
    ];
    const charts=[];
    if(orders.length>1)charts.push({title:'月订单量',source:'get_asin_order_trends',kind:'line',points:orders,ratio:0,note:'接口推算订单，不是后台实单。'});
    else if(orders.length===1)charts.push({title:'近月推算订单',source:'get_asin_order_trends',kind:'bar',points:orders,ratio:0,note:'只有 1 个月，不能画趋势。'});
    if(last30!==null)charts.push({title:'近 30 天推算订单',source:'get_asin_orders_last_30_days',kind:'bar',points:[{label:'近30天',value:last30}],ratio:0,note:'当前量级，不是月趋势。'});
    if(bsr.length>1)charts.push({title:'BSR'+(bsrPack.cat?' · '+bsrPack.cat:''),source:'get_asin_bsr_trends',kind:'line',points:bsr,ratio:0,note:'数值越小位次越靠前。'});
    if(traf.length>1)charts.push({title:'月自然流量得分',source:'get_asin_traffic_trends_monthly',kind:'line',points:traf,ratio:0,note:'相对得分。'});
    if(ads.length>1)charts.push({title:'月广告流量得分',source:'get_asin_traffic_trends_monthly',kind:'line',points:ads,ratio:0,note:'相对得分。'});
    const tables=[{title:'走势计算过程',headers:['指标','算法','结果'],rows:[
      ['表单窗口',winLabel,canTrend?'够比月线':'不到两个整月，不能定趋势'],
      ['月订单点',String(orders.length)+(latestOrder?('，最新 '+latestOrder.label+' = '+fmt(latestOrder.value,0)):''),state],
      ['近 30 天',last30===null?'未取到':fmt(last30,0),'只看量级'],
      ['BSR',(bsrPack.cat||'未标明类目')+' · '+bsr.length+' 点',rankDir],
      ['驱动','至少 2 个月订单，再比自然/广告月线是否同向',driver]
    ],note:'推算订单不是实际订单。±5% 走平。BSR 越小越靠前。'}];
    if(orders.length)tables.push({title:'月订单点',headers:['月份','推算订单'],rows:orders.map(p=>[p.label,fmt(p.value,0)]),note:'缺月不补零。'});
    const bsrNow=bsrLatestByCat(u.stepRows(steps,'get_asin_bsr_trends'));
    if(bsrNow.length)tables.push({title:'BSR 最新位次',headers:['类目','排名','日期'],rows:bsrNow.slice(0,8).map(x=>[x.cat,fmt(x.value,0),x.date||'—']),note:'数值越小位次越靠前。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'订单状态',value:state},
      {label:'近月订单',value:latestOrder?fmt(latestOrder.value,0):(last30===null?'未提供':fmt(last30,0))},
      {label:'BSR',value:bsr.length<2?'点不足':(rankBetter?'靠前':(bsr[bsr.length-1].value===bsr[0].value?'走平':'退后'))},
      {label:'下一步',value:canTrend?'继续观察':'拉到6个月'}
    ],charts,tables,process:[
      '**步骤 1 · 先看窗口**','- 表单不到两个整月时，月订单只会出现 1 个点。这是窗口问题，不是没有销量。先写下近月量级，不下爬坡/掉队。',
      '**步骤 2 · 月订单方向**','- 至少 2 个月才能比。首尾 >5% 爬坡，<-5% 掉队，中间走平。推算订单不是实单。',
      '**步骤 3 · BSR**','- 日线在短窗口也能看方向。数值下降=位次靠前。多类目时取点数最多的一条。',
      '**步骤 4 · 驱动**','- 有月线后再比自然/广告是否与销量同向。点不够就写驱动未定。',
      '**步骤 5 · 补窗口**','- 起始日提前到 6 个月前再跑。订单和流量月线会自动往前补，不要用 30 天窗口判断趋势。'
    ],extra:'### 判断口径\n- ±5% 走平带。\n- 1 个月点不能定趋势。\n- BSR 越小越靠前。\n- 推算订单不是实际订单。',boundary:'短窗口的 1 个点不是失败。没有 6 个月月线，不能下爬坡或掉队，也不能把 BSR 日波动写成趋势拐点。'});
  }

  function snapshotReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    function validDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'');}
    function stepAsin(st){
      if(st&&st.targetAsin)return String(st.targetAsin).toUpperCase();
      const a=st&&st.args&&(st.args.asin||st.args.product_asin);
      if(Array.isArray(a)&&a.length===1)return String(a[0]).toUpperCase();
      if(typeof a==='string'&&/^[A-Z0-9]{10}$/i.test(a))return a.toUpperCase();
      return '';
    }
    function allRows(tool){
      return (steps||[]).filter(s=>s.tool===tool&&s.status==='ok').flatMap(s=>{
        const tagged=stepAsin(s);
        return u.stepRows([s],tool).filter(r=>r&&typeof r==='object').map(r=>Object.assign({},r,{_stepAsin:tagged}));
      });
    }
    function rowAsin(r){
      const a=u.readable(r.asin||r.primaryAsin||(r.asinInfo&&(r.asinInfo.asin||r.asinInfo.primaryAsin))||r._stepAsin);
      return /^[A-Z0-9]{10}$/i.test(a)?a.toUpperCase():'';
    }
    const main=String((form&&form.asin)||'').toUpperCase();
    const roster=[];
    function addAsin(v){const a=String(v||'').toUpperCase();if(/^[A-Z0-9]{10}$/.test(a)&&roster.indexOf(a)<0)roster.push(a);}
    asinsOf(form).forEach(addAsin);
    allRows('get_asin_info').forEach(r=>addAsin(rowAsin(r)));
    allRows('get_asin_orders_last_30_days').forEach(r=>addAsin(rowAsin(r)));
    allRows('get_asin_traffic').forEach(r=>addAsin(rowAsin(r)));
    (steps||[]).forEach(s=>addAsin(s&&s.targetAsin));
    const formFrom=form&&validDay(form.dateFrom)?form.dateFrom:'';
    const formTo=form&&validDay(form.dateTo)?form.dateTo:'';
    const span=formFrom&&formTo?Math.round((Date.parse(formTo+'T00:00:00Z')-Date.parse(formFrom+'T00:00:00Z'))/864e5)+1:null;
    const horizon=span===null?'窗口未知':span>=30?'月度对照':span>=7?'周期对照':'当日快照';
    const infoMap={};
    allRows('get_asin_info').forEach(r=>{
      const a=rowAsin(r);if(!a)return;
      const v=infoView(r);
      infoMap[a]={asin:a,title:v.title,brand:v.brand,price:v.price,stars:v.stars,ratings:v.ratings};
    });
    const orderMap={};
    allRows('get_asin_orders_last_30_days').forEach(r=>{
      const a=rowAsin(r)||(roster.length===1?roster[0]:'');
      if(!a)return;
      const n=u.scalar(r.orderCount||r.orders||r.value);
      if(n!==null)orderMap[a]=n;
    });
    const trafMap=typeof u.trafficByAsin==='function'?u.trafficByAsin(steps):{};
    if(!Object.keys(trafMap).length){
      allRows('get_asin_traffic').forEach(r=>{
        const a=rowAsin(r)||(roster.length===1?roster[0]:'');
        if(!a)return;
        trafMap[a]=trafficView(r);
      });
    }
    const listingBy={},adsBy={};
    allRows('get_asin_info_change_trends').forEach(r=>{
      const a=rowAsin(r)||(roster.length===1?roster[0]:main);
      if(!a)return;listingBy[a]=(listingBy[a]||0)+1;
    });
    allRows('get_asin_ad_change_trends').forEach(r=>{
      const a=rowAsin(r)||(roster.length===1?roster[0]:main);
      if(!a)return;adsBy[a]=(adsBy[a]||0)+1;
    });
    const priceBy={};
    const priceRows=allRows('get_asin_info_trends').filter(r=>r);
    const grouped={};
    priceRows.forEach(r=>{
      const a=rowAsin(r)||'_main';
      const day=String(dateOf(r)).slice(0,10);
      const price=u.scalar(r.price||r.listingPrice||r.dealPrice||r.promoPrice);
      if(!validDay(day)||price===null)return;
      if(!grouped[a])grouped[a]=[];
      grouped[a].push({day,price});
    });
    Object.keys(grouped).forEach(a=>{
      const pts=grouped[a].sort((x,y)=>x.day.localeCompare(y.day));
      let cuts=0,ups=0;
      for(let i=1;i<pts.length;i++){
        const prev=pts[i-1],cur=pts[i];
        if(!Math.abs(prev.price))continue;
        const ch=(cur.price-prev.price)/Math.abs(prev.price);
        if(ch<=-0.05)cuts++;else if(ch>=0.05)ups++;
      }
      priceBy[a]={cuts,ups,first:pts[0],last:pts[pts.length-1]};
    });
    function playOf(p){
      if(p.listing&&p.ads&&p.cuts)return '促销冲量';
      if(p.listing>=2)return '测 Listing';
      if(p.ads&&!p.listing)return '加投';
      if(p.adsRatio!==null&&p.adsRatio>=0.7)return '广告托量';
      if(p.adsRatio!==null&&p.adsRatio<=0.3&&p.orders!==null)return '自然接住';
      if(p.listing||p.ads||p.cuts||p.ups)return '有零散动作';
      return '窗口内安静';
    }
    const people=roster.map(a=>{
      const info=infoMap[a]||{asin:a,title:'',brand:'',price:null,stars:null,ratings:null};
      const traf=trafMap[a]||{};
      const adsRatio=traf.adsRatio!==null&&traf.adsRatio!==undefined?traf.adsRatio:null;
      const price=priceBy[a]||(a===main?priceBy._main:null)||{cuts:0,ups:0};
      const p={asin:a,main:a===main,title:info.title,brand:info.brand,price:info.price,orders:orderMap[a]!==undefined?orderMap[a]:null,adsRatio,listing:listingBy[a]||0,ads:adsBy[a]||0,cuts:price.cuts||0,ups:price.ups||0};
      p.play=playOf(p);
      p.action=p.listing+p.ads+p.cuts+p.ups;
      return p;
    });
    const daily=allRows('get_asin_keywords_daily');
    const byDay={};
    daily.forEach(r=>{
      const day=String(dateOf(r)).slice(0,10);
      const term=u.readable(r.searchTerm||r.keyword||r.term);
      if(!validDay(day)||!term)return;
      if(!byDay[day])byDay[day]=new Set();
      byDay[day].add(term);
    });
    const kwDays=Object.keys(byDay).sort();
    const gained=kwDays.length>=2?[...byDay[kwDays[kwDays.length-1]]].filter(t=>!byDay[kwDays[0]].has(t)):[];
    const lost=kwDays.length>=2?[...byDay[kwDays[0]]].filter(t=>!byDay[kwDays[kwDays.length-1]].has(t)):[];
    const cover={};
    allRows('get_multi_asin_keyword_comparison').forEach(r=>{
      const a=rowAsin(r);if(!a)return;cover[a]=(cover[a]||0)+1;
    });
    const movers=people.filter(p=>p.action).slice().sort((a,b)=>b.action-a.action);
    const orderLead=people.filter(p=>p.orders!==null).slice().sort((a,b)=>b.orders-a.orders)[0]||null;
    const adsLead=people.filter(p=>p.adsRatio!==null).slice().sort((a,b)=>b.adsRatio-a.adsRatio)[0]||null;
    const surge=people.filter(p=>p.play==='促销冲量');
    const quiet=people.filter(p=>p.play==='窗口内安静');
    const next=movers[0]||orderLead||people[0]||null;
    const names=people.map(p=>(p.brand||p.asin)+(p.main?'（主）':''));
    const win=formFrom&&formTo?formFrom+' ~ '+formTo:'本窗口';
    const lead=!people.length
      ?'没有监控名单，不能做周期对照。主 ASIN 填自己的或锚点，对比 ASIN 填要盯的竞品。'
      :(win+'（'+horizon+(span!==null?' '+span+' 天':'')+'）盯 **'+people.length+'** 个：'+names.join('、')+'。'+(movers.length?'本周期有动作：'+movers.slice(0,3).map(p=>(p.brand||p.asin)+' '+p.play).join('；')+'。':'本周期名单内没有可识别改版或新广告。')+(orderLead?' 近 30 天订单最高是 '+(orderLead.brand||orderLead.asin)+' '+fmt(orderLead.orders,0)+'。':'')+' 下一周期优先盯 '+(next?(next.brand||next.asin):'名单')+'。');
    const conclusion=[
      '- 监控名单 **'+people.length+'** 个'+(people.length?('：'+people.map(p=>p.asin+(p.brand?' '+p.brand:'')+(p.main?'（主）':'')).join('、')):'，未识别到 ASIN')+'。主 ASIN 是锚点，对比 ASIN 是竞品。来源：表单 + get_asin_info。',
      '- 观察窗口：'+(formFrom&&formTo?formFrom+' ~ '+formTo:'未提供')+'，**'+horizon+'**。不足 7 天只当当日快照；≥7 天当周期对照。本场景是名单汇总，不是单品跟不跟。',
      '- 有动作 **'+movers.length+'** 个'+(movers.length?'：'+movers.map(p=>(p.brand||p.asin)+' '+p.play+'（改 Listing '+p.listing+'，新广告 '+p.ads+'）').join('；'):'')+'。安静 '+(quiet.length)+' 个。促销冲量 '+(surge.length)+' 个。Listing/广告来源：get_asin_info_change_trends、get_asin_ad_change_trends。',
      '- 量级：订单最高 '+(orderLead?(orderLead.brand||orderLead.asin)+' '+fmt(orderLead.orders,0):'未提供')+'。广告占比最高 '+(adsLead&&adsLead.adsRatio!==null?(adsLead.brand||adsLead.asin)+' '+fmt(adsLead.adsRatio,1):'未提供')+'。推算订单不是实际订单。来源：get_asin_orders_last_30_days、get_asin_traffic。',
      '- 主 ASIN 上词 '+(kwDays.length<2?'样本不足':String(gained.length))+'，掉词 '+(kwDays.length<2?'样本不足':String(lost.length))+'。名单词覆盖'+(Object.keys(cover).length?'：'+Object.keys(cover).map(a=>a+' '+cover[a]+' 词').join('、'):'未取到')+'。核心词卡位'+(form&&form.keyword?'已填核心词':'未填核心词，已跳过')+'。下一周期优先盯 **'+(next?(next.asin+(next.brand?' '+next.brand:'')):'名单')+'**。'
    ];
    const orderPts=people.filter(p=>p.orders!==null).map(p=>({label:p.brand||p.asin,value:p.orders}));
    const adsPts=people.filter(p=>p.adsRatio!==null).map(p=>({label:p.brand||p.asin,value:p.adsRatio}));
    const actPts=people.filter(p=>p.action).map(p=>({label:p.brand||p.asin,value:p.action}));
    const charts=[];
    if(orderPts.length)charts.push({title:'近 30 天推算订单',source:'get_asin_orders_last_30_days',kind:'bar',points:orderPts,ratio:0,note:'推算订单不是实际订单。缺的不画。'});
    if(adsPts.length)charts.push({title:'近 7 天广告流量占比',source:'get_asin_traffic',kind:'bar',points:adsPts,ratio:1,note:'相对得分占比，不是花费。'});
    if(actPts.length)charts.push({title:'本窗口策略动作次数',source:'改版与广告接口',kind:'bar',points:actPts,ratio:0,note:'Listing 变更+新广告+价格动作。条数不是影响幅度。'});
    const rosterRows=people.map(p=>[p.asin+(p.main?'（主）':''),p.brand||'—',p.price===null?'—':('$'+fmt(p.price,0)),p.orders===null?'—':fmt(p.orders,0),p.adsRatio===null?'—':fmt(p.adsRatio,1),String(p.listing),String(p.ads),p.play]);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'监控名单',value:String(people.length)+' 个'},{label:'有动作',value:String(movers.length)},{label:'订单最高',value:orderLead?(orderLead.brand||orderLead.asin).slice(0,10):'—'},{label:'下一周期',value:next?(next.brand||next.asin).slice(0,10):'—'}
    ],tables:[
      {title:'监控周期计算过程',headers:['指标','算法','结果'],rows:[
        ['监控名单','主 ASIN + 对比 ASIN 去重，最多 8 个',people.length?people.map(p=>p.asin).join('、'):'空'],
        ['窗口',horizon+'；≥7 天=周期对照，否则当日快照',formFrom&&formTo?formFrom+' ~ '+formTo:'未提供'],
        ['打法','改 Listing+新广告+降价=促销冲量；Listing≥2=测 Listing；只开广告=加投',movers.map(p=>p.asin+' '+p.play).join('；')||'名单内安静'],
        ['下一周期','动作最多，否则订单最高',next?next.asin+' '+next.play:'无法指定']
      ],note:'未观测到不等于没有改。推算订单不是实际订单。'},
      ...(rosterRows.length?[{title:'监控名单对照',headers:['ASIN','品牌','价格','近 30 天订单','广告占比','改 Listing','新广告','本周期判断'],rows:rosterRows,note:'主 ASIN 是锚点。其余竞品的 Listing/广告按名单补拉；词位和 BSR 主要在主 ASIN。'}]:[])
    ],charts,process:[
      '**步骤 1 · 定监控名单**','- 主 ASIN 当锚点，对比 ASIN 当竞品，去重后最多 8 个。没填对比 ASIN 就只有 1 个，不能做竞品对照。',
      '**步骤 2 · 划周期窗口**','- 用填写的起始日到结束日。≥7 天当周期对照，不足 7 天只当当日快照。',
      '**步骤 3 · 各竞品入账**','- 订单、流量结构按名单批量取。Listing 变更和新广告：主 ASIN 走原链路，其余竞品按名单补拉。价格动作只在有日快照时记相邻日 |Δ|≥5%。',
      '**步骤 4 · 汇总打法**','- 每个 ASIN 单独归类：促销冲量 / 测 Listing / 加投 / 广告托量 / 自然接住 / 安静。然后看谁有动作、谁订单最高。',
      '**步骤 5 · 下一周期**','- 优先盯本窗口动作最多的；没有动作就盯订单最高的。把名单存进清单，下次用同一窗口对照。'
    ],extra:'### 判断口径\n- 监控名单 = 主 ASIN + 对比 ASIN，去重上限 8。\n- ≥7 天才叫周期对照。\n- 促销冲量：同一窗口既改 Listing 又开新广告又出现降价。\n- 推算订单不是实际订单，流量得分不是曝光。',boundary:'变更接口是西柚观测记录，未观测到不等于没有改。词位、BSR、日流量主要覆盖主 ASIN。没有花费不能判断广告利润。'});
  }

  function keywordValueReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const words=keywordsOf(form,steps);
    const list=(words.length?words:['该词']).map(word=>{
      const info=firstRowForKeyword(steps,'get_keyword_info',word);
      const vol=u.scalar(info.weeklySearchVolume||info.searchVolume||info.abaSearchVolume);
      const aba=u.scalar(info.abaRank||info.searchFrequencyRank);
      const diff=u.scalar(info.searchTermCompetitiveDifficulty||info.competitiveDifficulty);
      const cvr=u.scalar(info.adjustedClickConversionRate||info.clickConversionRate);
      const cpc=u.scalar(info.cpc||info.costPerClick||info.avgCpc);
      const asins=rowsForKeyword(steps,'get_keyword_asin_analysis',word).map(r=>({asin:u.readable(r.asin||r.primaryAsin),brand:u.readable(r.brand),share:u.scalar(r.clickShare||r.trafficShare||r.organicTrafficScoreRatio),rank:u.scalar(r.rank||r.organicRank)}));
      const topShare=asins.slice(0,3).reduce((s,a)=>s+(a.share||0),0);
      let verdict='观察';
      if(vol!==null&&diff!==null&&cpc!==null){
        if(vol>=500&&diff<50&&cvr!==null&&cvr>=0.1)verdict='打';
        else if(diff>=80||(cvr!==null&&cvr<0.05))verdict='放弃';
      } else if(!vol&&!diff) verdict='未提供';
      return {word,vol,aba,diff,cvr,cpc,asins,topShare,verdict};
    });
    const first=list[0],many=list.length>1;
    const lead=many
      ?('共 '+list.length+' 个词。'+list.map(p=>p.word+' **'+p.verdict+'**').join('；')+'。')
      :(first.word+'：结论 **'+first.verdict+'**。周搜索量 '+(first.vol===null?'未提供':fmt(first.vol,0))+'，难度 '+(first.diff===null?'未提供':fmt(first.diff,0))+'，CPC '+(first.cpc===null?'未提供':fmt(first.cpc,0))+'。头部三家份额合计 '+(first.topShare?fmt(first.topShare,1):'未提供')+'。');
    const conclusion=many?[
      '- 本次评估 **'+list.length+'** 个词：'+list.map(p=>p.word+' → '+p.verdict).join('；')+'。',
      '- 「打」只表示量/难度/转化在本次阈值内可测试，不是保排名。',
      '- 每个词单独取 get_keyword_info / get_keyword_asin_analysis，不把逗号串当成一个搜索词。'
    ]:[
      '- 决策：**'+first.verdict+'**。周搜索量 '+(first.vol===null?'未提供':fmt(first.vol,0))+'，ABA '+(first.aba===null?'未提供':fmt(first.aba,0))+'，难度 '+(first.diff===null?'未提供':fmt(first.diff,0))+'，点击转化率 '+(first.cvr===null?'未提供':fmt(first.cvr,1))+'，CPC '+(first.cpc===null?'未提供':fmt(first.cpc,0))+'。来源：get_keyword_info。',
      '- 近 7 天竞争 ASIN '+first.asins.length+' 个；前三份额 '+(first.topShare?fmt(first.topShare,1):'未提供')+'。来源：get_keyword_asin_analysis。',
      '- 「打」只表示量/难度/转化在本次阈值内可测试，不是保排名。'
    ];
    const charts=[];
    if(many&&list.some(p=>p.vol!==null))charts.push({title:'各词周搜索量',source:'get_keyword_info',kind:'bar',points:list.filter(p=>p.vol!==null).map(p=>({label:p.word,value:p.vol})),ratio:0,note:'周搜索量不是订单。'});
    const shareSrc=many?list[0].asins:first.asins;
    if(shareSrc.filter(a=>a.share!==null).length)charts.push({title:(many?first.word+' · ':'')+'竞争 ASIN 流量占比',source:'get_keyword_asin_analysis',kind:'bar',points:shareSrc.filter(a=>a.share!==null).slice(0,8).map(a=>({label:a.brand||a.asin,value:a.share})),ratio:1,note:'接口份额口径。'});
    const tables=[];
    if(many)tables.push({title:'逐词价值对照',headers:['词','结论','周搜索量','难度','CPC','前三份额'],rows:list.map(p=>[p.word,p.verdict,p.vol===null?'—':fmt(p.vol,0),p.diff===null?'—':fmt(p.diff,0),p.cpc===null?'—':fmt(p.cpc,0),p.topShare?fmt(p.topShare,1):'—']),note:'量≥500 且难度<50 且转化≥10% 记打。'});
    list.forEach(p=>{
      if(p.asins.length)tables.push({title:(many?p.word+' · ':'')+'占据该词的 ASIN',headers:['ASIN / 品牌','排名','份额'],rows:p.asins.slice(0,10).map(a=>[(a.asin||'')+' '+(a.brand||''),fmt(a.rank,0),a.share===null?'—':fmt(a.share,1)]),note:'近 7 天样本。'});
    });
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:many?[
      {label:'词数',value:String(list.length)},{label:'可打',value:String(list.filter(p=>p.verdict==='打').length)},{label:'放弃',value:String(list.filter(p=>p.verdict==='放弃').length)},{label:'首词结论',value:first.verdict}
    ]:[
      {label:'结论',value:first.verdict},{label:'周搜索量',value:first.vol===null?'—':fmt(first.vol,0)},{label:'CPC',value:first.cpc===null?'—':fmt(first.cpc,0)},{label:'前三份额',value:first.topShare?fmt(first.topShare,1):'—'}
    ],charts,tables,process:[
      '**步骤 1 · 拆词**','- 表单拆成 '+list.length+' 个词：'+list.map(p=>p.word).join('、')+'。',
      '**步骤 2 · 市场指标**','- 周搜索量、难度、点击转化率、CPC 来自 get_keyword_info。',
      '**步骤 3 · 决策阈值**','- 量≥500 且难度<50 且转化≥10% 记打；难度≥80 或转化<5% 记放弃；其余观察。缺指标记未提供。',
      '**步骤 4 · 头部垄断**','- 竞争 ASIN 前三份额相加。缺份额不补零。',
      '**步骤 5 · 边界**','- 「打」只表示可小预算测试，不是保排名。'
    ],extra:'### 判断口径\n- 多个词分别取数。\n- 点击转化率不是成交转化率。CPC 不是你的实际出价。'});
  }

  function replayReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const replay=steps.find(s=>s.tool==='get_keyword_advertising_replay'&&s.status==='ok');
    if(!replay)return pack(scene,{lead:'没有广告放映机返回，不能看 24 小时占位。',ok:okCount(steps),conclusion:['广告放映机未成功，仅 US / UK / DE 可用。'],process:['**步骤 1 · 放映机**','- 未成功返回。该接口仅 US / UK / DE。']});
    const cells=new Map(),hours=new Set(),regular=new Map();
    const unpack=v=>{if(typeof v==='string'){try{return JSON.parse(v);}catch(_){return v;}}return v;};
    const adKind=t=>{
      const s=String(t||'').toLowerCase();
      if(!s)return '';
      if(/sbv|brand.?video|sponsored.?brand.?video/.test(s))return 'SBV';
      if(/^(sb)$|sponsored.?brand/.test(s))return 'SB';
      if(/^(sp)$|sponsored.?product/.test(s))return 'SP';
      if(/^(sd)$|display|sponsored.?display/.test(s))return 'SD';
      return String(t);
    };
    const posLabel=raw=>{
      const s=String(raw||'').trim();
      if(!s||s==='未标明位置'||s==='未标明位置类型')return '';
      const low=s.toLowerCase();
      if(/top of search|^tos$|搜索顶部|顶部广告/.test(low)||/搜索顶部/.test(s))return '搜索顶部';
      if(/rest of search|^ros$|其余搜索|搜索结果其余/.test(low)||/其余搜索/.test(s))return '搜索结果其余位置';
      if(/product page|商品页|详情页/.test(low)||/详情页/.test(s))return '商品详情页';
      if(/headline|品牌栏|brand shelf|sponsored brand/.test(low)||/品牌栏/.test(s))return '品牌栏';
      if(/video|视频/.test(low))return '视频广告位';
      return s;
    };
    const pickRank=(e,asins)=>{
      const bag=[e.pageRank,e.rank,e.slot,e.positionRank,e.inPageRank,e.index];
      (asins||[]).forEach(a=>{bag.push(a.pageRank,a.rank,a.slot,a.positionRank,a.inPageRank);});
      for(const v of bag){
        if(v===null||v===undefined||v==='')continue;
        const n=Number(v);
        if(Number.isFinite(n))return n;
      }
      return null;
    };
    const grainOf=c=>{
      if(c.rank!==null)return {grain:'单个广告位',why:'接口给了页内排名，这一格是第'+c.page+'页里的第 '+c.rank+' 位。'};
      if(c.named){
        if(c.ads.size<=1)return {grain:'单个广告位',why:'位置类型已标明，且这一格只有 1 条广告。仍要看页码，不是整页。'};
        return {grain:'广告区',why:'位置类型已标明，同一区里有多条广告。这是一个广告区，不是整页，也不是某一个商品位。'};
      }
      const pageTxt=c.page===null?'未标明页':'第'+c.page+'页';
      return {grain:'整页广告集合',why:'接口只给了页码、没有位置类型和页内排名。这一格是'+pageTxt+'上采到的广告捆在一起，不是某一个广告位。'};
    };
    const hourTxt=h=>String(h).padStart(2,'0')+':00';
    const pageTxt=p=>p===null||p===undefined||p===''?'未标明页':'第'+p+'页';
    const rankTxt=r=>r===null?'页内位未知':'页内第'+r+'位';
    const slotTitle=c=>[pageTxt(c.page),c.pos,rankTxt(c.rank),c.g.grain].filter(Boolean).join(' · ');
    function walk(raw,position){
      const v=unpack(raw);if(!v||typeof v!=='object')return;
      if(Array.isArray(v)){v.forEach(x=>walk(x,position));return;}
      const pos=v.positionName??v.position??v.location??v.name??position;
      if(Object.prototype.hasOwnProperty.call(v,'hour')&&Array.isArray(v.entities)){
        const h=Number(v.hour);if(!Number.isInteger(h)||h<0||h>23)return;hours.add(h);
        for(const e of (v.entities||[])){
          if(!e||typeof e!=='object')continue;
          const ePosRaw=e.positionName??e.position??e.location??e.name??pos;
          const named=posLabel(ePosRaw);
          const display=named||(ePosRaw&&ePosRaw!=='未标明位置'?String(ePosRaw):'未标明位置类型');
          const pageRaw=e.page??e.pageNo??e.pageNumber;
          const page=pageRaw===null||pageRaw===undefined||pageRaw===''?null:pageRaw;
          const asins=(e.asins||[]).filter(a=>a&&typeof a==='object');
          const rank=pickRank(e,asins);
          const key=[h,display,page===null?'':page,rank===null?'':rank].join('|');
          if(!cells.has(key))cells.set(key,{h,pos:display,named:!!named,page,rank,ads:new Set(),asins:new Set(),kinds:new Set(),missing:0});
          const c=cells.get(key);
          for(const a of asins){
            if(a.adId)c.ads.add(String(a.adId));else c.missing++;
            const kind=adKind(a.campaignType||a.adType||e.campaignType);
            if(kind)c.kinds.add(kind);
            if(a.asin){
              c.asins.add(a.asin);
              if(!regular.has(a.asin))regular.set(a.asin,new Set());
              regular.get(a.asin).add(h);
            }
          }
        }
        return;
      }
      Object.values(v).forEach(x=>walk(x,pos));
    }
    walk(replay.data,'未标明位置');
    const rows=[...cells.values()].map(c=>{c.g=grainOf(c);c.slotId=[c.pos,c.page===null?'':c.page,c.rank===null?'':c.rank].join('|');c.kindsTxt=[...c.kinds].join('/')||'类型未知';return c;});
    const slots=new Map();
    rows.forEach(c=>{
      if(!slots.has(c.slotId))slots.set(c.slotId,{id:c.slotId,pos:c.pos,named:c.named,page:c.page,rank:c.rank,g:c.g,kinds:new Set(c.kinds),hours:new Set(),minAds:null,minHours:[]});
      const s=slots.get(c.slotId);
      s.hours.add(c.h);
      c.kinds.forEach(k=>s.kinds.add(k));
      if(!c.missing){
        if(s.minAds===null||c.ads.size<s.minAds){s.minAds=c.ads.size;s.minHours=[c.h];}
        else if(c.ads.size===s.minAds)s.minHours.push(c.h);
      }
    });
    const slotList=[...slots.values()].sort((a,b)=>{
      const order={单个广告位:0,广告区:1,整页广告集合:2};
      return (order[a.g.grain]??9)-(order[b.g.grain]??9)||Number(a.page)-Number(b.page)||String(a.pos).localeCompare(String(b.pos))||(a.rank||0)-(b.rank||0);
    });
    const bestOf=grain=>{
      const list=slotList.filter(s=>s.minAds!==null&&(!grain||s.g.grain===grain));
      if(!list.length)return null;
      return list.slice().sort((a,b)=>a.minAds-b.minAds||Number(a.page)-Number(b.page)||(a.minHours[0]||0)-(b.minHours[0]||0))[0];
    };
    const preferred=bestOf('单个广告位')||bestOf('广告区')||bestOf();
    const looseHours=preferred?preferred.minHours.slice().sort((a,b)=>a-b).map(hourTxt):[];
    const guests=[...regular].sort((a,b)=>b[1].size-a[1].size);
    const shares={};
    u.stepRows(steps,'get_keyword_asin_analysis').forEach(r=>{
      const asin=u.readable(r.asin||r.primaryAsin);if(!asin)return;
      shares[asin]={click:u.scalar(r.clickShare||r.trafficShare),conv:u.scalar(r.conversionShare||r.purchaseShare),brand:u.readable(r.brand)};
    });
    const shareStep=steps.find(s=>s.tool==='get_keyword_asin_analysis'&&s.status==='ok');
    let lead='放映机没有可识别小时。';
    if(hours.size&&preferred){
      const where=[pageTxt(preferred.page),preferred.pos,rankTxt(preferred.rank),preferred.g.grain].join(' · ');
      const grainLine=preferred.g.grain==='整页广告集合'?'这是一页上采到的广告捆在一起，不是某一个广告位空了。':preferred.g.grain==='广告区'?'这是某一个广告区，不是整页空了，也不是某一个商品位。':'这是某一个广告位，不是整页空了。';
      lead='可识别 '+hours.size+'/24 小时。最松的是【'+where+'】在 '+(looseHours.join('、')||'不足')+'，当时 '+preferred.minAds+' 条广告。'+grainLine+'只代表采样广告少，不能证明 CPC 更低。';
    }else if(hours.size)lead='可识别 '+hours.size+'/24 小时，但位置字段不完整，暂不能判定最松的位。';
    const conclusion=[
      '- 可识别 **'+hours.size+'/24** 小时，识别出 **'+slotList.length+'** 个位置格（位 / 区 / 页）。来源：get_keyword_advertising_replay。',
      '- 最松窗口按**同一个位置格**比广告条数，不把整页合计说成某一个位空了。'+(preferred?'本次最松：'+[pageTxt(preferred.page),preferred.pos,rankTxt(preferred.rank),preferred.g.grain].join(' · ')+' · '+(looseHours.join('、')||'不足')+'，当时 '+preferred.minAds+' 条。':'位置不足，未判定。'),
      '- 常客 ASIN '+(guests[0]?guests[0][0]+' 出现 '+guests[0][1].size+' 小时':'未识别')+'。出现频率不是全天占位率。'+(shareStep?'份额来自 get_keyword_asin_analysis，只给对上的 ASIN。':'流量占比接口未成功，不编份额。')
    ];
    const chartSlot=slotList.slice().sort((a,b)=>b.hours.size-a.hours.size||Number(a.page)-Number(b.page))[0];
    const charts=[];
    if(chartSlot){
      const pts=rows.filter(c=>c.slotId===chartSlot.id&&!c.missing).sort((a,b)=>a.h-b.h).map(c=>({label:hourTxt(c.h),value:c.ads.size}));
      if(pts.length)charts.push({title:slotTitle(chartSlot)+' · 去重广告条数',source:'get_keyword_advertising_replay',kind:'bar',points:pts,ratio:0,note:'只画这个位置格、有记录的小时。一条广告 ID 算 1 条，SB 一条可带多个 ASIN。无记录小时不画、不补零。'});
    }
    const legendRows=slotList.map(s=>[s.g.grain,s.pos,pageTxt(s.page),rankTxt(s.rank),[...s.kinds].join('/')||'类型未知',s.g.why]);
    const looseRows=slotList.filter(s=>s.minAds!==null).map(s=>[s.g.grain,s.pos,pageTxt(s.page),rankTxt(s.rank),s.minHours.slice().sort((a,b)=>a-b).map(hourTxt).join('、'),String(s.minAds)]);
    const detail=rows.slice().sort((a,b)=>a.h-b.h||Number(a.page)-Number(b.page)||String(a.pos).localeCompare(String(b.pos))||(a.rank||0)-(b.rank||0));
    const detailRows=detail.slice(0,60).map(c=>{
      const asins=[...c.asins];
      const shown=asins.slice(0,6).join('、')+(asins.length>6?' 等'+asins.length+'个':'');
      return [hourTxt(c.h),c.g.grain,c.pos,pageTxt(c.page),rankTxt(c.rank),c.kindsTxt,c.missing?'不完整':String(c.ads.size),shown||'—'];
    });
    const guestRows=guests.slice(0,12).map(([a,hs])=>{
      const sh=shares[a];
      return [a,sh&&sh.brand?sh.brand:'—',String(hs.size)+' / '+hours.size,sh&&sh.click!==null&&sh.click!==undefined?fmt(sh.click,1):'—',sh&&sh.conv!==null&&sh.conv!==undefined?fmt(sh.conv,1):'—'];
    });
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'有记录小时',value:hours.size+'/24'},
      {label:'最松窗口',value:looseHours[0]||'—'},
      {label:'这一格是',value:preferred?preferred.g.grain:'—'},
      {label:'常客',value:guests[0]?guests[0][0]:'—'}
    ],charts,tables:[
      legendRows.length?{title:'位置怎么读（一个位，还是一页）',headers:['粒度','位置类型','页码','页内位','广告类型','说明'],rows:legendRows,note:'先看粒度。单个广告位=页内某一个坑；广告区=同一位置类型下的一组坑；整页广告集合=这一页采到的广告捆在一起。'}:null,
      looseRows.length?{title:'各位置最松时段',headers:['粒度','位置类型','页码','页内位','最松小时','当时广告条数'],rows:looseRows,note:'每个位置格自己比。第 2 页松了不等于第 1 页某个位松了。采样广告少不能证明 CPC 更低。'}:null,
      detailRows.length?{title:'时段 × 位置占位明细',headers:['小时','粒度','位置类型','页码','页内位','广告类型','广告条数','ASIN'],rows:detailRows,note:(detail.length>60?'只展示前 60 行，共 '+detail.length+' 格。':'')+'来源 get_keyword_advertising_replay。空小时不出现。'}:null,
      guestRows.length?{title:'常客 ASIN',headers:['ASIN','品牌','出现小时','点击份额','转化份额'],rows:guestRows,note:'出现小时是放映机采样常客。份额只在 get_keyword_asin_analysis 对上同一 ASIN 时填写，不编造。'}:null
    ].filter(Boolean),process:[
      '**步骤 1 · 拆小时**','- 只统计放映机真正返回的小时，空小时不补零、不画成零竞争。',
      '**步骤 2 · 定位置粒度**','- 有页内排名 → 单个广告位（还要写清第几页、位置类型）。有位置类型但没有页内排名 → 广告区。只有页码 → 整页广告集合，明确告诉用户这是一页不是一个位。',
      '**步骤 3 · 最松窗口**','- 按同一个位置格比去重广告 ID 数。一条 SB 广告 ID 带多个 ASIN 只算 1 条。不把首页所有位置加总后再说某个位空了。',
      '**步骤 4 · 常客**','- 出现小时最多的 ASIN 当常客。有 get_keyword_asin_analysis 才附点击/转化份额，对不上就写 —。'
    ],extra:'### 判断口径\n- 先看「这一格是」：单个广告位 / 广告区 / 整页广告集合。\n- 仅 US / UK / DE。出现频率不是曝光，采样广告少不能证明 CPC 更低。'});
  }

  function wordbankReport(scene,_form,steps){
    const u=U(),fmt=u.fmt;
    const NEG=/used|refurbished|parts|repair|wholesale|industrial|for parts|replacement only|knock.?off/i;
    const fill=(k,r)=>{
      const take=(cur,v)=>cur===null||cur===undefined?v:cur;
      k.volume=take(k.volume,u.scalar(r.searchVolume||r.categoryRelevantSearchVolume||r.weeklySearchVolume));
      k.cvr=take(k.cvr,u.scalar(r.adjustedClickConversionRate||r.clickConversionRate));
      k.difficulty=take(k.difficulty,u.scalar(r.searchTermCompetitiveDifficulty||r.competitiveDifficulty));
      k.cpc=take(k.cpc,u.scalar(r.cpc||r.costPerClick||r.avgCpc));
      k.rank=take(k.rank,u.organicRankOf?u.organicRankOf(r):u.scalar(r.rank||r.organicRank||r.totalRank));
      k.rel=take(k.rel,u.scalar(r.categoryRelevance||r.relevance||r.relevanceScore));
      k.aba=take(k.aba,u.scalar(r.abaRank||r.searchFrequencyRank));
      k.rate=take(k.rate,u.organicShareOf?u.organicShareOf(r):u.scalar(r.trafficAcquisitionRate));
      return k;
    };
    const fromRows=(rows,source)=>rows.map(r=>{
      const k=kwTerm(r);k.cpc=null;k.rank=null;k.rel=null;k.aba=null;k.rate=null;k.sources=new Set();
      if(!k.term)return k;
      fill(k,r);k.sources.add(source);return k;
    }).filter(k=>k.term);
    const merged={};
    const eat=(list)=>{list.forEach(k=>{
      const key=k.term.toLowerCase();
      if(!merged[key]){merged[key]=Object.assign({},k,{sources:new Set(k.sources)});return;}
      const o=merged[key];
      k.sources.forEach(s=>o.sources.add(s));
      fill(o,k);
      ['volume','cvr','difficulty','cpc','rank','rel','aba','rate'].forEach(f=>{if(o[f]===null&&k[f]!==null&&k[f]!==undefined)o[f]=k[f];});
    });};
    eat(fromRows(u.stepRows(steps,'get_asin_keywords'),'竞品反查'));
    eat(fromRows(u.stepRows(steps,'get_category_keywords'),'类目词'));
    (steps||[]).filter(s=>s.tool==='get_keyword_info'&&s.status==='ok').forEach(s=>{
      let d=s.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return;}}
      d=d&&d.data!==undefined?d.data:d;
      const row=d&&typeof d==='object'&&!Array.isArray(d)?d:(u.findRows?u.findRows(d)[0]:null)||{};
      const term=u.readable((s.args&&(s.args.keyword||s.args.search_term||s.args.searchTerm))||s.targetKeyword||row.searchTerm||row.keyword||row.term);
      if(!term)return;
      const key=term.toLowerCase();
      if(!merged[key])merged[key]={term,volume:null,cvr:null,difficulty:null,cpc:null,rank:null,rel:null,aba:null,rate:null,sources:new Set(['市场指标'])};
      fill(merged[key],row);
      merged[key].sources.add('市场指标');
    });
    const all=Object.values(merged).sort((a,b)=>(b.volume||0)-(a.volume||0)||a.term.localeCompare(b.term));
    const sourceTxt=k=>[...k.sources].filter(s=>s!=='市场指标').join('+')||[...k.sources].join('+')||'—';
    const both=all.filter(k=>k.sources.has('竞品反查')&&k.sources.has('类目词'));
    const onlyAsin=all.filter(k=>k.sources.has('竞品反查')&&!k.sources.has('类目词'));
    const onlyCat=all.filter(k=>k.sources.has('类目词')&&!k.sources.has('竞品反查'));
    const vols=all.map(k=>k.volume).filter(v=>v!==null),difs=all.map(k=>k.difficulty).filter(v=>v!==null);
    const vMed=median(vols),dMed=median(difs);
    const neg=[],precise=[],broad=[],thin=[];
    all.forEach(k=>{
      if(NEG.test(k.term))neg.push(k);
      else if(k.volume!==null&&vMed!==null&&k.volume>=vMed&&k.difficulty!==null&&dMed!==null&&k.difficulty<=dMed)precise.push(k);
      else if(k.volume!==null)broad.push(k);
      else thin.push(k);
    });
    precise.sort((a,b)=>(b.volume||0)-(a.volume||0));
    broad.sort((a,b)=>(b.volume||0)-(a.volume||0));
    neg.sort((a,b)=>(b.volume||0)-(a.volume||0)||a.term.localeCompare(b.term));
    const cpcBand=list=>{
      const xs=list.map(k=>k.cpc).filter(v=>v!==null);
      if(!xs.length)return '数据不足';
      const lo=Math.min(...xs),hi=Math.max(...xs);
      return lo===hi?fmt(lo,0):(fmt(lo,0)+'–'+fmt(hi,0));
    };
    const names=(list,n)=>list.slice(0,n||3).map(k=>k.term).join('、')||'无';
    const limit=30;
    const lead=all.length
      ?('合并去重后 '+all.length+' 个词：精准打爆 '+precise.length+'（'+(names(precise,3))+'），广泛拓量 '+broad.length+'，否定初筛 '+neg.length+'，指标不足 '+thin.length+'。投放结构按这四组建，不把否定词放进投放组。')
      :'竞品反查词和类目词都为空，不能搭词库。';
    const conclusion=[
      '- 竞品反查 **'+u.stepRows(steps,'get_asin_keywords').length+'** 条，类目词 **'+u.stepRows(steps,'get_category_keywords').length+'** 条，合并去重 **'+all.length+'** 个。两边都有 '+both.length+' 个，仅竞品 '+onlyAsin.length+' 个，仅类目 '+onlyCat.length+' 个。来源：get_asin_keywords、get_category_keywords。',
      '- 投放结构：精准打爆 **'+precise.length+'**（精确/词组测核心词），广泛拓量 **'+broad.length+'**（广泛/词组拓量），否定初筛 **'+neg.length+'**（确认意图后再加否定），指标不足 **'+thin.length+'**（先补量/难度，暂不建组）。',
      '- 先投：'+(precise[0]?precise[0].term:'数据不足')+'。本组 CPC 口径 '+(precise.length?cpcBand(precise):'数据不足')+'，不是你的出价。否定词必须人工确认意图。'
    ];
    const kwRow=k=>[k.term,sourceTxt(k),k.volume===null?'—':fmt(k.volume,0),k.difficulty===null?'—':fmt(k.difficulty,0),k.cvr===null?'—':fmt(k.cvr,1),k.cpc===null?'—':fmt(k.cpc,0),k.rank===null?'—':fmt(k.rank,0)];
    const clip=(list,title,note)=>list.length?{title,headers:['词','来源','搜索量','难度','点击转化率','CPC','竞品自然位'],rows:list.slice(0,limit).map(kwRow),note:(list.length>limit?'只展示前 '+limit+' 个，本组共 '+list.length+' 个。':'')+note}:null;
    const charts=[];
    charts.push({title:'词库结构（词数）',source:'get_asin_keywords、get_category_keywords',kind:'bar',points:[{label:'精准打爆',value:precise.length},{label:'广泛拓量',value:broad.length},{label:'否定初筛',value:neg.length},{label:'指标不足',value:thin.length}],ratio:0,note:'四组互斥。否定优先于精准/广泛。'});
    if(precise.filter(k=>k.volume!==null).length)charts.push({title:'精准打爆 · 搜索量',source:'get_asin_keywords、get_category_keywords',kind:'bar',points:precise.filter(k=>k.volume!==null).slice(0,10).map(k=>({label:k.term,value:k.volume})),ratio:0,note:'搜索量不是订单。CPC 不是你的出价。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'合并词数',value:String(all.length)},
      {label:'精准打爆',value:String(precise.length)},
      {label:'广泛拓量',value:String(broad.length)},
      {label:'否定 / 不足',value:neg.length+' / '+thin.length}
    ],charts,tables:[
      {title:'投放结构',headers:['投放组','用途','建议匹配','词数','CPC 口径','先看这些词'],rows:[
        ['精准打爆','核心转化词，控花费','精确 / 词组',String(precise.length),cpcBand(precise),names(precise,4)],
        ['广泛拓量','拉相关流量，控预算','广泛 / 词组',String(broad.length),cpcBand(broad),names(broad,4)],
        ['否定词','挡无关意图','确认后加否定',String(neg.length),'—',names(neg,4)],
        ['指标不足','缺搜索量，暂不建组','先补指标',String(thin.length),'—',names(thin,4)]
      ],note:'结构按本次中位数分组，不是广告后台已建活动。没有自身转化率，不写死出价。'},
      {title:'分组计算过程',headers:['指标','算法','结果'],rows:[
        ['竞品反查', 'get_asin_keywords 条数', String(u.stepRows(steps,'get_asin_keywords').length)],
        ['类目词', 'get_category_keywords 条数', String(u.stepRows(steps,'get_category_keywords').length)],
        ['合并去重', '按词面小写合并；量/难度/CPC 缺了才从另一路补', String(all.length)],
        ['两边都有', '竞品反查 ∩ 类目词', String(both.length)],
        ['搜索量中位', '有搜索量的词取中位数，不补零', vMed===null?'无法计算':fmt(vMed,0)],
        ['难度中位', '有难度的词取中位数，不补零', dMed===null?'无法计算':fmt(dMed,0)],
        ['精准打爆', '非否定，且量≥中位且难度≤中位', String(precise.length)],
        ['广泛拓量', '非否定、未进精准、但有搜索量', String(broad.length)],
        ['否定初筛', '词面 used/parts/repair/wholesale/industrial 等', String(neg.length)],
        ['指标不足', '非否定且没有搜索量', String(thin.length)]
      ],note:'换一批样本中位数会变。缺字段不按零处理。'},
      clip(precise,'精准打爆 · 词清单','量≥中位且难度≤中位。建议精确/词组小预算测。'),
      clip(broad,'广泛拓量 · 词清单','有量但未进精准。建议广泛/词组拓量，控预算。'),
      clip(neg,'否定词 · 初筛清单','只按词面规则，必须人工确认意图后再加否定。'),
      clip(thin,'指标不足 · 词清单','没有搜索量，不能直接进投放组。有 get_keyword_info 的词会补进上面各组。')
    ].filter(Boolean),process:[
      '**步骤 1 · 两路拉词**','- 竞品反查 '+u.stepRows(steps,'get_asin_keywords').length+' 条（get_asin_keywords），类目词 '+u.stepRows(steps,'get_category_keywords').length+' 条（get_category_keywords）。空来源不补零。',
      '**步骤 2 · 合并去重**','- 按词面小写合并，得到 '+all.length+' 个。两边都有 '+both.length+' 个。缺量/难度/CPC 才用另一路或 get_keyword_info 补，不编造。',
      '**步骤 3 · 定门槛**','- 搜索量中位 '+(vMed===null?'无法计算':fmt(vMed,0))+'，难度中位 '+(dMed===null?'无法计算':fmt(dMed,0))+'。只在有值的词上算中位数。',
      '**步骤 4 · 搭投放结构**','- 先切否定，再切精准（量≥中位且难度≤中位），其余有量进广泛，没量进指标不足。四组互斥。',
      '**步骤 5 · 出价边界**','- 只给本组 CPC 口径，没有自身转化率就不写死出价。否定词必须人工确认意图。'
    ],extra:'### 判断口径\n- 精准打爆：非否定，且搜索量≥本次中位、难度≤本次中位。\n- 广泛拓量：非否定、未进精准、但有搜索量。\n- 否定初筛：词面规则，不是已经生效的否定词。\n- 指标不足：没有搜索量，不能直接投放。\n- CPC 是接口口径，不是你的出价。点击转化率不是成交转化率。'});
  }

  function rankTrackReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const words=keywordsOf(form,steps);
    const word=(words[0]||'该词');
    const rankRows=rowsForKeyword(steps,'get_asin_keyword_rank_trends',word);
    const daily=series(rankRows,r=>pickKwRank(r,'or'));
    const ads=series(rankRows,r=>pickKwRank(r,'sp'));
    const hourly=rowsForKeyword(steps,'get_asin_keyword_rank_hourly',word);
    const trafRows=rowsForKeyword(steps,'get_asin_keyword_traffic_trends',word);
    const org=series(trafRows,r=>pickKwTraffic(r,'organic'));
    const adTraf=series(trafRows,r=>pickKwTraffic(r,'ads'));
    const better=daily.length>=2&&daily[daily.length-1].value<daily[0].value;
    const adsGone=ads.length>=2&&ads[ads.length-1].value>20;
    let why='需对照广告位是否同时消失';
    if(daily.length>=2&&ads.length>=2){
      const orgDrop=!better;
      if(orgDrop&&adsGone)why='更像广告停投或广告位丢失';
      else if(orgDrop)why='自然位下滑，广告位还在，更像被挤';
      else why='名次在变好或走平';
    } else if(ads.length&&!daily.length){
      why='窗口内有广告位、没有自然位';
    } else if(daily.length>=2){
      why=better?'自然位在靠前':'自然位退后或走平';
    }
    const rankTxt=daily.length>=2?(fmt(daily[0].value,0)+' → '+fmt(daily[daily.length-1].value,0)+(better?'（靠前）':'（退后或走平）')):(daily.length===1?('仅 '+fmt(daily[0].value,0)):'窗口内无自然位');
    let lead;
    if(daily.length)lead=(words.length>1?('共 '+words.length+' 个词。'):'')+word+'：自然位 '+rankTxt+'。'+why+'。';
    else if(ads.length)lead=(words.length>1?('共 '+words.length+' 个词。'):'')+word+'：窗口内无自然位，广告位样本 '+ads.length+' 个（末日 '+fmt(ads[ads.length-1].value,0)+'）。'+why+'。';
    else lead=(words.length>1?('共 '+words.length+' 个词。'):'')+word+'：没有可识别的日排名点。排名读 displayPositions 里 or/sp 的 totalRank。';
    const conclusion=[
      '- 词：'+word+'。日自然位点 '+daily.length+' 个，'+rankTxt+'。来源：get_asin_keyword_rank_trends，字段 displayPositions.displayPosition=or 的 totalRank。',
      '- 广告位点 '+ads.length+' 个。小时级样本 '+hourly.length+'。来源：get_asin_keyword_rank_hourly。',
      '- 判断：'+why+'。排名数值越小越靠前。自然流量点 '+org.length+'，广告流量点 '+adTraf.length+'。'
    ];
    const charts=[];
    if(daily.length)charts.push({title:'自然位日排名',source:'get_asin_keyword_rank_trends',kind:daily.length>1?'line':'bar',points:daily,ratio:0,note:'displayPositions.or.totalRank，越小越靠前。'});
    if(ads.length)charts.push({title:'广告位日排名',source:'get_asin_keyword_rank_trends',kind:ads.length>1?'line':'bar',points:ads,ratio:0,note:'displayPositions.sp.totalRank。'});
    if(org.length)charts.push({title:'该词自然流量',source:'get_asin_keyword_traffic_trends',kind:org.length>1?'line':'bar',points:org,ratio:0,note:'summaryTraffic.organic。0 也是当天结果。'});
    if(adTraf.length)charts.push({title:'该词广告流量',source:'get_asin_keyword_traffic_trends',kind:adTraf.length>1?'line':'bar',points:adTraf,ratio:0,note:'summaryTraffic.advertising。'});
    const dayMap={};
    rankRows.concat(trafRows).forEach(r=>{
      const d=dateOf(r);if(!d)return;
      if(!dayMap[d])dayMap[d]={day:d,or:null,sp:null,org:null,ads:null};
      const rr=pickKwRank(r,'or'),sp=pickKwRank(r,'sp');
      if(rr!==null)dayMap[d].or=rr;
      if(sp!==null)dayMap[d].sp=sp;
      const o=pickKwTraffic(r,'organic'),a=pickKwTraffic(r,'ads');
      if(o!==null)dayMap[d].org=o;
      if(a!==null)dayMap[d].ads=a;
    });
    const dayRows=Object.keys(dayMap).sort().map(d=>dayMap[d]);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'自然位',value:rankTxt},{label:'原因倾向',value:why.slice(0,10)},{label:'广告位样本',value:String(ads.length)},{label:'日自然位点',value:String(daily.length)}
    ],charts,tables:dayRows.length?[{title:'逐日排名对照',headers:['日期','自然位','SP 位','自然流量','广告流量'],rows:dayRows.slice(-30).map(r=>[r.day,r.or===null?'—':fmt(r.or,0),r.sp===null?'—':fmt(r.sp,0),r.org===null?'—':fmt(r.org,0),r.ads===null?'—':fmt(r.ads,0)]),note:'缺 or 的日期不补零。0 表示采到了但值为 0。'}]:[],process:[
      '**步骤 1 · 日自然位**','- 读 displayPositions 里 or 的 totalRank，得到 '+daily.length+' 个点。'+rankTxt+'。越小越靠前。',
      '**步骤 2 · 广告位对照**','- SP 位点 '+ads.length+' 个。自然位退后且广告位消失，更像停投；自然位退后广告还在，更像被挤。',
      '**步骤 3 · 小时级**','- 小时样本 '+hourly.length+' 个，用来看当天抖动，不单独定结论。'
    ],extra:'### 判断口径\n- 自然位 = displayPositions.displayPosition=or 的 totalRank。\n- 广告位 = displayPosition=sp 的 totalRank。\n- 排名不是流量。'});
  }

  function arenaReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const abaStep=okStepForKeyword(steps,'get_keyword_aba_trends',(keywordsOf(form,steps)[0]||''));
    const monthStep=okStepForKeyword(steps,'get_keyword_analysis_monthly',(keywordsOf(form,steps)[0]||''));
    const monthKey=r=>{
      const raw=dateOf(r)||u.readable(r.reportMonth||r.yearMonth||r.period||r.statsMonth||r.monthValue||r.reportPeriod||'');
      const m=String(raw).match(/(\d{4})[-/年]?(\d{1,2})/);
      return m?m[1]+'-'+String(m[2]).padStart(2,'0'):'';
    };
    const volOf=r=>u.scalar(r.weeklySearchVolume||r.searchVolume||r.abaSearchVolume||r.searchVolumeValue||(r.metrics&&(r.metrics.weeklySearchVolume||r.metrics.searchVolume)));
    const abaRows=(()=>{
      if(!abaStep||abaStep.status!=='ok')return [];
      let d=abaStep.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return [];}}
      d=d&&d.data!==undefined?d.data:d;
      const bags=[];
      const walk=(v,depth,name)=>{
        if(!v||depth>8)return;
        if(Array.isArray(v)&&v.some(x=>x&&typeof x==='object')){
          const hit=v.filter(r=>r&&typeof r==='object'&&volOf(r)!==null);
          if(hit.length)bags.push({score:(/trend|week|period/i.test(name)?20:0)+hit.length,rows:hit});
          v.forEach(x=>walk(x,depth+1,''));
          return;
        }
        if(typeof v==='object'&&!Array.isArray(v))Object.entries(v).forEach(([k,x])=>walk(x,depth+1,k));
      };
      walk(d,0,'');
      bags.sort((a,b)=>b.score-a.score);
      return bags[0]?bags[0].rows:u.stepRows(steps,'get_keyword_aba_trends');
    })();
    const aba=series(abaRows,volOf);
    const vol=slope(aba);
    const monthly=u.stepRows(steps,'get_keyword_analysis_monthly');
    const byMonth={};
    monthly.forEach(r=>{
      const m=monthKey(r)||'未标明月份';
      const asin=u.readable(r.asin||r.primaryAsin||(r.asinInfo&&(r.asinInfo.asin||r.asinInfo.primaryAsin)));
      const share=u.scalar(r.clickShare||r.trafficShare||r.organicTrafficScoreRatio||r.conversionShare||r.trafficAcquisitionRate);
      const score=u.scalar(r.organicTrafficScore||r.advertisingTrafficScore||r.totalTrafficScore);
      if(!byMonth[m])byMonth[m]={month:m,asins:new Set(),top:[]};
      if(asin){
        byMonth[m].asins.add(asin);
        byMonth[m].top.push({asin,share,score});
      }
    });
    const months=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month));
    const first=months[0],last=months[months.length-1];
    const newcomers=first&&last&&first!==last?[...last.asins].filter(a=>!first.asins.has(a)):[];
    const rankTop=list=>(list||[]).slice().sort((a,b)=>(b.share===null&&a.share===null?0:(b.share||0)-(a.share||0))||(b.score||0)-(a.score||0));
    const headLast=last?rankTop(last.top).slice(0,3):[];
    const formFrom=(form&&form.dateFrom)||'';
    const formTo=(form&&form.dateTo)||'';
    const spanDays=(/^\d{4}-\d{2}-\d{2}$/.test(formFrom)&&/^\d{4}-\d{2}-\d{2}$/.test(formTo))?Math.round((new Date(formTo+'T00:00:00Z')-new Date(formFrom+'T00:00:00Z'))/864e5)+1:null;
    const shortWindow=spanDays!==null&&spanDays<90;
    const why=[];
    if(!monthStep||monthStep.status!=='ok')why.push('月度格局接口未成功');
    else if(months.length<2)why.push('可比月份不足 2 个，不能算新进入者');
    if(!abaStep||abaStep.status==='skip')why.push('ABA 周趋势未执行'+(abaStep&&abaStep.error?'：'+abaStep.error:''));
    else if(abaStep.status!=='ok')why.push('ABA 周趋势调用失败'+(abaStep.error?'：'+abaStep.error:''));
    else if(aba.length<2)why.push('ABA 返回的周搜索量不足 2 个点，不能判断涨跌');
    if(shortWindow)why.push('表单日期只有 '+(spanDays||'—')+' 天；赛道格局至少要 90 天，建议 6 个月');
    const lead=months.length
      ?(shortWindow||months.length<2||aba.length<2
        ?('覆盖 '+months.length+' 个月，搜索量 '+vol.dir+'。'+why[0]+'。把起始日期提前到 6 个月前再重跑。')
        :('覆盖 '+months.length+' 个月。搜索量 '+vol.dir+'。新进入者 '+newcomers.length+' 个。'+(headLast[0]?'最新月头部 '+headLast[0].asin+'。':'')))
      :('没有月度竞争格局。'+(why[0]||'把日期拉到至少 90 天后重跑。'));
    const conclusion=[
      '- 月份样本 **'+months.length+'**'+(months.length?('：'+months.map(m=>m.month).join('、')):'')+'。新进入者 '+(months.length<2?'窗口太短，无法计算':(newcomers.slice(0,8).join('、')||'无'))+'。来源：get_keyword_analysis_monthly。',
      '- 搜索量 '+vol.dir+(vol.change!==null?' '+signed(vol.change):'')+'，ABA 周点 '+aba.length+' 个。来源：get_keyword_aba_trends。'+(aba.length<2?' 不足 2 个点就不写涨跌。':''),
      '- '+(why.length?why.join('；')+'。':'词在放量且头部松动才更像切入窗口。')
    ];
    const charts=[];
    if(aba.length>1)charts.push({title:'周搜索量',source:'get_keyword_aba_trends',kind:'line',points:aba,ratio:0,note:'ABA 周搜索量，不是订单。无记录周不补零。'});
    if(months.length)charts.push({title:'每月竞争 ASIN 数',source:'get_keyword_analysis_monthly',kind:'bar',points:months.map(m=>({label:m.month,value:m.asins.size})),ratio:0,note:'去重 ASIN 数。一个月不能判断格局变化。'});
    const monthRows=months.map(m=>{
      const head=rankTop(m.top)[0];
      return [m.month,String(m.asins.size),head?head.asin:'—',head&&head.share!==null&&head.share!==undefined?fmt(head.share,1):'—'];
    });
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'月份',value:String(months.length)},
      {label:'搜索量',value:vol.dir},
      {label:'新进入者',value:months.length<2?'—':String(newcomers.length)},
      {label:'最新头部',value:headLast[0]?headLast[0].asin:'—'}
    ],charts,tables:[
      {title:'数据是否够用',headers:['条件','本次','怎么补'],rows:[
        ['表单日期',formFrom&&formTo?formFrom+' ~ '+formTo+'（'+(spanDays||'—')+' 天）':'未填','赛道格局建议 ≥90 天，最好 6 个月'],
        ['可比月份',String(months.length)+(months.length?' 个':'') ,months.length<2?'拉长起始日期后重跑':'已够比较首月末月'],
        ['ABA 周搜索量',aba.length?String(aba.length)+' 个点':(abaStep&&abaStep.status!=='ok'?'接口未成功':'没有可识别周点'),aba.length<2?'确认关键词，日期拉到 ≥90 天再跑':'已够判断涨跌'],
        ['新进入者',months.length<2?'无法计算':String(newcomers.length)+' 个','至少 2 个完整月才能比谁新进来']
      ],note:'缺字段不补零。一个月里的 20 个 ASIN 只是当期名单，不是格局变化。'},
      ...(monthRows.length?[{title:'分月竞争名单',headers:['月份','去重 ASIN','头部 ASIN','头部份额'],rows:monthRows,note:'份额缺了就只写 ASIN。来源 get_keyword_analysis_monthly。'}]:[]),
      ...(newcomers.length?[{title:'最新月新进入者',headers:['ASIN'],rows:newcomers.slice(0,20).map(a=>[a]),note:'只相对首月名单。新进入不等于站稳。'}]:[])
    ],process:[
      '**步骤 1 · 看窗口**','- 表单日期 '+(formFrom&&formTo?formFrom+' ~ '+formTo:'未填')+'。不足 90 天不能判断赛道变化；月度接口在短窗口时会往前补到 6 个月。',
      '**步骤 2 · 月度格局**','- 按月去重竞争 ASIN，得到 '+months.length+' 个月。不足 2 个月不算新进入者。',
      '**步骤 3 · 搜索量**','- 从 ABA 周趋势里找带搜索量的周点（优先 trends，不拿头部 ASIN 列表冒充周点），本次 '+aba.length+' 个点。',
      '**步骤 4 · 切入窗口**','- 词在放量且头部松动才更像窗口。单月新进入者可能是采样噪音。'
    ],extra:'### 判断口径\n- 新进入者 = 最新月有、最早月没有的 ASIN，不是已经成功的卖家。\n- 搜索量来自 ABA 周趋势，不是订单。\n- 一个月的竞争名单不能当格局结论。',boundary:'分析仅使用本次接口已返回的数据。短窗口时月度/ABA 查询会自动往前补，但旧结果不会自动重拉，必须重新跑场景。'});
  }

  function stealReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const mine=asinsOf(form)[0]||'';
    const take=(cur,v)=>cur===null||cur===undefined?v:cur;
    const fillKw=(k,r)=>{
      k.volume=take(k.volume,u.scalar(r.searchVolume||r.categoryRelevantSearchVolume||r.weeklySearchVolume||r.volume));
      k.cvr=take(k.cvr,u.scalar(r.adjustedClickConversionRate||r.clickConversionRate||r.cvr));
      k.difficulty=take(k.difficulty,u.scalar(r.searchTermCompetitiveDifficulty||r.competitiveDifficulty||r.difficulty));
      k.cpc=take(k.cpc,u.scalar(r.cpc||r.costPerClick||r.avgCpc));
      k.rank=take(k.rank,u.organicRankOf?u.organicRankOf(r):u.scalar(r.organicRank||r.orRank));
      k.share=take(k.share,u.organicShareOf?u.organicShareOf(r):u.scalar(r.organicTrafficAcquisitionRate||r.organicTrafficScoreRatio));
      return k;
    };
    const merged={};
    const eatKw=(term,row,source)=>{
      if(!term)return;
      const key=term.toLowerCase();
      if(!merged[key])merged[key]={term,volume:null,cvr:null,difficulty:null,cpc:null,rank:null,share:null,sources:new Set()};
      fillKw(merged[key],row||{});
      if(source)merged[key].sources.add(source);
    };
    const kwStep=(steps||[]).find(s=>s.tool==='get_asin_keywords'&&s.status==='ok');
    let rawKws=[];
    if(kwStep){
      let d=kwStep.data;
      if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){d=null;}}
      rawKws=u.asinKeywordRows?u.asinKeywordRows(d):[];
      if(!rawKws.length)rawKws=u.stepRows(steps,'get_asin_keywords');
    }
    rawKws.forEach(r=>{
      const term=u.readable(r.searchTerm||r.keyword||r.term)||kwTerm(r).term;
      eatKw(term,r,'竞品反查');
    });
    (steps||[]).filter(s=>s.tool==='get_keyword_info'&&s.status==='ok').forEach(s=>{
      let d=s.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return;}}
      d=d&&d.data!==undefined?d.data:d;
      const rows=d&&typeof d==='object'?(Array.isArray(d)?d:(u.findRows?u.findRows(d):[])): [];
      const row=rows[0]||(d&&typeof d==='object'&&!Array.isArray(d)?d:{});
      const term=u.readable((s.args&&(s.args.keyword||s.args.search_term||s.args.searchTerm))||s.targetKeyword||row.searchTerm||row.keyword||row.term);
      eatKw(term,row,'市场指标');
    });
    const all=Object.values(merged).sort((a,b)=>a.term.localeCompare(b.term));
    const byValue=(a,b)=>{
      if(a.volume!==null&&b.volume!==null&&a.volume!==b.volume)return b.volume-a.volume;
      if(a.volume!==null&&b.volume===null)return -1;
      if(a.volume===null&&b.volume!==null)return 1;
      if(a.rank!==null&&b.rank!==null&&a.rank!==b.rank)return b.rank-a.rank;
      if(a.difficulty!==null&&b.difficulty!==null&&a.difficulty!==b.difficulty)return a.difficulty-b.difficulty;
      return a.term.localeCompare(b.term);
    };
    const steal=all.filter(k=>k.rank!==null&&k.rank>4).sort(byValue);
    const tight=all.filter(k=>k.rank!==null&&k.rank<=4).sort((a,b)=>(a.rank-b.rank)||byValue(a,b));
    const unknown=all.filter(k=>k.rank===null).sort(byValue);
    const play=k=>{
      if(k.rank===null)return '自然位不足，先补排名再判断';
      if(k.rank<=4)return '前排守得紧，硬抢性价比低';
      if(k.difficulty!==null&&k.difficulty>=80)return '位次松但难度高，先小预算观察';
      if(k.volume===null)return '位次松，缺搜索量，先核验量再投';
      return '可测精确/词组抢位';
    };
    const names=(list,n)=>list.slice(0,n||3).map(k=>k.term+(k.rank!==null?'（第 '+fmt(k.rank,0)+' 位）':'')).join('、')||'无';
    const infoSteps=(steps||[]).filter(s=>s.tool==='get_keyword_info'&&s.status==='ok');
    const arenaSteps=(steps||[]).filter(s=>s.tool==='get_keyword_asin_analysis'&&s.status==='ok');
    const arenaRows=[];
    arenaSteps.forEach(s=>{
      let d=s.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return;}}
      const rows=u.findRows?u.findRows(d):[];
      const term=u.readable((s.args&&(s.args.keyword||s.args.search_term||s.args.searchTerm))||s.targetKeyword||'');
      const rivals=rows.map(r=>{
        const info=r.asinInfo||r.productInfo||r;
        return {
          asin:u.readable(info.asin||info.primaryAsin||r.asin||r.primaryAsin),
          click:u.scalar(r.clickShare||r.clickShareRatio||r.trafficShare||info.clickShare||r.organicTrafficScoreRatio),
          conv:u.scalar(r.conversionShare||r.purchaseShare||r.conversionShareRatio||info.conversionShare)
        };
      }).filter(a=>a.asin);
      const hit=mine?rivals.find(a=>a.asin.toUpperCase()===mine.toUpperCase()):null;
      const topClick=rivals.map(a=>a.click).filter(v=>v!==null).sort((a,b)=>b-a).slice(0,3);
      const topSum=topClick.length?topClick.reduce((s,v)=>s+v,0):null;
      let judge='名单有返回，份额字段不足';
      if(!rivals.length)judge='该词近 7 天竞争名单为空';
      else if(!hit)judge='该词近 7 天名单未见该竞品';
      else if((hit.click!==null&&hit.click>=0.2)||(hit.conv!==null&&hit.conv>=0.2))judge='份额较稳，硬抢难';
      else if(hit.click!==null||hit.conv!==null)judge='份额不高，可测侧翼';
      arenaRows.push({term:term||'未标明词',hit:!!hit,click:hit?hit.click:null,conv:hit?hit.conv:null,topSum,judge,n:rivals.length});
    });
    let lead='没有竞品反查词。';
    if(all.length){
      if(steal.length)lead='反查到 '+all.length+' 个竞品词。可抢（自然位 >4）'+steal.length+' 个，优先：'+names(steal,1)+'。前排守得紧 '+tight.length+' 个。';
      else if(tight.length&&!unknown.length)lead='反查到 '+all.length+' 个竞品词，例如 '+names(tight,2)+'。都在前 4 位，可抢缝 0 个，完整词表见下方。';
      else if(tight.length)lead='反查到 '+all.length+' 个竞品词。前排守得紧 '+tight.length+' 个（如 '+names(tight,1)+'），另有 '+unknown.length+' 个没有自然位，可抢缝 0 个。';
      else lead='反查到 '+all.length+' 个竞品词，但没有可识别的自然位，不能按前 4 位过滤。词表仍列出。';
    }
    const conclusion=[
      '- 竞品反查 **'+all.length+'** 个。可抢（自然位 >4）**'+steal.length+'** 个，前排守得紧 **'+tight.length+'** 个，无自然位 **'+unknown.length+'** 个。来源：get_asin_keywords。',
      '- 优先'+(steal[0]?'可抢词 **'+steal[0].term+'**，竞品自然位 '+fmt(steal[0].rank,0)+(steal[0].volume===null?'，搜索量数据不足':'，搜索量 '+fmt(steal[0].volume,0))+'。':'：本次没有自然位 >4 的词，不能把「可抢=0」当成没有结果，下方仍列出全部词。'),
      '- 已补市场指标 '+infoSteps.length+' 次，竞争名单 '+arenaSteps.length+' 次。缺量/难度/份额不补零，守得松不等于你能拿到。'
    ];
    const kwRow=k=>[k.term,k.rank===null?'—':fmt(k.rank,0),k.volume===null?'—':fmt(k.volume,0),k.difficulty===null?'—':fmt(k.difficulty,0),k.cpc===null?'—':fmt(k.cpc,0),k.cvr===null?'—':fmt(k.cvr,1),k.share===null?'—':fmt(k.share,1),play(k)];
    const headers=['词','竞品自然位','搜索量','难度','CPC','点击转化率','流量获得率','建议打法'];
    const clip=(list,title,note)=>list.length?{title,headers,rows:list.slice(0,30).map(kwRow),note:(list.length>30?'只展示前 30 个，本组共 '+list.length+' 个。':'')+note}:null;
    const charts=[];
    if(all.length)charts.push({title:'词位结构',source:'get_asin_keywords',kind:'bar',points:[{label:'可抢（>4）',value:steal.length},{label:'前排（1–4）',value:tight.length},{label:'无自然位',value:unknown.length}],ratio:0,note:'可抢=0 仍要看另外两组，那也是结果。'});
    const volSrc=steal.filter(k=>k.volume!==null).length?steal:all.filter(k=>k.volume!==null);
    if(volSrc.length)charts.push({title:steal.filter(k=>k.volume!==null).length?'可抢词搜索量':'反查词搜索量',source:'get_asin_keywords、get_keyword_info',kind:'bar',points:volSrc.slice(0,10).map(k=>({label:k.term,value:k.volume})),ratio:0,note:'搜索量不是订单。CPC 不是你的出价。'});
    const rankSrc=(steal.length?steal:tight).filter(k=>k.rank!==null).slice(0,10);
    if(!volSrc.length&&rankSrc.length)charts.push({title:'竞品自然位',source:'get_asin_keywords',kind:'bar',points:rankSrc.map(k=>({label:k.term,value:k.rank})),ratio:0,note:'数值越大越靠后。越小越像守得紧。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'竞品词',value:String(all.length)},
      {label:'可抢候选',value:String(steal.length)},
      {label:'前排守得紧',value:String(tight.length)},
      {label:'优先词',value:steal[0]?steal[0].term:(tight[0]?tight[0].term:'—')}
    ],charts,tables:[
      clip(steal,'可抢词清单（自然位 >4）','按性价比：有搜索量的优先，同位次再看更靠后、难度更低。自然位越靠后越像守得松，不等于你能拿到。'),
      clip(tight,'前排守得紧（自然位 1–4）','这些是竞品正在吃流量的词。可抢=0 时这张表就是结果，不要硬碰前排。'),
      clip(unknown,'无自然位的反查词','接口没给可识别自然位，不能当成已经排在前 4 位。'),
      {title:'分组计算过程',headers:['指标','算法','结果'],rows:[
        ['反查词','get_asin_keywords 去重词面',String(all.length)],
        ['可抢','自然位有值且 >4',String(steal.length)],
        ['前排守得紧','自然位有值且 ≤4',String(tight.length)],
        ['无自然位','ranks 里没有 position=or 的 totalRank',String(unknown.length)],
        ['市场指标','get_keyword_info 成功次数（含补拉）',String(infoSteps.length)],
        ['竞争名单','get_keyword_asin_analysis 成功次数（含补拉）',String(arenaSteps.length)],
        ['优先词',steal.length?'可抢组第一':'可抢为空时展示前排第一',steal[0]?steal[0].term:(tight[0]?tight[0].term:(unknown[0]?unknown[0].term:'无'))]
      ],note:'缺字段不按零处理。可抢=0 仍要输出词表。'},
      arenaRows.length?{title:'词下竞品稳固度',headers:['词','名单条数','竞品是否在名单','竞品点击份额','竞品转化份额','前三点击份额','判断'],rows:arenaRows.map(a=>[a.term,String(a.n),a.hit?'在':'未见',a.click===null?'—':fmt(a.click,1),a.conv===null?'—':fmt(a.conv,1),a.topSum===null?'—':fmt(a.topSum,1),a.judge]),note:'只对实际调用过竞争名单的词。份额缺了不补零。未见不等于永远不占该词。'}:null
    ].filter(Boolean),process:[
      '**步骤 1 · 竞品反查词**','- get_asin_keywords 得到 '+all.length+' 个词。这是结果本身，不因为可抢=0 就藏起来。',
      '**步骤 2 · 按自然位分组**','- 自然位读 ranks 里 position=or 的 totalRank，不是广告位 sp。有值且 >4 记可抢 '+steal.length+' 个；≤4 记前排守得紧 '+tight.length+' 个；没有 or 总排名记无自然位 '+unknown.length+' 个。',
      '**步骤 3 · 补量和难度**','- 对高价值反查词补 get_keyword_info，本次成功 '+infoSteps.length+' 次。缺搜索量/难度/CPC 保持数据不足。',
      '**步骤 4 · 看份额是否稳**','- 对优先词拉 get_keyword_asin_analysis，看竞品是否还在该词近 7 天名单里。本次成功 '+arenaSteps.length+' 次。',
      '**步骤 5 · 打法**','- 可抢：精确/词组小预算测。前排：不硬碰，改打侧翼。没有自然位先补排名。守得松不等于能拿到。'
    ],extra:'### 判断口径\n- 自然位 = ranks 中 position=or 的 totalRank，不是 sp/sb 广告位。\n- 可抢：自然位有值且 >4。\n- 前排守得紧：自然位 1–4，是结果不是空。\n- 无自然位：没有 or 总排名（可能只有广告位），不能当成前 4。\n- 搜索量不是订单。CPC 不是你的出价。点击转化率不是成交转化率。\n- 守得松不等于你能拿到。'});
  }

  function churnReport(scene,_form,steps){
    const u=U(),fmt=u.fmt;
    const dailyTerms=datedTerms(stepPayload(steps,'get_asin_keywords_daily'));
    const monthTerms=datedTerms(stepPayload(steps,'get_asin_keywords_monthly'));
    const byDay={};
    dailyTerms.forEach(t=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(t.day||'')||!t.term)return;
      if(!byDay[t.day])byDay[t.day]=new Set();
      byDay[t.day].add(t.term);
    });
    const days=Object.keys(byDay).sort();
    const byMonth={};
    monthTerms.forEach(t=>{
      const m=String(t.day||'').slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(m)||!t.term)return;
      if(!byMonth[m])byMonth[m]=new Set();
      byMonth[m].add(t.term);
    });
    const months=Object.keys(byMonth).sort();
    const grain=days.length>=2?'day':(months.length>=2?'month':'none');
    const keys=grain==='day'?days:months;
    const bucket=grain==='day'?byDay:byMonth;
    const first=keys[0]?bucket[keys[0]]:new Set();
    const last=keys.length?bucket[keys[keys.length-1]]:new Set();
    const added=[...last].filter(t=>!first.has(t));
    const dropped=[...first].filter(t=>!last.has(t));
    const counts=series(u.stepRows(steps,'get_asin_keyword_count_trends'),pickOrganicCount);
    const cs=slope(counts);
    const countDir=counts.length>=2?cs.dir:(counts.length===1?('现有 '+fmt(counts[0].value,0)):'没有数量点');
    const allTerms=[...new Set(dailyTerms.concat(monthTerms).map(t=>t.term))].filter(Boolean);
    const rankOf={};
    dailyTerms.concat(monthTerms).forEach(t=>{if(t.rank!==null&&t.rank!==undefined)rankOf[t.term]=t.rank;});
    const names=(list)=>list.slice(0,3).join('、')||'无';
    let lead;
    if(grain!=='none'){
      lead=(grain==='day'?'日级 ':'月度 ')+keys[0]+' → '+keys[keys.length-1]+'：新增 '+added.length+' 个'+(added.length?'，如 '+names(added):'')+'；掉出 '+dropped.length+' 个'+(dropped.length?'，如 '+names(dropped):'')+'。词数量 '+countDir+'。';
    } else if(counts.length>=2){
      lead='词数量从 '+fmt(cs.first.value,0)+' 到 '+fmt(cs.last.value,0)+'，'+cs.dir+'。词表没有两个可对比日期，本期仍列出 '+allTerms.length+' 个词。';
    } else if(allTerms.length){
      lead='本期反查到 '+allTerms.length+' 个词。没有两个可对比日期，不能算上掉词，词表仍列出。';
    } else {
      lead='三个接口没有可识别的词或数量点。展开步骤看原始 JSON。';
    }
    const conclusion=[
      '- '+(grain==='day'?'可比日期 '+days.length+' 个':'可比月份 '+months.length+' 个')+'。新增 **'+added.length+'**，掉出 **'+dropped.length+'**。来源：'+(grain==='month'?'get_asin_keywords_monthly':'get_asin_keywords_daily')+'。',
      '- 词数量点 '+counts.length+' 个，方向 **'+countDir+'**'+(cs.change!==null?' '+signed(cs.change):'')+'。来源：get_asin_keyword_count_trends。',
      '- 单日消失可能是采样遗漏，要看月度是否同样下滑。本期词面 '+allTerms.length+' 个。'
    ];
    const charts=[];
    if(counts.length)charts.push({title:'自然词数量',source:'get_asin_keyword_count_trends',kind:counts.length>1?'line':'bar',points:counts,ratio:0,note:'数量不是流量。只有 1 个点也画出实际值。'});
    if(grain!=='none')charts.push({title:'上掉词数量',source:grain==='month'?'get_asin_keywords_monthly':'get_asin_keywords_daily',kind:'bar',points:[{label:'新增',value:added.length},{label:'掉出',value:dropped.length},{label:'首期词',value:first.size},{label:'末期词',value:last.size}],ratio:0,note:grain==='day'?'相对首末日。':'相对首末月。'});
    else if(allTerms.length)charts.push({title:'本期词数',source:'日级/月度反查',kind:'bar',points:[{label:'本期词',value:allTerms.length},{label:'新增',value:added.length},{label:'掉出',value:dropped.length}],ratio:0,note:'没有两个日期时只展示本期词数。'});
    const kwRows=(list,withRank)=>list.slice(0,30).map(t=>withRank?[t,rankOf[t]===undefined||rankOf[t]===null?'—':fmt(rankOf[t],0)]:[t]);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'新增词',value:String(added.length)},
      {label:'掉出词',value:String(dropped.length)},
      {label:'词数量方向',value:countDir},
      {label:grain==='month'?'可比月份':'可比日期',value:String(keys.length||days.length||months.length)}
    ],charts,tables:[
      added.length?{title:'新增词',headers:['词'],rows:kwRows(added,false),note:(grain==='month'?'相对首末月。':'相对首末日。')+(added.length>30?'只展示前 30 个。':'')}:null,
      dropped.length?{title:'掉出词',headers:['词','当时自然位'],rows:kwRows(dropped,true),note:'需排除采样遗漏。自然位来自 ranks.or.totalRank。'}:null,
      (!added.length&&!dropped.length&&allTerms.length)?{title:'本期词表',headers:['词','自然位'],rows:kwRows(allTerms,true),note:'没有两个可对比日期，先列出本期词。'}:null,
      {title:'上掉词计算过程',headers:['指标','算法','结果'],rows:[
        ['日级词', 'get_asin_keywords_daily 可识别词面', String(dailyTerms.length)],
        ['日级日期', '词上的 date/localDate/rankTime', days.join('、')||'没有可识别日期'],
        ['月度词', 'get_asin_keywords_monthly 可识别词面', String(monthTerms.length)],
        ['月度月份', '词上的 month/date', months.join('、')||'没有可识别月份'],
        ['对比口径', days.length>=2?'首末日词表差集':(months.length>=2?'首末月词表差集':'词表日期不够，改看数量曲线和本期词'), grain==='none'?'未做差集':keys[0]+' → '+keys[keys.length-1]],
        ['词数量点', 'organicKeywordCount / keywordCount.organic / nfKeywordCnt', counts.length?counts.map(p=>p.label+':'+fmt(p.value,0)).slice(0,8).join('；'):'没有可识别数量']
      ],note:'缺日期不把全部词当成同一天。缺数量字段不补零。'}
    ].filter(Boolean),process:[
      '**步骤 1 · 日级词表**','- get_asin_keywords_daily 识别 '+dailyTerms.length+' 个词、'+days.length+' 个日期。日期读 date / localDate / ranks.rankTime。',
      '**步骤 2 · 月度词表**','- get_asin_keywords_monthly 识别 '+monthTerms.length+' 个词、'+months.length+' 个月。日级不够两个日期时用首末月差集。',
      '**步骤 3 · 数量曲线**','- get_asin_keyword_count_trends 有 '+counts.length+' 个点，方向 '+countDir+'。用来区分波动和趋势。',
      '**步骤 4 · 采样**','- 单日消失可能是采样遗漏，要看月度是否同样下滑。'
    ],extra:'### 判断口径\n- 新增/掉出是首期有末日没有（或反过来），不是流量。\n- 词数量不是流量。\n- 没有两个日期时仍列出本期词，不把结论写成空。'});
  }

  function gapReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const mine=asinsOf(form);
    const me=mine[0]||'';
    const others=mine.slice(1);
    const rows=u.stepRows(steps,'get_multi_asin_keyword_comparison').concat(u.stepRows(steps,'get_multi_asin_keyword_comparison_monthly'));
    const byTerm={};
    rows.forEach(r=>{
      const term=u.readable(r.searchTerm||r.keyword);
      const asin=u.readable(r.asin||r.primaryAsin);
      if(!term||!asin)return;
      if(!byTerm[term])byTerm[term]={term,asins:new Set(),volume:u.scalar(r.searchVolume)};
      byTerm[term].asins.add(asin);
      if(byTerm[term].volume===null)byTerm[term].volume=u.scalar(r.searchVolume);
    });
    const all=Object.values(byTerm);
    const missingAll=all.filter(t=>others.every(a=>t.asins.has(a))&&me&&!t.asins.has(me));
    const onlyRival=all.filter(t=>me&&!t.asins.has(me)&&[...t.asins].some(a=>others.includes(a)));
    const onlyMe=all.filter(t=>me&&t.asins.has(me)&&![...t.asins].some(a=>others.includes(a)));
    const lead=all.length?('对比词 '+all.length+' 个。三家都有我没有 '+missingAll.length+'，只有对手有 '+onlyRival.length+'，只有我有 '+onlyMe.length+'。补词先看前两类。'):'没有多 ASIN 对比词。';
    const conclusion=[
      '- 参与对比 ASIN：'+(mine.join('、')||'未提供')+'。主 ASIN 按名单第一位。来源：get_multi_asin_keyword_comparison。',
      '- 我没有而对手有（含三家都有）**'+(missingAll.length+onlyRival.length)+'** 个。',
      '- 只对参与查询的 ASIN 做覆盖判断，不能外推全市场。'
    ];
    const top=missingAll.concat(onlyRival).sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,15);
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'对比词',value:String(all.length)},{label:'三家有我没有',value:String(missingAll.length)},{label:'只有对手有',value:String(onlyRival.length)},{label:'只有我有',value:String(onlyMe.length)}
    ],charts:[{title:'覆盖缺口分类',source:'get_multi_asin_keyword_comparison',kind:'bar',points:[{label:'三家有我没有',value:missingAll.length},{label:'只有对手有',value:onlyRival.length},{label:'只有我有',value:onlyMe.length}],ratio:0,note:'按本次查询名单。'}],tables:top.length?[{title:'补词优先级',headers:['词','搜索量','谁有'],rows:top.map(t=>[t.term,t.volume===null?'—':fmt(t.volume,0),[...t.asins].join('、')]),note:'第一位视为主 ASIN。'}]:[],process:[
      '**步骤 1 · 名单**','- 对比 ASIN 第一位视为主 ASIN，其余为对手。',
      '**步骤 2 · 三类缺口**','- 三家都有我没有、只有对手有、只有我有。补词先看前两类。',
      '**步骤 3 · 边界**','- 只对参与查询的 ASIN 做覆盖判断，不能外推全市场。'
    ],extra:'### 判断口径\n- 覆盖不是转化。'});
  }

  function parentCoverReport(scene,_form,steps){
    const u=U(),fmt=u.fmt;
    const kws=u.stepRows(steps,'get_parent_asin_keywords').map(r=>{
      const k=kwTerm(r);
      k.child=u.readable(r.asin||r.childAsin||r.variationAsin);
      return k;
    }).filter(k=>k.term);
    const vars=u.stepRows(steps,'get_asin_variations');
    const children=new Set(vars.flatMap(r=>(r.children||r.childAsins||[]).map(c=>u.readable(c.asin||c))).filter(Boolean));
    const byTerm={};
    kws.forEach(k=>{if(!byTerm[k.term])byTerm[k.term]={term:k.term,children:new Set(),volume:k.volume};byTerm[k.term].children.add(k.child||'未标明');});
    const dup=[...Object.values(byTerm)].filter(t=>t.children.size>1);
    const lead=kws.length?('父体词 '+Object.keys(byTerm).length+' 个，被多个子体同时吃的重复词 '+dup.length+' 个。重复词可能内耗。'):'没有父体词覆盖。';
    const conclusion=[
      '- 父体词 **'+Object.keys(byTerm).length+'**，记录 '+kws.length+' 条。来源：get_parent_asin_keywords。',
      '- 多子体重复词 **'+dup.length+'** 个。',
      '- 变体记录 '+children.size+' 个。无人覆盖的高价值词需要结合类目词另查，本接口只看已覆盖。'
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'父体词',value:String(Object.keys(byTerm).length)},{label:'重复词',value:String(dup.length)},{label:'子体数',value:String(children.size||'—')},{label:'词记录',value:String(kws.length)}
    ],tables:dup.length?[{title:'多子体内耗词（前 15）',headers:['词','子体数','子体'],rows:dup.sort((a,b)=>b.children.size-a.children.size).slice(0,15).map(t=>[t.term,String(t.children.size),[...t.children].join('、')]),note:'重复不等于一定抬价。'}]:[],charts:[{title:'覆盖结构',source:'get_parent_asin_keywords',kind:'bar',points:[{label:'词种',value:Object.keys(byTerm).length},{label:'重复词',value:dup.length},{label:'子体',value:children.size}],ratio:0,note:'结构计数。'}],process:[
      '**步骤 1 · 父体词**','- get_parent_asin_keywords 按词聚合到子体。',
      '**步骤 2 · 内耗**','- 同一词被多个子体覆盖记重复，可能内耗，不等于一定抬价。',
      '**步骤 3 · 缺口**','- 本接口只看已覆盖，无人覆盖的高价值词要另查类目词。'
    ],extra:'### 判断口径\n- 重复词不是自动否定。'});
  }

  function nurtureOne(word,steps){
    const u=U(),fmt=u.fmt;
    const trafRows=rowsForKeyword(steps,'get_asin_keyword_traffic_trends',word);
    const rankRows=rowsForKeyword(steps,'get_asin_keyword_rank_trends',word);
    const org=series(trafRows,r=>pickKwTraffic(r,'organic'));
    const ads=series(trafRows,r=>pickKwTraffic(r,'ads'));
    const orRank=series(rankRows,r=>pickKwRank(r,'or'));
    const spRank=series(rankRows,r=>pickKwRank(r,'sp'));
    const os=slope(org),as=slope(ads);
    const rankBetter=orRank.length>=2&&orRank[orRank.length-1].value<orRank[0].value;
    const adsOn=ads.some(p=>p.value>0);
    const orgOn=org.some(p=>p.value>0);
    let verdict='继续观察';
    if(adsOn&&rankBetter&&os.dir==='上升')verdict='广告养自然位较像成立，可继续投';
    else if(adsOn&&orRank.length>=2&&!rankBetter&&os.dir!=='上升')verdict='广告在花、自然位没养出来，考虑降预算';
    else if(adsOn&&!orgOn&&!orRank.length)verdict='窗口内几乎全是广告流量，自然位和自然流量都没接住';
    else if(!adsOn&&rankBetter)verdict='自然位在好，广告不是主因';
    else if(org.length>=2||ads.length>=2||orRank.length>=2)verdict='有流量或排名曲线，先对照花费再决定加减预算';
    const lastOrg=org.length?org[org.length-1].value:null;
    const lastAds=ads.length?ads[ads.length-1].value:null;
    const rankTxt=orRank.length>=2?(fmt(orRank[0].value,0)+' → '+fmt(orRank[orRank.length-1].value,0)+(rankBetter?'（靠前）':'（退后或走平）')):(orRank.length===1?('仅 '+fmt(orRank[0].value,0)):'窗口内无自然位');
    const cardVerdict={'广告养自然位较像成立，可继续投':'可继续投','广告在花、自然位没养出来，考虑降预算':'广告没养出','窗口内几乎全是广告流量，自然位和自然流量都没接住':'几乎全是广告','自然位在好，广告不是主因':'自然位在好','有流量或排名曲线，先对照花费再决定加减预算':'对照花费','继续观察':'继续观察'}[verdict]||verdict.slice(0,10);
    const posLast=trafRows[trafRows.length-1]||{};
    const pos=posLast.positionTraffic||{};
    const posBits=['or','sp','sb','sbv'].map(k=>{const n=u.scalar(pos[k]);return n===null?null:[k.toUpperCase(),n];}).filter(Boolean);
    const dayMap={};
    trafRows.concat(rankRows).forEach(r=>{
      const d=dateOf(r);if(!d)return;
      if(!dayMap[d])dayMap[d]={day:d,org:null,ads:null,or:null,sp:null};
      const o=pickKwTraffic(r,'organic'),a=pickKwTraffic(r,'ads');
      if(o!==null)dayMap[d].org=o;
      if(a!==null)dayMap[d].ads=a;
      const rr=pickKwRank(r,'or'),sp=pickKwRank(r,'sp');
      if(rr!==null)dayMap[d].or=rr;
      if(sp!==null)dayMap[d].sp=sp;
    });
    return {word,verdict,cardVerdict,os,as,org,ads,orRank,spRank,rankTxt,lastOrg,lastAds,trafRows,rankRows,posBits,dayRows:Object.keys(dayMap).sort().map(d=>dayMap[d])};
  }
  function nurtureReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const words=keywordsOf(form,steps);
    const list=(words.length?words:['该词']).map(w=>nurtureOne(w,steps));
    const counts=series(u.stepRows(steps,'get_asin_keyword_count_trends'),pickOrganicCount);
    const first=list[0];
    const many=list.length>1;
    const lead=many
      ?('共 '+list.length+' 个词。'+list.map(p=>p.word+'：'+p.verdict).join('；')+'。')
      :(first.org.length||first.ads.length||first.orRank.length
        ?first.word+'：'+first.verdict+'。自然流量 '+first.os.dir+(first.lastOrg!==null?'，末日 '+fmt(first.lastOrg,0):'')+'；广告流量 '+first.as.dir+(first.lastAds!==null?'，末日 '+fmt(first.lastAds,0):'')+'。自然位 '+first.rankTxt+'。'
        :first.word+'：三个接口没有可识别的流量或排名点。展开步骤看原始 JSON。');
    const raised=list.filter(p=>p.verdict.indexOf('可继续投')>=0).length;
    const missed=list.filter(p=>p.verdict.indexOf('没接住')>=0||p.verdict.indexOf('没养出来')>=0).length;
    const conclusion=many?[
      '- 本次复盘 **'+list.length+'** 个词：'+list.map(p=>p.word).join('、')+'。每个词单独跑流量和排名接口，不把逗号串当成一个词。',
      '- 较像养出来 '+raised+' 个，广告没接住或没养出 '+missed+' 个。',
      '- 流量读 summaryTraffic.organic / advertising，自然位读 displayPositions.or.totalRank。没有花费和订单，不能算 ACOS。'
    ]:[
      '- 复盘结论：**'+first.verdict+'**。词：'+first.word+'。',
      '- 自然流量点 '+first.org.length+' 个，'+first.os.dir+(first.os.change!==null?' '+signed(first.os.change):'')+'；广告流量点 '+first.ads.length+' 个，'+first.as.dir+(first.as.change!==null?' '+signed(first.as.change):'')+'。流量读 summaryTraffic.organic / advertising。来源：get_asin_keyword_traffic_trends。',
      '- 自然位点 '+first.orRank.length+' 个，'+first.rankTxt+'。排名读 displayPositions 里 displayPosition=or 的 totalRank，越小越靠前。来源：get_asin_keyword_rank_trends。没有花费和订单，不能算 ACOS。'
    ];
    const charts=[];
    if(many){
      const adsPts=list.filter(p=>p.lastAds!==null).map(p=>({label:p.word,value:p.lastAds}));
      const orgPts=list.filter(p=>p.lastOrg!==null).map(p=>({label:p.word,value:p.lastOrg}));
      if(adsPts.length)charts.push({title:'各词末日广告流量',source:'get_asin_keyword_traffic_trends',kind:'bar',points:adsPts,ratio:0,note:'summaryTraffic.advertising。'});
      if(orgPts.length)charts.push({title:'各词末日自然流量',source:'get_asin_keyword_traffic_trends',kind:'bar',points:orgPts,ratio:0,note:'summaryTraffic.organic。0 也是结果。'});
    }
    list.forEach(p=>{
      const prefix=many?p.word+' · ':'该词';
      if(p.org.length)charts.push({title:prefix+'自然流量',source:'get_asin_keyword_traffic_trends',kind:p.org.length>1?'line':'bar',points:p.org,ratio:0,note:'summaryTraffic.organic。0 也是结果，表示当天没有自然流量。'});
      if(p.ads.length)charts.push({title:prefix+'广告流量',source:'get_asin_keyword_traffic_trends',kind:p.ads.length>1?'line':'bar',points:p.ads,ratio:0,note:'summaryTraffic.advertising。流量得分不是花费。'});
      if(p.orRank.length)charts.push({title:prefix+'自然位',source:'get_asin_keyword_rank_trends',kind:p.orRank.length>1?'line':'bar',points:p.orRank,ratio:0,note:'越小越靠前。缺 or 总排名的日期不连线。'});
    });
    if(counts.length)charts.push({title:'ASIN 自然词数量',source:'get_asin_keyword_count_trends',kind:counts.length>1?'line':'bar',points:counts,ratio:0,note:'整词数量，不是这一词的流量。'});
    const tables=[];
    if(many)tables.push({title:'逐词复盘对照',headers:['词','结论','自然流量','广告流量','自然位'],rows:list.map(p=>[p.word,p.verdict,p.org.length?(p.os.dir+(p.lastOrg!==null?' · '+fmt(p.lastOrg,0):'')):'没有流量点',p.ads.length?(p.as.dir+(p.lastAds!==null?' · '+fmt(p.lastAds,0):'')):'没有流量点',p.rankTxt]),note:'每个词单独取数。0 表示采到了但值为 0。'});
    list.forEach(p=>{
      if(p.dayRows.length)tables.push({title:(many?p.word+' · ':'')+'投放期逐日对照',headers:['日期','自然流量','广告流量','自然位','SP 位'],rows:p.dayRows.slice(-30).map(r=>[r.day,r.org===null?'—':fmt(r.org,0),r.ads===null?'—':fmt(r.ads,0),r.or===null?'—':fmt(r.or,0),r.sp===null?'—':fmt(r.sp,0)]),note:'最多展示末 30 天。0 表示当天采到了但值为 0。'});
    });
    tables.push({title:'复盘计算过程',headers:['指标','算法','结果'],rows:[
      ['词数','逗号/分号/换行拆词，不去空格切词面',String(list.length)],
      ['词面','表单关键词',list.map(p=>p.word).join('、')],
      ['自然流量点','各词 summaryTraffic.organic',list.map(p=>p.word+' '+p.org.length).join('、')],
      ['广告流量点','各词 summaryTraffic.advertising',list.map(p=>p.word+' '+p.ads.length).join('、')],
      ['自然位点','各词 displayPositions.or.totalRank',list.map(p=>p.word+' '+p.orRank.length).join('、')],
      ['词数量点','get_asin_keyword_count_trends',String(counts.length)]
    ],note:'日期对象 {startDate,endDate} 按 startDate 取值。缺字段不补零。'});
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:many?[
      {label:'词数',value:String(list.length)},{label:'较像养出',value:String(raised)},{label:'没接住/没养出',value:String(missed)},{label:'首词结论',value:first.cardVerdict}
    ]:[
      {label:'结论',value:first.cardVerdict},
      {label:'自然流量',value:first.org.length?(first.os.dir+(first.lastOrg!==null?' · '+fmt(first.lastOrg,0):'')):'没有流量点'},
      {label:'广告流量',value:first.ads.length?(first.as.dir+(first.lastAds!==null?' · '+fmt(first.lastAds,0):'')):'没有流量点'},
      {label:'自然位',value:first.rankTxt}
    ],charts,tables,process:[
      '**步骤 1 · 拆词**','- 表单按逗号、分号或换行拆成 '+list.length+' 个词：'+list.map(p=>p.word).join('、')+'。词面空格保留。每个词单独请求流量和排名。',
      '**步骤 2 · 该词流量**','- 读 summaryTraffic。'+list.map(p=>p.word+' 自然 '+p.org.length+' 点（'+p.os.dir+'），广告 '+p.ads.length+' 点（'+p.as.dir+'）').join('；')+'。0 也计入。',
      '**步骤 3 · 自然位**','- 读 displayPositions 里 or 的 totalRank。'+list.map(p=>p.word+' '+p.rankTxt).join('；')+'。越小越靠前。',
      '**步骤 4 · 养号判断**','- 广告在、自然位靠前且自然流量上升，才较像养出来。广告在但自然位/自然流量没动，考虑降预算。',
      '**步骤 5 · 边界**','- 没有花费和订单，不能算 ACOS。流量得分不是曝光。'
    ],extra:'### 判断口径\n- 多个词分别取数，不把「a, b」当成一个搜索词。\n- 自然流量 = summaryTraffic.organic，广告流量 = summaryTraffic.advertising。\n- 自然位 = displayPositions.displayPosition=or 的 totalRank。\n- 当天值为 0 表示采到了但没量，不是缺字段。\n- 没有花费和订单，不能算 ACOS。'});
  }

  function sellerRoot(steps,tool){
    const d=stepPayload(steps,tool);
    if(!d)return null;
    return d.data!==undefined?d.data:d;
  }
  function sellerItems(root){
    if(!root)return [];
    if(Array.isArray(root))return root.filter(x=>x&&typeof x==='object');
    if(Array.isArray(root.items))return root.items.filter(x=>x&&typeof x==='object');
    if(Array.isArray(root.list))return root.list.filter(x=>x&&typeof x==='object');
    return [];
  }
  function keepaDay(t){
    const n=Number(t);
    if(!Number.isFinite(n)||n<=0)return '';
    const ms=n<1e12?n*1000:n;
    const d=new Date(ms);
    return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';
  }
  function keepaPts(arr){
    const u=U();
    return (arr||[]).map(p=>{
      if(!p||typeof p!=='object')return null;
      const day=keepaDay(p.timePoint||p.time||p.t||p.date);
      const v=u.scalar(p.value??p.v);
      if(!day||v===null)return null;
      return {label:day,value:v,date:day};
    }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function competitorView(r){
    const u=U();
    return {
      asin:String(u.readable(r.asin||r.asinCode)||'').toUpperCase(),
      brand:u.readable(r.brand)||'—',
      title:u.readable(r.title)||'',
      bsr:u.scalar(r.bsr??r.bsrRank),
      units:u.scalar(r.units??r.amzUnit),
      unitsGr:u.scalar(r.unitsGr),
      revenue:u.scalar(r.revenue??r.amzSales),
      price:u.scalar(r.price??r.averagePrice??r.primePrice),
      ratings:u.scalar(r.ratings),
      stars:u.scalar(r.rating??r.stars),
      fulfillment:u.readable(r.fulfillment)||''
    };
  }
  function overlayComp(a,b){
    const out=Object.assign({},a);
    Object.keys(b).forEach(k=>{if(b[k]!==null&&b[k]!==undefined&&b[k]!==''&&b[k]!=='—')out[k]=b[k];});
    return out;
  }
  function marketFromUrl(url){
    const s=String(url||'');
    if(/amazon\.co\.jp/i.test(s)) return 'JP';
    if(/amazon\.co\.uk/i.test(s)) return 'UK';
    if(/amazon\.de/i.test(s)) return 'DE';
    if(/amazon\.ca/i.test(s)) return 'CA';
    if(/amazon\.com(\/|$|\?)/i.test(s)) return 'US';
    return '';
  }
  function marketHost(code){
    return ({US:'amazon.com',JP:'amazon.co.jp',UK:'amazon.co.uk',DE:'amazon.de',CA:'amazon.ca',FR:'amazon.fr',IT:'amazon.it',ES:'amazon.es',AU:'amazon.com.au',MX:'amazon.com.mx',IN:'amazon.in'})[String(code||'').toUpperCase()]||'';
  }
  function siteName(code){
    return ({US:'美国站',JP:'日本站',UK:'英国站',DE:'德国站',FR:'法国站',IT:'意大利站',ES:'西班牙站',CA:'加拿大站',AU:'澳洲站',MX:'墨西哥站',IN:'印度站'})[String(code||'').toUpperCase()]||String(code||'');
  }
  function marketOf(form,keepa,detail){
    const wanted=String((form&&form.site)||'US').toUpperCase();
    const nested=keepa&&keepa.keepa&&typeof keepa.keepa==='object'?keepa.keepa:null;
    const url=(keepa&&(keepa.asinUrl||keepa.url))||(nested&&(nested.asinUrl||nested.url))||(detail&&(detail.asinUrl||detail.url||detail.link))||'';
    const fromUrl=marketFromUrl(url);
    const fromField=String((keepa&&keepa.marketplace)||(nested&&nested.marketplace)||(detail&&detail.marketplace)||'').toUpperCase();
    const got=fromUrl||fromField||wanted;
    return {wanted,got,mismatch:!!(fromUrl||fromField)&&got!==wanted,host:marketHost(got)||marketHost(wanted)};
  }
  function money(v,site){
    if(v===null||v===undefined)return '—';
    const n=U().fmt(v,0);
    const s=String(site||'US').toUpperCase();
    if(s==='JP') return '¥'+n;
    if(s==='UK') return '£'+n;
    if(s==='DE'||s==='FR'||s==='IT'||s==='ES'||s==='NL') return '€'+n;
    return '$'+n;
  }
  function competitorPanoramaReport(scene,form,steps){
    const u=U(),fmt=u.fmt,selfAsin=String((form&&form.asin)||'').toUpperCase();
    const map=new Map();
    sellerItems(sellerRoot(steps,'asin_competitor')).map(competitorView).filter(r=>r.asin).forEach(r=>map.set(r.asin,r));
    sellerItems(sellerRoot(steps,'competitor_lookup')).map(competitorView).filter(r=>r.asin).forEach(r=>map.set(r.asin,map.has(r.asin)?overlayComp(map.get(r.asin),r):r));
    const rivals=[...map.values()].filter(r=>r.asin!==selfAsin).sort((a,b)=>(b.units||0)-(a.units||0));
    const sameTrack=r=>/gooseneck|pour over|0\.8\s*l/i.test(r.title||'');
    const volume=rivals.filter(r=>r.units!==null)[0]||null;
    const priced=rivals.filter(r=>r.price!==null);
    const detailRoot=sellerRoot(steps,'asin_detail_with_coupon_trend')||{};
    const detail=detailRoot.asin&&typeof detailRoot.asin==='object'?detailRoot.asin:detailRoot;
    const coupons=Array.isArray(detailRoot.couponTrends)?detailRoot.couponTrends.filter(x=>x&&typeof x==='object'):[];
    const keepa=sellerRoot(steps,'keepa_info')||{};
    const market=marketOf(form,keepa,detail);
    const moneySite=market.mismatch?market.got:market.wanted;
    const selfPrice=u.scalar(detail.price??detail.dealPrice)??(keepaPts(keepa.price).slice(-1)[0]||{}).value;
    const peer=priced.length?(sameTrack({title:detail.title||keepa.title||''})?priced.filter(sameTrack).concat(priced):priced).slice().sort((a,b)=>Math.abs((a.price||0)-(selfPrice||0))-Math.abs((b.price||0)-(selfPrice||0)))[0]:null;
    const leaf=(Array.isArray(detail.subcategories)?detail.subcategories[0]:null)||null;
    const leafRank=leaf?u.scalar(leaf.rank):null;
    const leafName=leaf?u.readable(leaf.label||leaf.node):'';
    const selfBsr=u.scalar(detail.bsrRank??detail.bsr);
    const selfRatings=u.scalar(detail.ratings);
    const selfStars=u.scalar(detail.rating??detail.stars);
    const selfBrand=u.readable(detail.brand||keepa.brand)||'—';
    const bsrPts=keepaPts(keepa.bsr),pricePts=keepaPts(keepa.price||keepa.buyBox),revPts=keepaPts(keepa.reviews),starPts=keepaPts(keepa.rating);
    const bsrS=slope(bsrPts),priceS=slope(pricePts),revS=slope(revPts);
    const bsrTxt=bsrPts.length>=2?(bsrS.last.value<bsrS.first.value?'位次变好':bsrS.last.value>bsrS.first.value?'位次变差':'走平'):(bsrPts.length?'仅 1 个点':'没有可比点');
    const lastCoupon=coupons.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(-1)[0]||null;
    const couponDays=coupons.length;
    const couponFinal=lastCoupon?u.scalar(lastCoupon.finalPrice):null;
    const couponOn=couponDays>0;
    const siteLead=siteName(market.wanted)+' · '+market.host;
    let lead;
    if(market.mismatch){
      lead='参数栏是 '+siteName(market.wanted)+'，但 Keepa/详情返回了 '+siteName(market.got)+' '+market.host+'。卖家精灵不带 marketplace 会落到日本站，同一 ASIN 在日本也有占位页。请确认站点是 '+market.wanted+' 后整场重跑，不要把这次 '+siteName(market.got)+' 结论当成 '+siteName(market.wanted)+'。';
    } else if(!rivals.length)lead='站点 '+siteLead+'。asin_competitor 没有返回竞品名单，不能点名强竞品。';
    else {
      const volTxt=volume?(volume.brand+' '+volume.asin+(volume.units!==null?' · 约 '+fmt(volume.units,0)+' 单':'')):'未提供量级标杆';
      const peerTxt=peer?(peer.brand+' '+money(peer.price,moneySite)):'没有价格对标';
      const selfTxt=selfPrice!==null?money(selfPrice,moneySite):'未提供现价';
      const leafTxt=leafRank!==null?(leafName+' 第 '+fmt(leafRank,0)):'叶子位未提供';
      const keepaTxt=bsrPts.length>=2?('Keepa 大类 BSR '+fmt(bsrS.first.value,0)+'→'+fmt(bsrS.last.value,0)+'（'+bsrTxt+'）'):'Keepa 没有可比 BSR 点';
      const couponTxt=couponOn?('优惠 '+couponDays+' 天在线'+(couponFinal!==null?'，最近成交价 '+money(couponFinal,moneySite):'')):'没有优惠曲线';
      lead='站点 '+siteLead+'。量级标杆是 '+volTxt+'；同价带对标 '+peerTxt+'。自身 '+selfBrand+' '+selfTxt+'、'+leafTxt+(selfRatings!==null?'、评论 '+fmt(selfRatings,0):'')+'。'+keepaTxt+'。'+couponTxt+'。关系分不是销量。卖家精灵价格符号 Y 在美国站仍按美元读，不是日元。';
    }
    const charts=[];
    if(rivals.some(r=>r.units!==null))charts.push({title:'关系名单估算销量',source:'asin_competitor',kind:'bar',points:rivals.filter(r=>r.units!==null).slice(0,8).map(r=>({label:r.brand,value:r.units})),ratio:0,note:'卖家精灵估算口径，不是后台订单。'});
    if(bsrPts.length)charts.push({title:'自身大类 BSR',source:'keepa_info',kind:bsrPts.length>1?'line':'bar',points:bsrPts,ratio:0,note:'数值越小位次越靠前。用来排除一天冲榜。'});
    if(pricePts.length)charts.push({title:'自身成交价',source:'keepa_info',kind:pricePts.length>1?'line':'bar',points:pricePts,ratio:0,note:'Keepa price / buyBox。'});
    const couponPts=coupons.map(r=>{const day=isoDay(r.date);const v=u.scalar(r.finalPrice);return day&&v!==null?{label:day,value:v,date:day}:null;}).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
    if(couponPts.length)charts.push({title:'优惠后成交价',source:'asin_detail_with_coupon_trend',kind:couponPts.length>1?'line':'bar',points:couponPts.slice(-60),ratio:0,note:'couponTrends.finalPrice。连续在线说明成交价才是对标。'});
    const tables=[];
    if(rivals.length)tables.push({title:'关系竞品清单',headers:['ASIN','品牌','估算销量','价格','BSR','评论','星级','标题'],rows:rivals.map(r=>[r.asin,r.brand,r.units===null?'—':fmt(r.units,0),r.price===null?'—':money(r.price,moneySite),r.bsr===null?'—':fmt(r.bsr,0),r.ratings===null?'—':fmt(r.ratings,0),r.stars===null?'—':fmt(r.stars,0),(r.title||'').slice(0,48)]),note:'名单来自 asin_competitor。Damsun 这类 1.7L 烧水壶与 0.8L 鹅颈不是同一产品。价格按 '+siteName(moneySite)+' 读，不把接口 symbol=Y 当成日元。'});
    tables.push({title:'自身 vs 标杆 vs 同价带',headers:['对象','ASIN','价格','BSR / 叶子位','评论','说明'],rows:[
      ['自身',selfAsin||'—',selfPrice===null?'—':money(selfPrice,moneySite),(selfBsr!==null?'大类 '+fmt(selfBsr,0):'—')+(leafRank!==null?' / 叶子 '+fmt(leafRank,0):''),selfRatings===null?'—':fmt(selfRatings,0)+(selfStars!==null?' · '+fmt(selfStars,0)+'★':''),selfBrand],
      volume?['量级标杆',volume.asin,volume.price===null?'—':money(volume.price,moneySite),volume.bsr===null?'—':fmt(volume.bsr,0),volume.ratings===null?'—':fmt(volume.ratings,0),volume.brand+' · 估算 '+fmt(volume.units,0)+' 单']:[],
      peer?['同价带对标',peer.asin,money(peer.price,moneySite),peer.bsr===null?'—':fmt(peer.bsr,0),peer.ratings===null?'—':fmt(peer.ratings,0),peer.brand]:[]
    ].filter(r=>r.length),note:market.mismatch?'站点不一致，价格只标返回站，不能当美国站结论。':'没有成本，不能建议跟 Cosori 的价位。Chefman 才是价格带邻居。'});
    if(bsrPts.length||pricePts.length||revPts.length)tables.push({title:'Keepa 长期对照',headers:['指标','较早点','较近点','方向'],rows:[
      bsrPts.length?['大类 BSR',fmt(bsrS.first.value,0)+' · '+bsrS.first.label,fmt(bsrS.last.value,0)+' · '+bsrS.last.label,bsrTxt]:null,
      pricePts.length?['成交价',money(priceS.first.value,moneySite)+' · '+priceS.first.label,money(priceS.last.value,moneySite)+' · '+priceS.last.label,priceS.dir]:null,
      revPts.length?['评分数',fmt(revS.first.value,0)+' · '+revS.first.label,fmt(revS.last.value,0)+' · '+revS.last.label,revS.dir]:null
    ].filter(Boolean),note:'BSR 数值下降=位次变好。点多说明不是一天冲榜。看 asinUrl / marketplace 确认站点。'});
    tables.push({title:'计算过程',headers:['指标','算法','结果'],rows:[
      ['站点', '参数栏 '+market.wanted+'；返回 '+(market.got||'未标')+(market.mismatch?' · 不一致':' · 一致'), siteLead],
      ['关系竞品','asin_competitor 去重，排除主 ASIN',String(rivals.length)],
      ['量级标杆','估算 units 最高',volume?volume.brand+' '+volume.asin:'没有销量字段'],
      ['同价带对标','与自身现价绝对差最小',peer?peer.brand+' '+money(peer.price,moneySite):'没有价格字段'],
      ['优惠天数','couponTrends 条数',String(couponDays)],
      ['Keepa BSR 点','keepa_info.bsr',String(bsrPts.length)]
    ],note:'关系分不是销量。units / revenue 是卖家精灵估算。'});
    function keepaLine(pts,s,txt){return pts.length>=2?('大类 BSR '+fmt(s.first.value,0)+'→'+fmt(s.last.value,0)+'（'+txt+'）'):'没有可比 BSR 点';}
    const conclusion=market.mismatch?[
      '- 站点不一致：要 '+siteName(market.wanted)+'，实际 '+siteName(market.got)+' '+market.host+'。整场重跑后再看竞品。',
      '- 同一 ASIN 在日本站也可能有占位页，不能凭 ASIN 判断已经是美国站。',
      '- 下面数字如果来自日本站 Keepa，不要和美国站 Cosori / Chefman 名单混读。'
    ]:[
      '- 站点 '+siteLead+'。关系名单 '+rivals.length+' 个。量级标杆 '+(volume?volume.brand+'，估算约 '+fmt(volume.units,0)+' 单、评论 '+(volume.ratings===null?'未提供':fmt(volume.ratings,0)):'未提供')+'。',
      peer?('- 同价带对标 '+peer.brand+' '+money(peer.price,moneySite)+'。自身现价 '+(selfPrice===null?'未提供':money(selfPrice,moneySite))+'。'):'- 没有价格字段，不能做价位对标。',
      '- 叶子类目 '+(leafName||'Electric Kettles')+(leafRank!==null?' 第 '+fmt(leafRank,0):' 位次未提供')+'。评论 '+(selfRatings===null?'未提供':fmt(selfRatings,0))+'。和 Cosori 万级评论不是同一量级。',
      '- Keepa：'+keepaLine(bsrPts,bsrS,bsrTxt)+'；价格 '+ (pricePts.length>=2?priceS.dir:'没有可比点')+'。'+(couponOn?'优惠连续 '+couponDays+' 天，成交价才是对标。':'没有优惠曲线。'),
      '- 没有成本，不能建议跟价。1.7L 烧水壶增速再高也不等于鹅颈壶的可复制动作。'
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'站点',value:siteName(market.mismatch?market.got:market.wanted)},
      {label:'关系竞品',value:String(rivals.length)},
      {label:'量级标杆',value:volume?volume.brand:'未提供'},
      {label:'同价带对标',value:peer?peer.brand:'未提供'}
    ],charts,tables,process:[
      '**步骤 1 · 站点**','- 参数栏 '+siteName(market.wanted)+'。接口必须带 marketplace='+market.wanted+'。不带会落到日本站。本次返回 '+(market.got||'未标站点')+' · '+market.host+(market.mismatch?'，不一致，先重跑。':'。'),
      '**步骤 2 · 发现竞品**','- asin_competitor 出 '+rivals.length+' 个关系 ASIN。关系分不是销量；估算销量最高的当量级标杆。',
      '**步骤 3 · 对标**','- 自身现价与名单价格做绝对差，最近的当同价带对标。鹅颈/0.8L 与 1.7L 烧水壶分开看。美国站价格符号 Y 仍按美元。',
      '**步骤 4 · 优惠**','- couponTrends 连续在线时，用 finalPrice 对标，不用划线价。',
      '**步骤 5 · 长期趋势**','- Keepa BSR / 价格 / 评分数看是不是一天冲榜。看 asinUrl 是 amazon.com 还是 amazon.co.jp。'
    ],extra:'### 判断口径\n- 卖家精灵 units / revenue / BSR 是第三方估算，不能写成后台订单。\n- 关系名单 ≠ 同一产品。\n- 优惠连续在线时，成交价才是对标口径。\n- 价格符号 Y 不是日元；日本站只看 amazon.co.jp / marketplace=JP。',boundary:'分析只用本次已返回字段。预测销量和跟价动作需要成本、费用和真实订单，本页不下。站点不一致时先重跑，不把日本站 Keepa 当美国站。'});
  }

  function relName(code){
    if(window.Mcp&&window.Mcp.relationLabel)return window.Mcp.relationLabel(code);
    const REL={vav:'看了又看',fbt:'组合购买 FBT',ftb:'组合购买 FBT',mib:'捆绑销售',csi:'买了又买',bav:'看后还买',sp:'SP广告',avp:'关联广告',bab:'浏览后买',mie:'加购扩展',cob:'一起买',fsa:'四星推荐',bca:'品牌关联'};
    const c=String(code||'').toLowerCase();
    return REL[c]||c;
  }
  function listingBySource(steps){
    const u=U(),out=[];
    (steps||[]).filter(s=>s.tool==='traffic_listing'&&s.status==='ok').forEach(s=>{
      const argRel=s.targetRelation||(s.args&&s.args.request&&Array.isArray(s.args.request.relations)?s.args.request.relations[0]:'');
      const mixed=!s.targetRelation&&s.args&&s.args.request&&Array.isArray(s.args.request.relations)&&s.args.request.relations.length>1;
      const root=sellerRoot([s],'traffic_listing')||{};
      sellerItems(root).forEach(r=>{
        const code=String(r.relation||r.relType||r.trafficType||argRel||'').toLowerCase();
        out.push({row:r,rel:code,mixed:mixed&&!(r.relation||r.relType||r.trafficType),total:u.scalar(root.total)});
      });
    });
    return out;
  }
  function trafficGraphReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const stat=sellerRoot(steps,'traffic_listing_stat')||{};
    const items=(Array.isArray(stat.items)?stat.items:[]).filter(x=>x&&typeof x==='object').map(x=>({code:String(x.relation||'').toLowerCase(),count:u.scalar(x.count)})).filter(x=>x.code);
    items.sort((a,b)=>(b.count||0)-(a.count||0));
    const total=u.scalar(stat.relations??stat.total)??items.reduce((s,x)=>s+(x.count||0),0);
    const hot=items.filter(x=>x.count>0);
    const top=hot[0]||null;
    const tagged=listingBySource(steps);
    const list=tagged.map(x=>Object.assign({},x.row,{_rel:x.rel,_mixed:x.mixed}));
    const listSteps=(steps||[]).filter(s=>s.tool==='traffic_listing');
    const listFailed=listSteps.some(s=>s.status==='error')&&!list.length;
    const mixedOnly=list.length&&list.every(r=>r._mixed);
    let lead;
    if(listFailed&&!hot.length&&!items.length)lead='关联列表缺必填 relations，统计也没有返回类型。硬刷新后重试失败步骤。';
    else if(!hot.length&&items.length)lead='关联位各类型都是 0，没有导流 ASIN 可点名。新品常见，不能据此说没有竞品。';
    else if(!items.length&&!list.length)lead='关联统计和明细都没有返回，不能画关系图。';
    else {
      const by={};
      list.forEach(r=>{const k=r._mixed?'未分类型':(r._rel||'未标');by[k]=(by[k]||0)+1;});
      const srcTxt=Object.keys(by).map(k=>(k==='未分类型'||k==='未标'?k:relName(k))+' '+fmt(by[k],0)+' 条').join('、');
      lead='关联位合计 '+(total===null?'未提供':fmt(total,0))+'。主力是 '+(top?relName(top.code)+' '+fmt(top.count,0):'未提供')+'。非零类型：'+(hot.length?hot.map(x=>relName(x.code)+' '+fmt(x.count,0)).join('、'):'没有')+'。'+(listFailed?'明细步骤失败，请重试。':(list.length?('明细样本 '+fmt(list.length,0)+' 条：'+srcTxt+'。'):'明细未取到。'))+(mixedOnly?' 这批没带来源，请重新运行本场景，按看了又看 / FBT 等类型分开拉。':'')+'关联位候选不是必投。';
    }
    const charts=[];
    if(items.length)charts.push({title:'关联类型条数',source:'traffic_listing_stat',kind:'bar',points:items.map(x=>({label:relName(x.code),value:x.count||0})),ratio:0,note:'按条数从高到低。0 也画出来，避免只看到前几个空类型。'});
    if(list.some(r=>u.scalar(r.units??r.amzUnit)!==null))charts.push({title:'导流 ASIN 估算销量',source:'traffic_listing',kind:'bar',points:list.filter(r=>u.scalar(r.units??r.amzUnit)!==null).slice(0,8).map(r=>({label:u.readable(r.brand)||u.readable(r.asin),value:u.scalar(r.units??r.amzUnit)})),ratio:0,note:'卖家精灵估算，不是后台订单。'});
    const tables=[];
    if(items.length)tables.push({title:'关联类型分布',headers:['类型','代码','条数'],rows:items.map(x=>[relName(x.code),x.code,x.count===null?'—':fmt(x.count,0)]),note:'vav=看了又看，sp=SP 广告。表格按条数排序，不要只看接口原序的前几行 0。'});
    if(list.length)tables.push({title:'导流 ASIN 明细',headers:['来源','ASIN','品牌','估算销量','价格','标题'],rows:list.slice(0,40).map(r=>[r._mixed?'未分类型':(r._rel?relName(r._rel):'未标'),u.readable(r.asin)||'—',u.readable(r.brand)||'—',u.scalar(r.units??r.amzUnit)===null?'—':fmt(u.scalar(r.units??r.amzUnit),0),u.scalar(r.price)===null?'—':'$'+fmt(u.scalar(r.price),0),(u.readable(r.title)||'').slice(0,48)]),note:'来源是看了又看 / 组合购买 FBT / SP 广告等版块。FBT 即 Frequently bought together，有人写成 FTB。混在一页且没有类型字段时写未分类型，需按类型重拉。'});
    tables.push({title:'计算过程',headers:['指标','算法','结果'],rows:[
      ['关联合计','stat.relations 或各类型相加',total===null?'未提供':String(total)],
      ['非零类型','count>0 的 relation',hot.length?hot.map(x=>x.code).join('、'):'没有'],
      ['明细条数','按类型分次 listing 后合并',listFailed?'步骤失败':String(list.length)],
      ['来源','步骤 targetRelation 或行内 relation',mixedOnly?'未分类型，需重跑':(list.filter(r=>r._rel&&!r._mixed).length?list.filter(r=>r._rel&&!r._mixed).map(r=>r._rel).filter((v,i,a)=>a.indexOf(v)===i).join('、'):'未标')]
    ],note:'统计是结构，明细才是具体导流 ASIN。'});
    return pack(scene,{lead,conclusion:[
      hot.length?('- 关联位合计 '+(total===null?'未提供':fmt(total,0))+'。主力 '+relName(top.code)+' '+fmt(top.count,0)+'。'):'- 各关联类型都是 0，或统计未返回，不能点名导流位。',
      list.length?('- 明细 '+fmt(list.length,0)+' 条。'+(mixedOnly?'来源未拆开，重新运行后按看了又看 / FBT 分列。':'已按来源标注：'+list.filter(r=>r._rel&&!r._mixed).map(r=>relName(r._rel)).filter((v,i,a)=>a.indexOf(v)===i).join('、')+'。')):(listFailed?'- 明细步骤失败：列表接口要带 relations，硬刷新后重试。':'- 没有导流 ASIN 明细。'),
      '- 看了又看、组合购买是自然关联；SP / 关联广告是付费位。不要把关联名单当必投清单。',
      '- 没有花费和订单，不能判断这些位值不值得打。'
    ],ok:okCount(steps),cards:[
      {label:'关联合计',value:total===null?'未提供':String(total)},
      {label:'主力类型',value:top?relName(top.code):'未提供'},
      {label:'非零类型',value:String(hot.length)},
      {label:'明细样本',value:listFailed?'失败':String(list.length)}
    ],charts,tables,process:[
      '**步骤 1 · 结构**','- traffic_listing_stat 按关联类型计数。先看非零类型，不要被接口原序里的 mib/fbt=0 挡住。',
      '**步骤 2 · 明细**','- 有量的类型各拉一次 traffic_listing，表上「来源」写看了又看或组合购买 FBT，不混在一页里猜。',
      '**步骤 3 · 流向**','- traffic_source 看关键词/ASIN 流向，和关联位不是同一回事。',
      '**步骤 4 · 动作**','- 关联位候选用来找可能抢位的 Listing，不是自动加广告。'
    ],extra:'### 判断口径\n- 统计条数不是曝光，也不是订单。\n- 关联名单 ≠ 同一产品、更不是必投。\n- 美国站看 marketplace=US。',boundary:'分析只用本次已返回字段。没有花费和订单，本页不下令投放。'});
  }

  function fracShare(v){
    if(v===null||v===undefined||v==='')return null;
    const n=Number(v);
    if(!Number.isFinite(n)||n<0)return null;
    if(n>1&&n<=100)return n/100;
    if(n>100)return null;
    return n;
  }
  function pctShare(v){
    const p=fracShare(v);
    return p===null?'未提供':((p*100).toFixed(1)+'%');
  }
  function barrierLabel(r){
    if(!r||typeof r!=='object')return '—';
    const u=U();
    return u.readable(r.label||r.name||r.sellerName||r.seller||r.brand||r.country||r.nation||r.sellerType||r.type||r.ebcType||r.period||r.age||r.asin)||'—';
  }
  function unitsShare(r){
    if(!r||typeof r!=='object')return null;
    return fracShare(r.totalUnitsRatio??r.unitsRatio??r.unitRatio??r.salesRatio??r.unitsShare??r.ratio);
  }
  function revShare(r){
    if(!r||typeof r!=='object')return null;
    return fracShare(r.totalRevenueRatio??r.revenueRatio??r.revenueShare);
  }
  function prodShare(r){
    if(!r||typeof r!=='object')return null;
    return fracShare(r.productsRatio??r.asinRatio??r.productRatio);
  }
  function prodCount(r){
    if(!r||typeof r!=='object')return null;
    return U().scalar(r.products??r.productCount??r.asins??r.asinCount??r.count);
  }
  function crShare(rows,n){
    const xs=(rows||[]).map(unitsShare).filter(v=>v!==null).slice(0,n);
    if(!xs.length)return null;
    return xs.reduce((a,b)=>a+b,0);
  }
  function barLevel(p,high,mid){
    if(p===null)return '未提供';
    if(p>=high)return '高';
    if(p>=mid)return '中';
    return '低';
  }
  function leafNameOf(form,steps,ctxLabel){
    if(ctxLabel)return String(ctxLabel).split(':').pop()||ctxLabel;
    const detail=sellerRoot(steps,'asin_detail_with_coupon_trend')||{};
    const asin=detail.asin&&typeof detail.asin==='object'?detail.asin:detail;
    const path=asin.nodeLabelPath||'';
    if(path)return String(path).split(':').pop()||path;
    const leaf=(Array.isArray(asin.subcategories)?asin.subcategories[0]:null)||null;
    if(leaf)return U().readable(leaf.label||leaf.node)||'';
    const picked=window.Mcp&&window.Mcp.pickSellerNode?window.Mcp.pickSellerNode(sellerRoot(steps,'product_node'),form&&form.category):null;
    if(picked&&picked.name)return String(picked.name).split(':').pop()||picked.name;
    return (form&&form.category)||'';
  }
  function marketBarrierReport(scene,form,steps){
    const u=U(),fmt=u.fmt,self=String((form&&form.asin)||'').toUpperCase();
    const products=sellerItems(sellerRoot(steps,'market_product_concentration')).slice().sort((a,b)=>(unitsShare(b)||0)-(unitsShare(a)||0));
    const sellers=sellerItems(sellerRoot(steps,'market_seller_concentration')).slice().sort((a,b)=>(unitsShare(b)||0)-(unitsShare(a)||0));
    const types=sellerItems(sellerRoot(steps,'market_seller_type_concentration')).slice().sort((a,b)=>(unitsShare(b)||0)-(unitsShare(a)||0));
    const countries=sellerItems(sellerRoot(steps,'market_seller_country_distribution')).slice().sort((a,b)=>(unitsShare(b)||0)-(unitsShare(a)||0));
    const ages=sellerItems(sellerRoot(steps,'market_listing_date_distribution'));
    const ebc=sellerItems(sellerRoot(steps,'market_ebc_distribution'));
    const leaf=leafNameOf(form,steps);
    const cr3=crShare(products,3),cr5=crShare(products,5),cr10=crShare(products,10);
    const topProduct=products[0]||null;
    const amazonSeller=sellers.find(r=>/amazon|^amz$|亚马逊/i.test(barrierLabel(r)))||null;
    const topSeller=sellers[0]||null;
    const amzType=types.find(r=>/自营|amazon\s*retail/i.test(barrierLabel(r)))||null;
    const fba=types.find(r=>/^fba$|FBA/i.test(barrierLabel(r)))||null;
    const fbm=types.find(r=>/^fbm$|FBM|自发货/i.test(barrierLabel(r)))||null;
    const us=countries.find(r=>/美国|united states|^us$|usa/i.test(barrierLabel(r)))||null;
    const cn=countries.find(r=>/中国|china|^cn$|^prc$/i.test(barrierLabel(r)))||null;
    const young=ages.find(r=>/3个月|90天|新品/i.test(barrierLabel(r)))||null;
    const old=ages.find(r=>/3年|36个月|以上|老品/i.test(barrierLabel(r)))||null;
    const aplus=ebc.find(r=>{const t=String(barrierLabel(r)).trim();return t==='A+'||t==='有A+'||/^a\+$/i.test(t);})||null;
    const aplusVideo=ebc.find(r=>/有A+.*视频|视频.*A\+/i.test(barrierLabel(r)))||null;
    const selfRow=products.find(r=>String(r.asin||'').toUpperCase()===self)||null;
    const dims=[
      {name:'商品集中',level:barLevel(cr10,0.55,0.35),value:cr10,note:cr10===null?'没有头部销量份额':'CR10 '+pctShare(cr10)+(topProduct?'，头部品 '+(u.readable(topProduct.brand)||topProduct.asin):'')},
      {name:'卖家集中',level:barLevel(amazonSeller?unitsShare(amazonSeller):unitsShare(topSeller),0.40,0.25),value:amazonSeller?unitsShare(amazonSeller):unitsShare(topSeller),note:amazonSeller?('Amazon 销量份额 '+pctShare(unitsShare(amazonSeller))):(topSeller?barrierLabel(topSeller)+' '+pctShare(unitsShare(topSeller)):'没有卖家份额')},
      {name:'履约结构',level:barLevel(unitsShare(amzType),0.40,0.25),value:unitsShare(amzType),note:amzType?('Amazon 自营 '+pctShare(unitsShare(amzType))+(fba?'，FBA '+pctShare(unitsShare(fba)):'')+(fbm?'，FBM '+pctShare(unitsShare(fbm)):'')):'没有履约份额'},
      {name:'卖家国家',level:barLevel(unitsShare(us),0.70,0.50),value:unitsShare(us),note:us?('美国卖家销量 '+pctShare(unitsShare(us))+(cn?'，中国 '+pctShare(unitsShare(cn)):'')):'没有国家份额'},
      {name:'商品年龄',level:barLevel(unitsShare(old),0.45,0.25),value:unitsShare(old),note:old?('3年+ '+pctShare(unitsShare(old))+(young?'，3个月桶 '+pctShare(unitsShare(young)):'')):(young?'3个月桶 '+pctShare(unitsShare(young)):'没有年龄份额')},
      {name:'内容门槛',level:barLevel(prodShare(aplus)??unitsShare(aplus),0.70,0.45),value:prodShare(aplus)??unitsShare(aplus),note:aplus?('A+商品 '+pctShare(prodShare(aplus)??unitsShare(aplus))+(aplusVideo?'，有A+有视频 '+pctShare(prodShare(aplusVideo)??unitsShare(aplusVideo)):'')):'没有 A+ 覆盖'}
    ];
    const high=dims.filter(d=>d.level==='高').length;
    const mid=dims.filter(d=>d.level==='中').length;
    const known=dims.filter(d=>d.level!=='未提供').length;
    const overall=known===0?'未提供':(high>=4?'很高':(high>=2||(high>=1&&mid>=2)?'中高':(high===0&&mid<=1?'偏低':'中等')));
    const hasShare=products.length||sellers.length||types.length||countries.length||ages.length||ebc.length;
    let lead;
    if(!hasShare){
      lead='没有读到叶子类目的六维份额。市场接口要的是数字 nodeIdPath，不是类目文本。把站点选美国站、类目写成 electric kettle / Electric Kettles'+(self?'，并保留主 ASIN':'')+' 后重新运行，不要用上次空路径结果点生成报告。记录条数不是壁垒。';
    } else {
      lead='叶子类目 '+(leaf||'未提供')+'。商品 CR5 '+(cr5===null?'未提供':pctShare(cr5))+'、CR10 '+(cr10===null?'未提供':pctShare(cr10))+(topProduct?'，头部品 '+(u.readable(topProduct.brand)||'—')+' '+(topProduct.asin||'')+' 约 '+pctShare(unitsShare(topProduct)):'')+'。'+(amazonSeller?('Amazon 卖家约占销量 '+pctShare(unitsShare(amazonSeller))+(revShare(amazonSeller)!==null?'、销售额 '+pctShare(revShare(amazonSeller)):'')+'。'):'')+(amzType?('履约上 Amazon 自营 '+pctShare(unitsShare(amzType))+(fba?'，FBA '+pctShare(unitsShare(fba)):'')+'。'):'')+(us?('美国卖家销量 '+pctShare(unitsShare(us))+(cn?'，中国 '+pctShare(unitsShare(cn)):'')+'。'):'')+(young?('上架 3 个月桶约占销量 '+pctShare(unitsShare(young))+'。'):'')+(aplus?('A+ 已覆盖 '+(prodShare(aplus)!==null?pctShare(prodShare(aplus)):pctShare(unitsShare(aplus)))+(aplusVideo?'，有A+有视频 '+(prodShare(aplusVideo)!==null?pctShare(prodShare(aplusVideo)):pctShare(unitsShare(aplusVideo))):'')+'，内容是入场配置不是差异。'):'')+'综合壁垒 '+overall+'。份额是卖家精灵估算，不是后台市占。';
    }
    const charts=[];
    if(products.some(r=>unitsShare(r)!==null))charts.push({title:'头部商品销量份额',source:'market_product_concentration',kind:'bar',points:products.filter(r=>unitsShare(r)!==null).slice(0,8).map(r=>({label:u.readable(r.brand)||r.asin,value:Number((unitsShare(r)*100).toFixed(2))})),ratio:0,note:'卖家精灵估算销量份额，不是后台订单。'});
    if(types.some(r=>unitsShare(r)!==null))charts.push({title:'履约类型销量份额',source:'market_seller_type_concentration',kind:'bar',points:types.filter(r=>unitsShare(r)!==null).map(r=>({label:barrierLabel(r),value:Number((unitsShare(r)*100).toFixed(2))})),ratio:0,note:'Amazon 自营 / FBA / FBM。'});
    if(countries.some(r=>unitsShare(r)!==null))charts.push({title:'卖家国家销量份额',source:'market_seller_country_distribution',kind:'bar',points:countries.filter(r=>unitsShare(r)!==null).slice(0,8).map(r=>({label:barrierLabel(r),value:Number((unitsShare(r)*100).toFixed(2))})),ratio:0,note:'卖家所属国家，不是消费者国家。'});
    if(ages.some(r=>unitsShare(r)!==null))charts.push({title:'商品年龄销量份额',source:'market_listing_date_distribution',kind:'bar',points:ages.filter(r=>unitsShare(r)!==null).map(r=>({label:barrierLabel(r),value:Number((unitsShare(r)*100).toFixed(2))})),ratio:0,note:'桶标签是上架年龄，不是本次记录条数。'});
    if(ebc.some(r=>(prodShare(r)??unitsShare(r))!==null))charts.push({title:'A+ / 视频覆盖',source:'market_ebc_distribution',kind:'bar',points:ebc.filter(r=>(prodShare(r)??unitsShare(r))!==null).map(r=>({label:barrierLabel(r),value:Number(((prodShare(r)??unitsShare(r))*100).toFixed(2))})),ratio:0,note:'A+ 行是覆盖汇总，不是某一个 Listing。'});
    const tables=[];
    if(products.length)tables.push({title:'头部商品',headers:['ASIN','品牌','销量份额','销售额份额','价格','评论'],rows:products.slice(0,10).map(r=>[r.asin||'—',u.readable(r.brand)||'—',pctShare(unitsShare(r)),pctShare(revShare(r)),u.scalar(r.price)===null?'—':'$'+fmt(u.scalar(r.price),2),u.scalar(r.ratings??r.reviews)===null?'—':fmt(u.scalar(r.ratings??r.reviews),0)]),note:'CR 按本表销量份额累加。头部品通常是大盘烧水壶，不等于鹅颈壶。'});
    if(sellers.length)tables.push({title:'卖家集中',headers:['卖家','商品数','销量份额','销售额份额'],rows:sellers.slice(0,10).map(r=>[barrierLabel(r),prodCount(r)===null?'—':fmt(prodCount(r),0),pctShare(unitsShare(r)),pctShare(revShare(r))]),note:'Amazon 出现在卖家表里，表示平台自营吃量，不是普通 3P。'});
    if(types.length)tables.push({title:'履约结构',headers:['类型','商品数','销量份额','销售额份额'],rows:types.map(r=>[barrierLabel(r),prodCount(r)===null?'—':fmt(prodCount(r),0),pctShare(unitsShare(r)),pctShare(revShare(r))]),note:'自营高说明跟价和库存能力要按 Amazon 规则想，不是只跟 FBA 卖家。'});
    if(countries.length)tables.push({title:'卖家国家',headers:['国家','商品数','销量份额','销售额份额'],rows:countries.map(r=>[barrierLabel(r),prodCount(r)===null?'—':fmt(prodCount(r),0),pctShare(unitsShare(r)),pctShare(revShare(r))]),note:'中国卖家商品数可以很多，但仍可能只占较小销量。'});
    if(ages.length)tables.push({title:'商品年龄',headers:['年龄桶','商品数','销量份额','销售额份额'],rows:ages.map(r=>[barrierLabel(r),prodCount(r)===null?'—':fmt(prodCount(r),0),pctShare(unitsShare(r)),pctShare(revShare(r))]),note:'3 个月桶有自身新品很正常；要看这个桶吃不吃得动销量。'});
    if(ebc.length)tables.push({title:'内容建设',headers:['类型','商品覆盖','销量份额'],rows:ebc.map(r=>[barrierLabel(r),pctShare(prodShare(r)),pctShare(unitsShare(r))]),note:'A+ 行是汇总。有A+有视频接近全覆盖时，内容是入场配置。'});
    tables.push({title:'六维壁垒',headers:['维度','强度','依据'],rows:dims.map(d=>[d.name,d.level,d.note]),note:'强度只比较本次返回的份额。没有综合分公式之外的编造。'});
    tables.push({title:'计算过程',headers:['指标','算法','结果'],rows:[
      ['叶子类目','product_node 选叶子，有主 ASIN 时用详情 nodeIdPath 覆盖',leaf||'未提供'],
      ['CR3 / CR5 / CR10','头部商品销量份额累加',[cr3,cr5,cr10].map(v=>v===null?'未提供':pctShare(v)).join(' / ')],
      ['Amazon 卖家','卖家表名称匹配 Amazon / AMZ / 亚马逊',amazonSeller?pctShare(unitsShare(amazonSeller)):'未提供'],
      ['Amazon 自营','履约表匹配自营',amzType?pctShare(unitsShare(amzType)):'未提供'],
      ['综合壁垒','高维≥4 很高；高维≥2 或 1高+2中 中高',overall],
      ['自身是否进头部',self||'未填主 ASIN',selfRow?(selfRow.asin+' · '+pctShare(unitsShare(selfRow))):'未出现在头部商品表']
    ],note:'nodeIdPath 必须是数字路径。类目文本或记录条数不能当壁垒。'});
    const conclusion=hasShare?[
      '- 叶子类目 '+(leaf||'未提供')+'。商品 CR5 '+(cr5===null?'未提供':pctShare(cr5))+'，CR10 '+(cr10===null?'未提供':pctShare(cr10))+'。'+(topProduct?('头部品 '+(u.readable(topProduct.brand)||topProduct.asin)+' 约 '+pctShare(unitsShare(topProduct))+'，这是大盘集中，不是鹅颈细分垄断。'):''),
      amazonSeller?('- Amazon 作为卖家约占销量 '+pctShare(unitsShare(amazonSeller))+(revShare(amazonSeller)!==null?'、销售额 '+pctShare(revShare(amazonSeller)):'')+(prodCount(amazonSeller)!==null?'，商品 '+fmt(prodCount(amazonSeller),0)+' 个':'')+'。这是平台自营壁垒。'):'- 卖家表没有 Amazon 行，不能写自营垄断。',
      amzType?('- 履约：Amazon 自营 '+pctShare(unitsShare(amzType))+(fba?'，FBA '+pctShare(unitsShare(fba)):'')+(fbm?'，FBM '+pctShare(unitsShare(fbm)):'')+'。'):'- 没有履约份额。',
      (us||cn)?('- 卖家国家：'+(us?('美国销量 '+pctShare(unitsShare(us))):'美国未提供')+(cn?('，中国销量 '+pctShare(unitsShare(cn))+(prodCount(cn)!==null?' / 商品 '+fmt(prodCount(cn),0):'')):'')+'。中国卖家多不等于中国卖家吃量。'):'- 没有国家份额。',
      (young||old)?('- 商品年龄：'+(young?('3个月桶 '+pctShare(unitsShare(young))):'')+(old?(young?'，':'')+'3年+ '+pctShare(unitsShare(old)):'')+'。新品能上架，不代表能从老品手里抢量。'):'- 没有年龄份额。',
      aplus?('- A+ 覆盖 '+(prodShare(aplus)!==null?pctShare(prodShare(aplus)):pctShare(unitsShare(aplus)))+(aplusVideo?'，有A+有视频 '+(prodShare(aplusVideo)!==null?pctShare(prodShare(aplusVideo)):pctShare(unitsShare(aplusVideo))):'')+'。内容是入场配置，做了也不构成差异。'):'- 没有 A+ 覆盖。',
      '- 综合壁垒 '+overall+'。高壁垒不是不能进，而是不要按 Cosori / Amazon 大盘头部品硬拼；鹅颈、温控、0.8L 要单独验证。份额是估算，不是后台市占。'
    ]:[
      '- 六维接口没有返回份额。上次把类目文本当成 nodeIdPath 时，集中度会空、年龄/A+只会留下桶标签。',
      '- 必须先定位 Electric Kettles 这类叶子节点，再拉商品/卖家/国家/履约/年龄/内容。',
      '- 不要把“成功 6 步、18 条记录”写成进入壁垒。'
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'叶子类目',value:leaf||'未提供'},
      {label:'商品CR5',value:cr5===null?'未提供':pctShare(cr5)},
      {label:'Amazon销量',value:amazonSeller?pctShare(unitsShare(amazonSeller)):(amzType?pctShare(unitsShare(amzType)):'未提供')},
      {label:'A+覆盖',value:aplus?(prodShare(aplus)!==null?pctShare(prodShare(aplus)):pctShare(unitsShare(aplus))):'未提供'}
    ],charts,tables,process:[
      '**步骤 1 · 定位叶子**','- product_node 用类目词找 nodeIdPath，避开吉他配件等脏节点。有主 ASIN 时用详情路径覆盖，确保是 Electric Kettles 而不是父级 Drinkware。',
      '**步骤 2 · 商品集中**','- 用头部 Listing 销量份额算 CR3/CR5/CR10。头部品品牌要点名，不能只数返回了几行。',
      '**步骤 3 · 卖家与履约**','- 卖家表看 Amazon 吃量；履约表看自营 / FBA / FBM。两张表不要混成“卖家结构”。',
      '**步骤 4 · 国家与年龄**','- 国家看销量份额，不看商品数。年龄看老品桶和新品桶各吃多少量。',
      '**步骤 5 · 内容门槛**','- A+ 行是覆盖汇总。有A+有视频接近全覆盖时，内容是入场配置。',
      '**步骤 6 · 进入判断**','- 高维数量决定综合壁垒。高壁垒=按细分差异化验证，不是不能进，更不是用记录条数打分。'
    ],extra:'### 判断口径\n- 市场接口只要数字 nodeIdPath，类目文本会让集中度空返回。\n- 份额是卖家精灵估算，不是后台市占。\n- Amazon 在卖家表是自营，不是普通 3P。\n- A+ 行不是某一个 Listing。\n- 大盘 Electric Kettles ≠ 鹅颈壶细分。',boundary:'分析只用本次已返回的份额字段。没有成本和订单，本页不下令备货或跟价。旧的空路径结果必须重新运行，不能点生成报告冒充壁垒。'});
  }

  function reviewDay(v){
    if(v==null||v==='')return '';
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
    const n=Number(v);
    if(!Number.isFinite(n)||n<=0)return '';
    const ms=n<1e12?n*1000:n;
    const d=new Date(ms);
    return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';
  }
  function reviewView(r){
    if(!r||typeof r!=='object')return null;
    const u=U();
    const star=u.scalar(r.star??r.stars??r.rating??r.starRating);
    const title=u.readable(r.title||r.reviewTitle||'');
    const content=u.readable(r.content||r.comment||r.body||r.text||r.review||'');
    const text=(title+' '+content).replace(/\s+/g,' ').trim();
    if(!text&&star===null)return null;
    return {
      star,title,content,text,
      date:reviewDay(r.date||r.reviewDate||r.createdTime),
      verified:r.verified===true,
      vine:r.vine===true||r.free===true||r.experience===true,
      likes:u.scalar(r.likes),
      author:u.readable(r.author)
    };
  }
  const VOC_THEMES=[
    {id:'leak',name:'漏水/密封',kind:'pain',re:/leak|drip|seep|seal|spout drip|漏水|滴水|渗/i,fix:'检查壶嘴密封和壶盖配合'},
    {id:'rust',name:'锈/异味/材质',kind:'pain',re:/rust|metallic|plastic taste|chemical|smell|odor|锈|异味|塑料味|金属味/i,fix:'减少塑料过水，改不锈钢水路'},
    {id:'temp',name:'温控/保温',kind:'pain',re:/temperature|inaccurate|not hot enough|lukewarm|keep warm|hold temp|cool too|温控|不热|保温|温度不准/i,fix:'校准温控或加保温'},
    {id:'spout',name:'壶嘴/水流',kind:'pain',re:/spout|pour over|gooseneck|flow rate|dribble|splash|壶嘴|水流|鹅颈|溅/i,fix:'优化鹅颈出水和止水'},
    {id:'handle',name:'手柄/防烫',kind:'pain',re:/handle|hot to (the )?touch|burn|scald|cool touch|手柄|烫手|防烫/i,fix:'手柄隔热或双层壶壁'},
    {id:'lid',name:'壶盖/开合',kind:'pain',re:/lid|hard to open|pop off|盖子|打不开|盖不严/i,fix:'改进开盖和密封'},
    {id:'noise',name:'噪音',kind:'pain',re:/loud|noisy|noise|buzz|吵|噪音/i,fix:'降低加热噪音'},
    {id:'base',name:'底座/断电',kind:'pain',re:/base|cord|plug|shut.?off|boil dry|auto off|底座|插头|断电|干烧/i,fix:'检查底座接触和自动断电'},
    {id:'durable',name:'耐用/故障',kind:'pain',re:/broke|broken|stopped working|dead|warranty|month later|坏了|不工作|故障|保修/i,fix:'提高加热元件寿命'},
    {id:'ship',name:'物流/包装',kind:'logistics',re:/shipping|packaging|box crushed|damaged in transit|arrived broken|物流|包装|运输破损/i,fix:'包装加固，不当产品功能'},
    {id:'expect',name:'期望不符',kind:'expect',re:/not as (described|pictured)|smaller than|cheap feel|expected|和描述不符|和图片不符|比想象/i,fix:'标题主图对齐实际规格'},
    {id:'speed',name:'煮水速度',kind:'feature',re:/fast boil|quick boil|heats? (up )?fast|rapid|很快|迅速烧开|1500w/i,fix:'作为卖点写进标题和五点'},
    {id:'easy',name:'易用/清洁',kind:'feature',re:/easy to (use|clean)|simple|intuitive|好用|好清洗|易清洁/i,fix:'作为卖点保留'},
    {id:'precise',name:'精准倒水/手冲',kind:'feature',re:/precise pour|control(led)? pour|pour over|gooseneck|手冲|精准倒/i,fix:'鹅颈/手冲能力是差异点'}
  ];
  const VOC_WISH=/wish|would be better|need(s|ed)? a|missing|should have|hope they|if only|没有.{0,8}(保温|温控|滤网)|希望|最好能|建议加/i;
  function vocHits(text){
    const t=String(text||'');
    return VOC_THEMES.filter(th=>th.re.test(t));
  }
  function vocLayer(rev,hits){
    if(!rev)return '未分层';
    if(hits.some(h=>h.kind==='logistics'))return '物流/包装';
    if(hits.some(h=>h.kind==='expect'))return '期望不符';
    if(rev.star!==null&&rev.star<=2&&hits.some(h=>h.kind==='pain'))return '产品差评';
    if(rev.star!==null&&rev.star>=3&&rev.star<=4&&hits.some(h=>h.kind==='pain'))return '可改进痛点';
    if(VOC_WISH.test(rev.text)&&rev.star!==null&&rev.star<=4)return '功能机会';
    if(rev.star===5&&hits.some(h=>h.kind==='feature'))return '功能验证';
    if(rev.star===5)return '好评';
    if(rev.star!==null&&rev.star<=2)return '差评待拆';
    return '未分层';
  }
  function vocGrade(n){
    if(n>=3)return '样本内较稳';
    if(n===2)return '待复核';
    return '单条，不能当需求';
  }
  function collectReviews(steps){
    const map=new Map();
    (steps||[]).filter(s=>s.tool==='review'&&s.status==='ok').forEach(s=>{
      sellerItems(sellerRoot([s],'review')).forEach(row=>{
        const r=reviewView(row);
        if(!r)return;
        const key=[r.date,r.star,r.title,r.content].join('|');
        if(!map.has(key))map.set(key,r);
      });
    });
    return [...map.values()].sort((a,b)=>(b.star||0)-(a.star||0)||String(b.date).localeCompare(String(a.date)));
  }
  function vocReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const reviews=collectReviews(steps);
    const reviewSteps=(steps||[]).filter(s=>s.tool==='review');
    const split=reviewSteps.some(s=>Array.isArray(s.targetStars)&&s.targetStars.length);
    const annotated=reviews.map(r=>{
      const hits=vocHits(r.text);
      return Object.assign({},r,{hits,layer:vocLayer(r,hits)});
    });
    const byStar=[1,2,3,4,5].map(star=>({star,n:annotated.filter(r=>r.star===star).length}));
    const mid=annotated.filter(r=>r.star===3||r.star===4);
    const low=annotated.filter(r=>r.star===1||r.star===2);
    const themeCount=new Map();
    annotated.forEach(r=>r.hits.forEach(h=>{
      const cur=themeCount.get(h.id)||{theme:h,n:0,stars:[],layers:[]};
      cur.n+=1;
      cur.stars.push(r.star);
      cur.layers.push(r.layer);
      themeCount.set(h.id,cur);
    }));
    const themes=[...themeCount.values()].sort((a,b)=>b.n-a.n);
    const pains=themes.filter(t=>t.theme.kind==='pain');
    const features=themes.filter(t=>t.theme.kind==='feature');
    const logistics=themes.filter(t=>t.theme.kind==='logistics');
    const topPain=pains[0]||null;
    const topFeat=features[0]||null;
    const wishRows=annotated.filter(r=>VOC_WISH.test(r.text));
    const vineN=annotated.filter(r=>r.vine).length;
    const verifiedN=annotated.filter(r=>r.verified).length;
    let lead;
    if(!annotated.length){
      lead='评论接口没有返回正文。确认站点是美国站、主 ASIN 填对后重新运行。接口默认只给 5 条，本场景会按星级分批各拉最多 10 条。不要用记录条数当 VOC。';
    } else {
      lead='样本 '+fmt(annotated.length,0)+' 条'+(split?'，已按 1–2★ / 3–4★ / 5★ 分批':'，还是混页（默认最多 5 条），请重新运行按星级分批')+'。3–4★ '+fmt(mid.length,0)+' 条，1–2★ '+fmt(low.length,0)+' 条。'+(topPain?('主痛点是 '+topPain.theme.name+'，样本内 '+fmt(topPain.n,0)+' 次，'+vocGrade(topPain.n)+'。'):'没有匹配到产品痛点词。')+(topFeat?(' 被提到的功能是 '+topFeat.theme.name+' '+fmt(topFeat.n,0)+' 次。'):'')+(logistics.length?(' 物流/包装 '+fmt(logistics[0].n,0)+' 次，不当功能缺陷。'):'')+' 这是抽样不是全量 VOC，Vine/免费评 '+fmt(vineN,0)+' 条。';
    }
    const charts=[];
    if(byStar.some(x=>x.n))charts.push({title:'样本星级分布',source:'review',kind:'bar',points:byStar.filter(x=>x.n).map(x=>({label:x.star+'★',value:x.n})),ratio:0,note:'只统计本次返回的评论，不是 Listing 上的全部评分数。'});
    if(themes.length)charts.push({title:'主题出现次数',source:'review',kind:'bar',points:themes.slice(0,8).map(t=>({label:t.theme.name,value:t.n})),ratio:0,note:'一条评论可命中多个主题。次数只在本样本内比。'});
    const tables=[];
    tables.push({title:'分层结论',headers:['分层','条数','怎么用'],rows:[
      ['可改进痛点',String(annotated.filter(r=>r.layer==='可改进痛点').length),'3–4★ 且命中产品问题，优先改结构'],
      ['产品差评',String(annotated.filter(r=>r.layer==='产品差评').length),'1–2★ 产品问题，要看是不是个例'],
      ['物流/包装',String(annotated.filter(r=>r.layer==='物流/包装').length),'不当功能机会'],
      ['期望不符',String(annotated.filter(r=>r.layer==='期望不符').length),'改图片和标题，不当结构缺陷'],
      ['功能机会',String(annotated.filter(r=>r.layer==='功能机会').length),'3–4★ 里明确希望补的功能'],
      ['功能验证',String(annotated.filter(r=>r.layer==='功能验证').length),'5★ 里被点名的能力，可写进卖点']
    ],note:'分层看正文，不看记录总数。'});
    if(themes.length)tables.push({title:'主题与方案',headers:['主题','类型','次数','证据','建议'],rows:themes.map(t=>[t.theme.name,t.theme.kind==='pain'?'痛点':(t.theme.kind==='feature'?'功能':(t.theme.kind==='logistics'?'物流':'期望')),String(t.n),vocGrade(t.n),t.theme.fix]),note:'单条不能立项。3 次以上才在本样本里较稳。'});
    if(annotated.length)tables.push({title:'评论摘录',headers:['星级','分层','日期','命中','摘要'],rows:annotated.slice(0,20).map(r=>[r.star===null?'—':(fmt(r.star,0)+'★'),r.layer,r.date||'—',r.hits.length?r.hits.map(h=>h.name).join('、'):'未命中词典',(r.text||'').slice(0,80)]),note:'先读 3–4★。Vine/免费评证据更弱。'});
    tables.push({title:'计算过程',headers:['指标','算法','结果'],rows:[
      ['样本','去重后的 review 正文',String(annotated.length)],
      ['是否分星级','步骤是否带 targetStars / starList',split?'已分批':'混页，需重跑'],
      ['3–4★','star=3 或 4',String(mid.length)],
      ['主痛点','痛点主题次数最高',topPain?topPain.theme.name+' × '+topPain.n:'未命中'],
      ['功能机会','3–4★ 愿望句或功能主题',wishRows.length?(fmt(wishRows.length,0)+' 条愿望句'):(topFeat?topFeat.theme.name:'未提供')],
      ['Vine/免费','vine / free / experience',String(vineN)],
      ['Verified','verified=true',String(verifiedN)]
    ],note:'接口每页最多 10 条，默认 5 条。评分数 66 不等于评论文 66 条。'});
    const conclusion=annotated.length?[
      '- 样本 '+fmt(annotated.length,0)+' 条'+(split?'，已按星级分批。':'。这是混页默认条数，重新运行后会按 1–2 / 3–4 / 5 星各拉最多 10 条。'),
      topPain?('- 主痛点 '+topPain.theme.name+'，出现 '+fmt(topPain.n,0)+' 次，'+vocGrade(topPain.n)+'。建议：'+topPain.theme.fix+'。'):'- 本样本没有命中产品痛点词典，不能编造漏水或温控问题。',
      mid.length?('- 3–4★ '+fmt(mid.length,0)+' 条是可改进观察窗，优先看这些，不要被 5★ 好评淹没。'):'- 没有 3–4★ 正文，可改进痛点证据弱。',
      logistics.length?('- 物流/包装 '+fmt(logistics[0].n,0)+' 次，这是履约问题，不要写成壶的功能缺陷。'):'- 本样本没有物流主题。',
      topFeat||wishRows.length?('- 功能侧：'+(topFeat?(topFeat.theme.name+' '+fmt(topFeat.n,0)+' 次，'+topFeat.theme.fix+'。'):'')+(wishRows.length?('愿望句 '+fmt(wishRows.length,0)+' 条。'):'')):'- 没有可点名的功能验证或愿望句。',
      '- 证据等级是抽样。Vine/免费评 '+fmt(vineN,0)+' 条。没有退货率和全量评论，不能把单条写成必须改的功能。'
    ]:[
      '- 没有评论正文，不能做 VOC。',
      '- 确认美国站和主 ASIN 后重新运行，按星级分批拉。',
      '- 不要把“成功 1 步、5 条记录”写成痛点结论。'
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'样本',value:String(annotated.length)},
      {label:'3–4★',value:String(mid.length)},
      {label:'主痛点',value:topPain?topPain.theme.name:'未命中'},
      {label:'功能机会',value:topFeat?topFeat.theme.name:(wishRows.length?'愿望句':'未命中')}
    ],charts,tables,process:[
      '**步骤 1 · 抽样**','- 评论接口默认 5 条、最多 10 条。本场景按 1–2★ / 3–4★ / 5★ 分批，避免只看到最新好评。这是抽样，不是 Listing 上的全部评分数。',
      '**步骤 2 · 分层**','- 先读 3–4★：更像可改进。1–2★ 先拆物流/期望/产品。5★ 只用来验证哪些功能被买过的人点名。',
      '**步骤 3 · 主题**','- 用正文匹配漏水、温控、壶嘴、手柄、物流等词典。没匹配到就写未命中，不编造。',
      '**步骤 4 · 证据**','- 同主题 ≥3 次才在本样本里较稳；2 次待复核；1 次不能立项。Vine/免费评降权。',
      '**步骤 5 · 动作**','- 痛点对结构，物流对包装，期望对图片标题。功能机会只有愿望句或 3–4★ 点名缺失时才写。'
    ],extra:'### 判断口径\n- 评分数 ≠ 评论文本条数。\n- 物流/期望不当功能缺陷。\n- 词典未命中 ≠ 没有问题，只是本页不能编。\n- 美国站必须带 marketplace=US。',boundary:'分析只用本次已返回的评论正文。没有退货率和全量评论，本页不下令改模或备货。旧的 5 条混页可生成摘录，但要重跑才能按星级补样本。'});
  }

  function histMonth(p){
    return String((p&& (p.month||p.date))||'').slice(0,7);
  }
  function salesTrendPts(steps){
    const u=U();
    const root=sellerRoot(steps,'asin_sales_trend')||{};
    const raw=Array.isArray(root.salesTrendPoints)?root.salesTrendPoints:(Array.isArray(root.items)?root.items:sellerItems(root));
    return raw.filter(p=>p&&typeof p==='object').map(p=>{
      const child=u.scalar(p.childUnitSales??p.childUnits);
      const parent=u.scalar(p.parentUnitSales??p.parentUnits??p.units);
      return {
        month:histMonth(p),
        child,parent,
        units:child!==null?child:parent,
        rev:u.scalar(p.childSalesRevenue??p.parentSalesRevenue??p.amount),
        price:u.scalar(p.averagePrice??p.price),
        scope:child!==null?'子体':'父体'
      };
    }).filter(p=>p.month).sort((a,b)=>a.month.localeCompare(b.month));
  }
  function predMonths(steps){
    const u=U();
    const root=sellerRoot(steps,'asin_prediction')||{};
    const raw=Array.isArray(root.monthItemList)?root.monthItemList:(Array.isArray(root.monthlyItemList)?root.monthlyItemList:[]);
    return raw.filter(p=>p&&typeof p==='object').map(p=>({
      month:histMonth(p),
      units:u.scalar(p.sales??p.units),
      rev:u.scalar(p.amount??p.revenue),
      price:u.scalar(p.price)
    })).filter(p=>p.month).sort((a,b)=>a.month.localeCompare(b.month));
  }
  function predDays(steps){
    const u=U();
    const root=sellerRoot(steps,'asin_prediction')||{};
    const raw=Array.isArray(root.dailyItemList)?root.dailyItemList:[];
    return raw.filter(p=>p&&typeof p==='object').map(p=>({
      day:isoDay(p.date)||histMonth(p),
      units:u.scalar(p.sales??p.units),
      bsr:u.scalar(p.bsr)
    })).filter(p=>p.day);
  }
  function bsrPredView(steps){
    const u=U();
    const root=sellerRoot(steps,'bsr_prediction')||{};
    if(!root||typeof root!=='object')return null;
    const month=u.scalar(root.estMonthSales??root.monthSales??root.estMonthlySales);
    const day=u.scalar(root.estDailySales??root.dailySales);
    const bsr=u.scalar(root.bsr);
    if(month===null&&day===null&&bsr===null)return null;
    return {month,day,bsr,label:u.readable(root.categoryLabel||root.category),categoryId:u.readable(root.categoryId)};
  }
  function lastWithUnits(pts){
    for(let i=(pts||[]).length-1;i>=0;i--){if(pts[i].units!==null)return pts[i];}
    return null;
  }
  function dirOf(a,b){
    if(a===null||b===null||a===0)return '未提供';
    const d=(b-a)/Math.abs(a);
    if(d>0.1)return '上升';
    if(d<-0.1)return '下降';
    return '走平';
  }
  function gapPct(base,pred){
    if(base===null||pred===null||base===0)return null;
    return (pred-base)/Math.abs(base);
  }
  function predictionTriangleReport(scene,form,steps){
    const u=U(),fmt=u.fmt;
    const hist=salesTrendPts(steps);
    const months=predMonths(steps);
    const days=predDays(steps);
    const bsr=bsrPredView(steps);
    const histOk=!!(steps||[]).some(s=>s.tool==='asin_sales_trend'&&s.status==='ok');
    const predOk=!!(steps||[]).some(s=>s.tool==='asin_prediction'&&s.status==='ok');
    const bsrStep=(steps||[]).find(s=>s.tool==='bsr_prediction');
    const last=lastWithUnits(hist);
    const prev=hist.filter(p=>p.units!==null&&(!last||p.month!==last.month)).slice(-1)[0]||null;
    const histDir=prev&&last?dirOf(prev.units,last.units):'未提供';
    const predLast=lastWithUnits(months);
    const predFirst=months.filter(p=>p.units!==null)[0]||null;
    const predDir=predFirst&&predLast&&predFirst.month!==predLast.month?dirOf(predFirst.units,predLast.units):'未提供';
    const overlap=months.map(p=>{
      const h=hist.find(x=>x.month===p.month&&x.units!==null);
      return h?{month:p.month,hist:h.units,pred:p.units,gap:gapPct(h.units,p.units),scope:h.scope}:null;
    }).filter(Boolean);
    const overlapGap=overlap.length?overlap.map(x=>x.gap).filter(v=>v!==null):[];
    const midGap=overlapGap.length?overlapGap.slice().sort((a,b)=>a-b)[Math.floor((overlapGap.length-1)/2)]:gapPct(last&&last.units,predLast&&predLast.units);
    const bsrGap=gapPct(last&&last.units,bsr&&bsr.month);
    const paths=[last&&last.units!==null,predLast&&predLast.units!==null,bsr&&bsr.month!==null].filter(Boolean).length;
    const dirs=[histDir,predDir].filter(d=>d==='上升'||d==='下降'||d==='走平');
    const dirAgree=dirs.length>=2&&dirs.every(d=>d===dirs[0]);
    const close=v=>v!==null&&Math.abs(v)<=0.4;
    let conf='未提供';
    if(paths>=3&&close(midGap)&&close(bsrGap)&&(dirAgree||dirs.length<2))conf='较高';
    else if(paths>=2&&(close(midGap)||close(bsrGap)))conf='中';
    else if(paths>=1)conf='低，待验证';
    const bsrBlock=bsrStep&&bsrStep.status==='error'?'BSR 预测失败：'+(bsrStep.error||'未说明')
      :(bsrStep&&bsrStep.status==='skip'?'BSR 预测未调用：需要大类 BSR 和一级类目节点，不是类目文本。':'');
    let lead;
    if(!histOk&&!predOk&&!bsr){
      lead='三条路径都没有可用数字。确认美国站和主 ASIN 后重新运行。不要用接口成功条数当预测。';
    } else {
      lead=(last?('历史近月 '+(last.scope||'')+' '+last.month+' 约 '+fmt(last.units,0)+' 单，较上月 '+histDir+'。'):'历史销量没有可用月份。')
        +(predLast?(' ASIN 预测 '+predLast.month+' 约 '+fmt(predLast.units,0)+' 单'+(midGap!==null?'，相对历史 '+(midGap>=0?'+':'')+(midGap*100).toFixed(0)+'%':'')+'。'):' ASIN 预测没有月份。')
        +(bsr?(' BSR 路径按大类第 '+(bsr.bsr===null?'?':fmt(bsr.bsr,0))+' 估每月 '+fmt(bsr.month,0)+' 单'+(bsrGap!==null?'，相对历史 '+(bsrGap>=0?'+':'')+(bsrGap*100).toFixed(0)+'%':'')+'。'):(' '+ (bsrBlock||'BSR 路径未返回。')))
        +' 交叉置信 '+conf+'。这是卖家精灵估算，不能当首批产量。';
    }
    const charts=[];
    if(hist.some(p=>p.units!==null))charts.push({title:'历史月销量',source:'asin_sales_trend',kind:'line',points:hist.filter(p=>p.units!==null).map(p=>({label:p.month,value:p.units,date:p.month})),ratio:0,note:'优先子体；子体为空时用父体。不是后台订单。'});
    if(months.some(p=>p.units!==null))charts.push({title:'ASIN 预测月销量',source:'asin_prediction',kind:months.length>1?'line':'bar',points:months.filter(p=>p.units!==null).map(p=>({label:p.month,value:p.units,date:p.month})),ratio:0,note:'monthItemList。和历史重叠的月份才能算偏差。'});
    if(days.filter(p=>p.units!==null).length>=2)charts.push({title:'ASIN 预测日销量（样本）',source:'asin_prediction',kind:'line',points:days.filter(p=>p.units!==null).slice(-30).map(p=>({label:p.day,value:p.units,date:p.day})),ratio:0,note:'dailyItemList 只用来看近期斜率，不把单日加总当月销量。'});
    const tables=[];
    if(hist.length)tables.push({title:'历史销量',headers:['月份','口径','销量','销售额','均价'],rows:hist.map(p=>[p.month,p.scope,p.units===null?'—':fmt(p.units,0),p.rev===null?'—':fmt(p.rev,0),p.price===null?'—':'$'+fmt(p.price,2)]),note:'子体空值常见，不要把空当成 0。'});
    if(months.length)tables.push({title:'ASIN 预测',headers:['月份','预测销量','预测销售额','均价'],rows:months.map(p=>[p.month,p.units===null?'—':fmt(p.units,0),p.rev===null?'—':fmt(p.rev,0),p.price===null?'—':'$'+fmt(p.price,2)]),note:'预测月份可能和历史重叠，重叠处才能比。'});
    if(overlap.length)tables.push({title:'重叠月份偏差',headers:['月份','历史','ASIN预测','偏差'],rows:overlap.map(p=>[p.month,fmt(p.hist,0),p.pred===null?'—':fmt(p.pred,0),p.gap===null?'—':((p.gap>=0?'+':'')+(p.gap*100).toFixed(0)+'%')]),note:'偏差绝对值 >40% 视为待验证。'});
    tables.push({title:'三条路径',headers:['路径','月份/口径','销量','方向/备注'],rows:[
      ['历史近月',last?last.month+' · '+last.scope:'未提供',last?fmt(last.units,0):'未提供',histDir],
      ['ASIN 预测',predLast?predLast.month:'未提供',predLast?fmt(predLast.units,0):'未提供',predDir+(midGap!==null?' · 偏差 '+(midGap>=0?'+':'')+(midGap*100).toFixed(0)+'%':'')],
      ['BSR 预测',bsr?(('大类第 '+(bsr.bsr===null?'?':fmt(bsr.bsr,0)))+(bsr.label?' · '+bsr.label:'')):(bsrBlock||'未提供'),bsr&&bsr.month!==null?fmt(bsr.month,0):'未提供',bsrGap!==null?('相对历史 '+(bsrGap>=0?'+':'')+(bsrGap*100).toFixed(0)+'%'):(bsr&&bsr.day!==null?('日估 '+fmt(bsr.day,0)):'未提供')]
    ],note:'BSR 要用大类排名 + 一级类目节点。类目文本 electric kettle 会失败。'});
    tables.push({title:'计算过程',headers:['指标','算法','结果'],rows:[
      ['历史近月','salesTrendPoints 最后有销量的月',last?last.month+' / '+last.units:'未提供'],
      ['历史方向','近两月有销量点比较',histDir],
      ['ASIN预测月','monthItemList 最后有销量的月',predLast?predLast.month+' / '+predLast.units:'未提供'],
      ['重叠偏差中位','同月 预测相对历史',midGap===null?'未提供':((midGap>=0?'+':'')+(midGap*100).toFixed(0)+'%')],
      ['BSR月估','estMonthSales',bsr&&bsr.month!==null?String(bsr.month):'未提供'],
      ['置信','3 条且偏差≤40% 且方向不打架=较高',conf]
    ],note:'预测不是订单。区间不能直接当首批产量。'});
    const conclusion=[
      last?('- 历史近月 '+last.month+' '+(last.scope||'')+' 约 '+fmt(last.units,0)+' 单，方向 '+histDir+'。'):'- 历史销量没有可用月份，不能当锚。',
      predLast?('- ASIN 预测 '+predLast.month+' 约 '+fmt(predLast.units,0)+' 单'+(midGap!==null?'，重叠偏差 '+(midGap>=0?'+':'')+(midGap*100).toFixed(0)+'%':'')+'。方向 '+predDir+'。'):'- ASIN 预测没有月份。',
      bsr?('- BSR 路径大类第 '+(bsr.bsr===null?'未提供':fmt(bsr.bsr,0))+'，估每月 '+fmt(bsr.month,0)+' 单'+(bsrGap!==null?'，相对历史 '+(bsrGap>=0?'+':'')+(bsrGap*100).toFixed(0)+'%':'')+'。这是同大类同排名的估算，不是本 ASIN 专属曲线。'):('- BSR 路径没有数字。'+(bsrBlock||'重新运行前先让销量趋势带回 bsrRank 和 nodeIdPath。')),
      '- 交叉置信 '+conf+'。方向一致且偏差不超过约 40% 才提高置信；否则只当待验证区间。',
      '- 没有库存、广告和费用，不能把预测区间写成首批产量或备货令。'
    ];
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[
      {label:'历史近月',value:last?String(last.units):'未提供'},
      {label:'ASIN预测',value:predLast?String(predLast.units):'未提供'},
      {label:'BSR预测',value:bsr&&bsr.month!==null?String(bsr.month):'未提供'},
      {label:'交叉置信',value:conf}
    ],charts,tables,process:[
      '**步骤 1 · 历史锚**','- asin_sales_trend 的 salesTrendPoints。优先子体销量；子体是空就改用父体，空值不当 0。',
      '**步骤 2 · ASIN 预测**','- monthItemList 是月预测。和历史同月才能算偏差。dailyItemList 只看斜率，不把日点加总冒充月。',
      '**步骤 3 · BSR 预测**','- 用历史/详情里的大类 bsrRank + nodeIdPath 第一段（一级类目）。类目文本会失败。得到的是同大类同排名估算。',
      '**步骤 4 · 交叉**','- 三条都在、偏差≤40%、方向不打架，置信才较高。缺一条或偏差大，标待验证。',
      '**步骤 5 · 边界**','- 估算不是后台订单。没有成本、库存和广告花费，不能下备货令。'
    ],extra:'### 判断口径\n- 子体空 ≠ 0。\n- BSR 路径不是本 ASIN 的第三条历史曲线，是大类排名对照。\n- 预测月份和历史月份对不上时，不硬算偏差。\n- 美国站必须带 marketplace=US。',boundary:'分析只用本次已返回字段。旧的“成功 2/3、记录 2 条”页不是三角校验，需重新运行。预测不能直接当首批产量。'});
  }

  function sellerSupplementReport(scene,_form,steps){
    const u=U(),ok=steps.filter(s=>s.status==='ok'),failed=steps.filter(s=>s.status==='error');
    const rows=ok.map(s=>({name:s.cn||s.tool,tool:s.tool,count:u.stepRows(steps,s.tool).length}));
    const evidence=rows.reduce((a,r)=>a+r.count,0);
    const purposes={
      s26:'竞品关系、完整详情、优惠与长期趋势',s27:'长尾词、真实出单词与外部趋势',s28:'关联商品流量与流向',s29:'商品和卖家结构、商品年龄与内容门槛',s30:'真实评论痛点与功能机会',s31:'历史销量、ASIN预测与BSR预测'
    };
    const lead=failed.length?('卖家精灵补充证据完成 '+ok.length+'/'+steps.length+' 项，'+failed.length+' 项待修复。'):(ok.length?('已取得 '+purposes[scene.id]+'，共识别 '+evidence+' 条结构化记录。'):'尚未取得卖家精灵数据，请先配置卖家精灵 MCP 连接。');
    const conclusion=[
      '- 本场景专门补足西柚没有的 **'+purposes[scene.id]+'**。',
      '- 已成功接口 '+ok.length+'/'+steps.length+'，结构化记录 '+evidence+' 条。来源平台：卖家精灵。',
      '- '+(failed.length?'失败项：'+failed.map(s=>s.tool).join('、')+'。':'全部补充接口已返回；具体判断仅按返回字段计算。')
    ];
    const play={
      s26:['**步骤 1 · 发现竞品**','- asin_competitor 出关系名单，不把关系分当销量。','**步骤 2 · 补详情**','- 详情、优惠、Keepa 长期趋势用来排除短期异常。','**步骤 3 · 可复制动作**','- 没有成本不能建议跟价。'],
      s27:['**步骤 1 · 挖词**','- keyword_miner 扩词根和长尾。','**步骤 2 · 出单词**','- keyword_order 才是真实出单证据，矿词不是出单词。','**步骤 3 · 站外**','- Google 趋势只核长期需求，不能当站内订单。'],
      s28:['**步骤 1 · 关联来源**','- traffic_listing 补搜索词之外的导流 ASIN。','**步骤 2 · 结构**','- 统计替代/互补，集中度高说明被少数关联位卡住。','**步骤 3 · 投放**','- 关联位候选不是必投。'],
      s29:['**步骤 1 · 六维壁垒**','- 商品集中、卖家集中、国家、履约、商品年龄、A+/视频分开看。','**步骤 2 · 打分**','- 只比较本次返回的结构计数，不编造综合分。','**步骤 3 · 进入**','- 高集中 + 老品多 = 壁垒高，不是不能进。'],
      s30:['**步骤 1 · 抽样**','- 只读本次返回的评论，不是全量 VOC。','**步骤 2 · 分层**','- 3★/4★ 更像可改进痛点；1★ 可能是物流/期望。','**步骤 3 · 功能**','- 出现次数只在本样本内比较，证据等级写抽样。'],
      s31:['**步骤 1 · 三条路径**','- 历史销量、ASIN 预测、BSR 预测分开记录。','**步骤 2 · 交叉**','- 三条方向一致才提高置信；偏差大标待验证。','**步骤 3 · 备货**','- 预测区间不能直接当首批产量。']
    };
    return pack(scene,{lead,conclusion,ok:okCount(steps),cards:[{label:'补充接口',value:String(steps.length)},{label:'成功',value:String(ok.length)},{label:'记录',value:String(evidence)},{label:'失败',value:String(failed.length)}],charts:rows.length?[{title:'卖家精灵接口数据覆盖',source:'SellerSprite MCP',kind:'bar',points:rows.map(r=>({label:r.name,value:r.count})),ratio:0,note:'记录数用于检查覆盖，不等于结论强度。'}]:[],tables:rows.length?[{title:'补充证据清单',headers:['接口','记录数','平台'],rows:rows.map(r=>[r.name,String(r.count),'卖家精灵']),note:'这些能力在当前西柚 44 接口中没有直接等价项。'}]:[],process:play[scene.id]||['**步骤 1 · 补充接口**','- 按返回记录计数，缺接口写失败原因。'],extra:'### 判断口径\n- 卖家精灵是补充证据，不能冒充西柚官方市占。\n- 商标检索只是初筛。',boundary:'卖家精灵字段随接口变化；缺字段写数据不足。预测和商标结论不能直接用于备货或命名。'});
  }

  window.Analyst.sceneBuilders={
    s5:brandReport,s6:demandReport,s24:darkHorseReport,
    s7:dossierReport,s8:trafficMixReport,s9:spikeReport,s10:variantReport,s11:changeReport,s12:trendReport,s23:snapshotReport,
    s13:keywordValueReport,s14:replayReport,s15:wordbankReport,s16:rankTrackReport,s17:arenaReport,s18:stealReport,
    s19:churnReport,s20:gapReport,s21:parentCoverReport,s22:nurtureReport,
    s26:competitorPanoramaReport,s27:sellerSupplementReport,s28:trafficGraphReport,s29:marketBarrierReport,s30:vocReport,s31:predictionTriangleReport
  };
})();
