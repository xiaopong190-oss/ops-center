// Pure projection runs off the UI thread; no storage, network API or commit hook.
importScripts('../domain.js','../comparison-core.js','../channel-score.js','../quote-core.js','../import-resolution.js','bulk-clean-adoption.js');
self.onmessage=event=>{try{self.postMessage({ok:true,result:self.BulkCleanAdoption.previewBulkCleanAdoption(event.data.db,event.data.options)})}catch(error){self.postMessage({ok:false,error:error.message})}};
