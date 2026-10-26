const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require(path.resolve(__dirname,'../../../../modules/new-product-followup/work/qa/node_modules/jsdom'));
const base=path.resolve(__dirname,'../..'),dom=new JSDOM(fs.readFileSync(path.join(base,'quotes.html'),'utf8'),{url:'https://isolated.test',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
try{
 for(const file of ['supplier-confirmation','intake-feedback'])w.eval(fs.readFileSync(path.join(base,'extensions',file+'.js'),'utf8'));
 let file={},candidate={id:'existing',name:'已有物流'},runs=0;
 const supplier=$('draftCompany'),manual=w.document.createElement('details'),input=w.document.createElement('input');
 supplier.innerHTML='<option value="existing">已有物流</option>';manual.append(input);
 w.IntakeFeedback.mountSupplierEntry({supplier,button:$('batchClean'),manualPanel:manual,manualInput:input,getFile:()=>file,getCandidate:()=>candidate});
 for(const id of ['batchClean','matrixBuild','toStandard','continueImport']){
  const button=$(id);button.disabled=false;button.onclick=()=>runs++;button.click();assert.equal(runs,0,id+' blocks unconfirmed supplier');
 }
 const confirm=$('supplierConfirmation').querySelector('button');confirm.click();$('batchClean').click();assert.equal(runs,1);
 file={};$('batchClean').click();assert.equal(runs,1,'new upload requires confirmation');
 confirm.click();candidate={id:'existing',name:'改名物流'};$('batchClean').click();assert.equal(runs,1,'renamed candidate requires confirmation');
 confirm.click();$('batchClean').click();assert.equal(runs,2);
 supplier.dispatchEvent(new w.Event('change'));$('batchClean').click();assert.equal(runs,2,'selection change invalidates confirmation');
 candidate={name:'新公司'};confirm.click();$('batchClean').click();assert.equal(runs,3,'explicitly confirmed new company allowed');
 candidate=null;$('batchClean').click();assert.equal(runs,3,'empty selection blocked');
 assert.equal(confirm.disabled,true);
 console.log('PASS supplier confirmation: detected and manual candidates, all clean/forward controls, file/name/selection changes');
}finally{w.close();}
