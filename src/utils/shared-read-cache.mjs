// Cache only in this page, partitioned by endpoint and credential.
export function createSharedReadCache(ttl=5000,clock=Date.now){
 let current=null;
 return {
  clear(){current=null},
  read(identity,load){
   const now=clock();
   if(!current||current.identity!==identity||now>=current.expires){
    const slot={identity,expires:now+ttl};current=slot;
    slot.pending=Promise.resolve().then(load).catch(e=>{if(current===slot)current=null;throw e});
   }
   return current.pending.then(value=>JSON.parse(JSON.stringify(value)));
  }
 };
}
