export async function cleanupFollowupUploads(env, now=Date.now()) {
  const prefix='_new-product-followup:upload:';
  const rows=(await env.DB.prepare("SELECT key,value FROM records WHERE key GLOB '_new-product-followup:upload:*' AND key NOT GLOB '_new-product-followup:upload:*:*'").all()).results;
  let expired=0;
  for(const row of rows){
    let manifest;try{manifest=JSON.parse(row.value);}catch{continue;}
    if(!Number.isFinite(manifest.expires)||manifest.expires>=now)continue;
    await env.DB.prepare('DELETE FROM records WHERE key=? OR substr(key,1,?)=?').bind(row.key,row.key.length+1,row.key+':').run();
    expired++;
  }
  return {expiredUploads:expired};
}
