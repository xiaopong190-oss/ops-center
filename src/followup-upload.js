// Each attempt queries durable server receipts before sending any missing parts.
export async function uploadFollowupPayload(send,payload,progress=()=>{},scope='') {
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  if(bytes.length>16*1024*1024)throw Error('数据超过16MB容量保护上限，请先导出归档并联系管理员扩容；原数据未改变');
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
  const hash=await digest(bytes),key=await digest(new TextEncoder().encode(scope+':'+hash));
  const id=key.slice(0,8)+'-'+key.slice(8,12)+'-'+key.slice(12,16)+'-'+key.slice(16,20)+'-'+key.slice(20,32);
  const partBytes=512*1024,count=Math.ceil(bytes.length/partBytes),hashes=[];
  for(let i=0;i<count;i++)hashes.push(await digest(bytes.subarray(i*partBytes,(i+1)*partBytes)));
  let completed=0;
  const report=phase=>progress({completed,total:count,phase});
  try {
    report('checking');
    let status;
    try {status=await send('/ops-api/followup/upload',{action:'status',id});}
    catch(error){if(![404,410].includes(error.status))throw error;}
    if(!status){await send('/ops-api/followup/upload',{action:'start',id,bytes:bytes.length,count,sha256:hash,hashes});status=await send('/ops-api/followup/upload',{action:'status',id});}
    const received=new Set((status.parts||[]).filter(p=>p.sha256===hashes[p.index]).map(p=>p.index));
    completed=received.size;report('uploading');
    for(let index=0;index<count;index++){
      if(received.has(index))continue;
      const part=bytes.subarray(index*partBytes,(index+1)*partBytes);
      let binary='';for(let offset=0;offset<part.length;offset+=8192)binary+=String.fromCharCode(...part.subarray(offset,offset+8192));
      const receipt=await send('/ops-api/followup/upload',{action:'part',id,index,content:btoa(binary),sha256:hashes[index]});
      if(receipt.sha256!==hashes[index])throw Error('分片保存确认校验失败');
      completed++;report('uploading');
    }
    report('verifying');
    const saved=await send('/ops-api/followup/upload',{action:'commit',id});
    if(!saved?.data||!Number.isSafeInteger(saved.revision))throw Error('云端提交尚未确认');
    report('complete');return saved;
  } catch(error) {
    report('paused');
    if(error.status&&[400,401,403,409,413,507].includes(error.status)){if(error.status!==409)error.uploadPaused=true;throw error;}
    throw Object.assign(Error('已保留'+completed+'片，点击继续上传；'+error.message),{status:error.status,uploadPaused:true,completed,total:count});
  }
}
