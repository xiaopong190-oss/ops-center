/* 西柚 MCP 接口字典 + 作业场景定义
 * p: 该接口需要的规范化参数（site / asin / asins / keyword / category / brand / range / date / months）
 * 实际传给 MCP 的参数名由 mcp.js 依据 tools/list 返回的 inputSchema 自动匹配。
 */
window.GROUPS = [
  { k: "ASIN 维度", d: "单个 / 父子体商品的流量、销量、排名与变动", ids: [
    ["get_asin_traffic", "ASIN 近 7 天流量得分", "自然、广告及总流量得分，关键词数量、得分占比、增长率和前 7 天得分。", ["site","asin"]],
    ["get_asin_info", "ASIN 商品基础信息", "标题、图片、价格、币种、评分、评分数和商品链接。", ["site","asin"]],
    ["get_asin_keywords", "ASIN 近 7 天反查关键词", "关键词、类型数量、排名、自然及广告流量、流量获得率和增长率。", ["site","asin"]],
    ["get_asin_info_trends", "ASIN 商品信息日趋势", "每日评分、评分数、展示价、促销价、划线价、Prime 价及优惠信息。", ["site","asin","range"]],
    ["get_asin_info_change_trends", "ASIN 基础信息变动趋势", "标题、主图等基础信息的每日变更前后记录。", ["site","asin","range"]],
    ["get_asin_traffic_trends", "ASIN 日流量趋势", "每日自然、广告流量得分及 OR、SP、SB、SBV、OOR、SOR 分位置得分。", ["site","asin","range"]],
    ["get_asin_traffic_trends_weekly", "ASIN 周流量得分趋势", "每周自然、广告流量得分及各广告位分位置得分。", ["site","asin","range"]],
    ["get_asin_traffic_trends_monthly", "ASIN 月流量得分趋势", "每月自然、广告流量得分及各广告位分位置得分。", ["site","asin","months"]],
    ["get_asin_ad_change_trends", "ASIN 广告变化趋势", "每日新观测到的广告活动 ID、名称和广告类型。", ["site","asin","range"]],
    ["get_asin_bsr_trends", "ASIN BSR 类目排名趋势", "类目层级、类目名称及每日 BSR 排名变化。", ["site","asin","range"]],
    ["get_asin_orders_last_30_days", "ASIN 近 30 天订单量", "批量返回当前近 30 天订单量。", ["site","asin"]],
    ["get_asin_order_trends", "ASIN 月订单量趋势", "指定月份范围内的月订单量变化。", ["site","asin","months"]],
    ["get_asin_variations", "ASIN 变体关系", "父 ASIN、子 ASIN 列表、变体维度及各子体属性。", ["site","asin"]],
    ["get_asin_keywords_monthly", "ASIN 月度反查关键词", "按月返回关键词、类型数量、排名、自然及广告流量与获得率。", ["site","asin","months"]],
    ["get_asin_keywords_daily", "ASIN 日级反查关键词", "指定日期范围内的关键词、排名、自然及广告流量和获得率。", ["site","asin","range"]],
    ["get_parent_asin_keywords", "父体近 7 天反查关键词", "父体下全部子体的词覆盖、相关性得分、排名、流量及获得率。", ["site","asin"]],
    ["get_parent_asin_keywords_monthly", "父体月度反查关键词", "按月返回父体全量子体的词覆盖与流量表现。", ["site","asin","months"]],
    ["get_multi_asin_keyword_comparison", "多 ASIN 近 7 天关键词对比", "最多 20 个 ASIN 的词覆盖、相关性、排名与流量对比。", ["site","asins"]],
    ["get_multi_asin_keyword_comparison_monthly", "多 ASIN 月度关键词对比", "最多 20 个 ASIN 在指定月份范围内的词覆盖与流量对比。", ["site","asins","months"]],
    ["get_asin_keyword_count_trends", "ASIN 关键词数量日趋势", "每日自然及广告词数量、排名区间、头部与中长尾词数量和获得率分布。", ["site","asin","range"]]
  ]},
  { k: "关键词维度", d: "关键词市场指标、竞争格局、广告位与排名追踪", ids: [
    ["get_keyword_info", "关键词基础市场指标", "周搜索量、ABA 排名、竞争难度、点击转化率、自然位滚动率、CPC 及头部 ASIN 份额。", ["site","keyword"]],
    ["get_keyword_asin_analysis", "关键词近 7 天的 ASIN 列表", "竞争 ASIN、商品信息、排名、自然及广告流量、增长率与流量占比。", ["site","keyword"]],
    ["get_keyword_analysis_monthly", "关键词月度竞争格局", "按月返回竞争 ASIN、排名、自然及广告流量与流量占比。", ["site","keyword","months"]],
    ["get_keyword_aba_trends", "关键词 ABA 周趋势", "报告周期、ABA 排名、周搜索量及头部 ASIN 点击和转化份额。", ["site","keyword","range"]],
    ["get_keyword_advertising_replay", "关键词广告放映机", "US / UK / DE 指定关键词一天内最多 24 小时的广告位、页码、页内排名与 ASIN。", ["site","keyword","date"]],
    ["get_asin_keyword_traffic_trends", "ASIN + 关键词日流量趋势", "每日自然、广告流量及各广告位流量和获得率。", ["site","asin","keyword","range"]],
    ["get_asin_keyword_rank_trends", "ASIN + 关键词日排名趋势", "指定 ASIN 在该词下的自然位、广告位或推荐位日排名。", ["site","asin","keyword","range"]],
    ["get_asin_keyword_rank_hourly", "ASIN + 关键词小时级排名", "指定日期内每小时的展示位置、页码、页内排名和总排名。", ["site","asin","keyword","date"]]
  ]},
  { k: "类目与市场", d: "类目洞察资源、榜单、规模、价格带、品牌与口碑", ids: [
    ["search_market_insight_categories", "搜索类目", "匹配类目的名称、完整路径、代表 ASIN 数量与可用状态。", ["site","category"]],
    ["generate_category_insight_resource", "生成类目洞察资源", "生成站点 + 类目的洞察资源，后续榜单与分析接口的前置条件。", ["site","category"]],
    ["get_category_sales_ranking", "类目销量榜", "月度、年度及滚动周期的代表 ASIN 销量榜，可按销量、销售额、价格、评分筛选。", ["site","category"]],
    ["get_category_new_release_ranking", "类目新品榜", "按上架天数筛选，查看销量、销售额、价格与评分表现。", ["site","category"]],
    ["get_category_surging_ranking", "类目飙升榜", "结合销量增长、价格与评分，发现增长最快的商品和潜力竞品。", ["site","category"]],
    ["get_category_keyword_analysis", "类目关键词分析", "所选月份和相关度下的关键词汇总、指标分布与历史趋势。", ["site","category","months"]],
    ["get_category_keywords", "类目关键词列表", "类目词及搜索量、ABA 排名、CPC、转化率、竞争难度与历史趋势。", ["site","category"]],
    ["get_category_market_size_trends", "类目市场规模趋势", "完整历史月度销售趋势及近 30 天汇总。", ["site","category"]],
    ["get_category_seasonality", "类目季节性分析", "旺淡季划分、销售对比与需求预测。", ["site","category"]],
    ["get_category_new_release_opportunity_trends", "类目新品机会分析", "新品机会汇总、商品列表与历史趋势。", ["site","category"]],
    ["get_category_price_segment_trends", "类目价格带分析", "低中高价格带的价格区间、品牌、代表 ASIN、评分与历史趋势。", ["site","category"]],
    ["get_primary_asin_children", "代表 ASIN 子体列表", "单个代表 ASIN 下的子体列表与完整销售趋势。", ["site","asin"]],
    ["get_category_primary_asins", "类目代表 ASIN 列表", "类目或指定价格带的代表 ASIN 列表与销售趋势。", ["site","category"]],
    ["get_category_brand_market_size", "类目品牌市场规模", "月度或近 30 天的品牌市场规模列表与历史趋势。", ["site","category"]],
    ["get_category_brand_sales_trends", "类目品牌销售趋势", "指定品牌的完整历史月度销售趋势及近 30 天汇总。", ["site","category","brand"]],
    ["get_category_review_analysis", "类目评分与评价数量分析", "星级和评价数量分布及各自历史趋势。", ["site","category"]]
  ]},
  { k: "卖家精灵补充 · 西柚缺失", d: "竞品发现、预测、长尾词、出单词、关联流量、卖家结构、评论与商标", ids: [
    ["asin_competitor","卖家精灵 · ASIN 竞品关系","输入 ASIN，返回竞争关系较高的竞品。",["site","asin"]],
    ["asin_prediction","卖家精灵 · ASIN 销量预测","预测指定 ASIN 的销量。",["site","asin"]],
    ["bsr_prediction","卖家精灵 · BSR 销量预测","按大类 BSR 和一级类目节点预测销量。",["site","asin"]],
    ["keyword_miner","卖家精灵 · 关键词挖掘","扩展衍生词、词根词和长尾词。",["site","keyword"]],
    ["google_trend","卖家精灵 · Google 趋势","查询关键词的外部搜索趋势。",["site","keyword"]],
    ["keyword_order","卖家精灵 · 出单词反查","查询 ASIN 的 Top 出单词。",["site","asin"]],
    ["traffic_listing","卖家精灵 · 关联流量列表","查询产品及变体的关联商品流量来源。",["site","asin"]],
    ["traffic_listing_stat","卖家精灵 · 关联流量统计","统计 ASIN 的关联流量结构。",["site","asin"]],
    ["market_product_concentration","卖家精灵 · 商品集中度","统计类目的商品集中程度。",["site","category"]],
    ["market_seller_country_distribution","卖家精灵 · 卖家国家分布","统计类目卖家所属国家。",["site","category"]],
    ["market_seller_concentration","卖家精灵 · 卖家集中度","统计类目卖家集中程度。",["site","category"]],
    ["market_seller_type_concentration","卖家精灵 · 卖家类型分布","统计 FBA、FBM、Amazon 自营等结构。",["site","category"]],
    ["market_listing_date_distribution","卖家精灵 · 上架时间分布","统计类目商品上架年份和商品年龄。",["site","category"]],
    ["market_ebc_distribution","卖家精灵 · A+视频分布","统计 A+ 与视频内容覆盖。",["site","category"]],
    ["review","卖家精灵 · Product Review","读取指定商品评论，用于 VOC。",["site","asin"]],
    ["trademark_country_list","卖家精灵 · 商标国家范围","查询商标库覆盖国家。",[]],
    ["trademark_detail","卖家精灵 · 商标详情","查询具体商标详情。",["keyword"]],
    ["trademark_list","卖家精灵 · 商标检索","检索商标列表。",["keyword"]],
    ["trademark_stats","卖家精灵 · 商标统计","统计相关商标申请与状态。",["keyword"]]
  ]}
];

