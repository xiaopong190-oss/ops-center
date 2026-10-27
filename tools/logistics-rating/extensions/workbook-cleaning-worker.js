// Executes the unchanged, pure workbook projection without blocking the UI.
importScripts('../domain.js','../comparison-core.js','../channel-score.js','../quote-core.js','../matrix-import.js?v=scan-cache-1');
self.onmessage=event=>{try{self.postMessage({ok:true,result:self.MatrixImport.workbook(event.data.model,event.data.meta)})}catch(error){self.postMessage({ok:false,error:error.message||'清洗计算失败'})}};
