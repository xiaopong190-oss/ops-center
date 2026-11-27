const el=id=>document.getElementById(id);
async function request(path,body){
  const res=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const result=await res.json();
  if(!res.ok)throw Error(result.error||'请求失败');
  return result;
}
async function load(){
  const {providers,selected,demo}=await request('/api/connections');
  el('mode').textContent=(demo?'当前业务数据使用演示模式。':'')+'真实数据同步通道为领星 '+selected.toUpperCase()+'。凭据在服务端配置。';
  for(const p of providers){
    const section=document.createElement('section'),title=document.createElement('h2'),info=document.createElement('p'),btn=document.createElement('button'),result=document.createElement('output');
    title.textContent=p.label;
    info.textContent=p.configured?'已配置'+(p.model?' · '+p.model:''):'待配置 · '+p.missing.join('、');
    btn.textContent=p.id==='llm'?'验证模型访问':'验证店铺读取';
    btn.disabled=!p.configured;
    btn.onclick=async()=>{btn.disabled=true;result.textContent='验证中…';try{await request('/api/connections/check',{id:p.id});result.textContent='验证通过';}catch(e){result.textContent=e.message;}finally{btn.disabled=false;}};
    section.append(title,info,btn,result);el('providers').append(section);
    if(p.id==='llm')el('model').querySelector('button').disabled=!p.configured;
  }
}
el('model').onsubmit=async event=>{
  event.preventDefault();
  const button=el('model').querySelector('button');button.disabled=true;el('answer').textContent='等待模型响应…';
  try{el('answer').textContent=(await request('/api/llm/responses',{input:el('input').value})).text;}
  catch(e){el('answer').textContent=e.message;}finally{button.disabled=false;}
};
load().catch(e=>{el('mode').textContent=e.message;});
