const perfFinite = value => typeof value === 'number' && Number.isFinite(value);
export function analyzePerformance(link, records, calculated) {
  const fields={sessions:'访客',units:'订单件数',sales:'销售额',adSpend:'广告花费',adSales:'广告销售额',adOrders:'广告订单',returns:'退货件数'};
  const missingCosts=[];
  for(const [key,label] of [['cogs','采购成本'],['fba','FBA配送费'],['commission','佣金比例']])if(!perfFinite(link.econ[key]))missingCosts.push(label);
  if(!perfFinite(link.econ.head)&&!calculated.ue?.headAuto)missingCosts.push('头程成本');
  const invalidCosts=['cogs','fba','head','commission','other','unsellable','targetMargin'].some(key=>perfFinite(link.econ[key])&&(link.econ[key]<0||['commission','unsellable','targetMargin'].includes(key)&&link.econ[key]>100));
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const incomplete=records.filter(row=>Object.keys(fields).some(key=>!perfFinite(row[key])));
  const missingFields=Object.entries(fields).filter(([key])=>records.some(row=>!perfFinite(row[key]))).map(([,label])=>label);
  const invalid=records.filter(row=>!validDate(row.from)||!validDate(row.to)||Object.keys(fields).some(key=>perfFinite(row[key])&&row[key]<0)||perfFinite(row.returns)&&perfFinite(row.units)&&row.returns>row.units||row.from&&row.to&&row.to<row.from);
  const ordered=records.filter(row=>validDate(row.from)).slice().sort((a,b)=>a.from.localeCompare(b.from));
  const overlap=ordered.some((row,index)=>index>0&&row.from<=(ordered[index-1].to||ordered[index-1].from));
  const profitFields=['units','sales','adSpend','returns'];
  const profitReady=records.length>0&&records.every(row=>profitFields.every(key=>perfFinite(row[key])))&&!missingCosts.length&&!invalidCosts&&!invalid.length&&!overlap&&Boolean(calculated.ue)&&calculated.S.units>0;
  const issues=[];
  if(!records.length)issues.push({kind:'data',title:'先录入一个完整经营周期',detail:'录入销售、广告和退货，再填写单件成本，即可查看保本线和利润驱动。',target:'records',action:'录入周期'});
  if(missingCosts.length)issues.push({kind:'data',title:'补齐成本，利润才有依据',detail:'待填写：'+missingCosts.join('、')+'。空白成本不会作为真实的零成本展示。',target:'costs',action:'补齐成本'});
  if(missingFields.length&&records.length)issues.push({kind:'data',title:incomplete.length+' 个周期仍有空白字段',detail:'待核对：'+missingFields.join('、')+'；真实为零时请填写 0。',target:'records',action:'核对周期'});
  if(invalidCosts)issues.push({kind:'data',title:'成本或比例超出有效范围',detail:'成本不能为负，佣金、不可再售比例和目标净利率应在 0% 到 100% 之间。',target:'costs',action:'核对成本'});
  if(invalid.length||overlap)issues.push({kind:'data',title:'先核对统计口径',detail:[invalid.length?'存在空白或无效日期、负数、退货大于订单或日期倒置':'',overlap?'周期日期交叠，汇总可能重复':''].filter(Boolean).join('；')+'。',target:'records',action:'检查明细'});
  if(profitReady){
    if(calculated.ue.unit<=0)issues.push({kind:'loss',title:'广告前的单件利润已不为正',detail:'当前售价下，销售收入尚未覆盖商品、履约和退货损耗。先核对成本，再试算调价。',target:'costs',action:'查看成本'});
    else if(calculated.net<0)issues.push({kind:'loss',title:'广告花费超过当前利润空间',detail:'按已录入数据，广告前利润不足以覆盖广告花费。可在下方比较调价、广告与退货情景。',target:'scenario',action:'试算方案'});
    else if(perfFinite(link.econ.targetMargin)&&calculated.margin<link.econ.targetMargin/100)issues.push({kind:'attention',title:'已盈利，尚未达到目标净利率',detail:'目标来自当前链接的成本设置。试算达到目标时可承受的广告花费。',target:'scenario',action:'查看空间'});
    else issues.push({kind:'ready',title:'当前周期处于盈利区间',detail:'利润基于当前已录入周期。继续观察保本差距与退货变化，不代表未来销量预测。',target:'trend',action:'查看趋势'});
  }
  return {profitReady,missingCosts,missingFields,incomplete:incomplete.length,invalid:invalid.length,invalidCosts,overlap,complete:records.length-incomplete.length,total:records.length,issues};
}

export function simulatePerformance(link, calculated, changes, unitCalculator) {
  if(!['price','advertising','returns'].every(key=>perfFinite(changes[key]))||changes.price<=-100||changes.advertising<-100)return null;
  if(!calculated.ue||!perfFinite(calculated.price)||calculated.price<=0||!calculated.has.units||!calculated.has.adSpend||calculated.S.units<=0)return null;
  const price=calculated.price*(1+changes.price/100),adSpend=calculated.S.adSpend*(1+changes.advertising/100);
  const returnRate=Math.max(0,Math.min(1,changes.returns/100));
  const unit=unitCalculator(link,price,returnRate);
  const sales=price*calculated.S.units,preAd=unit.unit*calculated.S.units,net=preAd-adSpend;
  const target=perfFinite(link.econ.targetMargin)?link.econ.targetMargin/100:0;
  return {price,adSpend,returnRate,sales,preAd,net,margin:sales>0?net/sales:null,delta:net-calculated.net,
    breakEvenBudget:preAd,targetBudget:preAd-target*sales,targetMargin:target};
}
