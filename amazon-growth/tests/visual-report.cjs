const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ctx={window:{},fetch:()=>{throw Error('Unexpected model call');}};
vm.createContext(ctx);
for(const file of ['data.js','claude.js','report.js','scene-reports.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),ctx);
(async()=>{
  const builtIn=['s1','s2','s3','s4','s25'];
  const extra=Object.keys(ctx.window.Analyst.sceneBuilders||{}).sort();
  assert.deepEqual(extra,['s10','s11','s12','s13','s14','s15','s16','s17','s18','s19','s20','s21','s22','s23','s24','s26','s27','s28','s29','s30','s31','s5','s6','s7','s8','s9']);
  const scenes=Object.values(ctx.window.SCENES);
  assert.equal(scenes.length,31);
  for(const scene of scenes)assert(builtIn.includes(scene.id)||ctx.window.Analyst.sceneBuilders[scene.id],scene.id+' 缺少专项报告');
  const steps=[{tool:'get_asin_order_trends',cn:'销量趋势',status:'ok',data:{data:{trends:[{localDate:'2026-02-01',sales:{value:20}},{localDate:'2026-01-01',sales:{value:10}},{localDate:'2026-03-01',sales:{value:null}}]}}}];
  for(const scene of scenes){const r=await ctx.window.Analyst.report({},scene,{},steps);assert(r.text.includes('核心结论'));assert(r.text.includes('行动建议'));assert(r.text.includes('结论边界'));assert(r.text.includes('分析过程'),scene.id+' 缺分析过程');assert(r.text.includes('步骤 1'),scene.id+' 缺步骤');assert(!r.text.includes('数据路径'));assert(!r.text.includes('专项分析报告'));assert.equal(r.title,scene.name);assert(r.lead);assert(r.charts.length);assert(r.cards&&r.cards.length);if(scene.id!=='s1')assert(!r.text.includes('首末变化'));const html=ctx.window.Analyst.renderVisual(r);assert(html.includes('report-lead'));assert(!html.includes('<script>'));}
  const escaped=ctx.window.Analyst.renderVisual({text:'报告',charts:[{title:'<script>x</script>',source:'x',kind:'bar',points:[{label:'<img src=x onerror=alert(1)>',value:1}]}]});assert(!escaped.includes('<script>'));assert(!escaped.includes('<img'));
  const named=await ctx.window.Analyst.report({},ctx.window.SCENES.s3,{},[{tool:'get_category_primary_asins',cn:'代表商品',status:'ok',data:{data:{list:[{brand:{value:'COSORI'},ratings:20},{brand:{value:'OVENTE'},ratings:10}]}}}]);assert.equal(named.charts[0].points[0].label,'COSORI');assert(!ctx.window.Analyst.renderVisual(named).includes('[object Object]'));
  const price=await ctx.window.Analyst.report({},ctx.window.SCENES.s3,{},[{tool:'get_category_price_segment_trends',cn:'价格带',status:'ok',data:{data:[{priceType:'lowPrice',min:'9',max:'35',brands:['A'],periods:[{period:'last30days',sales:{value:100,ratio:.25},salesRevenue:{value:2000}}]},{priceType:'highPrice',min:'65',max:'260',brands:['B'],periods:[{period:'last30days',sales:{value:300,ratio:.75},salesRevenue:{value:30000}}]}]}},{tool:'get_category_primary_asins',cn:'代表商品',status:'ok',data:{data:{list:[{brand:{value:'CROSS_BAND_BRAND'},sales:{metrics:{value:999}}},{brand:{value:'OTHER'},sales:{metrics:{value:500}}}]}}}]);assert(price.charts[0].points[0].label.includes('低价带 $9–35'));assert(price.charts.some(c=>c.title==='销量份额'));assert(price.text.includes('销量最高的是 高价带'));assert(price.text.includes('该价带头部品牌'));assert(!price.charts.some(c=>c.points.some(p=>p.label==='CROSS_BAND_BRAND')));assert(price.lead);assert(price.tables&&price.tables[0].title.includes('价格带'));assert.equal(ctx.window.Analyst.topPriceType({data:[{priceType:'lowPrice',min:9,max:35,periods:[{period:'last30days',sales:{value:100}}]},{priceType:'highPrice',min:65,max:260,periods:[{period:'last30days',sales:{value:300}}]}]}),'highPrice');
  const feature=await ctx.window.Analyst.report({},ctx.window.SCENES.s25,{},[{tool:'get_category_primary_asins',status:'ok',data:{list:[{primaryAsin:'A',title:'Gooseneck kettle with temperature control'}]}},{tool:'get_category_new_release_ranking',status:'ok',data:{list:[{asinInfo:{asin:'B',title:'Gooseneck kettle'},metrics:{sales:{value:20}}}]}},{tool:'get_category_surging_ranking',status:'ok',data:{list:[]}},{tool:'get_category_keywords',status:'ok',data:{list:[{searchTerm:'gooseneck electric kettle',searchVolume:1000}]}}]);assert(feature.text.includes('鹅颈壶嘴｜双重验证'));assert(feature.text.includes('产品：B（销量 20）'));assert(feature.charts.some(c=>c.title.includes('功能词搜索量')));
  const fresh=await ctx.window.Analyst.report({},ctx.window.SCENES.s2,{},[{tool:'get_category_new_release_opportunity_trends',status:'ok',data:{summary:{asinCount:{value:6,mom:{previous:12,rate:'-0.5'}},sales:{value:5295,mom:{previous:12835,rate:'-0.587'}},salesRatio:{value:'0.02126'}}}},{tool:'get_category_new_release_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B0NEW00001',brand:'olega',title:'Stainless Steel Electric Kettle 1.5L',listedDays:171,ratings:204,stars:'4.6',priceDistribution:{value:'31.91'},streetDate:'2026-03-21'},metrics:{sales:{value:3421}}},{asinInfo:{primaryAsin:'B0OLDCOSORI',brand:'Cosori',title:'No Plastic Contact Electric Kettle',listedDays:146,ratings:5434,stars:'4.5',priceDistribution:{value:'35.99'}},metrics:{sales:{value:2886}}},{asinInfo:{primaryAsin:'B0GOOSE001',brand:'FuseBrew',title:'Gooseneck Electric Kettle 1000W',listedDays:86,ratings:77,stars:'4.5',priceDistribution:{value:'34.57'}},metrics:{sales:{value:923}}}]}},{tool:'get_category_surging_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B0GOOSE001'}}]}},{tool:'get_asin_traffic',status:'ok',data:{entities:[{asin:'B0NEW00001',organicTrafficScore:900,advertisingTrafficScore:970,advertisingTrafficScoreRatio:0.52},{asin:'B0GOOSE001',organicTrafficScore:1131,advertisingTrafficScore:148,advertisingTrafficScoreRatio:0.106}]}}]);assert(fresh.text.includes('窗口在收'));assert(fresh.text.includes('B0GOOSE001'));assert(fresh.text.includes('自然接住'));assert(fresh.text.includes('已剔除'));assert(fresh.cards.some(c=>c.label.includes('90 天')&&c.value==='1'));assert(fresh.tables&&fresh.tables[0].rows.length>=3);assert(fresh.tables[0].rows.some(r=>String(r[0]).includes('90天唯一')&&String(r[1]).includes('B0GOOSE001')));assert(fresh.charts.some(c=>c.title.includes('近 180 天新品')));  const freshHtml=ctx.window.Analyst.renderVisual(fresh);assert(freshHtml.includes('report-lead'));assert(freshHtml.includes('<table'));assert(freshHtml.indexOf('report-chart')<freshHtml.indexOf('findings'));assert(!freshHtml.includes('<script>'));
  const seasonMonths=[];
  const shape=[308,261,227,217,211,183,222,221,236,266,370,448];
  for(const y of [2024,2025]) shape.forEach((v,i)=>seasonMonths.push({localDate:y+'-'+String(i+1).padStart(2,'0')+'-01',sales:{value:v*1000}}));
  seasonMonths.push({localDate:'2026-08-01',sales:{value:239000}});
  const season=await ctx.window.Analyst.report({},ctx.window.SCENES.s4,{dateTo:'2026-09-08'},[
    {tool:'get_category_seasonality',status:'ok',data:{isSeasonal:false,monthInfos:[],avgMonthlySales:{off:'0',peak:'0'}}},
    {tool:'get_category_market_size_trends',status:'ok',data:{list:seasonMonths}},
    {tool:'get_category_sales_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B08PP48979',brand:'COSORI'},metrics:{sales:{value:34480}}}]}}
  ]);
  assert(season.lead.includes('冬旺夏淡')||season.lead.includes('11'));
  assert(season.text.includes('上新截止'));
  assert(!season.text.includes('首末变化 -22'));
  assert(season.tables.some(t=>t.title.includes('12 个月')&&t.rows.length===12));
  assert(season.tables.some(t=>t.title.includes('倒推')));
  assert(season.charts.some(c=>c.kind==='line'&&c.points.length>=24));
  const seasonHtml=ctx.window.Analyst.renderVisual(season);
  assert(seasonHtml.includes('report-lead'));
  assert(seasonHtml.includes('12 个月节奏'));
  assert.equal(ctx.window.Analyst.displayTitle({text:'## 季节性与备货节奏 · 专项分析报告'},ctx.window.SCENES.s4),'季节性与备货节奏');
  const doc=ctx.window.Analyst.renderDocument(season,ctx.window.SCENES.s4);
  assert(doc.includes('<h1>季节性与备货节奏</h1>'));
  assert(!doc.includes('专项分析报告'));
  const peek=ctx.window.Analyst.renderPreview(season);
  assert(peek.includes('report-preview-lead'));
  assert(peek.includes('冬旺夏淡')||peek.includes('11'));
  const brands=await ctx.window.Analyst.report({},ctx.window.SCENES.s5,{brand:'A'},[{tool:'get_category_brand_market_size',status:'ok',data:{list:[{brand:'A',sales:{value:100},salesRatio:0.4},{brand:'B',sales:{value:50},salesRatio:0.2},{brand:'C',sales:{value:30},salesRatio:0.1},{brand:'D',sales:{value:20},salesRatio:0.05},{brand:'E',sales:{value:10},salesRatio:0.05}]}}]);
  assert(brands.lead.includes('巨头锁死'));assert(brands.lead.includes('目标品牌'));assert.equal(brands.charts[0].points[0].label,'A');assert(brands.tables.some(t=>t.title.includes('品牌')));assert(brands.text.includes('分析过程'));assert(brands.text.includes('步骤 2'));assert(brands.text.includes('CR1'));assert(brands.text.includes('剩余份额'));assert(brands.tables.some(t=>t.title.includes('集中度计算')));
  const kwTrends=[];for(let i=0;i<12;i++)kwTrends.push({localDate:'2025-'+String(i+1).padStart(2,'0')+'-01',searchVolume:i>=9?130:100});
  const supplyTrends=[];for(let i=0;i<12;i++)supplyTrends.push({localDate:'2025-'+String(i+1).padStart(2,'0')+'-01',asinCount:10});
  const gap=await ctx.window.Analyst.report({},ctx.window.SCENES.s5,{brand:'A',asin:'B0GH78L65N',keyword:'gooseneck electric kettle'},[
    {tool:'get_category_brand_market_size',status:'ok',data:{list:[{brand:'A',sales:{value:100},salesRatio:0.4},{brand:'B',sales:{value:50},salesRatio:0.2},{brand:'C',sales:{value:30},salesRatio:0.1},{brand:'D',sales:{value:20},salesRatio:0.05},{brand:'E',sales:{value:10},salesRatio:0.05}]}},
    {tool:'get_category_keywords',status:'ok',data:{list:[{searchTerm:'gooseneck electric kettle',trends:kwTrends}]}},
    {tool:'get_category_new_release_opportunity_trends',status:'ok',data:{list:supplyTrends}},
    {tool:'get_category_price_segment_trends',status:'ok',data:[{priceType:'lowPrice',min:9,max:35,periods:[{period:'last30days',sales:{value:100}}]},{priceType:'highPrice',min:65,max:260,periods:[{period:'last30days',sales:{value:300}}]}]},
    {tool:'get_asin_info',status:'ok',data:{asin:'B0GH78L65N',price:34.99}},
    {tool:'get_keyword_asin_analysis',status:'ok',data:{list:[{asin:'X1',clickShare:0.22,conversionShare:0.5},{asin:'X2',clickShare:0.18,conversionShare:0.25},{asin:'X3',clickShare:0.15,conversionShare:0.15},{asin:'X4',clickShare:0.1,conversionShare:0.05}]}}
  ]);
  assert(gap.lead.includes('黄金信号'));
  assert(gap.lead.includes('垄断严重')||gap.lead.includes('新手'));
  assert(gap.lead.includes('点击分散但购买集中'));
  assert(gap.lead.includes('偏离')||gap.text.includes('超过 30%'));
  assert(gap.tables.some(t=>t.title.includes('点击')));
  assert(gap.text.includes('步骤 8'));
  const horse=await ctx.window.Analyst.report({},ctx.window.SCENES.s24,{},[
    {tool:'get_category_sales_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B08OLD0001',brand:'COSORI',ratings:5000,stars:'4.6'},metrics:{sales:{value:34480}}},{asinInfo:{primaryAsin:'B08OLD0002',brand:'OVENTE',ratings:3000},metrics:{sales:{value:12000}}},{asinInfo:{primaryAsin:'B08OLD0003',brand:'Amazon Basics',ratings:2200},metrics:{sales:{value:8000}}},{asinInfo:{primaryAsin:'B08OLD0004',brand:'Chefman',ratings:1800},metrics:{sales:{value:6000}}}]}},
    {tool:'get_category_new_release_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B0NEW00001',brand:'olega',title:'Stainless Steel Electric Kettle 1.5L',listedDays:171,ratings:204,stars:'4.6',priceDistribution:{value:'31.91'},streetDate:'2026-03-21'},metrics:{sales:{value:3421}}},{asinInfo:{primaryAsin:'B0OLDCOSORI',brand:'Cosori',title:'No Plastic Contact Electric Kettle',listedDays:146,ratings:5434,stars:'4.5',priceDistribution:{value:'35.99'}},metrics:{sales:{value:2886}}},{asinInfo:{primaryAsin:'B0GOOSE001',brand:'FuseBrew',title:'Gooseneck Electric Kettle 1000W',listedDays:86,ratings:77,stars:'4.5',priceDistribution:{value:'34.57'}},metrics:{sales:{value:923}}}]}},
    {tool:'get_category_surging_ranking',status:'ok',data:{list:[{asinInfo:{primaryAsin:'B0GOOSE001',brand:'FuseBrew'},metrics:{sales:{value:923}}},{asinInfo:{primaryAsin:'B0NEW00001',brand:'olega'},metrics:{sales:{value:3421}}}]}},
    {tool:'get_category_price_segment_trends',status:'ok',data:[{priceType:'lowPrice',min:9,max:35,periods:[{period:'last30days',sales:{value:100}}]},{priceType:'highPrice',min:65,max:260,periods:[{period:'last30days',sales:{value:300}}]}]},
    {tool:'get_asin_traffic',status:'ok',data:{entities:[{asin:'B0NEW00001',organicTrafficScore:900,advertisingTrafficScore:970,advertisingTrafficScoreRatio:0.52},{asin:'B0GOOSE001',organicTrafficScore:1131,advertisingTrafficScore:148,advertisingTrafficScoreRatio:0.106}]}}
  ]);
  assert(horse.lead.includes('高置信黑马'));
  assert(horse.lead.includes('不是官方 HNR')||horse.text.includes('不是官方'));
  assert(horse.text.includes('分析过程'));
  assert(horse.text.includes('步骤 2'));
  assert(horse.text.includes('共享评价'));
  assert(horse.text.includes('B0GOOSE001'));
  assert(horse.text.includes('自然接住'));
  assert(horse.tables.some(t=>t.title.includes('计算过程')));
  assert(horse.tables.some(t=>t.title.includes('已剔除')&&t.rows.some(r=>String(r[1]).includes('B0OLDCOSORI'))));
  const snap=await ctx.window.Analyst.report({},ctx.window.SCENES.s23,{asin:'B0GH78L65N',asins:'B0RIVAL001',dateFrom:'2026-09-01',dateTo:'2026-09-10'},[
    {tool:'get_asin_info',status:'ok',data:{list:[{asin:'B0GH78L65N',title:'Gooseneck Kettle',brand:'Stariver',price:34.99},{asin:'B0RIVAL001',title:'Rival Kettle',brand:'Cosori',price:32.99}]}},
    {tool:'get_asin_orders_last_30_days',status:'ok',data:{list:[{asin:'B0GH78L65N',orderCount:40},{asin:'B0RIVAL001',orderCount:120}]}},
    {tool:'get_asin_traffic',status:'ok',data:{list:[{asin:'B0GH78L65N',organicTrafficScore:800,advertisingTrafficScore:200,advertisingTrafficScoreRatio:0.2},{asin:'B0RIVAL001',organicTrafficScore:300,advertisingTrafficScore:700,advertisingTrafficScoreRatio:0.7}]}},
    {tool:'get_asin_info_change_trends',status:'ok',targetAsin:'B0RIVAL001',data:{list:[{localDate:'2026-09-08',field:'title',before:'A',after:'B',asin:'B0RIVAL001'}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',targetAsin:'B0RIVAL001',data:{list:[{localDate:'2026-09-08',name:'SP new',adType:'SP',asin:'B0RIVAL001'}]}}
  ]);
  assert(snap.lead.includes('2')&&(snap.lead.includes('B0RIVAL001')||snap.text.includes('B0RIVAL001')));
  assert(snap.text.includes('监控名单')&&(snap.lead.includes('周期')||snap.text.includes('周期')));
  assert(snap.tables.some(t=>t.title.includes('监控名单')));
  assert(snap.text.includes('下一周期'));
  const onePoint=await ctx.window.Analyst.report({},ctx.window.SCENES.s12,{dateFrom:'2026-08-10',dateTo:'2026-09-08'},[{tool:'get_asin_order_trends',status:'ok',data:{list:[{localDate:'2026-08-01',orders:10}]}},{tool:'get_asin_bsr_trends',status:'ok',data:{list:[{localDate:'2026-08-20',categoryName:'Electric Kettles',bsr:12000},{localDate:'2026-09-01',categoryName:'Electric Kettles',bsr:9000}]}}]);
  assert(onePoint.lead);
  assert(!onePoint.lead.includes('undefined'));
  assert(onePoint.lead.includes('10'));
  assert(onePoint.lead.includes('不能判断爬坡')||onePoint.lead.includes('不能定趋势')||onePoint.text.includes('不能定趋势'));
  assert(onePoint.cards.some(c=>c.label==='近月订单'&&String(c.value)==='10'));
  assert(onePoint.cards.some(c=>c.label==='下一步'&&String(c.value).includes('6')));
  assert(onePoint.charts.some(c=>c.points.some(p=>p.value===10)));
  assert(onePoint.charts.some(c=>c.title.includes('BSR')));
  assert(!onePoint.text.includes('数据不足'));
  assert(!onePoint.text.includes('首末变化'));
  const messyChange=await ctx.window.Analyst.report({},ctx.window.SCENES.s11,{asin:'B0GH78L65N',dateFrom:'2026-06-12',dateTo:'2026-09-10'},[
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[null,{localDate:'2026-07-08',field:'title',before:'A',after:'B'}]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[null,{localDate:'2026-07-01',price:40},{localDate:'2026-07-08',price:32}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[null,{localDate:'2026-07-08',name:'SP July',adType:'SP'}]}}
  ]);
  assert(messyChange.lead);
  const change=await ctx.window.Analyst.report({},ctx.window.SCENES.s11,{asin:'B0GH78L65N'},[
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[{localDate:'2026-09-08',field:'title',before:'A',after:'B'}]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[{localDate:'2026-09-01',price:40},{localDate:'2026-09-08',price:32}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[{localDate:'2026-09-08',name:'SP new',adType:'SP'}]}}
  ]);
  assert(change.lead.includes('促销冲量')||change.text.includes('促销冲量'));
  assert(change.text.includes('分析过程'));
  assert(change.tables.some(t=>t.title.includes('改版监控')));
  assert(change.text.includes('周期')||change.lead.includes('周期')||change.text.includes('下一周期'));
  assert(!change.lead.includes('跟不跟'));
  const changeLong=await ctx.window.Analyst.report({},ctx.window.SCENES.s11,{asin:'B0GH78L65N',dateFrom:'2026-06-12',dateTo:'2026-09-10'},[
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[{localDate:'2026-07-08',field:'title',before:'A',after:'B'},{localDate:'2026-08-20',field:'title',before:'B',after:'C'}]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[{localDate:'2026-07-01',price:40},{localDate:'2026-07-08',price:32},{localDate:'2026-08-20',price:26}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[{localDate:'2026-07-08',name:'SP July',adType:'SP'},{localDate:'2026-08-20',name:'SP Aug',adType:'SP'}]}}
  ]);
  assert(changeLong.lead.includes('反复促销冲量')||changeLong.text.includes('反复促销冲量'));
  assert(changeLong.tables.some(t=>t.title.includes('周期动作')));
  const mix=await ctx.window.Analyst.report({},ctx.window.SCENES.s8,{asin:'B0GH78L65N'},[
    {tool:'get_asin_traffic',status:'ok',data:{organicTrafficScore:300,advertisingTrafficScore:700,advertisingTrafficScoreRatio:0.7}},
    {tool:'get_asin_orders_last_30_days',status:'ok',data:{orderCount:100}},
    {tool:'get_asin_traffic_trends',status:'ok',data:{list:[{localDate:'2026-09-07',organicTrafficScore:300,advertisingTrafficScore:700,spScore:300,sbScore:250,sbvScore:150},{localDate:'2026-09-08',organicTrafficScore:310,advertisingTrafficScore:690,spScore:280,sbScore:260,sbvScore:160}]}},
    {tool:'get_asin_traffic_trends_weekly',status:'ok',data:{list:[{localDate:'2026-08-25',advertisingTrafficScoreRatio:0.68},{localDate:'2026-09-01',advertisingTrafficScoreRatio:0.72}]}}
  ]);
  assert(mix.lead.includes('广告主导')||mix.text.includes('广告主导'));
  assert(mix.text.includes('推算')&&(mix.text.includes('72')||mix.lead.includes('72')||mix.text.includes('70')));
  assert(mix.text.includes('SB/SBV')||mix.text.includes('品牌广告'));
  assert(mix.tables.some(t=>t.title.includes('单量')));
  const replayPage=await ctx.window.Analyst.report({},ctx.window.SCENES.s14,{keyword:'gooseneck kettle'},[
    {tool:'get_keyword_advertising_replay',status:'ok',data:{list:[
      {hour:3,entities:[{page:1,asins:[{adId:'A1',asin:'B0AAA',campaignType:'sb'},{adId:'A1',asin:'B0AAB',campaignType:'sb'},{adId:'A2',asin:'B0BBB',campaignType:'sb'}]},{page:2,asins:[{adId:'A3',asin:'B0CCC',campaignType:'sb'}]}]},
      {hour:15,entities:[{page:1,asins:[{adId:'A1',asin:'B0AAA',campaignType:'sb'},{adId:'A2',asin:'B0BBB',campaignType:'sb'},{adId:'A4',asin:'B0DDD',campaignType:'sb'}]}]}
    ]}},
    {tool:'get_keyword_asin_analysis',status:'ok',data:{list:[{asin:'B0AAA',brand:'Stariver',clickShare:0.12,conversionShare:0.2}]}}
  ]);
  assert(replayPage.lead.includes('整页'));
  assert(replayPage.lead.includes('不是某一个广告位'));
  assert(replayPage.lead.includes('03:00'));
  assert(replayPage.lead.includes('第2页'));
  assert(replayPage.cards.some(c=>c.label==='这一格是'&&c.value.includes('整页')));
  assert(replayPage.tables.some(t=>t.title.includes('一个位')&&t.headers.includes('页码')&&t.headers.includes('粒度')));
  assert(replayPage.tables.some(t=>t.title.includes('最松')&&t.rows.some(r=>String(r.join()).includes('第2页')&&String(r.join()).includes('03:00'))));
  assert(replayPage.tables.some(t=>t.rows.some(r=>String(r[0]).includes('B0AAA')&&String(r.join()).includes('12.00%'))));
  assert(!replayPage.charts[0].points.some(p=>p.label==='00:00'&&p.value===0));
  assert(replayPage.text.includes('分析过程')&&replayPage.text.includes('步骤 1'));
  const replaySlot=await ctx.window.Analyst.report({},ctx.window.SCENES.s14,{keyword:'gooseneck kettle'},[
    {tool:'get_keyword_advertising_replay',status:'ok',data:{list:[
      {hour:8,entities:[{positionName:'Top of search',page:1,pageRank:1,asins:[{adId:'SP1',asin:'B0SLOT1',campaignType:'sp'}]}]},
      {hour:9,entities:[{positionName:'Top of search',page:1,pageRank:1,asins:[{adId:'SP1',asin:'B0SLOT1',campaignType:'sp'},{adId:'SP2',asin:'B0SLOT2',campaignType:'sp'}]},{positionName:'Rest of search',page:1,pageRank:1,asins:[{adId:'SP3',asin:'B0ROS1',campaignType:'sp'},{adId:'SP4',asin:'B0ROS2',campaignType:'sp'},{adId:'SP5',asin:'B0ROS3',campaignType:'sp'},{adId:'SP6',asin:'B0ROS4',campaignType:'sp'}]}]}
    ]}}
  ]);
  assert(replaySlot.lead.includes('单个广告位'));
  assert(replaySlot.lead.includes('不是整页空了'));
  assert(replaySlot.lead.includes('08:00'));
  assert(replaySlot.lead.includes('搜索顶部'));
  assert(replaySlot.lead.includes('页内第1位'));
  assert(replaySlot.cards.some(c=>c.label==='这一格是'&&c.value==='单个广告位'));
  assert(replaySlot.tables.some(t=>t.rows.some(r=>String(r.join()).includes('搜索结果其余位置'))));
  assert(replaySlot.charts[0].title.includes('单个广告位'));
  assert(!replaySlot.charts[0].points.some(p=>p.value===4));
  const bank=await ctx.window.Analyst.report({},ctx.window.SCENES.s15,{asin:'B0GH78L65N'},[
    {tool:'get_asin_keywords',status:'ok',data:{list:[{searchTerm:'gooseneck electric kettle',organicRank:3},{searchTerm:'stariver gooseneck'},{searchTerm:'used electric kettle'},{searchTerm:'brand xyz kettle'}]}},
    {tool:'get_category_keywords',status:'ok',data:{list:[
      {searchTerm:'gooseneck electric kettle',searchVolume:2000,searchTermCompetitiveDifficulty:30,cpc:1.2,clickConversionRate:0.12},
      {searchTerm:'electric kettle',searchVolume:5000,searchTermCompetitiveDifficulty:80,cpc:2},
      {searchTerm:'pour over kettle',searchVolume:800,searchTermCompetitiveDifficulty:20,cpc:0.9},
      {searchTerm:'temperature control kettle',searchVolume:1200,searchTermCompetitiveDifficulty:40,cpc:1.5},
      {searchTerm:'kettle parts',searchVolume:100}
    ]}},
    {tool:'get_keyword_info',status:'ok',targetKeyword:'stariver gooseneck',args:{keyword:'stariver gooseneck'},data:{weeklySearchVolume:900,searchTermCompetitiveDifficulty:25,cpc:0.8}}
  ]);
  assert(bank.lead.includes('精准打爆'));
  assert(bank.lead.includes('gooseneck electric kettle')||bank.text.includes('gooseneck electric kettle'));
  assert(bank.tables.some(t=>t.title==='投放结构'&&t.rows.some(r=>String(r.join()).includes('精确')&&String(r.join()).includes('精准打爆'))));
  assert(bank.tables.some(t=>t.title.includes('计算过程')&&t.rows.some(r=>String(r[0]).includes('搜索量中位'))));
  assert(bank.tables.some(t=>t.title.includes('精准打爆')&&t.headers.includes('词')&&t.rows.some(r=>String(r[0])==='gooseneck electric kettle'&&String(r.join()).includes('竞品'))));
  assert(bank.tables.some(t=>t.title.includes('否定')&&t.rows.some(r=>String(r[0]).includes('used'))));
  assert(bank.tables.some(t=>t.title.includes('指标不足')&&t.rows.some(r=>String(r[0]).includes('brand xyz kettle'))));
  assert(bank.tables.some(t=>t.rows.some(r=>String(r[0])==='stariver gooseneck'&&String(r.join()).includes('900'))));
  assert(bank.charts.some(c=>c.title.includes('结构')));
  assert(bank.text.includes('分析过程')&&bank.text.includes('步骤 1')&&bank.text.includes('步骤 4'));
  assert(!bank.text.includes('首末变化'));
  const arena=await ctx.window.Analyst.report({},ctx.window.SCENES.s17,{keyword:'electric kettle',dateFrom:'2026-08-10',dateTo:'2026-09-08'},[
    {tool:'get_keyword_analysis_monthly',status:'ok',data:{list:[
      {localDate:'2026-06-01',asin:'B0OLD00001',clickShare:0.22},
      {localDate:'2026-06-01',asin:'B0OLD00002',clickShare:0.11},
      {localDate:'2026-08-01',asin:'B0OLD00001',clickShare:0.18},
      {localDate:'2026-08-01',asin:'B0NEW00001',clickShare:0.12}
    ]}},
    {tool:'get_keyword_aba_trends',status:'ok',data:{entities:[{asin:'B0OLD00001',clickShare:0.3}],trends:[
      {week:'2026-07-06',weeklySearchVolume:100},
      {week:'2026-08-03',weeklySearchVolume:130}
    ]}}
  ]);
  assert(arena.lead.includes('上升')||arena.text.includes('上升'));
  assert(!arena.lead.includes('搜索量 数据不足'));
  assert(arena.tables.some(t=>t.title.includes('数据是否够用')));
  assert(arena.cards.some(c=>c.label==='新进入者'&&c.value==='1'));
  assert(arena.text.includes('B0NEW00001'));
  const arenaShort=await ctx.window.Analyst.report({},ctx.window.SCENES.s17,{keyword:'electric kettle',dateFrom:'2026-08-10',dateTo:'2026-09-08'},[
    {tool:'get_keyword_analysis_monthly',status:'ok',data:{list:[{asin:'B0AAA00001'},{asin:'B0BBB00002'}]}},
    {tool:'get_keyword_aba_trends',status:'ok',data:{entities:[{asin:'B0AAA00001'}]}}
  ]);
  assert(arenaShort.lead.includes('90')||arenaShort.text.includes('90')||arenaShort.tables.some(t=>t.title.includes('数据是否够用')));
  assert(arenaShort.cards.some(c=>c.label==='新进入者'&&c.value==='—'));
  const stealTight=await ctx.window.Analyst.report({},ctx.window.SCENES.s18,{asin:'B0GH78L65N',keyword:'electric kettle'},[
    {tool:'get_asin_keywords',status:'ok',data:{list:[
      {searchTerm:'gooseneck electric kettle',organicRank:2,searchVolume:2000,trafficAcquisitionRate:0.18},
      {searchTerm:'electric kettle',organicRank:3,searchVolume:5000},
      {searchTerm:'pour over kettle',organicRank:1,searchVolume:800}
    ]}},
    {tool:'get_keyword_info',status:'ok',targetKeyword:'gooseneck electric kettle',args:{keyword:'gooseneck electric kettle'},data:{weeklySearchVolume:2100,searchTermCompetitiveDifficulty:40,cpc:1.1}},
    {tool:'get_keyword_asin_analysis',status:'ok',targetKeyword:'electric kettle',args:{keyword:'electric kettle'},data:{list:[{asin:'B0GH78L65N',clickShare:0.31,conversionShare:0.28},{asin:'B0RIVAL001',clickShare:0.12,conversionShare:0.08}]}}
  ]);
  assert(stealTight.tables.some(t=>t.title.includes('前排守得紧')&&t.rows.length===3&&t.rows.some(r=>String(r[0])==='gooseneck electric kettle'&&String(r.join()).includes('2'))));
  assert(!stealTight.tables.some(t=>t.title.includes('可抢词清单')&&t.rows.length));
  assert(stealTight.lead.includes('gooseneck electric kettle')||stealTight.lead.includes('electric kettle')||stealTight.lead.includes('pour over kettle'));
  assert(stealTight.lead.includes('可抢缝 0')||stealTight.text.includes('可抢（自然位 >4）**0**'));
  assert(stealTight.charts.some(c=>c.title.includes('词位结构')&&c.points.some(p=>p.label.includes('前排')&&p.value===3)));
  assert(stealTight.tables.some(t=>t.title.includes('稳固度')&&t.rows.some(r=>String(r.join()).includes('份额较稳'))));
  assert(stealTight.text.includes('分析过程')&&stealTight.text.includes('步骤 1')&&stealTight.text.includes('步骤 4'));
  assert(!stealTight.text.includes('首末变化'));
  const stealLoose=await ctx.window.Analyst.report({},ctx.window.SCENES.s18,{asin:'B0GH78L65N'},[
    {tool:'get_asin_keywords',status:'ok',data:{list:[
      {searchTerm:'tea kettle',organicRank:12,searchVolume:300},
      {searchTerm:'gooseneck kettle',organicRank:2,searchVolume:2000}
    ]}}
  ]);
  assert(stealLoose.tables.some(t=>t.title.includes('可抢')&&t.rows.some(r=>String(r[0])==='tea kettle'&&String(r[1]).includes('12'))));
  assert(stealLoose.lead.includes('tea kettle'));
  const stealBlank=await ctx.window.Analyst.report({},ctx.window.SCENES.s18,{asin:'B0GH78L65N'},[
    {tool:'get_asin_keywords',status:'ok',data:{list:[{searchTerm:'mystery kettle'},{searchTerm:'hidden kettle'}]}}
  ]);
  assert(stealBlank.tables.some(t=>t.title.includes('无自然位')&&t.rows.length===2));
  assert(!stealBlank.lead.includes('都在前 4'));
  assert(stealBlank.text.includes('步骤 1'));
  const stealApi=await ctx.window.Analyst.report({},ctx.window.SCENES.s18,{asin:'B0GH78L65N'},[
    {tool:'get_asin_keywords',status:'ok',data:{list:[
      {searchTerm:'gooseneck electric kettle',ranks:[{position:'sp',totalRank:1},{position:'or',totalRank:2,page:1,pageRank:2}],trafficSummary:{trafficAcquisitionRate:{organic:'0.18',advertising:'0.05',total:'0.23'}}},
      {searchTerm:'tea kettle',ranks:[{position:'or',totalRank:12,page:1,pageRank:12}],trafficSummary:{trafficAcquisitionRate:{organic:'0.04'}}},
      {searchTerm:'ad only kettle',ranks:[{position:'sp',totalRank:3}]}
    ]}}
  ]);
  assert.equal(ctx.window.Analyst.U.organicRankOf({ranks:[{position:'sp',totalRank:1},{position:'or',totalRank:8}]}),8);
  assert(stealApi.tables.some(t=>t.title.includes('前排')&&t.rows.some(r=>String(r[0])==='gooseneck electric kettle'&&String(r[1]).includes('2'))));
  assert(stealApi.tables.some(t=>t.title.includes('可抢')&&t.rows.some(r=>String(r[0])==='tea kettle'&&String(r[1]).includes('12'))));
  assert(stealApi.tables.some(t=>t.title.includes('无自然位')&&t.rows.some(r=>String(r[0])==='ad only kettle')));
  assert(!stealApi.lead.includes('没有可识别的自然位'));
  assert(stealApi.lead.includes('tea kettle')||stealApi.text.includes('tea kettle'));
  const churn=await ctx.window.Analyst.report({},ctx.window.SCENES.s19,{asin:'B0GH78L65N',dateFrom:'2026-08-10',dateTo:'2026-09-08'},[
    {tool:'get_asin_keyword_count_trends',status:'ok',data:{trends:[
      {date:'2026-08-10',keywordCount:{organic:40,advertising:8}},
      {date:'2026-09-08',organicKeywordCount:32}
    ]}},
    {tool:'get_asin_keywords_daily',status:'ok',data:{trends:[
      {date:'2026-08-10',list:[{searchTerm:'old kettle',ranks:[{position:'or',totalRank:6}]},{searchTerm:'stay kettle'}]},
      {date:'2026-09-08',list:[{searchTerm:'stay kettle'},{searchTerm:'new kettle'}]}
    ]}},
    {tool:'get_asin_keywords_monthly',status:'ok',data:{list:[{searchTerm:'stay kettle',month:'2026-08'},{searchTerm:'stay kettle',month:'2026-09'},{searchTerm:'month only',month:'2026-09'}]}}
  ]);
  assert(!churn.lead.includes('数据不足'));
  assert(!churn.text.includes('数据不足'));
  assert(churn.cards.every(c=>!String(c.value).includes('数据不足')));
  assert(churn.lead.includes('new kettle')||churn.text.includes('new kettle'));
  assert(churn.tables.some(t=>t.title.includes('新增')&&t.rows.some(r=>String(r[0])==='new kettle')));
  assert(churn.tables.some(t=>t.title.includes('掉出')&&t.rows.some(r=>String(r[0])==='old kettle')));
  assert(churn.charts.some(c=>c.title.includes('自然词数量')&&c.points.length>=2));
  assert(churn.cards.some(c=>c.label.includes('词数量')&&(String(c.value).includes('下降')||String(c.value).includes('走平'))));
  const churnNested=await ctx.window.Analyst.report({},ctx.window.SCENES.s19,{},[
    {tool:'get_asin_keyword_count_trends',status:'ok',data:{list:[{date:'2026-08-01',counts:{organic:20}},{date:'2026-09-01',counts:{organic:28}}]}},
    {tool:'get_asin_keywords_daily',status:'ok',data:{list:[{searchTerm:'solo kettle',ranks:[{position:'or',totalRank:2,rankTime:'2026-09-08T12:00:00Z'}]}]}}
  ]);
  assert(!churnNested.cards.some(c=>String(c.value).includes('数据不足')));
  assert(churnNested.lead.includes('solo kettle')||churnNested.text.includes('solo kettle')||churnNested.tables.some(t=>t.rows&&t.rows.some(r=>String(r[0])==='solo kettle')));
  const nurture=await ctx.window.Analyst.report({},ctx.window.SCENES.s22,{asin:'B0GH78L65N',keyword:'electric kettle'},[
    {tool:'get_asin_keyword_traffic_trends',status:'ok',data:{trends:[
      {date:{startDate:'2026-08-10',endDate:'2026-08-10'},summaryTraffic:{organic:0,advertising:12},positionTraffic:{or:0,sp:4,sb:8,sbv:0}},
      {date:{startDate:'2026-09-08',endDate:'2026-09-08'},summaryTraffic:{organic:0,advertising:18},positionTraffic:{or:0,sp:6,sb:12,sbv:0}}
    ]}},
    {tool:'get_asin_keyword_rank_trends',status:'ok',data:{trends:[
      {date:'2026-08-10',displayPositions:[{displayPosition:'sp',page:1,pageRank:3,totalRank:3}]},
      {date:'2026-09-08',displayPositions:[{displayPosition:'sp',page:1,pageRank:2,totalRank:2}]}
    ]}},
    {tool:'get_asin_keyword_count_trends',status:'ok',data:{trends:[{date:'2026-08-10',keywordCount:{organic:40}},{date:'2026-09-08',keywordCount:{organic:32}}]}}
  ]);
  assert(!nurture.lead.includes('不能复盘'));
  assert(!nurture.lead.includes('数据不足'));
  assert(!nurture.lead.includes('没有可比点'));
  assert(!nurture.text.includes('数据不足'));
  assert(nurture.cards.every(c=>!String(c.value).includes('数据不足')&&!String(c.value).includes('没有可比点')));
  assert(nurture.lead.includes('electric kettle'));
  assert(nurture.lead.includes('广告')&&(nurture.lead.includes('没接住')||nurture.text.includes('几乎全是广告')));
  assert(nurture.charts.some(c=>c.title.includes('广告流量')&&c.points.length===2&&c.points.some(p=>p.value===12)&&c.points.some(p=>p.value===18)));
  assert(nurture.charts.some(c=>c.title.includes('自然流量')&&c.points.length===2&&c.points.every(p=>p.value===0)));
  assert(nurture.tables.some(t=>t.title.includes('逐日')&&t.rows.length===2));
  assert(nurture.text.includes('步骤 1')&&nurture.text.includes('summaryTraffic'));
  const nurtureRaised=await ctx.window.Analyst.report({},ctx.window.SCENES.s22,{asin:'B0GH78L65N',keyword:'gooseneck electric kettle'},[
    {tool:'get_asin_keyword_traffic_trends',status:'ok',data:{trends:[
      {date:{startDate:'2026-08-10',endDate:'2026-08-10'},summaryTraffic:{organic:2,advertising:20}},
      {date:{startDate:'2026-09-08',endDate:'2026-09-08'},summaryTraffic:{organic:9,advertising:16}}
    ]}},
    {tool:'get_asin_keyword_rank_trends',status:'ok',data:{trends:[
      {date:'2026-08-10',displayPositions:[{displayPosition:'or',page:1,pageRank:18,totalRank:18},{displayPosition:'sp',page:1,pageRank:4,totalRank:4}]},
      {date:'2026-09-08',displayPositions:[{displayPosition:'or',page:1,pageRank:7,totalRank:7},{displayPosition:'sp',page:1,pageRank:3,totalRank:3}]}
    ]}}
  ]);
  assert(nurtureRaised.lead.includes('gooseneck electric kettle'));
  assert(nurtureRaised.lead.includes('可继续投')||nurtureRaised.text.includes('较像成立'));
  assert(nurtureRaised.charts.some(c=>c.title.includes('自然位')&&c.points.some(p=>p.value===18)&&c.points.some(p=>p.value===7)));
  const rankTrack=await ctx.window.Analyst.report({},ctx.window.SCENES.s16,{keyword:'electric kettle'},[
    {tool:'get_asin_keyword_rank_trends',status:'ok',data:{trends:[
      {date:'2026-08-10',displayPositions:[{displayPosition:'sp',page:1,pageRank:3,totalRank:3}]},
      {date:'2026-09-08',displayPositions:[{displayPosition:'sp',page:1,pageRank:2,totalRank:2}]}
    ]}},
    {tool:'get_asin_keyword_traffic_trends',status:'ok',data:{trends:[
      {date:{startDate:'2026-08-10',endDate:'2026-08-10'},summaryTraffic:{organic:0,advertising:12}},
      {date:{startDate:'2026-09-08',endDate:'2026-09-08'},summaryTraffic:{organic:0,advertising:18}}
    ]}}
  ]);
  assert(!rankTrack.lead.includes('没有日排名'));
  assert(!rankTrack.lead.includes('数据不足'));
  assert(rankTrack.lead.includes('无自然位')||rankTrack.text.includes('没有自然位'));
  assert(rankTrack.charts.some(c=>c.title.includes('广告位')&&c.points.length===2));
  assert(rankTrack.charts.some(c=>c.title.includes('广告流量')&&c.points.some(p=>p.value===18)));
  assert.deepEqual(ctx.window.Analyst.U.parseKeywords('electric kettle, gooseneck electric kettle\nsteel kettle'),['electric kettle','gooseneck electric kettle','steel kettle']);
  const nurtureMulti=await ctx.window.Analyst.report({},ctx.window.SCENES.s22,{asin:'B0GH78L65N',keyword:'electric kettle, gooseneck electric kettle'},[
    {tool:'get_asin_keyword_traffic_trends',status:'ok',targetKeyword:'electric kettle',args:{keyword:'electric kettle'},data:{trends:[
      {date:{startDate:'2026-08-10',endDate:'2026-08-10'},summaryTraffic:{organic:0,advertising:12}},
      {date:{startDate:'2026-09-08',endDate:'2026-09-08'},summaryTraffic:{organic:0,advertising:18}}
    ]}},
    {tool:'get_asin_keyword_traffic_trends',status:'ok',targetKeyword:'gooseneck electric kettle',args:{keyword:'gooseneck electric kettle'},data:{trends:[
      {date:{startDate:'2026-08-10',endDate:'2026-08-10'},summaryTraffic:{organic:2,advertising:20}},
      {date:{startDate:'2026-09-08',endDate:'2026-09-08'},summaryTraffic:{organic:9,advertising:16}}
    ]}},
    {tool:'get_asin_keyword_rank_trends',status:'ok',targetKeyword:'electric kettle',args:{keyword:'electric kettle'},data:{trends:[
      {date:'2026-08-10',displayPositions:[{displayPosition:'sp',page:1,pageRank:3,totalRank:3}]},
      {date:'2026-09-08',displayPositions:[{displayPosition:'sp',page:1,pageRank:2,totalRank:2}]}
    ]}},
    {tool:'get_asin_keyword_rank_trends',status:'ok',targetKeyword:'gooseneck electric kettle',args:{keyword:'gooseneck electric kettle'},data:{trends:[
      {date:'2026-08-10',displayPositions:[{displayPosition:'or',page:1,pageRank:18,totalRank:18}]},
      {date:'2026-09-08',displayPositions:[{displayPosition:'or',page:1,pageRank:7,totalRank:7}]}
    ]}}
  ]);
  assert(nurtureMulti.lead.includes('共 2 个词'));
  assert(nurtureMulti.lead.includes('electric kettle')&&nurtureMulti.lead.includes('gooseneck electric kettle'));
  assert(nurtureMulti.tables.some(t=>t.title.includes('逐词')&&t.rows.length===2));
  assert(nurtureMulti.cards.some(c=>c.label==='词数'&&c.value==='2'));
  const panorama=await ctx.window.Analyst.report({},ctx.window.SCENES.s26,{site:'US',asin:'B0GH78L65N'},[
    {tool:'asin_competitor',status:'ok',data:{code:'OK',data:[
      {asin:'B07T1CH2HH',brand:'Cosori',title:'Cosori Gooseneck Electric Kettle with Temperature Control, 0.8L',bsr:4774,units:5154,revenue:360728,price:69.99,ratings:19545,rating:4.6,symbol:'Y',sellerNation:'US'},
      {asin:'B0D4617CLP',brand:'Chefman',title:'Chefman Gooseneck Electric Kettle, 0.8L Pour Over Tea Kettle',bsr:18863,units:1592,revenue:47744,price:29.99,ratings:865,rating:4.6,symbol:'Y',sellerNation:'US'},
      {asin:'B0H45HR39K',brand:'Damsun',title:'Damsun 1.7L Stainless Steel Electric Kettle, 1500W Rapid Boil',bsr:61726,units:664,revenue:22569,price:33.99,ratings:40,rating:4.1,symbol:'Y',sellerNation:'US'}
    ]}},
    {tool:'competitor_lookup',status:'ok',data:{data:{items:[{asin:'B0GH78L65N',brand:'FuseBrew',price:29.15,units:584}]}}},
    {tool:'asin_detail_with_coupon_trend',status:'ok',data:{data:{asin:{asin:'B0GH78L65N',brand:'FuseBrew',price:29.15,ratings:66,rating:4.4,bsrRank:23540,subcategories:[{rank:39,label:'Electric Kettles'}],asinUrl:'https://www.amazon.com/dp/B0GH78L65N'},couponTrends:[{date:'2026-08-01',finalPrice:32.39,type:'P'},{date:'2026-09-01',finalPrice:30.77,type:'P'}]}}},
    {tool:'keepa_info',status:'ok',data:{data:{marketplace:'US',asinUrl:'https://www.amazon.com/dp/B0GH78L65N',price:[{timePoint:1785147840000,value:35.99},{timePoint:1788605700000,value:29.15}],bsr:[{timePoint:1785147840000,value:80739},{timePoint:1788605700000,value:44670}],reviews:[{timePoint:1785147840000,value:30},{timePoint:1788605700000,value:71}]}}}
  ]);
  assert(panorama.lead.includes('Cosori'));
  assert(panorama.lead.includes('Chefman'));
  assert(panorama.lead.includes('美国站'));
  assert(panorama.lead.includes('amazon.com'));
  assert(!panorama.lead.includes('日本站'));
  assert(!panorama.lead.includes('¥'));
  assert(panorama.lead.includes('$'));
  assert(!panorama.lead.includes('结构化记录'));
  assert(panorama.cards.some(c=>c.label==='站点'&&c.value==='美国站'));
  assert(panorama.cards.some(c=>c.label==='量级标杆'&&c.value==='Cosori'));
  assert(panorama.cards.some(c=>c.label==='同价带对标'&&c.value==='Chefman'));
  assert(panorama.tables.some(t=>t.title.includes('关系竞品')&&t.rows.length===3));
  assert(panorama.text.includes('位次变好')||panorama.lead.includes('位次变好'));
  assert(panorama.text.includes('没有成本'));
  const panoramaJp=await ctx.window.Analyst.report({},ctx.window.SCENES.s26,{site:'US',asin:'B0GH78L65N'},[
    {tool:'asin_competitor',status:'ok',data:{code:'OK',data:[{asin:'B07T1CH2HH',brand:'Cosori',price:69.99,units:5154,symbol:'Y'}]}},
    {tool:'keepa_info',status:'ok',data:{data:{marketplace:'JP',asinUrl:'https://www.amazon.co.jp/dp/B0GH78L65N',price:[{timePoint:1785147840000,value:35.99},{timePoint:1788605700000,value:29.15}]}}}
  ]);
  assert(panoramaJp.lead.includes('日本站'));
  assert(panoramaJp.lead.includes('amazon.co.jp'));
  assert(panoramaJp.lead.includes('重跑'));
  assert(panoramaJp.cards.some(c=>c.label==='站点'&&c.value==='日本站'));
  const graph=await ctx.window.Analyst.report({},ctx.window.SCENES.s28,{site:'US',asin:'B0GH78L65N'},[
    {tool:'traffic_listing_stat',status:'ok',data:{data:{relations:126,items:[{relation:'mib',count:0},{relation:'fbt',count:2},{relation:'vav',count:77},{relation:'sp',count:37},{relation:'avp',count:10}]}}},
    {tool:'traffic_listing',status:'ok',targetRelation:'vav',args:{request:{relations:['vav']}},data:{code:'OK',data:{total:77,items:[{asin:'B0FQT49BJG',brand:'ELTRIKO',title:'1L Gooseneck Electric Kettle',units:655,price:29.99}]}}},
    {tool:'traffic_listing',status:'ok',targetRelation:'fbt',args:{request:{relations:['fbt']}},data:{code:'OK',data:{total:2,items:[{asin:'B0DFWH54G5',brand:'Yuioase',title:'Electric Gooseneck Kettle',units:210,price:32.99}]}}}
  ]);
  assert(graph.lead.includes('看了又看')||graph.lead.includes('vav'));
  assert(graph.lead.includes('77'));
  assert(!graph.lead.includes('结构化记录'));
  assert(!graph.lead.includes('未分类型'));
  assert(graph.cards.some(c=>c.label==='主力类型'&&String(c.value).includes('看了又看')));
  assert(graph.tables.some(t=>t.title.includes('关联类型')&&t.rows[0][1]==='vav'));
  assert(graph.tables.some(t=>t.title.includes('导流')&&t.headers[0]==='来源'&&t.rows.some(r=>String(r[0]).includes('看了又看'))&&t.rows.some(r=>String(r[0]).includes('FBT'))));
  const barrier=await ctx.window.Analyst.report({},ctx.window.SCENES.s29,{site:'US',category:'electric kettle',asin:'B0GH78L65N'},[
    {tool:'product_node',status:'ok',data:{data:[{nodeIdPath:'1055398:284507:915194:19309415011:289753',nodeLabelPath:'Home & Kitchen:Kitchen & Dining:Coffee, Tea & Espresso:Kettles & Tea Machines:Electric Kettles',products:1200}]}},
    {tool:'asin_detail_with_coupon_trend',status:'ok',data:{data:{asin:{asin:'B0GH78L65N',nodeIdPath:'1055398:284507:915194:19309415011:289753',nodeLabelPath:'Home & Kitchen:Kitchen & Dining:Coffee, Tea & Espresso:Kettles & Tea Machines:Electric Kettles',subcategories:[{rank:39,label:'Electric Kettles'}]}}}},
    {tool:'market_product_concentration',status:'ok',data:{data:[{asin:'B08PP48979',brand:'Cosori',price:25.99,ratings:49400,totalUnitsRatio:0.1453,totalRevenueRatio:0.102},{asin:'B07T1CH2HH',brand:'Cosori',price:69.99,ratings:19545,totalUnitsRatio:0.081,totalRevenueRatio:0.09}]}},
    {tool:'market_seller_concentration',status:'ok',data:{data:[{sellerName:'Amazon',products:37,unitsRatio:0.6873,revenueRatio:0.5244}]}},
    {tool:'market_seller_type_concentration',status:'ok',data:{data:[{sellerType:'Amazon自营',asins:37,unitsRatio:0.6873},{sellerType:'FBA',asins:56,unitsRatio:0.2793},{sellerType:'FBM',asins:5,unitsRatio:0.022}]}},
    {tool:'market_seller_country_distribution',status:'ok',data:{data:[{country:'美国',products:54,unitsRatio:0.76},{country:'中国',products:41,unitsRatio:0.22}]}},
    {tool:'market_listing_date_distribution',status:'ok',data:{data:[{label:'3个月',products:18,unitsRatio:0.0105},{label:'3年以上',products:40,unitsRatio:0.62}]}},
    {tool:'market_ebc_distribution',status:'ok',data:{data:[{label:'A+',productsRatio:95,unitsRatio:0.9663},{label:'有A+有视频',productsRatio:80,unitsRatio:0.88}]}}
  ]);
  assert(barrier.lead.includes('Electric Kettles'));
  assert(barrier.lead.includes('Amazon'));
  assert(barrier.lead.includes('68.7')||barrier.lead.includes('68.73'));
  assert(barrier.lead.includes('Cosori'));
  assert(!barrier.lead.includes('结构化记录'));
  assert(!barrier.lead.includes('18 条'));
  assert(!barrier.text.includes('数据不足'));
  assert(barrier.cards.every(c=>!String(c.value).includes('数据不足')));
  assert(barrier.cards.some(c=>c.label==='叶子类目'&&String(c.value).includes('Electric Kettles')));
  assert(barrier.cards.some(c=>c.label==='Amazon销量'&&String(c.value).includes('68.7')));
  assert(barrier.tables.some(t=>t.title.includes('头部商品')&&t.rows.some(r=>String(r.join()).includes('B08PP48979'))));
  assert(barrier.tables.some(t=>t.title.includes('六维壁垒')));
  assert(barrier.text.includes('分析过程')&&barrier.text.includes('步骤 1')&&barrier.text.includes('步骤 6'));
  assert(barrier.charts.some(c=>c.title.includes('头部商品')));
  const voc=await ctx.window.Analyst.report({},ctx.window.SCENES.s30,{site:'US',asin:'B0GH78L65N'},[
    {tool:'review',status:'ok',targetStars:[1,2],data:{data:[{star:1,title:'Leaked on first use',content:'The spout started to leak after two pours. Packaging was fine.',date:'2026-08-20',verified:true}]}},
    {tool:'review',status:'ok',targetStars:[3,4],data:{data:[
      {star:3,title:'Temperature drifts',content:'It boils fast but keep warm does not hold. Wish it had a better thermostat.',date:'2026-08-28',verified:true},
      {star:4,title:'Good gooseneck',content:'Precise pour for pour over, but the handle gets hot to touch.',date:'2026-09-01',verified:true}
    ]}},
    {tool:'review',status:'ok',targetStars:[5],data:{data:[{star:5,title:'Fast boil',content:'Heats up fast and easy to clean. Great gooseneck control.',date:'2026-09-05',verified:true,vine:false}]}}
  ]);
  assert(voc.lead.includes('样本'));
  assert(voc.lead.includes('温控')||voc.text.includes('温控'));
  assert(voc.lead.includes('漏水')||voc.text.includes('漏水'));
  assert(!voc.lead.includes('结构化记录'));
  assert(!voc.lead.includes('5 条结构化'));
  assert(!voc.text.includes('数据不足'));
  assert(voc.cards.some(c=>c.label==='样本'&&c.value==='4'));
  assert(voc.cards.some(c=>c.label==='3–4★'&&c.value==='2'));
  assert(voc.cards.some(c=>c.label==='主痛点'&&String(c.value)!=='未命中'));
  assert(voc.tables.some(t=>t.title.includes('评论摘录')&&t.rows.some(r=>String(r.join()).includes('leak')||String(r.join()).includes('漏水')||String(r.join()).includes('Temperature')||String(r.join()).includes('温控'))));
  assert(voc.text.includes('分析过程')&&voc.text.includes('步骤 1')&&voc.text.includes('步骤 5'));
  assert(voc.charts.some(c=>c.title.includes('星级')));
  const triangle=await ctx.window.Analyst.report({},ctx.window.SCENES.s31,{site:'US',asin:'B0GH78L65N',category:'electric kettle'},[
    {tool:'asin_sales_trend',status:'ok',data:{data:{asin:{asin:'B0GH78L65N',bsrRank:23540,nodeIdPath:'1055398:284507:915194:19309415011:289753'},salesTrendPoints:[
      {month:'2026-07',parentUnitSales:420,childUnitSales:380,parentSalesRevenue:12000,averagePrice:31},
      {month:'2026-08',parentUnitSales:510,childUnitSales:460,parentSalesRevenue:14500,averagePrice:29}
    ]}}},
    {tool:'asin_prediction',status:'ok',data:{data:{asinDetail:{asin:'B0GH78L65N',category:'Home & Kitchen',categoryId:'1055398'},monthItemList:[{date:'2026-08',sales:440,amount:12800,price:29},{date:'2026-09',sales:480,amount:13900,price:29}]}}},
    {tool:'bsr_prediction',status:'ok',data:{data:{marketplace:'US',bsr:23540,categoryId:'1055398',categoryLabel:'Home & Kitchen',estDailySales:16,estMonthSales:490}}}
  ]);
  assert(triangle.lead.includes('460')||triangle.lead.includes('历史'));
  assert(triangle.lead.includes('480')||triangle.text.includes('480'));
  assert(triangle.lead.includes('490')||triangle.text.includes('490'));
  assert(!triangle.lead.includes('结构化记录'));
  assert(!triangle.lead.includes('补充证据完成'));
  assert(!triangle.text.includes('数据不足'));
  assert(triangle.cards.some(c=>c.label==='历史近月'&&String(c.value)==='460'));
  assert(triangle.cards.some(c=>c.label==='ASIN预测'&&String(c.value)==='480'));
  assert(triangle.cards.some(c=>c.label==='BSR预测'&&String(c.value)==='490'));
  assert(triangle.text.includes('不能')&&(triangle.text.includes('首批')||triangle.text.includes('备货')));
  assert(triangle.text.includes('分析过程')&&triangle.text.includes('步骤 1')&&triangle.text.includes('步骤 5'));
  assert(triangle.tables.some(t=>t.title.includes('重叠')&&t.rows.some(r=>String(r[0]).includes('2026-08'))));
  const dossier=await ctx.window.Analyst.report({},ctx.window.SCENES.s7,{asin:'B0GH78L65N'},[{tool:'get_asin_info',status:'ok',data:{asin:'B0GH78L65N',title:'Gooseneck Kettle',brand:'Stariver',price:34.99,stars:4.5,ratings:120}},{tool:'get_asin_traffic',status:'ok',data:{organicTrafficScore:800,advertisingTrafficScore:200,advertisingTrafficScoreRatio:0.2}},{tool:'get_asin_orders_last_30_days',status:'ok',data:{orderCount:90}},{tool:'get_asin_variations',status:'ok',data:{parentAsin:'B0GH78L65N',children:[{asin:'B0GH78L65N',color:'Black',price:34.99},{asin:'B0CHILD001',color:'White',price:32.99}]}}]);
  assert(dossier.lead.includes('90'));assert(dossier.lead.includes('20.00%')||dossier.lead.includes('20%'));assert(dossier.cards.some(c=>c.label.includes('订单')));
  assert(dossier.lead.includes('Stariver')&&dossier.lead.includes('B0GH78L65N'));
  assert(dossier.lead.includes('自然接住')||dossier.lead.includes('自然流量'));
  assert(dossier.lead.includes('鹅颈')||dossier.lead.includes('卖什么'));
  assert(!dossier.lead.includes('数据不足'));
  assert(!dossier.text.includes('数据不足'));
  assert(!dossier.text.includes('首末变化'));
  assert(dossier.tables.some(t=>t.title.includes('商品底稿')));
  assert(dossier.tables.some(t=>t.title.includes('变体')&&t.rows.some(r=>String(r[0]).includes('B0CHILD001'))));
  assert(dossier.cards.some(c=>c.label==='变体'&&String(c.value)==='2'));
  const dossierLong=await ctx.window.Analyst.report({},ctx.window.SCENES.s7,{asin:'B0GH78L65N'},[{tool:'get_asin_info',status:'ok',data:{asin:'B0GH78L65N',title:'Gooseneck Electric Kettle 1000W | Pour Over Coffee Kettle with Steady Flow Spout & Balanced Handle | Matte Black Tea Kettle for Home Barista Espresso Station Countertop-Black',brand:'Stariver',price:34.99,stars:4.5,ratings:66}},{tool:'get_asin_traffic',status:'ok',data:{organicTrafficScore:800,advertisingTrafficScore:200,advertisingTrafficScoreRatio:0.2}},{tool:'get_asin_orders_last_30_days',status:'ok',data:{orderCount:90}}]);
  assert(dossierLong.lead.includes('90'));
  assert(!dossierLong.lead.includes('Steady Flow'));
  assert(!dossierLong.lead.includes('Espresso Station'));
  assert(dossierLong.lead.includes('1000W')||dossierLong.lead.includes('鹅颈'));
  const dossierTrap=await ctx.window.Analyst.report({},ctx.window.SCENES.s7,{asin:'B0GH78L65N'},[{tool:'get_asin_info',status:'ok',data:{asin:'B0GH78L65N',title:'Gooseneck Kettle',brand:'Stariver',price:34.99,stars:4.5,ratings:120}},{tool:'get_asin_traffic',status:'ok',data:{organicTrafficScore:800,advertisingTrafficScore:200,advertisingTrafficScoreRatio:0.2}},{tool:'get_asin_orders_last_30_days',status:'ok',data:{orderCount:90,trends:[{localDate:'2026-09-01',value:70000}]}}]);
  assert(dossierTrap.lead.includes('90'));
  assert(!dossierTrap.lead.includes('70000')&&!dossierTrap.lead.includes('70,000'));
  const dossierWild=await ctx.window.Analyst.report({},ctx.window.SCENES.s7,{asin:'B0GH78L65N'},[{tool:'get_asin_info',status:'ok',data:{asin:'B0GH78L65N',title:'Gooseneck Kettle',brand:'Stariver',ratings:66}},{tool:'get_asin_orders_last_30_days',status:'ok',data:{orderCount:70000}}]);
  assert(dossierWild.lead.includes('待核'));
  assert(dossierWild.cards.some(c=>String(c.value).includes('待核')));
  const spikeHit=await ctx.window.Analyst.report({},ctx.window.SCENES.s9,{asin:'B0GH78L65N',dateFrom:'2026-08-10',dateTo:'2026-09-08'},[
    {tool:'get_asin_traffic_trends',status:'ok',data:{list:[{localDate:'2026-08-20',organicTrafficScore:80,advertisingTrafficScore:20},{localDate:'2026-08-21',organicTrafficScore:85,advertisingTrafficScore:65}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[{localDate:'2026-08-21',campaignName:'SP kettle',adType:'SP'}]}},
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[{localDate:'2026-08-20',price:34.99},{localDate:'2026-08-21',price:34.99}]}},
    {tool:'get_asin_keywords_daily',status:'ok',data:{list:[{localDate:'2026-08-20',searchTerm:'gooseneck kettle'},{localDate:'2026-08-21',searchTerm:'gooseneck kettle'},{localDate:'2026-08-21',searchTerm:'pour over kettle'}]}}
  ]);
  assert(spikeHit.lead.includes('2026-08-21'));
  assert(spikeHit.lead.includes('50%')||spikeHit.lead.includes('+50')||spikeHit.text.includes('50'));
  assert(spikeHit.lead.includes('广告')||spikeHit.text.includes('新广告'));
  assert(spikeHit.cards.some(c=>c.label==='窗口判断'&&String(c.value).includes('爆单')));
  assert(!spikeHit.lead.includes('不能做爆单溯源'));
  assert(!spikeHit.text.includes('数据不足'));
  assert(!spikeHit.text.includes('首末变化'));
  const breakoutBsr=Array.from({length:30},(_,day)=>({
    localDate:`2026-06-${String(day+1).padStart(2,'0')}`,
    bsrRank:Math.round(day<16?10000*Math.pow(0.998,day):day<23?9700*Math.pow(0.82,day-16):2450),
    ratings:120
  }));
  const spikeBsr=await ctx.window.Analyst.report({},ctx.window.SCENES.s9,{asin:'B0GH78L65N',dateFrom:'2026-06-01',dateTo:'2026-06-30'},[
    {tool:'get_asin_bsr_trends',status:'ok',data:{list:breakoutBsr}},
    {tool:'get_asin_traffic_trends',status:'ok',data:{list:[{localDate:'2026-06-16',organicTrafficScore:100,advertisingTrafficScore:20},{localDate:'2026-06-17',organicTrafficScore:140,advertisingTrafficScore:35}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[{localDate:'2026-06-16',name:'SP launch'}]}},
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[{localDate:'2026-06-15',price:35},{localDate:'2026-06-16',price:35}]}},
    {tool:'get_asin_keywords_daily',status:'ok',data:{list:[{localDate:'2026-06-15',searchTerm:'gooseneck kettle'},{localDate:'2026-06-16',searchTerm:'gooseneck kettle'},{localDate:'2026-06-16',searchTerm:'pour over kettle'}]}}
  ]);
  assert(spikeBsr.lead.includes('可信 BSR 拐点'));
  assert(spikeBsr.cards.some(c=>c.label==='分析模式'&&c.value==='BSR归因'));
  assert(spikeBsr.tables.some(t=>t.title.includes('归因矩阵')&&t.rows.some(r=>String(r[0]).includes('广告放量'))));
  assert(spikeBsr.text.includes('归因权重')&&spikeBsr.text.includes('持续性'));
  const spikeFlat=await ctx.window.Analyst.report({},ctx.window.SCENES.s9,{asin:'B0GH78L65N',dateFrom:'2026-08-10',dateTo:'2026-09-08'},[
    {tool:'get_asin_traffic_trends',status:'ok',data:{list:[{localDate:'2026-08-20',organicTrafficScore:100,advertisingTrafficScore:20},{localDate:'2026-08-21',organicTrafficScore:104,advertisingTrafficScore:22},{localDate:'2026-08-22',organicTrafficScore:110,advertisingTrafficScore:24}]}},
    {tool:'get_asin_ad_change_trends',status:'ok',data:{list:[{localDate:'2026-08-21',name:'SP test'}]}},
    {tool:'get_asin_info_change_trends',status:'ok',data:{list:[]}},
    {tool:'get_asin_info_trends',status:'ok',data:{list:[{localDate:'2026-08-20',price:36},{localDate:'2026-08-21',price:32}]}}
  ]);
  assert(!spikeFlat.lead.includes('不能做爆单溯源'));
  assert(spikeFlat.lead.includes('没有')&&(spikeFlat.lead.includes('30%')||spikeFlat.lead.includes('爆单')));
  assert(spikeFlat.lead.includes('最大一跳')||spikeFlat.text.includes('最大一跳'));
  assert(spikeFlat.tables.some(t=>t.title.includes('动作')&&t.rows.some(r=>String(r.join(' ')).includes('降价')||String(r.join(' ')).includes('32'))));
  assert(spikeFlat.cards.some(c=>c.label==='窗口判断'&&String(c.value).includes('无')));
  const variantStr=await ctx.window.Analyst.report({},ctx.window.SCENES.s10,{asin:'B0GH78L65N'},[
    {tool:'get_asin_variations',status:'ok',data:{parentAsin:'B0GH78L65N',childAsins:['B0CHILD001','B0CHILD002']}},
    {tool:'get_parent_asin_keywords',status:'ok',data:{list:[{searchTerm:'gooseneck kettle',childAsin:'B0CHILD001',organicTrafficScore:80},{searchTerm:'pour over kettle',childAsin:'B0CHILD001',organicTrafficScore:40},{searchTerm:'travel kettle',childAsin:'B0CHILD002',organicTrafficScore:10}]}},
    {tool:'get_multi_asin_keyword_comparison',status:'ok',data:{list:[]}}
  ]);
  assert(!variantStr.lead.includes('未取到变体列表'));
  assert(variantStr.tables.some(t=>t.title.includes('变体')&&t.rows.some(r=>String(r[0]).includes('B0CHILD001'))));
  assert(variantStr.cards.some(c=>c.label==='子体'&&String(c.value)==='2'));
  assert(variantStr.lead.includes('B0CHILD001')||variantStr.text.includes('B0CHILD001'));
  const variantKw=await ctx.window.Analyst.report({},ctx.window.SCENES.s10,{asin:'B0GH78L65N'},[
    {tool:'get_asin_variations',status:'ok',data:{parentAsin:'B0GH78L65N'}},
    {tool:'get_parent_asin_keywords',status:'ok',data:{list:[{searchTerm:'gooseneck kettle',searchVolume:900},{searchTerm:'pour over kettle',searchVolume:400}]}}
  ]);
  assert(!variantKw.lead.includes('未取到变体列表'));
  assert(variantKw.tables.some(t=>t.title.includes('吃词')&&t.rows.some(r=>String(r[0]).includes('gooseneck'))));
  assert(variantKw.charts.some(c=>c.title.includes('吃词')||c.points.some(p=>String(p.label).includes('gooseneck'))));
  const trend=await ctx.window.Analyst.report({},ctx.window.SCENES.s12,{},steps);
  assert(trend.lead.includes('爬坡'));assert.equal(trend.charts[0].points[0].label,'2026-01-01');assert.equal(trend.charts[0].points.length,2);
  console.log('PASS all 31 specialized scene reports, lead/cards, brand/dossier fixtures, escaped content');
})();
