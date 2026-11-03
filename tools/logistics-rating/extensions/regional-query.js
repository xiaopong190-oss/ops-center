(function(root){'use strict';
function select(rows,{query='',mode='',provider='',providerName='',country='',channel='',region='',page=0,size=50}={},transport,geography=()=>null,project=r=>r){
 const needle=String(query).trim().toLowerCase();size=Math.max(1,Math.min(200,Number(size)||50));
 const matched=rows.filter(r=>{const scope=project(r);return (!mode||transport(r)===mode)&&(!provider||(r.companyId||r.company)===provider||(!r.companyId&&providerName&&r.company===providerName))&&(!country||scope.country===country)&&(!channel||scope.channel===channel)&&(!region||geography(scope)===region)&&(!needle||[r.company,r.country,r.channel,r.regionRaw,r.terms,r.sourceSheet].some(v=>String(v||'').toLowerCase().includes(needle)))});
 const pages=Math.max(1,Math.ceil(matched.length/size));page=Math.max(0,Math.min(pages-1,Math.floor(Number(page)||0)));
 return {total:rows.length,matched:matched.length,pages,page,rows:matched.slice(page*size,(page+1)*size)};
}
const api={select};if(typeof module!=='undefined')module.exports=api;else root.RegionalQuery=api;
})(typeof window==='undefined'?globalThis:window);
