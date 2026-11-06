import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicationSections,assertPublicationBase} from './publication-safety.mjs';
import {createHash} from 'node:crypto';
import {buildIncremental} from '../deploy/snapshot-incremental.mjs';

const snapshot=(quotes,regional,templates)=>({space:'real',storage:{
 'logistics-company-directory-v1':[{id:'synthetic'}],
 'logistics-quotes-v1':{quotes:Array.from({length:quotes},(_,id)=>({id})),regionalQuotes:Array.from({length:regional},(_,id)=>({id})),templates:Array.from({length:templates},(_,id)=>({id}))},
 'logistics-monthly-bills-v1':{rows:[],aliases:{}},
 'logistics-completed-ratings-v1':[]
}});

test('a 62-region-only master cannot clear thousands of warehouse quotes and permanent templates',async()=>{
 const base=snapshot(20714,4760,590),partial=snapshot(0,62,0),before=JSON.stringify(base);
 await assert.rejects(buildIncremental(partial,'published',async endpoint=>{
  assert.equal(endpoint,'previous');
  return Response.json({sha:'published',data:base});
 }),error=>error.code==='PUBLICATION_SECTIONS_REMOVED'&&error.status===422&&error.before.quotes===20714&&error.after.quotes===0&&error.sections.includes('templates'));
 assert.equal(JSON.stringify(base),before);
});

test('first publication, unchanged data and supplier updates retaining populated sections remain allowed',()=>{
 assert.doesNotThrow(()=>assertPublicationSections(null,snapshot(0,62,0)));
 assert.doesNotThrow(()=>assertPublicationSections(snapshot(2000,100,20),snapshot(2000,100,20)));
 assert.doesNotThrow(()=>assertPublicationSections(snapshot(2000,100,20),snapshot(1900,134,20)));
});

test('each previously populated section has the same protection even when another section remains populated',()=>{
 const base=snapshot(1,1,1);
 base.storage['logistics-monthly-bills-v1'].rows=[{id:'bill'}];
 base.storage['logistics-completed-ratings-v1']=[{id:'rating'}];
 const paths=[['logistics-company-directory-v1'],['logistics-quotes-v1','quotes'],['logistics-quotes-v1','regionalQuotes'],['logistics-quotes-v1','templates'],['logistics-monthly-bills-v1','rows'],['logistics-completed-ratings-v1']];
 for(const [key,field] of paths){
  const next=structuredClone(base);
  if(field)next.storage[key][field]=[];else next.storage[key]=[];
  assert.throws(()=>assertPublicationSections(base,next),error=>error.code==='PUBLICATION_SECTIONS_REMOVED');
 }
});

test('an unknown baseline cannot silently remove operational scores, comparison mappings or bill aliases',()=>{
 const base=snapshot(2,2,2);
 base.storage['logistics-quotes-v1'].channelScoreEvents=[{id:'synthetic-score'}];
 base.storage['logistics-quotes-v1'].comparisonMappings=[{id:'synthetic-mapping'}];
 base.storage['logistics-monthly-bills-v1'].aliases={synthetic:'preserve'};
 for(const field of ['channelScoreEvents','comparisonMappings','aliases']){
  const next=structuredClone(base);
  if(field==='aliases')next.storage['logistics-monthly-bills-v1'].aliases={};
  else delete next.storage['logistics-quotes-v1'][field];
  assert.throws(()=>assertPublicationBase(base,next,null),error=>error.status===428);
 }
 const changed=structuredClone(base);changed.storage['logistics-quotes-v1'].quotes[0]={id:999};
 const hash=createHash('sha256').update(JSON.stringify(base)).digest('hex');
 assert.doesNotThrow(()=>assertPublicationBase(base,changed,hash));
});

test('normal ten-day quote expiry remains allowed while permanent warehouse templates remain protected',()=>{
 const base=snapshot(2000,100,20);
 for(const row of [...base.storage['logistics-quotes-v1'].quotes,...base.storage['logistics-quotes-v1'].regionalQuotes])row.date='2000-01-01';
 const next=snapshot(0,0,20);
 assert.doesNotThrow(()=>assertPublicationBase(base,next,null));
 next.storage['logistics-quotes-v1'].templates=[];
 assert.throws(()=>assertPublicationBase(base,next,null),error=>error.code==='PUBLICATION_SECTIONS_REMOVED');
});
