function complexDemoInputs(baseDate){
  const day=n=>{const d=new Date(baseDate+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const people=['示例·小林','示例·小周','示例·小陈','示例·小许','示例·小何'];
  const names=['桌面收纳盒','真空保温杯','笔记本支架','便携榨汁杯','宠物梳','旅行收纳袋'];
  const stages=['推广优化','持续优化','上架准备','转化优化','复盘验证','页面优化'];
  const states=['测款中','稳定销售','待上架','优化中','清库存','待上架'];
  const items=[],add=(key,kind,body,productKey,operationKey)=>items.push({key,kind,body,productKey,operationKey});
  for(let p=0;p<6;p++)add('p'+p,'product',{name:'示例｜'+names[p],sku:'TEAM-QA-'+['BOX','CUP','STAND','JUICER','PET','BAG'][p],owner:'示例·运营主管',stage:stages[p],operating:states[p],health:['待处理','正常','正常','风险','风险','待处理'][p],purpose:['验证点击到订单的转化','保持销量并控制获客成本','确认到货后上架节奏','验证页面修改是否改善转化','降低库存并评估促销收益','完善已确认产品的销售页面'][p],issue:['美国站广告成本增长','销量稳定，德国站仍需页面优化','首批货在清关，销售页面待核对','页面转化偏低，卖点表达需优化','库存偏高，促销费超预算','产品已确认，主图和卖点资料待完善'][p],next:['复盘关键词和主图','检查预算与复购','跟进物流和Listing资料','验证页面调整结果','确认清库存方案','安排页面优化与核验'][p],due:day([-2,5,1,0,-1,14][p])});
  const distribution=[0,0,0,1,1,2,2,3,3,4,4,4];
  const markets=['美国','德国','英国','日本'];
  for(let i=0;i<12;i++){
    const pid=distribution[i],key='a'+i,owner=people[i%5],status=i===3?'已完成':['推广中','测款中','优化中','稳定销售','待上架','暂停','清库存'][i%7];
    add(key,'operation',{title:i<3?'':['广告与关键词','页面与转化','产品运营'][i%3],owner,store:i<3?'':'示例'+String.fromCharCode(65+i%4)+'店',site:i<3?'':markets[i%4],status,purpose:'验证'+markets[i%4]+'站订单与成本表现',issue:i%3===0?'花费超过预期，待复盘':i%3===1?'有点击但订单不足':'当前稳定，等待数据更新',next:i%2?'核对页面与关键词':'复盘广告并调整预算',due:day([-3,0,2,7][i%4]),target:'比较7天订单和花费，记录单变量调整结果',result:status==='已完成'||i%4===0?'示例：订单提升12%，已记录核对结果':'',evidence:status==='已完成'||i%4===0?'https://example.com/demo/operation-'+i:''},'p'+pid);
    for(let t=0;t<2;t++){
      const status=['待开始','进行中','待验证','已验证'][(i+t)%4];
      add('t'+i+'-'+t,'task',{title:'示例｜'+names[pid]+' · '+(t?'销售页面核验':'关键词转化复盘'),owner,due:day([-5,-1,0,4,10][(i+t)%5]),target:t?'核对图片和卖点表达，提交核验记录':'确认高花费无订单词，比较调整前后数据',status,result:status==='已验证'?'示例：已核对数据并完成单变量验证':'',evidence:status==='已验证'?'https://example.com/demo/task-'+i+'-'+t:''},'p'+pid,key);
    }
    const campaignStatus=['未开始','进行中','待复盘','已完成','暂停'][i%5];
    add('c'+i,'campaign',{title:'示例｜'+names[pid]+' · '+['关键词广告','达人内容','优惠券测试'][i%3],owner,plan:'按店铺和站点分组测试；一次只调整一个变量',channel:['站内广告','达人合作','优惠券'][i%3],start:day(-10),due:day(i%3?4:-1),target:'目标ROAS ≥ 3.0；订单数据需核对归因',budget:i===0?0:1500+i*100,actual:i===0?0:i===1?'':i%3===0?2400:900+i*75,sales:i===0?0:i===2?'':3000+i*700,orders:i===0?0:20+i*3,status:campaignStatus,result:campaignStatus==='已完成'?'示例：ROAS改善，已记录验证结果':'',evidence:campaignStatus==='已完成'?'https://example.com/demo/campaign-'+i:''},'p'+pid,key);
  }
  for(let p=0;p<6;p++){
    const key='opt'+p,owner=people[p%5],opIndex=distribution.indexOf(p),op=opIndex<0?undefined:'a'+opIndex,status=['进行中','待验证','待开始','进行中','已完成','待开始'][p];
    add(key,'optimization',{title:'示例｜'+names[p]+' · '+['关键词与预算优化','主图点击率优化','上架页面完善','卖点转化优化','清库存方案复盘','图片与文案优化'][p],owner,problem:'当前'+['广告花费高','点击率未达目标','页面资料未完善','转化率低','库存偏高','主图与卖点待完善'][p],hypothesis:'当前表达或投放未匹配目标人群，采用单变量优化验证',plan:'调整'+['关键词分组与预算','主图卖点表达','图片和Listing资料','五点描述与场景图','优惠券与促销预算','主图和标题信息'][p]+'；记录调整前后同周期数据',metric:['ROAS','点击率CTR','页面质量','转化率CVR','销量','页面质量'][p],baseline:['2.1x / 前7天','0.45% / 前7天','资料完成70%','6% / 前7天','20单 / 前7天','资料完成50%'][p],target:['ROAS≥3.0x / 后7天','CTR≥0.6% / 后7天','上架资料核对100%','CVR≥8% / 后7天','销量≥35单 / 后7天','图片文案核对100%'][p],start:day(-7),due:day(p%2?-1:4),status,actual:status==='已完成'?'38单 / 后7天':'',result:status==='已完成'?'销量达到目标，下一步控制促销成本':'',evidence:status==='已完成'?'https://example.com/demo/optimization-'+p:''},'p'+p,op);
    for(let t=0;t<2;t++)add('optTask'+p+'-'+t,'task',{title:'示例｜'+names[p]+' · '+(t?'复盘优化结果':'实施优化动作'),owner,due:day(t?4:0),target:t?'提交优化前后同周期对照和证据':'完成方案中的单变量调整',status:status==='已完成'?'已验证':t?'待开始':'进行中',result:status==='已完成'?'示例：动作完成并核验效果':'',evidence:status==='已完成'?'https://example.com/demo/optimization-task-'+p+'-'+t:''},'p'+p,op),items[items.length-1].optimizationKey=key;
    const shipmentStatus=['待发货','运输中','清关中','已签收','异常','待发货'][p];
    add('s'+p,'shipment',{title:'示例批次-'+String(p+1).padStart(3,'0'),owner:'示例·物流',method:p%2?'空运':'海运',tracking:p===0?'':'DEMO-TRACK-'+p,quantity:p===5?0:300+p*50,planned:day(-14),shipped:shipmentStatus==='待发货'?'':day(-10),due:day([-2,3,-1,-3,-4,10][p]),arrived:shipmentStatus==='已签收'?day(-4):'',status:shipmentStatus,firstLegStatus:['待备货','已离港','清关中','已入仓','异常','待提货'][p],evidence:shipmentStatus==='已签收'?'https://example.com/demo/shipment-'+p:''},'p'+p);
    add('cost'+p,'cost',{title:'示例｜'+names[p]+'首批采购',category:'采购',batch:'示例批次-'+String(p+1).padStart(3,'0'),date:day(-15),budget:10000,actual:p===5?'':p%2?9800:11000,status:p===5?'未付':'已付',evidence:p===5?'':'https://example.com/demo/cost-'+p},'p'+p);
    add('freight'+p,'cost',{title:'示例｜'+names[p]+'物流费',category:'物流',batch:'示例批次-'+String(p+1).padStart(3,'0'),date:day(-10),budget:p===5?0:1200,actual:p===5?0:1400,status:'已付'},'p'+p);
  }
  for(let i=0;i<items.length;i++){const item=items[i];if(['task','campaign','optimization','shipment','cost'].includes(item.kind)){const op=items.find(a=>a.key===item.operationKey);item.body.account=op?.body.store||'示例A店';item.body.site=op?.body.site||['美国','德国','英国'][i%3];item.body.executedAt=day(-(i%5))+'T'+['09:00','14:30','18:00'][i%3];}}
  return items;
}
function applyBatch(current,items,actor,reason){
  let next=current;const refs={};
  for(const item of items){
    const body={...item.body};if(item.operationKey){if(!refs[item.operationKey])throw Error('示例运营关联顺序无效');body.operationId=refs[item.operationKey];}
    if(item.optimizationKey){if(!refs[item.optimizationKey])throw Error('示例优化关联顺序无效');body.optimizationId=refs[item.optimizationKey];}
    if(item.productKey&&!refs[item.productKey])throw Error('示例产品关联顺序无效');
    const changed=applyChange(next,{kind:item.kind,body,productId:refs[item.productKey],actor,reason});
    refs[item.key]=changed.result.id;next=changed.next;
  }
  return {next,result:{ok:true,products:items.filter(i=>i.kind==='product').length,records:items.filter(i=>i.kind!=='product').length}};
}
async function teamDemo(){
  if(busy)return;const actor=$('#actor').value.trim();if(!actor){toast('请先填写右上角操作人。',true);$('#actor').focus();return;}
  busy=true;try{
    await transact(current=>{
      if(current.products.some(p=>p.body.sku.startsWith('TEAM-QA-')))throw Error('复杂示例已存在；可在产品列表搜索“TEAM-QA”查看，无需重复加载。');
      return applyBatch(current,complexDemoInputs(today()),actor,'加载复杂示例，所有数据与证据链接仅供测试');
    });
    ownerFilter='全部运营';view='总览';search='TEAM-QA';filter='全部状态';
    await load();toast('已加入6款产品、5位运营、12项分工及6个优化方案。方案含优化动作、基准目标和12项关联跟进。');
  }catch(e){toast(e.message,true);}finally{busy=false;}
}
