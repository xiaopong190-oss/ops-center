const {test}=require('node:test'),assert=require('node:assert/strict');
const {supplierConfirmationMatches:matches}=require('../extensions/supplier-confirmation.js');
test('supplier confirmation is scoped to file, stable ID and exact archive name',()=>{
 const file={},candidate={id:'company-1',name:'测试物流'},proof={file,...candidate};
 assert.equal(matches(null,file,candidate),false);
 assert.equal(matches(proof,file,candidate),true);
 assert.equal(matches(proof,{},candidate),false);
 assert.equal(matches(proof,file,{...candidate,id:'company-2'}),false);
 assert.equal(matches(proof,file,{...candidate,name:'测试物流新名称'}),false);
 assert.equal(matches(proof,file,null),false);
 assert.equal(matches(proof,null,candidate),false);
});
