import assert from 'node:assert/strict';
import {validateRelations,validateRelationsResult,recognizeRelationsCached} from './logistics-relations.mjs';
const input=validateRelations({purpose:'relation-identity',exception:true,items:[{kind:'geo',raw:'美东一区',context:''}]});
assert.throws(()=>validateRelations({...input,exception:true,items:[...input.items,...input.items]}));
assert.throws(()=>validateRelationsResult({items:[{kind:'geo',raw:'别的名称',context:'',confidence:'high',country:'美国',region:'美东一区',channel:'',mode:'待确认'}]},input));
const map=new Map();let calls=0,charges=0;const env={DEEPSEEK_API_KEY:'test-key',DB:{prepare(sql){let args;return {bind(...x){args=x;return this},async first(){return map.has(args[0])?{value:map.get(args[0])}:null},async run(){map.set(args[0],args[1]);return {}}}}}};
const send=async(url,opt)=>{calls++;assert.ok(!opt.body.includes('price'));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{...input.items[0],confidence:'high',country:'美国',region:'美东一区',channel:'',mode:'待确认'}]})}}]}));};
const charge=async n=>{charges+=n};assert.equal((await recognizeRelationsCached(input,env,charge,send)).items[0].country,'美国');await recognizeRelationsCached(input,env,charge,send);assert.equal(calls,1);assert.equal(charges,1);console.log('PASS input bounds, duplicate rejection, forged-output rejection, one API call, shared cached second call');
