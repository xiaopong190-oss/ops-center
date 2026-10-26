const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../extensions/cargo-filter.js');
test('cargo multiselect uses OR, preserves evidence and never changes source records',()=>{
 const rows=[{id:1,terms:'普货／带电均可'},{id:2,channel:'带磁专线'},{id:3,terms:'液体、粉末'},{id:4,terms:'不接带电；禁止带磁'},{id:5,terms:''}],snapshot=JSON.stringify(rows);
 assert.deepEqual(C.classifyCargo(rows[0]).tags,['普货','带电']);assert.deepEqual(C.filterCargoRows(rows,['带电','带磁']).map(x=>x.id),[1,2]);
 assert.deepEqual(C.filterCargoRows(rows,['未注明／待确认']).map(x=>x.id),[4,5]);assert.equal(C.filterCargoRows(rows,[]),rows);assert.equal(JSON.stringify(rows),snapshot);
});
test('negative, conflicting and malicious text never creates unsupported special cargo matches',()=>{
 for(const text of ['不接带电','禁止电池','不带磁','带电；但不接带电','不支持液体','粉末禁运'])assert.deepEqual(C.classifyCargo({terms:text}).tags,['未注明／待确认']);
 assert.deepEqual(C.classifyCargo({comparisonProfile:{cargo:'带电'},terms:'普货'}).tags,['普货','带电']);
 assert.equal(C.filterCargoRows([{terms:'<script>alert(1)</script>'}],['带电']).length,0);
});
