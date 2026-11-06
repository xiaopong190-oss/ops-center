(function(root){'use strict';
function coversWarehouse(row,warehouse){
 const code=String(warehouse||'').trim().toUpperCase();
 if(!code)return true;
 if(String(row.warehouse||'').trim().toUpperCase()===code)return true;
 // Only destination evidence can establish coverage. Notes and channel names
 // may mention an unrelated warehouse or an exception.
 const scope=String(row.regionRaw||'').normalize('NFKC').toUpperCase();
 if(/不含|不送|除外|不接|不支持|仅限|除.*外|EXCEPT|EXCLUD|NOT\s/i.test(scope))return false;
 return scope.split(/[^A-Z0-9]+/).includes(code);
}
function select(rows,{query='',mode='',provider='',providerName='',country='',channel='',region='',warehouse='',coverage='confirmed',page=0,size=50}={},transport,geography=()=>null,project=r=>r){
 const needle=String(query).trim().toLowerCase();size=Math.max(1,Math.min(200,Number(size)||50));
 const eligible=rows.filter(r=>{const scope=project(r);return (!mode||transport(r)===mode)&&(!provider||(r.companyId||r.company)===provider||(!r.companyId&&providerName&&r.company===providerName))&&(!country||scope.country===country)&&(!channel||scope.channel===channel)&&(!region||geography(scope)===region)&&(!needle||[r.company,r.country,r.channel,r.regionRaw,r.terms,r.sourceSheet].some(v=>String(v||'').toLowerCase().includes(needle)))});
 const confirmed=warehouse?eligible.filter(row=>coversWarehouse(row,warehouse)):eligible;
 const unverified=warehouse?eligible.filter(row=>!coversWarehouse(row,warehouse)):[];
 const matched=warehouse&&coverage==='unverified'?unverified:confirmed;
 const pages=Math.max(1,Math.ceil(matched.length/size));page=Math.max(0,Math.min(pages-1,Math.floor(Number(page)||0)));
 return {total:rows.length,matched:matched.length,confirmed:confirmed.length,unverified:unverified.length,pages,page,rows:matched.slice(page*size,(page+1)*size)};
}
const api={select,coversWarehouse};if(typeof module!=='undefined')module.exports=api;else root.RegionalQuery=api;
})(typeof window==='undefined'?globalThis:window);
