window.trackerSourceMode = document.currentScript.dataset.mode;
customElements.define('lingxing-orders', class extends HTMLElement {
  connectedCallback() {
    const key = 'tracker-source:'+window.trackerSourceMode+':'+this.dataset.link;
    const demo = window.trackerSourceMode==='demo';
    const example = demo && this.dataset.link==='demo-hook';
    let saved = {};
    try { saved=JSON.parse(localStorage.getItem(key)) || {}; } catch {}
    this.style.display='block';
    this.innerHTML = '<section class="panel"><details><summary>领星订单、成本与配送 · '+(demo?'模拟数据':'真实接口')+'</summary><form style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0"><label>店铺 SID <input name="sid" required pattern="[1-9][0-9]{0,9}" size="7"></label><label>ASIN <input name="asin" required pattern="[A-Za-z0-9]{10}" maxlength="10" size="12"></label><label>从 <input name="from" type="date" required></label><label>至 <input name="to" type="date" required></label><button type="submit">同步订单</button></form><div role="status"></div><div data-lines></div></details></section>';
    const form=this.querySelector('form'), status=this.querySelector('[role=status]'), lines=this.querySelector('[data-lines]');
    const day=new Date().toISOString().slice(0,10);
    const query=saved.query || {sid:example?'101':'', asin:example?'B0C9X1PL7A':'',from:example?'2026-10-01':day,to:example?'2026-10-31':day};
    for(const field of ['sid','asin','from','to']) form.elements[field].value=query[field] || '';
    const show=(snapshot,id)=>{
      lines.replaceChildren();
      status.textContent=snapshot.scope.asin+' · '+snapshot.orderCount+' 笔订单 · '+snapshot.syncedAt;
      for(const row of snapshot.lines){
        const p=document.createElement('p');
        p.textContent=[row.orderId,row.sku,'件数 '+row.quantity,'采购成本 '+(row.purchase??'待提供'),'头程 '+(row.firstLeg??'待提供'),'FBA 配送费 '+(row.fba??'待提供'),row.channel,row.tracking||'暂无运单'].join(' · ');
        lines.append(p);
      }
      const a=document.createElement('a');a.href='/api/snapshots/'+id;a.textContent='下载共用快照 JSON';a.download='lingxing-snapshot.json';lines.append(a);
    };
    let revision=0;
    const request=async(url,options)=>{const r=await fetch(url,options);const value=await r.json();if(!r.ok)throw Error(value.error);return value;};
    form.onsubmit=async e=>{
      e.preventDefault();e.stopPropagation();revision++;
      const query=Object.fromEntries(new FormData(form));const button=form.querySelector('button');
      button.disabled=true;lines.replaceChildren();status.textContent='正在同步…';
      try {
        const {id,snapshot}=await request('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query)});
        localStorage.setItem(key,JSON.stringify({query,id}));show(snapshot,id);
      } catch(err){status.textContent=err.message;} finally{button.disabled=false;}
    };
    if(/^[a-f0-9]{64}$/.test(saved.id)){
      request('/api/snapshots/'+saved.id).then(snapshot=>{if(!revision)show(snapshot,saved.id);}).catch(err=>{if(!revision)status.textContent=err.message;});
    }
  }
});
