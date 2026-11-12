(function(root){
 'use strict';
 const definitions=[['provider','物流商','text'],['country','国家','text'],['warehouse','仓库','text'],['channel','渠道','text'],['terms','计费条件','text'],['price','报价','number'],['time','承诺时效','time'],['date','原始日期','date'],['priceGrade','价格等级','grade'],['timeGrade','时效等级','grade'],['quoteGrade','综合等级','grade'],['score','渠道参考分','number']].map(([id,label,type])=>({id,label,type,dynamic:['priceGrade','timeGrade','quoteGrade','score'].includes(id)}));
 function cell(row,id,ranked=false){
  const grade=ranked?row.ranked:row.base;let value,label;
  if(id==='provider'){value=row.provider;label=row.company||row.provider;}
  else if(id==='channel'){value=row.channelDisplay||row.channel||null;label=value;}
  else if(id==='price'){value=[row.price,row.currency,row.unit];label=(row.price/100).toFixed(2)+' '+row.currency+'/'+row.unit;}
  else if(id==='time'){value=row.min==null?null:[row.min,row.max];label=value?value[0]+'–'+value[1]+'天':'未提供';}
  else if(id==='score'){value=typeof grade?.channelScore==='number'?grade.channelScore:null;label=value===null?'未评分':String(value);}
  else if(['priceGrade','timeGrade','quoteGrade'].includes(id)){value=grade?.[id]||null;label=value||'待评级';}
  else{value=row[id]===undefined||row[id]===null||row[id]===''?null:row[id];label=value;}
  return {value,label:String(label??'（空白）')};
 }
 function compare(a,b,type,direction=1){
  if(a.value===null||b.value===null)return a.value===b.value?0:a.value===null?1:-1;
  let result;
  if(type==='grade'){const rank={D:0,C:1,B:2,A:3,S:4};result=rank[a.value]-rank[b.value];}
  else if(type==='time')result=a.value[1]-b.value[1]||a.value[0]-b.value[0];
  else if(type==='number')result=Array.isArray(a.value)?a.value[0]-b.value[0]||a.label.localeCompare(b.label,'zh-CN',{numeric:true}):a.value-b.value;
  else if(type==='date')result=String(a.value).localeCompare(String(b.value));
  else result=a.label.localeCompare(b.label,'zh-CN',{numeric:true});
  return direction*(result||JSON.stringify(a.value).localeCompare(JSON.stringify(b.value)));
 }
 const api={schema:1,definitions,cell,compare};if(typeof module!=='undefined')module.exports=api;else root.TableColumns=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
