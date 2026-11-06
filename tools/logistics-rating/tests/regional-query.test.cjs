const {test}=require('node:test'),assert=require('node:assert/strict'),Q=require('../extensions/regional-query.js');
test('postal air rows beyond the former 200-row cutoff remain searchable and paginated without modifying data',()=>{const rows=Array.from({length:513},(_,i)=>({company:'物流商',channel:i<453?'海运':'天翼提',sourceSheet:i<453?'海运':'空运',regionRaw:'8,9',price:i})),before=JSON.stringify(rows),mode=r=>r.sourceSheet;assert.equal(Q.select(rows,{mode:'空运'},mode).matched,60);assert.equal(Q.select(rows,{query:'天翼提',page:1},mode).rows.length,10);assert.equal(Q.select(rows,{query:'无结果',page:10},mode).page,0);assert.equal(Q.select(rows,{page:100},mode).rows.length,13);assert.equal(JSON.stringify(rows),before)});

test('provider selection reaches rows beyond the first page and keeps transport filtering',()=>{const rows=[...Array.from({length:70},()=>({companyId:'t',company:'天盛',sourceSheet:'海运'})),{companyId:'h',company:'天惠提',sourceSheet:'空运'}];assert.equal(Q.select(rows,{provider:'h'},r=>r.sourceSheet).matched,1);assert.equal(Q.select(rows,{provider:'h',mode:'海运'},r=>r.sourceSheet).matched,0)});

test('warehouse coverage requires destination evidence and keeps broad country rates in an explicit review view',()=>{
 const rows=[{country:'英国',regionRaw:'英国',channel:'BHX1专线'},{country:'英国',regionRaw:'BHX1、MAN1'},{country:'英国',regionRaw:'BHX10'},{country:'英国',regionRaw:'英国（不含BHX1）'},{country:'美国',regionRaw:'BHX1'},{country:'英国',regionRaw:'邮编B46',warehouse:'MAN1'}];
 const before=JSON.stringify(rows),filter={country:'英国',warehouse:'BHX1'};
 const selected=Q.select(rows,filter,()=> '空运');
 assert.equal(selected.matched,1);assert.equal(selected.unverified,4);
 assert.equal(selected.rows[0].regionRaw,'BHX1、MAN1');
 assert.equal(Q.select(rows,{...filter,coverage:'unverified'},()=> '空运').matched,4);
 assert.equal(Q.select(rows,{country:'英国'},()=> '空运').matched,5);
 assert.equal(JSON.stringify(rows),before);
});
