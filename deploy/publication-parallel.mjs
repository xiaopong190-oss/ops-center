// Independent immutable work only. Drain in-flight requests before propagating
// failure so callers cannot activate/commit while a prior batch is still writing.
export async function mapPublicationWork(items,concurrency,work){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('PUBLICATION_CONCURRENCY_INVALID');
 const result=new Array(items.length);let cursor=0,failed=false,error;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(!failed){const index=cursor++;if(index>=items.length)return;try{result[index]=await work(items[index],index)}catch(e){if(!failed){failed=true;error=e;}}}
 }));
 if(failed)throw error;return result;
}