window.TOOL = {};
window.GROUPS.forEach(g => g.ids.forEach(([id, cn, d, p]) => { window.TOOL[id] = { id, cn, d, p }; }));
// These SellerSprite tools overlap with existing Xiyou coverage, so they are
// available to cross-validation scenes without being counted as "Xiyou missing".
Object.assign(window.TOOL, {
  competitor_lookup: { id:"competitor_lookup", cn:"卖家精灵 · 竞品详情", d:"交叉核对目标 ASIN 的销量、销售额与竞争表现", p:["site","asin"] },
  asin_detail_with_coupon_trend: { id:"asin_detail_with_coupon_trend", cn:"卖家精灵 · ASIN详情及优惠趋势", d:"结合商品详情与优惠历史识别促销驱动", p:["site","asin"] },
  keepa_info: { id:"keepa_info", cn:"卖家精灵 · Keepa趋势", d:"核对价格、BSR、评论数与评分历史", p:["site","asin"] },
  traffic_source: { id:"traffic_source", cn:"卖家精灵 · 流量来源", d:"核对关键词与 ASIN 之间的曝光流向", p:["site","asin"] },
  asin_sales_trend: { id:"asin_sales_trend", cn:"卖家精灵 · ASIN销量趋势", d:"用父子体销量和销售额趋势校验预测", p:["site","asin"] },
  product_node: { id:"product_node", cn:"卖家精灵 · 产品类目节点", d:"按类目名或 nodeId 定位叶子类目 nodeIdPath", p:["site","category"] }
});

