import '../tools/logistics-rating/domain.js';
import C from '../tools/logistics-rating/comparison-core.js';
import Score from '../tools/logistics-rating/channel-score.js';
import Q from '../tools/logistics-rating/quote-core.js';
import Relations from '../tools/logistics-rating/relation-core.js';
import N from '../tools/logistics-rating/n001.js';
import W from '../tools/logistics-rating/extensions/weekly-carryover.js';
import Tax from '../tools/logistics-rating/extensions/tax-filter.js';
import Cargo from '../tools/logistics-rating/extensions/cargo-filter.js';
import Regions from '../tools/logistics-rating/extensions/regional-query.js';
import {buildQueryIndex} from '../cloud/query-index.mjs';
import {buildTableColumns} from './table-column-projection.mjs';

const gradeFields=['priceGrade','timeGrade','quoteGrade','quoteScore','channelScore','channelScoreLevel','channelScoreBasis','priceReference','reason'];
const grades=row=>Object.fromEntries(gradeFields.map(key=>[key,row[key]??null]));
function compact(row,names){
 const provider=row.companyId||row.company;
 return {
  provider,company:names[provider]||row.company,region:row.geographyRegion||Q.region(row.country),country:row.country,
  warehouse:row.warehouse||'',channel:row.channel,channelDisplay:W.label(row,row.channelDisplay||row.channel),transport:N.transport(row),
  cargo:Cargo.classifyCargo(row).tags,tax:Tax.optionsFor().filter(mode=>Tax.filterTaxRows([row],mode).length),
  terms:row.terms,date:row.date,price:row.price,currency:row.currency,unit:row.unit,min:row.min??null,max:row.max??null,
  regionRaw:row.regionRaw||'',source:row.source||'',sourceSheet:row.sourceSheet||'',priceCell:row.priceCell||'',
  timeBasis:row.timeBasis||'',timeUnverified:!!row.timeUnverified,leadRaw:row.leadRaw||'',timeNote:row.timeNote||'',
  originalCountry:row.comparisonOriginal?.country||row.country,originalChannel:row.comparisonOriginal?.channel||row.channel
 };
}
function rankGroups(rows,db,confirmed){
 const groups=new Map();
 for(const row of rows){const key=Q.comparisonGroup(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 N.confirmed=confirmed;
 const ranked=[...groups.values()].flatMap(group=>N.rank(group,Q));
 return new Map(ranked.map(row=>[row.queryRowId,{...row,...Score.calculate(row,confirmed,db.channelScoreEvents||[])}]));
}
export function projectQuerySnapshot(snapshot,today,relations=[]){
 const db=snapshot.storage['logistics-quotes-v1'],companies=snapshot.storage['logistics-company-directory-v1'];
 const names=Object.fromEntries(companies.map(company=>[company.id,company.name]));
 const effective=W.effective(Q.prune(Q.canonical(db),today),today),kinds={};
 Relations.install(relations);Relations.prepare(db);
 const warehouses=[...new Set(db.templates.map(row=>row.warehouse))];
 for(const mode of ['price','strict']){
  C.setMode(mode);
  const compared=C.latest(Q.comparisonRows(effective.quotes,db.comparisonMappings||[]).map(row=>Relations.normalize(row)))
   .map((row,queryRowId)=>({...row,queryRowId}));
  const base=rankGroups(compared,db,false),ranked=rankGroups(compared,db,true);
  const rows=compared.map(row=>{
   const initial=base.get(row.queryRowId)||row,calculated=ranked.get(row.queryRowId)||initial;
   return {...compact(initial,names),base:grades(initial),ranked:grades(calculated),score:initial.channelScore??null,rankedScore:calculated.channelScore??null};
  }).sort((a,b)=>a.country.localeCompare(b.country)||a.warehouse.localeCompare(b.warehouse));
  kinds['quotes-'+mode]=buildQueryIndex(rows);
  const columns=buildTableColumns(rows);kinds['quotes-'+mode].index.tableColumns={schema:columns.schema,fields:columns.fields};kinds['quotes-'+mode].columnParts=columns.parts;
  kinds['quotes-'+mode].index.archive=db.templates.map(row=>Relations.normalize(row)).map(row=>({country:row.country,region:row.geographyRegion||Q.region(row.country),warehouse:row.warehouse}));
  const regions=C.prepare(effective.regionalQuotes,db.comparisonMappings||[]).map((row,i)=>({
   ...compact(Relations.normalize(row),names),regionRaw:effective.regionalQuotes[i].regionRaw,
   coverage:warehouses.filter(code=>Regions.coversWarehouse(effective.regionalQuotes[i],code))
  }));
  kinds['regional-'+mode]=buildQueryIndex(regions);
  const searchParts=[];let texts=[],start=0,bytes=2;
  for(const row of effective.regionalQuotes){
   const text=[row.company,row.country,row.channel,row.regionRaw,row.terms,row.sourceSheet].map(value=>String(value||'').toLowerCase()).join('\n');
   const size=Buffer.byteLength(JSON.stringify(text))+1;
   if(texts.length&&bytes+size>900000){searchParts.push({start,texts});start+=texts.length;texts=[];bytes=2;}
   texts.push(text);bytes+=size;
  }
  if(texts.length)searchParts.push({start,texts});
  kinds['regional-'+mode].searchParts=searchParts;
  kinds['regional-'+mode].index.searchParts=searchParts.map((part,i)=>({part:'search-'+i,start:part.start,count:part.texts.length}));
 }
 kinds.warehouses=buildQueryIndex((db.templates||[]).map(row=>({...row,...Relations.normalize(row)})));
 const bills=snapshot.storage['logistics-monthly-bills-v1'],billRows=bills.rows.map(row=>{
  const provider=row.companyId||bills.aliases[row.company]||row.company;
  return {...row,provider,company:names[provider]||bills.aliases[row.company]||row.company,month:row.date.slice(0,7)};
 });
 kinds.bills=buildQueryIndex(billRows);
 const summaries=new Map();
 for(const row of billRows){const key=JSON.stringify([row.month,row.company,row.currency]);if(!summaries.has(key))summaries.set(key,{month:row.month,provider:row.provider,company:row.company,currency:row.currency,count:0,amount:0,paid:0});const group=summaries.get(key);group.count++;group.amount+=row.amount;group.paid+=row.paid;}
 kinds.bills.index.summaries=[...summaries.values()].sort((a,b)=>a.company.localeCompare(b.company));
 kinds.ratings=buildQueryIndex(snapshot.storage['logistics-completed-ratings-v1']||[]);
 for(const [kind,view] of Object.entries(kinds)){
  view.index.providerNames=names;
  if(kind==='ratings')view.index.companies=companies;
 }
 return {kinds,counts:{quotes:effective.quotes.length,regional:effective.regionalQuotes.length,templates:db.templates.length,bills:snapshot.storage['logistics-monthly-bills-v1'].rows.length,ratings:snapshot.storage['logistics-completed-ratings-v1'].length}};
}
