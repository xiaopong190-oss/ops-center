(function(root){'use strict';
function select(rows,{query='',mode='',provider='',page=0,size=50}={},transport){
 const needle=String(query).trim().toLowerCase();size=Math.max(1,Math.min(200,Number(size)||50));
 const matched=rows.filter(r=>(!mode||transport(r)===mode)&&(!provider||(r.companyId||r.company)===provider)&&(!needle||[r.company,r.country,r.channel,r.regionRaw,r.terms,r.sourceSheet].some(v=>String(v||'').toLowerCase().includes(needle))));
 const pages=Math.max(1,Math.ceil(matched.length/size));page=Math.max(0,Math.min(pages-1,Math.floor(Number(page)||0)));
 return {total:rows.length,matched:matched.length,pages,page,rows:matched.slice(page*size,(page+1)*size)};
}
const api={select};if(typeof module!=='undefined')module.exports=api;else root.RegionalQuery=api;
})(typeof window==='undefined'?globalThis:window);
