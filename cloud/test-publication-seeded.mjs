import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture,snapshot} from './publication-test-helper.mjs';
import {recoverJobs,jobKey,readRecord} from './publication-jobs.mjs';
import {publishSnapshot} from '../deploy/publish-logistics-snapshot.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('1000 fixed-seed end-to-end fault schedules: zero lost content, duplicate business commits or false success',async()=>{
 const evidence=[];
 for(let i=0;i<1000;i++){
  const seed=(0x48415855+i)>>>0;let random=seed;const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0};
  const f=fixture();try{
   const data=snapshot();data.storage['logistics-quotes-v1'].quotes[0].price=1000+next()%100000;const payload=Buffer.from(JSON.stringify(data)),expected=sha(payload),confirmedAt=Date.now()+(next()%2?-1:1)*(next()%172800000);
   await f.prepare(data);await f.upload({action:'publication-accept',confirmedAt});
   const fault=next()%8;let lostDispatch=fault===6;
   await recoverJobs(f.env,{send:async(...args)=>{const response=await f.send(...args);if(lostDispatch){lostDispatch=false;throw Error('synthetic accepted dispatch but response lost')}return response;}});
   if(fault===6){const j=await readRecord(f.env,jobKey('synthetic-owner',f.id));await recoverJobs(f.env,{send:f.send,now:j.nextAttemptAt+1});}
   let ticket=f.ticket(),cloud=f.cloudFor(ticket),result;
   if(fault===1)f.loseRef();
   const at=['ready','committed','query-index','verified','finish'][Math.max(0,fault-2)];
   if(fault>=2&&fault<=5){let dead=false;const crashing=async(path,options)=>{if(dead||path===at){dead=true;throw Error('synthetic killed executor')}return cloud(path,options)};await assert.rejects(publishSnapshot({ticket,cloud:crashing,github:f.github,delay:async()=>{}}));await cloud('failed',{method:'POST',headers:{'X-Workspace-Failure':'RUNNER_FAILED'}});const j=await readRecord(f.env,jobKey('synthetic-owner',f.id));await recoverJobs(f.env,{send:f.send,now:j.nextAttemptAt+1});ticket=f.ticket();cloud=f.cloudFor(ticket);}
   result=await publishSnapshot({ticket,cloud,github:f.github,delay:async()=>{}});
   assert(result.receipt.verified,'seed '+seed);assert.equal(result.receipt.contentHash,expected,'seed '+seed);assert.equal(f.rootWrites(),1,'seed '+seed);
   for(let duplicate=0,n=next()%4;duplicate<n;duplicate++)assert.deepEqual((await f.upload({action:'publication-status'})).receipt,result.receipt);
   const job=await readRecord(f.env,jobKey('synthetic-owner',f.id));assert.equal(job.confirmedAt,confirmedAt);assert.equal(job.state,'SUCCEEDED');assert(job.receipt.queryContent['quotes-price'].hash);
   assert(process.memoryUsage().rss<1024*1024*1024,'test resource stop threshold reached');
   evidence.push({seed,fault,confirmedAt,sourceHash:expected,rootSha:result.receipt.sha,queryHash:job.receipt.queryContent['quotes-price'].hash,rootWrites:f.rootWrites()});
  }catch(e){e.message='seed='+seed+' '+e.message;throw e;}finally{f.sql.close();}
  if((i+1)%100===0)console.log('Completed seeded complete chains: '+(i+1));
 }
 if(process.env.PUBLICATION_EVIDENCE_FILE)fs.writeFileSync(process.env.PUBLICATION_EVIDENCE_FILE,JSON.stringify({generator:'xorshift32-v1',startSeed:0x48415855,count:1000,evidence},null,2));
});
