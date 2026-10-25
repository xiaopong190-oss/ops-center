(function(root){
 'use strict';
 // Presentation toggle only. Never creates the legacy positive-inclusion state.
 function nextTransportExclusion(current){return current==='exclude'?'neutral':'exclude';}
 const api={nextTransportExclusion};if(typeof module!=='undefined')module.exports=api;else root.TransportExclusion=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
