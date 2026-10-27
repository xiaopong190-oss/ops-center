importScripts('../domain.js','../comparison-core.js','../channel-score.js','../quote-core.js','../import-resolution.js','../matrix-import.js?v=evidence-3','import-evidence.js?v=evidence-3');
self.onmessage=e=>{try{self.postMessage({ok:true,result:self.ImportEvidence.preview(e.data.db,e.data.options)})}catch(error){self.postMessage({ok:false,error:error.message})}};
