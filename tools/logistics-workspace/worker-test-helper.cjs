const {Worker}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path');
class BrowserWorker{
 constructor(url){const filename=new URL(url).pathname.split('/').at(-1),file=path.join(__dirname,'../logistics-rating/extensions',filename);this.worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');global.self=global;global.importScripts=(...files)=>{for(const f of files)vm.runInThisContext(fs.readFileSync(path.resolve(path.dirname(workerData),f),'utf8'),{filename:f})};global.postMessage=value=>parentPort.postMessage(value);vm.runInThisContext(fs.readFileSync(workerData,'utf8'));parentPort.on('message',data=>global.onmessage({data}));`,{eval:true,workerData:file});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}))}
 postMessage(value){this.worker.postMessage(value)}
 terminate(){this.worker.terminate()}
}
module.exports=BrowserWorker;
