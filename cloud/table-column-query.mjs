import Columns from '../tools/logistics-workspace/table-columns.js';
import {decodeIds,matchingQueryIds,pageQueryIds} from './query-index.mjs';
const definitions=new Map(Columns.definitions.map(item=>[item.id,item]));
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const decoded=new WeakMap();
function values(root){let cache=decoded.get(root);if(!cache){cache={values:decodeIds(root.rowValues),orders:{}};decoded.set(root,cache);}return cache;}
export async function tableColumnQuery(index,filters,query,read,confirmed){
 const supported=index.tableColumns?.schema===1,raw=query.get('columns')||'{}';let rules;
 try{rules=JSON.parse(raw)}catch{fail(400,'表头筛选格式无效');}
 if(!rules||Array.isArray(rules)||typeof rules!=='object'||Object.keys(rules).length>12)fail(400,'表头筛选无效');
 const entries=Object.entries(rules),facet=query.get('column')||'',sortText=query.get('columnSort')||'',sort=sortText?sortText.split(':'):null,mode=confirmed?'ranked':'base';
 if(facet&&!definitions.has(facet)||sort&&(!definitions.has(sort[0])||sort.length!==2||!['asc','desc'].includes(sort[1])))fail(400,'表头列无效');
 for(const [field,rule] of entries){if(!definitions.has(field)||!rule||!['include','exclude'].includes(rule.mode)||!Array.isArray(rule.values)||rule.values.length>32000||rule.values.some(value=>!Number.isSafeInteger(value)||value<0))fail(400,'表头筛选选项无效');}
 const active=entries.length||facet||sort;
 if(!supported){if(active)fail(503,'完整表头索引正在准备，请稍后重新加载');return {state:{supported:false},ids:null};}
 if(entries.length&&!query.get('version'))fail(409,'表头筛选版本已变化，请重新选择');
 if(entries.some(([field])=>definitions.get(field).dynamic)&&query.get('columnMode')!==mode)fail(409,'评分状态已变化，请重新选择等级筛选');
 const state={supported:true,schema:1,filters:rules,sort:sortText,mode};
 if(!active)return {state,ids:null};
 const fields=[...new Set([...entries.map(([field])=>field),...(facet?[facet]:[]),...(sort?[sort[0]]:[])])],roots=new Map();
 await Promise.all(fields.map(async field=>{const part=index.tableColumns.fields[field]?.[mode];if(!part)fail(503,'完整表头索引尚未就绪');roots.set(field,await read(part));}));
 for(const [field,rule] of entries)if(rule.values.some(value=>value>=roots.get(field).valueCount))fail(400,'表头筛选选项已失效');
 const base=matchingQueryIds(index,filters)??Array.from({length:index.count},(_,id)=>id),sets=new Map(entries.map(([field,rule])=>[field,new Set(rule.values)]));
 const matches=(row,skip='')=>entries.every(([field,rule])=>field===skip||(sets.get(field).has(values(roots.get(field)).values[row])===(rule.mode==='include')));
 let ids=base.filter(row=>matches(row));
 if(facet){
  const root=roots.get(facet),rowValues=values(root).values,counts=new Map();for(const row of base)if(matches(row,facet)){const id=rowValues[row];counts.set(id,(counts.get(id)||0)+1);}
  const allValues=[...counts.keys()].sort((a,b)=>a-b),cursor=Number(query.get('cursor')||0),needle=String(query.get('columnSearch')||'').trim().toLocaleLowerCase();
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>allValues.length||needle.length>100)fail(400,'表头选项分页或搜索无效');
  let position=cursor;const parts=new Map(),choices=[];
  while(position<allValues.length&&choices.length<200){
   const id=allValues[position],part=root.pages.find(item=>id>=item.start&&id<item.end);if(!part)fail(502,'表头选项索引无效');
   if(!parts.has(part.part)){if(parts.size>=4)break;parts.set(part.part,await read(part.part));}
   const entry=parts.get(part.part)[id-part.start];if(entry.value!==id)fail(502,'表头选项校验失败');
   if(!needle||entry.label.toLocaleLowerCase().includes(needle))choices.push({...entry,count:counts.get(id)});position++;
  }
  return {state,facet:{field:facet,label:definitions.get(facet).label,type:root.type,choices,allValues,total:allValues.length,nextCursor:position<allValues.length?position:null,scanned:position},ids};
 }
 if(sort){const cache=values(roots.get(sort[0])),eligible=new Set(ids);cache.orders[sort[1]]??=decodeIds(roots.get(sort[0]).orders[sort[1]]);ids=cache.orders[sort[1]].filter(id=>eligible.has(id));}
 return {state,ids,selection:sort?pageQueryIds(index,ids,Number(query.get('page')||0),Number(query.get('size')||50)):null};
}
