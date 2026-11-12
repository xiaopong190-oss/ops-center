(function(root){'use strict';
async function review(model,result,meta,onProgress=()=>{},options={}){
 const binding=await root.SemanticQuoteReview.sourceBinding(model,meta),previous=result.aiReview?.binding===binding?result.aiReview:null;
 let recovered=await root.CleaningReview.review(model,result,meta,p=>onProgress({...p,phase:'recovery'}),{maxItems:10000,budgetMs:60000,maxRequests:4,...options,previous});
 recovered={...recovered,aiReview:{...recovered.aiReview,binding}};if(options.project)recovered=options.project(recovered);
 // Validated recovered quotes become available before the independent field review finishes.
 onProgress({...recovered.aiReview,phase:'recovery',result:recovered});
 const audited=await root.SemanticQuoteReview.review(model,recovered,meta,p=>onProgress({...recovered.aiReview,phase:'semantic',fieldReview:p}),{budgetMs:60000,maxRequests:4,...options});
 return audited;
}
root.ExpandedQuoteReview={review};if(typeof module!=='undefined')module.exports=root.ExpandedQuoteReview;
})(typeof window==='undefined'?globalThis:window);