window.NEEDLABEL = { asin:"ASIN", asins:"多 ASIN", kw:"关键词（可多个）", cat:"类目", brand:"品牌", date:"日期区间" };

const CAT_PRE = [
  ["search_market_insight_categories", "按品类词定位类目，确认类目路径与可用状态"],
  ["generate_category_insight_resource", "为该站点 + 类目生成洞察资源（后续接口的前置）"]
];

window.MODULES = [
 { k:"M1", name:"选品与类目机会", desc:"先看市场，再决定进不进", scenes:[
  { id:"s1", name:"类目快速体检", goal:"一次拿到市场规模、增长方向、评价门槛和价格带格局，判断这个类目还值不值得进。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_market_size_trends","看历史月度规模与近 30 天，判断是增长、见顶还是萎缩"],
      ["get_category_price_segment_trends","看低中高价格带各自的规模与竞争密度"],
      ["get_category_review_analysis","看星级与评价数量分布，测算进入所需的评价门槛"],
      ["get_category_primary_asins","用头部商品的销量、Ratings、星级和价格复算可见门槛"],
      ["get_category_brand_market_size","判断各价格带对强品牌的依赖程度"],
      ["get_category_keyword_analysis","看自然月搜索需求总量与变化方向"],
      ["get_category_keywords","用功能词搜索量、转化率和竞争度验证细分需求"]],
    out:"输出：增长方向、上升功能细分、Ratings/星级门槛、销量最大价格带、各价带功能质量要求与品牌依赖，并给出关键词和转化率证据。" },
  { id:"s2", name:"新品机会扫描", goal:"找出这个类目里近期真正跑出来的新品，看它们靠什么起来的。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_new_release_opportunity_trends","看新品机会汇总与历史趋势，判断窗口是打开还是关闭"],
      ["get_category_new_release_ranking","按上架 0–180 天筛出近期新品的销量与销售额；不筛天数时会混进类目畅销老品"],
      ["get_category_surging_ranking","交叉比对飙升榜，锁定既新又在加速的商品"]],
    out:"输出：近 90/180 天真正出量的新品（ASIN、上架天数、销量、价格、Ratings），清洗共享评价和广告托举，并标注第一/第二驱动。运行后会自动补近 7 天流量。" },
  { id:"s3", name:"价格带卡位", goal:"确定自己该定在哪一档，以及那一档现在被谁占着。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_price_segment_trends","拿到三档价格区间、品牌构成与历史趋势"],
      ["get_category_primary_asins","按目标价格带拉代表 ASIN 列表与销售趋势"],
      ["get_primary_asin_children","下钻代表 ASIN 的子体，看同一款在不同价位的表现"]],
    out:"输出：每档价格带的容量、增速、头部品牌集中度，推荐卡位价格区间并说明理由。" },
  { id:"s4", name:"季节性与备货节奏", goal:"排出旺淡季日历，倒推上新、备货和加大广告投放的时间点。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_seasonality","拿到旺淡季划分、销售对比与需求预测"],
      ["get_category_market_size_trends","用历史月度规模验证季节峰谷是否稳定复现"],
      ["get_category_sales_ranking","看旺季周期内的销量榜，确认头部在旺季的表现"]],
    out:"输出：一张 12 个月节奏表（淡 / 平 / 旺），标注上新截止、头程发货、广告加码三个时间点。" },
  { id:"s5", name:"品牌格局与集中度", goal:"看清这个类目是巨头垄断还是碎片化，新品还有没有缝。",
    needs:["cat","brand"], chain:[...CAT_PRE,
      ["get_category_brand_market_size","拿到品牌市场规模列表与各价格带的品牌表现"],
      ["get_category_brand_sales_trends","对目标品牌拉完整历史月度销售趋势"],
      ["get_category_keywords","用类目词表的历史搜索量对比近 360 天与近 90 天"],
      ["get_category_new_release_opportunity_trends","对照同期新品/代表商品数量，判断供给有没有跟上需求"],
      ["get_category_price_segment_trends","确认主流价格带区间"],
      ["get_asin_info","把主 ASIN 价格对照主流价格带"],
      ["get_keyword_asin_analysis","用细分词前三名的点击份额和转化份额判断垄断还是蓝海"]],
    out:"输出：品牌 CR5、搜索量 360/90 天对照、转化前三集中度、主流价格带偏离、点击 vs 购买集中度；黄金信号是搜索在涨而商品数量几乎没变。" },
  { id:"s6", name:"类目搜索需求盘点", goal:"在做 Listing 之前，先摸清这个类目的搜索需求结构和词的贵贱。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_keyword_analysis","看所选月份的关键词汇总、指标分布与历史趋势"],
      ["get_category_keywords","拉类目词表：搜索量、ABA 排名、CPC、转化率、竞争难度"]],
    out:"输出：按「高量高难 / 高量低难 / 长尾高转化」三类分组的词表，标出首批该抢的 10-15 个词。" },
  { id:"s24", name:"类目黑马产品雷达", goal:"从销量榜、新品榜和飙升榜交叉找出低评价、高增速、正在突破的具体产品。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_sales_ranking","建立类目销量基准，区分成熟头部与异常突破者"],
      ["get_category_new_release_ranking","识别上架时间较短且已经出量的新品"],
      ["get_category_surging_ranking","识别销量或排名正在加速的产品"],
      ["get_category_price_segment_trends","把候选产品放回所属价格带比较进入门槛"],
      ["get_category_review_analysis","核验候选 Ratings 与星级是否低于类目成熟门槛"]],
    out:"输出：三榜交叉、新品榜完整性（非官方 HNR）、成熟 Ratings 门槛、共享评价清洗、高置信黑马、价格带与突破类型；榜单交集不冒充长期成功，不能输出成活率百分比。" },
  { id:"s25", name:"功能特征与上升需求", goal:"建立类目功能与特征地图，并用关键词流量趋势验证哪些功能正在上升、哪些只是在标题里常见。",
    needs:["cat"], chain:[...CAT_PRE,
      ["get_category_primary_asins","从代表 ASIN 标题、价格和销售表现提取可见功能与产品特征"],
      ["get_category_new_release_ranking","提取新品正在采用的功能、规格、形态和场景特征"],
      ["get_category_surging_ranking","核对上升产品共同出现的特征"],
      ["get_category_keyword_analysis","获取类目关键词总体结构和历史趋势"],
      ["get_category_keywords","用搜索量、趋势、转化率和竞争度验证功能词与特征词需求"]],
    out:"输出：通用功能、爆款特有功能、上升功能、新品上升特征、对应关键词与流量证据；无法从标题或关键词确认的功能标为待验证。" }
 ]},
 { k:"M2", name:"竞品拆解与监控", desc:"把对手的流量来源和动作拆开", scenes:[
  { id:"s7", name:"竞品全景档案", goal:"半分钟建立一个竞品的完整底稿：卖什么、卖多少、靠什么流量、有几个变体。",
    needs:["asin"], chain:[
      ["get_asin_info","标题、主图、价格、评分与评分数"],
      ["get_asin_traffic","近 7 天自然 / 广告 / 总流量得分、词数量与增长率"],
      ["get_asin_orders_last_30_days","近 30 天订单量量级"],
      ["get_asin_bsr_trends","BSR 各层级排名走势"],
      ["get_asin_variations","父子体结构与变体维度"]],
    out:"输出：一页竞品档案（基础信息 / 销量量级 / 流量结构 / 排名走势 / 变体矩阵），末尾给出它最依赖的 2-3 个流量来源。" },
  { id:"s8", name:"流量结构拆解", goal:"算清对手的单量里有多少是自然来的、多少是花钱买的。",
    needs:["asin","date"], chain:[
      ["get_asin_traffic","拿近 7 天自然 / 广告得分占比作为基线"],
      ["get_asin_orders_last_30_days","拿近 30 天推算订单，按流量占比分摊自然/广告单量"],
      ["get_asin_traffic_trends","按日拆 OR、SP、SB、SBV、OOR、SOR 各位置得分"],
      ["get_asin_traffic_trends_weekly","用周维度抹掉日波动，确认配比是稳定结构还是短期动作"],
      ["get_asin_keyword_count_trends","看自然词与广告词数量、头部词与中长尾词分布"]],
    out:"输出：自然:广告流量配比、按该配比分摊的推算单量、广告坑位（是否靠 SB/SBV 撑）、周配比是否稳态，以及这套打法能不能复制。" },
  { id:"s9", name:"竞品爆发归因", goal:"检测可信的 BSR / 流量拐点，排除变体调整等伪爆发，再判断关键词、广告、改版或价格是否支持增长。",
    needs:["asin","date"], chain:[
      ["get_asin_traffic_trends","先在日趋势上定位得分突增的具体日期"],
      ["get_asin_bsr_trends","用 7 日因果平滑与异常阈值识别 BSR 爆发窗口，并检查是否持续"],
      ["get_asin_variations","核对当前父子体结构，避免把变体调整误判为真实爆发"],
      ["get_asin_keywords_daily","对比突增日前后关键词构成与排名变化"],
      ["get_asin_ad_change_trends","查当日是否新增广告活动及广告类型"],
      ["get_asin_info_change_trends","查标题 / 主图是否改版"],
      ["get_asin_info_trends","查当日展示价、促销价、优惠是否变动"]],
    out:"输出：可信爆发日期、幅度、持续性、伪爆发排除项、驱动支持/反对矩阵、归因权重与证据边界。" },
  { id:"s10", name:"变体矩阵拆解", goal:"看清对手用几个变体在吃词，哪个子体才是真正的走量款。子体由变体接口自动灌进对比，不必先手工填。",
    needs:["asin"], chain:[
      ["get_asin_variations","拿父体、子体列表与变体维度"],
      ["get_parent_asin_keywords","看父体下全量子体的词覆盖与相关性得分"],
      ["get_multi_asin_keyword_comparison","把子体放在一起对比，看词是分散还是集中在某一个"]],
    out:"输出：变体矩阵表（子体 / 属性 / 价格 / 主力词 / 词覆盖数），指出主推子体和用来占词位的凑数子体。" },
  { id:"s11", name:"竞品改版监控", goal:"周期回看对手的 Listing、价格与广告动作，把长期动作汇总成它在用的打法，而不是给一条当天跟不跟的建议。",
    needs:["asin","date"], chain:[
      ["get_asin_info_change_trends","标题、主图等基础信息的每日变更前后记录"],
      ["get_asin_info_trends","评分、评分数、展示价、促销价、划线价、Prime 价逐日变化"],
      ["get_asin_ad_change_trends","每日新观测到的广告活动 ID、名称与类型"]],
    out:"输出：观察窗口时间轴、按周/月汇总的动作次数、反复出现的打法结论，以及下一周期该盯什么。日期建议拉到 90 天或更长。" },
  { id:"s12", name:"销量与排名走势", goal:"判断这个竞品是在爬坡、走平还是掉队。月线至少要 6 个月；表单只有 30 天时会自动往前补。",
    needs:["asin"], chain:[
      ["get_asin_order_trends","月订单量；短窗口自动往前补到 6 个月"],
      ["get_asin_orders_last_30_days","近 30 天推算订单，给当前量级"],
      ["get_asin_bsr_trends","各层级 BSR 日走势，窗口内也能看名次方向"],
      ["get_asin_traffic_trends_monthly","月度自然 / 广告得分；短窗口同样补到 6 个月"]],
    out:"输出：销量、BSR、流量对照。只有 1 个月时先写近月量级和 BSR，并提示拉长窗口，不下爬坡/掉队。" },
  { id:"s23", name:"每日监控快照", goal:"按监控名单做周期报表：看清这期盯的是哪些竞品，各自改版、销量、流量和词位怎么动，再汇总结论。",
    needs:["asin","asins","date"], chain:[
      ["get_asin_info","确认监控名单里每个 ASIN 的标题、价格、评分"],
      ["get_asin_orders_last_30_days","各竞品近 30 天推算订单量级"],
      ["get_asin_traffic","各竞品近 7 天自然 / 广告得分与占比"],
      ["get_asin_info_change_trends","主 ASIN 的标题、主图变更；其余竞品会按名单补拉"],
      ["get_asin_info_trends","主 ASIN 展示价、促销价与评分数逐日变化"],
      ["get_asin_ad_change_trends","主 ASIN 新广告活动；其余竞品会按名单补拉"],
      ["get_asin_bsr_trends","主 ASIN 各层级 BSR 排名走势"],
      ["get_asin_traffic_trends","主 ASIN 每日各位置得分"],
      ["get_asin_keyword_count_trends","主 ASIN 自然词与广告词数量"],
      ["get_asin_keywords_daily","主 ASIN 区间内新增和消失的词"],
      ["get_asin_keyword_rank_trends","有核心词时看主 ASIN 自然位 / 广告位"],
      ["get_asin_keyword_traffic_trends","有核心词时看该词带来的流量"],
      ["get_multi_asin_keyword_comparison","把监控名单放在一起看词覆盖差距"]],
    out:"输出：监控名单、各竞品本窗口动作与量级对照、交叉结论（谁在冲量 / 测 Listing / 加投 / 安静），以及下一周期优先盯谁。对比 ASIN 填监控名单；日期建议 ≥7 天。" }
 ]},
 { k:"M3", name:"关键词研究与广告投放", desc:"选词、估成本、盯广告位", scenes:[
  { id:"s13", name:"关键词价值评估", goal:"在投钱之前判断一个或多个词值不值得打：量、难度、转化和 CPC。",
    needs:["kw"], chain:[
      ["get_keyword_info","周搜索量、ABA 排名、竞争难度、点击转化率、自然位滚动率、CPC"],
      ["get_keyword_aba_trends","ABA 周趋势与头部 ASIN 点击 / 转化份额"],
      ["get_keyword_asin_analysis","看当前占据该词的竞争 ASIN 及其流量占比"]],
    out:"输出：每个词的「打 / 观察 / 放弃」结论，附预估 CPC、需要多久能拿到自然位、以及头部三家的垄断程度。多个词分别评估，不把逗号串当成一个搜索词。" },
  { id:"s14", name:"广告位竞争侦察", goal:"用放映机看某个词一天 24 小时的广告位被谁占了、什么时段最松。每一格要写清是单个广告位、广告区，还是整页。",
    needs:["kw"], chain:[
      ["get_keyword_advertising_replay","逐小时的广告位、页码、页内排名与投放 ASIN（仅 US / UK / DE）"],
      ["get_keyword_asin_analysis","把高频占位 ASIN 与该词的流量占比对上"]],
    out:"输出：先标明粒度（单个广告位 / 广告区 / 整页），再给 24 小时占位表（时段 × 位置类型 × 页码 × 页内位 × ASIN）、常客、各位置最松时段。不要把整页广告数说成某一个位空了。" },
  { id:"s15", name:"广告词库搭建", goal:"从竞品反查词 + 类目词里拉出一份可直接投放的分组词库。",
    needs:["asin","cat"], chain:[
      ["get_asin_keywords","拉竞品近 7 天反查词、排名与流量获得率"],
      ...CAT_PRE,
      ["get_category_keywords","补类目层面的词与搜索量、CPC、竞争难度"],
      ["get_keyword_info","对候选核心词逐个补齐市场指标"]],
    out:"输出：投放结构（精准打爆 / 广泛拓量 / 否定词 / 指标不足）+ 每组完整词清单（词、来源、搜索量、难度、CPC）+ 分组计算过程。不要只给词数。没有自身转化率不写死出价。" },
  { id:"s16", name:"关键词卡位追踪", goal:"盯住自己或对手在一个或多个词下的位置，看排名是靠自然位还是广告位撑的。",
    needs:["asin","kw","date"], chain:[
      ["get_asin_keyword_rank_hourly","指定单日每小时的展示位置、页码、页内排名与总排名"],
      ["get_asin_keyword_rank_trends","该词下的自然位 / 广告位 / 推荐位日排名走势"],
      ["get_asin_keyword_traffic_trends","该 ASIN + 该词的每日自然与广告流量及获得率"]],
    out:"输出：自然位/广告位日曲线 + 逐日对照表。排名读 displayPositions 的 or/sp totalRank；没有自然位时仍展示广告位。" },
  { id:"s17", name:"关键词赛道格局", goal:"看一个词的竞争格局在最近几个月怎么变的，还有没有插进去的机会。",
    needs:["kw"], chain:[
      ["get_keyword_analysis_monthly","按月看竞争 ASIN、排名、自然及广告流量与流量占比"],
      ["get_keyword_aba_trends","看 ABA 排名与搜索量的周度走势"]],
    out:"输出：头部占比的月度变化、新进入者名单、词本身是在放量还是萎缩，给出切入窗口判断。日期建议 ≥90 天，最好 6 个月；一个月只能看到当期名单。" },
  { id:"s18", name:"竞品词位反打", goal:"找出竞品靠哪些词吃流量，挑出它守得松、我能抢的那批。",
    needs:["asin","kw"], chain:[
      ["get_asin_keywords","拉竞品全量反查词及各词的流量获得率"],
      ["get_keyword_info","对高价值词补搜索量、难度与 CPC"],
      ["get_keyword_asin_analysis","看该词下竞品的排名与流量占比是否稳固"]],
    out:"输出：全部反查词分组清单（可抢 / 前排守得紧 / 无自然位），含词、搜索量、竞品自然位、难度、CPC、建议打法；可抢按性价比排序。即使可抢为 0 也要列出前排词，不能把词表藏掉。" }
 ]},
 { k:"M4", name:"Listing 优化与效果复盘", desc:"上词、掉词、埋词与效果归因", scenes:[
  { id:"s19", name:"上词掉词诊断", goal:"回答「我的词是变多还是变少了、掉的是哪一批」。",
    needs:["asin","date"], chain:[
      ["get_asin_keyword_count_trends","每日自然 / 广告词数量、排名区间、头部与中长尾分布"],
      ["get_asin_keywords_daily","定位区间内新增和消失的具体词"],
      ["get_asin_keywords_monthly","用月度视角确认是波动还是趋势性下滑"]],
    out:"输出：新增词 / 掉出词两张清单 + 词数量曲线。日级没有两个日期时改用月度首末月，并仍列出本期词表。卡片不写「数据不足」。" },
  { id:"s20", name:"竞品词对比找差距", goal:"把自己和几个对手放在一起，看谁多吃了哪些词。",
    needs:["asins"], chain:[
      ["get_multi_asin_keyword_comparison","最多 20 个 ASIN 的近 7 天词覆盖、相关性、排名与流量对比"],
      ["get_multi_asin_keyword_comparison_monthly","按月对比，排除单周波动"]],
    out:"输出：词覆盖对比矩阵，分成「三家都有我没有」「只有对手有」「只有我有」三类，前两类按流量价值排序给补词优先级。" },
  { id:"s21", name:"父体词覆盖体检", goal:"从父体维度看全量子体的词覆盖有没有漏，变体是不是在互相抢词。",
    needs:["asin"], chain:[
      ["get_parent_asin_keywords","父体下全部子体的词覆盖、类型数量、相关性得分与流量获得率"],
      ["get_parent_asin_keywords_monthly","按月看覆盖变化，识别长期缺口"],
      ["get_asin_variations","把词覆盖映射回具体子体与变体属性"]],
    out:"输出：父体词覆盖体检表，标出无人覆盖的高价值词、多个子体内耗的重复词，并建议每个子体主攻方向。" },
  { id:"s22", name:"单词效果复盘", goal:"投了一段时间，复盘某个核心词到底带来了多少自然流量、广告有没有养出自然位。",
    needs:["asin","kw","date"], chain:[
      ["get_asin_keyword_traffic_trends","每日自然、广告流量及各位置流量和获得率"],
      ["get_asin_keyword_rank_trends","同期自然位与广告位排名走势"],
      ["get_asin_keyword_count_trends","看该 ASIN 整体词数量是否同步改善"]],
    out:"输出：投放期内自然/广告流量曲线、自然位走势、逐日对照表；多个词给出逐词对照。即使自然流量为 0 也要画出广告曲线，不能写成没有可比点。" }
 ]},
 { k:"M5", name:"卖家精灵补强", desc:"补足西柚没有的竞品、预测、关联流量、卖家与 VOC 证据", scenes:[
  {id:"s26",name:"竞品发现与历史全景",goal:"从一个 ASIN 自动发现强竞品，并核对完整详情、优惠与长期趋势。",needs:["asin"],chain:[
    ["asin_competitor","按竞争关系发现候选竞品","sellersprite"],
    ["competitor_lookup","补齐候选销量、销售额和商品表现","sellersprite"],
    ["asin_detail_with_coupon_trend","核对详情、上架时间、A+和优惠变化","sellersprite"],
    ["keepa_info","用长期价格、BSR、评分趋势排除短期异常","sellersprite"]],out:"输出：竞品关系图、核心竞品清单、长期趋势和可复制动作。"},
  {id:"s27",name:"长尾需求与出单词机会",goal:"把词根扩展、真实出单词与外部趋势交叉，找可承接的长尾需求。",needs:["asin","kw"],chain:[
    ["keyword_miner","扩展词根和长尾词","sellersprite"],["keyword_order","反查竞品真实出单词","sellersprite"],["google_trend","核验外部需求趋势与季节性","sellersprite"]],out:"输出：词根树、出单词、增长长尾、伪增长词与 Listing/PPC 承接建议。"},
  {id:"s28",name:"关联流量关系图谱",goal:"补足搜索词之外的关联推荐流量，识别替代品、互补品和抢位对象。",needs:["asin"],chain:[
    ["traffic_listing_stat","先看各关联类型有多少条","sellersprite"],["traffic_listing","再按有量的类型拉导流 ASIN 明细","sellersprite"],["traffic_source","追踪 ASIN 与关键词流向","sellersprite"]],out:"输出：关联流量来源、主要导流 ASIN、流量集中度和商品投放候选。"},
  {id:"s29",name:"市场进入壁垒全检",goal:"从商品、卖家、国家、履约、商品年龄和内容建设判断市场壁垒。",needs:["cat"],chain:[
    ["product_node","按品类词定位卖家精灵叶子类目和 nodeIdPath","sellersprite"],
    ["asin_detail_with_coupon_trend","有主 ASIN 时用其叶子类目路径交叉确认","sellersprite"],
    ["market_product_concentration","测算商品集中度","sellersprite"],["market_seller_country_distribution","识别卖家国家结构","sellersprite"],["market_seller_concentration","测算卖家集中度","sellersprite"],["market_seller_type_concentration","识别 FBA、FBM 与 Amazon 自营结构","sellersprite"],["market_listing_date_distribution","判断老品壁垒与新品渗透","sellersprite"],["market_ebc_distribution","判断 A+与视频内容门槛","sellersprite"]],out:"输出：六维进入壁垒、集中度、卖家结构、新老品结构和内容门槛评分。"},
  {id:"s30",name:"VOC痛点与功能机会",goal:"读取真实评论，区分通用抱怨、可改进痛点和功能机会。",needs:["asin"],chain:[["review","按 1–2★ / 3–4★ / 5★ 分批读取评论正文","sellersprite"]],out:"输出：3★/4★痛点、出现次数、对应功能方案、证据等级与评论样本边界。"},
  {id:"s31",name:"销量预测三角校验",goal:"用 ASIN 历史销量、ASIN预测和BSR预测三条路径交叉验证。",needs:["asin","cat"],chain:[
    ["asin_sales_trend","读取父子体历史销量和销售额，并取出大类 BSR","sellersprite"],["asin_prediction","生成 ASIN 月/日销量预测","sellersprite"],    ["bsr_prediction","用大类 BSR + 一级类目节点做对照预测","sellersprite"]],out:"输出：三种口径预测区间、偏差、置信度与不可直接用于备货的风险。"}
 ]}
];

window.SCENES = {};
window.MODULES.forEach(m => m.scenes.forEach(s => { s.mod = m.name; window.SCENES[s.id] = s; }));
