(async function(){
 const list=JSON.parse(document.getElementById('appScripts').textContent),load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('加载失败：'+src));document.body.append(s);});
 try{for(const src of list){await load(src);if(src.split('?')[0]==='github-data.js')await window.GithubData.ready;}}catch(e){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=e.message+'，请刷新后重试。';document.body.prepend(error);}
})();
