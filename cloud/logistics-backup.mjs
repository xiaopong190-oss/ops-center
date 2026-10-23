import D from '../tools/logistics-rating/domain.js';
import Q from '../tools/logistics-rating/quote-core.js';
import {logisticsStorage} from './logistics-storage.mjs';
const keys=['logistics-company-directory-v1','logistics-quotes-v1','logistics-monthly-bills-v1','logistics-completed-ratings-v1'];
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function validateBackup(data){
 if(!data||data.space!=='real'||!data.storage||Object.keys(data.storage).length!==4||keys.some(k=>!Object.hasOwn(data.storage,k)))fail(400,'仅允许真实业务四键备份');
 const [companies,quotes,bills,ratings]=keys.map(k=>data.storage[k]);try{D.directory(companies);Q.validate(quotes);D.bills(bills);D.ratings(ratings,new Date(Date.now()+14*3600000).toISOString().slice(0,10));}catch{fail(400,'业务数据校验失败，云端未保存');}
 const rows=[...quotes.quotes,...(quotes.deletedQuotes||[]),...(quotes.regionalQuotes||[]),...bills.rows,...ratings],ids=new Set(companies.map(c=>c.id));if([...companies,...rows].some(r=>r.demo===true)||quotes.templates.some(t=>t.demo===true&&!quotes.quotes.some(q=>q.country===t.country&&q.warehouse===t.warehouse)))fail(400,'演示数据禁止上传真实业务云端');
 if(rows.some(r=>!ids.has(r.companyId)))fail(400,'业务记录缺少关联公司档案');return data;
}
export async function logisticsBackup(req,env,user,assembled=null){
 const store=logisticsStorage(user),url=new URL(req.url);
 if(url.pathname.endsWith('/upload'))return store.upload(req,env,user,text=>logisticsBackup(new Request(new URL('/api/logistics-backup',req.url),{method:'POST'}),env,user,text));
 const previous=await store.read(env),current=previous.snapshot;
 if(req.method==='GET')return Response.json(url.searchParams.get('download')==='1'?current:{revision:current.revision,savedAt:current.savedAt||null,owner:user.id,counts:current.counts||null},{headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')fail(405,'方法不允许');if(user.canEdit===false&&user.auth!=='super')fail(403,'当前账号没有编辑权限');
 const text=assembled??await req.text();if(new TextEncoder().encode(text).length>16*1024*1024)fail(413,'备份超过16 MiB');let input;try{input=JSON.parse(text);}catch{fail(400,'无效备份JSON');}
 if(input.operationId===current.operationId)return Response.json({ok:true,revision:current.revision,savedAt:current.savedAt,counts:current.counts});
 if(input.revision!==current.revision)fail(409,'云端备份已被更新，请核对后重试；本地数据保留');
 if(!/^[0-9a-f-]{36}$/i.test(input.operationId||''))fail(400,'操作编号无效');const data=validateBackup(input.data),s=data.storage;
 const next={revision:current.revision+1,operationId:input.operationId,savedAt:new Date().toISOString(),owner:user.id,data,counts:{companies:s[keys[0]].length,quotes:s[keys[1]].quotes.length,bills:s[keys[2]].rows.length,ratings:s[keys[3]].length}};
 await store.write(env,previous,next);return Response.json({ok:true,revision:next.revision,savedAt:next.savedAt,counts:next.counts},{headers:{'Cache-Control':'no-store'}});
}
