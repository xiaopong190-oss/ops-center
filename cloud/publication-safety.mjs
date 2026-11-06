import {createHash} from 'node:crypto';
function retainedQuotes(snapshot){
 const cutoff=new Date(Date.now()-9*86400000).toISOString().slice(0,10);
 const keep=row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||row.date>=cutoff;
 const storage=snapshot.storage,q=storage['logistics-quotes-v1'];
 return {...snapshot,storage:{...storage,'logistics-quotes-v1':{...q,quotes:q.quotes.filter(keep),regionalQuotes:(q.regionalQuotes||[]).filter(keep)}}};
}
export function sectionCounts(snapshot){
 const storage=snapshot.storage,quotes=storage['logistics-quotes-v1'];
 return {
  companies:storage['logistics-company-directory-v1'].length,
  quotes:quotes.quotes.length,
  regional:quotes.regionalQuotes?.length||0,
  templates:quotes.templates.length,
  bills:storage['logistics-monthly-bills-v1'].rows.length,
  ratings:storage['logistics-completed-ratings-v1'].length
 };
}

// A local master from a fresh browser or machine may contain only the latest
// imported workbook. Do not publish it over populated cloud sections.
export function assertPublicationSections(previous,next){
 if(!previous)return;
 const before=sectionCounts(retainedQuotes(previous)),after=sectionCounts(next);
 const emptied=Object.keys(before).filter(section=>before[section]>0&&(after[section]===0||(before[section]>=1000&&after[section]<before[section]/2)));
 if(emptied.length)throw Object.assign(Error('PUBLICATION_SECTIONS_REMOVED'),{
  code:'PUBLICATION_SECTIONS_REMOVED',status:422,sections:emptied,before,after
 });
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sections(snapshot){
 const result=new Map();
 for(const [key,value]of Object.entries(snapshot.storage)){
  if(Array.isArray(value))result.set(key,value);
  else for(const [field,rows]of Object.entries(value))result.set(key+'/'+field,Array.isArray(rows)?rows:[rows]);
 }
 return result;
}
export function assertPublicationBase(previous,next,baseContentHash){
 if(!previous)return;
 try{assertPublicationSections(previous,next);}catch(error){
  error.message='发布数据异常减少，已阻止覆盖共享快照。请先载入共享完整数据，再重新导入本次报价。';
  throw error;
 }
 if(baseContentHash&&baseContentHash===digest(previous))return;
 // Older clients may safely republish identical content or add records. They
 // cannot replace/delete existing values without a verified local baseline.
 const before=sections(retainedQuotes(previous)),after=sections(next);
 for(const [path,rows]of before){
  const retained=new Set((after.get(path)||[]).map(digest));
  if(rows.some(row=>!retained.has(digest(row))))throw Object.assign(Error('本机数据尚未对齐共享版本，已阻止覆盖。请先载入共享完整数据，再重新导入本次报价。'),{code:'PUBLICATION_BASE_REQUIRED',status:428});
 }
}
