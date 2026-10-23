export async function cleanupLogistics(env,now=Date.now()){
 const cutoff=now-30*86400000,rows=(await env.DB.prepare("SELECT key,value FROM records WHERE key GLOB '_logistics-backup:*' AND key NOT GLOB '*:version:*' AND key NOT GLOB '*:upload:*:*'").all()).results;
 const protect=new Set(),remove=[],expiredUploads=[];
 for(const row of rows){const value=JSON.parse(row.value);if(/:upload:[0-9a-f-]{36}$/i.test(row.key)){if(Number.isFinite(value.expires)&&value.expires<now)expiredUploads.push(row.key);continue;}
  if(/:history:/.test(row.key)){if(Number.isFinite(value.createdAt)&&value.createdAt<cutoff){remove.push(row.key);continue;}}
  // Current roots and histories of unknown age always survive; protect all their immutable parts.
  if(Array.isArray(value.parts))for(const key of value.parts)protect.add(key);
 }
 const parts=(await env.DB.prepare("SELECT key FROM records WHERE key GLOB '_logistics-backup:*:version:*'").all()).results;
 for(const {key} of parts){const timestamp=key.match(/:version:(\d{13})-[0-9a-f-]+:/i)?.[1];if(timestamp&&Number(timestamp)<cutoff&&!protect.has(key))remove.push(key);}
 for(let i=0;i<remove.length;i+=40){const batch=remove.slice(i,i+40);await env.DB.prepare('DELETE FROM records WHERE key IN ('+batch.map(()=>'?').join(',')+')').bind(...batch).run();}
 for(const key of expiredUploads){const prefix=key+':';await env.DB.prepare('DELETE FROM records WHERE key=? OR substr(key,1,?)=?').bind(key,prefix.length,prefix).run();}
 return {deletedHistoryAndParts:remove.length,deletedExpiredUploads:expiredUploads.length,retentionDays:30};
}
