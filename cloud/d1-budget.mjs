// Two indexed ranges are equivalent to excluding the leading '_' namespace.
// Avoid scanning private upload shards on every public-file synchronization.
export const publicRecordsSql='SELECT key,value FROM records WHERE key < ? UNION ALL SELECT key,value FROM records WHERE key >= ?';
export const publicRecordsBounds=['_','`'];
export function dailyD1Limit(error,now=Date.now()){
 const text=String(error?.message||error||'');
 const match=text.match(/(?:exceeded|exceeds)[\s\S]*?(?:D1[^\n]*?)?(?:free tier|daily)[\s\S]*?daily row (read|write) limit/i);
 if(!match)return null;
 const kind=match[1].toLowerCase(),resetAt=new Date(now);resetAt.setUTCHours(24,0,0,0);
 return {status:503,code:kind==='read'?'D1_DAILY_READ_LIMIT':'D1_DAILY_WRITE_LIMIT',retryable:false,resetAt:resetAt.toISOString(),retryAfter:Math.max(1,Math.ceil((resetAt.getTime()-now)/1000)),error:'云端免费数据库今日'+(kind==='read'?'读取':'写入')+'额度已用尽，将在 UTC 00:00（北京时间08:00）重置；GitHub快照及本机数据保留，请勿重复上传。'};
}
