(function(root){'use strict';
 // Only the visibility of already-unclassified rows changes. No classification,
 // quotation, scoring or storage rule is inferred from this presentation group.
 function unknownStatus(states={}){return states['其它']==='exclude'?'outside':'unknown'}
 const api={unknownStatus};if(typeof module!=='undefined')module.exports=api;else root.TransportOther=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
