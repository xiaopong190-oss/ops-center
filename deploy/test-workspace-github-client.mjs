import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubClient} from './workspace-github-client.mjs';
test('404 identifies operation, method, part, status and request ID without logging payload or token',async()=>{
 const logs=[],seen=[],token='PRIVATE_TOKEN_NOT_FOR_LOGS',secret='PRIVATE_QUOTE_NOT_FOR_LOGS';
 const github=createGitHubClient({token,report:d=>logs.push(d),send:async(url,options)=>{seen.push({url,options});return new Response(secret,{status:404,headers:{'x-github-request-id':'AB12:CD34:EF56'}})}});
 await assert.rejects(github('git/blobs/'+'a'.repeat(40),{stage:'part-readback',part:7}),e=>e.code==='GITHUB_404'&&e.status===404);
 assert.deepEqual(logs,[{sequence:1,method:'GET',endpoint:'git/blobs/:sha',stage:'part-readback',part:7,kind:'http',status:404,requestId:'AB12:CD34:EF56'}]);assert.equal(seen[0].options.headers.Authorization,'Bearer '+token);assert(!JSON.stringify(logs).includes(token));assert(!JSON.stringify(logs).includes(secret));
});
test('successful write and expected missing baseline retain behavior and do not announce failures',async()=>{
 const logs=[],calls=[];const github=createGitHubClient({token:'synthetic',report:d=>logs.push(d),send:async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({sha:'b'.repeat(40)}):new Response(null,{status:404})}});
 assert.deepEqual(await github('git/blobs',{method:'POST',body:{encoding:'base64',content:'c3ludGhldGlj'},stage:'root-write'}),{sha:'b'.repeat(40)});
 assert.equal(JSON.parse(calls[0].options.body).content,'c3ludGhldGlj');assert.equal(calls[0].options.redirect,'error');assert.equal(await github('contents/data/logistics/workspace-snapshot.enc.json?ref=main',{allow404:true,stage:'baseline-read'}),null);assert.equal(logs.length,0);
});
test('unsafe fields and server text cannot inject diagnostics; reporter failure preserves HTTP error',async()=>{
 const logs=[],github=createGitHubClient({token:'synthetic',report:d=>logs.push(d),send:async()=>new Response('token=SECRET',{status:403,headers:{'x-github-request-id':'SECRET<bad>'}})});
 await assert.rejects(github('private/SECRET',{stage:'SECRET',part:'SECRET'}),e=>e.code==='GITHUB_403');assert.equal(JSON.stringify(logs).includes('SECRET'),false);assert.equal(logs[0].endpoint,'unrecognized');
 const other=createGitHubClient({token:'synthetic',report:()=>{throw Error('logging failure')},send:async()=>new Response(null,{status:404})});await assert.rejects(other('git/blobs',{method:'POST'}),e=>e.code==='GITHUB_404');
});
test('network and malformed JSON failures identify endpoint without reflecting error text',async()=>{
 const logs=[],error=Error('PRIVATE_URL_TOKEN');const github=createGitHubClient({token:'synthetic',report:d=>logs.push(d),send:async()=>{throw error}});await assert.rejects(github('git/trees',{method:'POST',stage:'tree-write'}),e=>e===error);assert.equal(logs[0].kind,'network');assert(!JSON.stringify(logs).includes('PRIVATE_URL_TOKEN'));
 const other=createGitHubClient({token:'synthetic',report:d=>logs.push(d),send:async()=>new Response('PRIVATE_BROKEN_RESPONSE')});await assert.rejects(other('git/ref/heads/main',{stage:'branch-read'}));assert.equal(logs[1].kind,'invalid-json');assert(!JSON.stringify(logs).includes('PRIVATE_BROKEN_RESPONSE'));
});
