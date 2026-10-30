import {publicRecordsSql,publicRecordsBounds} from './d1-budget.mjs';
const slots=new WeakMap(),ttl=15000;
export function invalidatePublicRows(env){slots.delete(env.DB)}
export async function publicRows(env,now=Date.now()){
 let slot=slots.get(env.DB);
 if(!slot||now>=slot.expires){
  slot={expires:now+ttl};slots.set(env.DB,slot);
  slot.pending=env.DB.prepare(publicRecordsSql).bind(...publicRecordsBounds).all().then(r=>r.results).catch(e=>{if(slots.get(env.DB)===slot)slots.delete(env.DB);throw e});
 }
 return slot.pending;
}
