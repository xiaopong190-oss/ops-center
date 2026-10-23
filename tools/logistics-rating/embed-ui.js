(() => {
 if(window.parent===window)return;
 document.documentElement.classList.add('embedded');
 let previous=0;
 function update(){let main=document.querySelector('main');if(!main)return;let height=Math.ceil(main.getBoundingClientRect().height+main.getBoundingClientRect().top+24);height=Math.max(300,height);if(height!==previous){previous=height;window.parent.postMessage({type:'module-height',height},location.origin);}}
 new ResizeObserver(update).observe(document.querySelector('main')||document.body);window.addEventListener('load',update);update();
})();
