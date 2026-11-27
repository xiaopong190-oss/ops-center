const mode = document.currentScript.dataset.mode;
window.trackerSourceMode = mode;
const catalogUrl = '/api/snapshots';
const changes = new BroadcastChannel('system-orders-'+mode);

async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || '请求失败');
  return value;
}
function label(scope) {return '店铺 '+scope.sid+' · '+scope.asin+' · '+scope.from+' 至 '+scope.to;}
function announce() {
  changes.postMessage('updated');
  window.dispatchEvent(new Event('orders-updated'));
}
customElements.define('lingxing-orders',class extends HTMLElement {
  disconnectedCallback() { this.controller?.abort(); }
  connectedCallback() {
    this.controller?.abort();
    this.controller=new AbortController();
    const options={signal:this.controller.signal};
    const link=this.dataset.link, orderPage=this.dataset.view==='orders', demo=mode==='demo';
    const key='tracker-source:'+mode+':'+link;
    let saved={};
    if(link){try{saved=JSON.parse(localStorage.getItem(key)) || {};}catch{}}
    let chosen=saved.id || '', pending=false, serial=0;
    const example=demo && (!link || link==='demo-hook');
    const today=new Date().toISOString().slice(0,10);
    const initial=saved.query || {sid:example?'101':'',asin:example?'B0C9X1PL7A':'',from:example?'2026-10-01':today,to:example?'2026-10-31':today};
    this.innerHTML='<section class="panel shared-orders"><details><summary>领星订单、成本与配送 · '+(demo?'模拟数据':'真实接口')+'</summary><label>共用数据范围 <select class="catalog"></select></label><form class="query"><label>店铺 SID <input name="sid" required pattern="[1-9][0-9]{0,9}" size="7"></label><label>ASIN <input name="asin" required pattern="[A-Za-z0-9]{10}" maxlength="10" size="12"></label><label>从 <input name="from" type="date" required></label><label>至 <input name="to" type="date" required></label><button>同步订单</button></form><p role="status"></p><div class="records"></div></details></section>';
    const q=this.querySelector('.query'),select=this.querySelector('select'),status=this.querySelector('[role=status]'),records=this.querySelector('.records');
    this.querySelector('details').open=orderPage;
    const fill=scope=>{for(const name of ['sid','asin','from','to'])q.elements[name].value=scope[name];};
    fill(initial);
    function bind(id,query){chosen=id;if(link)localStorage.setItem(key,JSON.stringify({id,query}));}
    const show=(id,snapshot)=>{
      records.replaceChildren();
      status.textContent=label(snapshot.scope)+' · '+snapshot.orderCount+' 笔订单 · '+snapshot.source+' · '+new Date(snapshot.dataUpdatedAt || snapshot.syncedAt).toLocaleString();
      const table=document.createElement('table');
      const head=table.createTHead().insertRow();
      for(const name of ['订单号','SKU','件数','采购成本','头程费','FBA 配送费','领星毛利润','订单币种','配送方式','运单','订单服务费']){
        const th=document.createElement('th');th.textContent=name;head.append(th);
      }
      const body=table.createTBody(),seen=new Set();
      for(const row of snapshot.lines){
        const tr=body.insertRow();
        for(const value of [row.orderId,row.sku,row.quantity,row.purchase,row.firstLeg,row.fba,row.profit,row.orderCurrency,row.channel,row.tracking])tr.insertCell().textContent=value??'待提供';
        const cell=tr.insertCell(),entry=snapshot.orderFees?.[row.orderId];
        if(seen.has(row.orderId)){cell.textContent='同一订单';continue;}
        seen.add(row.orderId);
        if(!orderPage){cell.textContent=entry?entry.amount+' '+entry.currency:'未录入';continue;}
        const fee=document.createElement('form');
        fee.innerHTML='<input aria-label="订单服务费" name="amount" type="number" min="0" max="999999.99" step=".01" required><input name="currency" aria-label="服务费币种" pattern="[A-Z]{3}" maxlength="3" size="3" required><button>保存</button>';
        fee.elements.amount.value=entry?.amount??'';
        fee.elements.currency.value=entry?.currency??row.orderCurrency??'';
        fee.onsubmit=async e=>{
          e.preventDefault();e.stopPropagation();fee.querySelector('button').disabled=true;
          try{await api('/api/order-fee',{id,orderId:row.orderId,version:entry?.version??0,...Object.fromEntries(new FormData(fee))});announce();}
          catch(err){status.textContent=err.message;}
          finally{fee.querySelector('button').disabled=false;}
        };
        cell.append(fee);
      }
      records.append(table);
      const a=document.createElement('a');a.href=catalogUrl+'/'+id;a.textContent='下载共用快照 JSON';a.download='lingxing-orders.json';records.append(a);
    };
    const refresh=async ({fillQuery=false}={})=>{
      if(pending || !this.isConnected)return;
      const seq=++serial;
      try{
        const {snapshots}=await api(catalogUrl);
        if(seq!==serial)return;
        select.replaceChildren(new Option('选择已同步范围',''));
        for(const s of snapshots)select.add(new Option(label(s.scope),s.id));
        const entry=snapshots.find(s=>s.id===chosen) || (!link?snapshots[0]:example?snapshots.find(s=>label(s.scope)===label(initial)):null);
        if(!entry){records.replaceChildren();status.textContent='请选择已同步范围，或输入条件同步订单。';return;}
        select.value=entry.id;
        const value=await api(catalogUrl+'/'+entry.id);
        if(seq!==serial || !this.isConnected)return;
        if(fillQuery)fill(value.scope);
        show(entry.id,value);
      }catch(err){if(seq===serial)status.textContent=err.message;}
    }
    select.onchange=async()=>{
      if(!select.value)return;
      const id=select.value,seq=++serial;
      try{const data=await api(catalogUrl+'/'+id);if(seq!==serial)return;bind(id,data.scope);fill(data.scope);show(id,data);}
      catch(err){status.textContent=err.message;}
    };
    q.onsubmit=async e=>{
      e.preventDefault();e.stopPropagation();if(pending)return;
      pending=true;serial++;q.querySelector('button').disabled=true;status.textContent='正在同步…';
      try{
        const {id,snapshot}=await api('/api/sync',Object.fromEntries(new FormData(q)));
        bind(id,snapshot.scope);fill(snapshot.scope);show(id,snapshot);pending=false;announce();
      }catch(err){status.textContent=err.message;}
      finally{pending=false;q.querySelector('button').disabled=false;}
    };
    const update=()=>refresh({fillQuery:!link && !chosen});
    changes.addEventListener('message',update,options);
    window.addEventListener('orders-updated',update,options);
    window.addEventListener('focus',()=>{if(!this.contains(document.activeElement))update();},options);
    refresh({fillQuery:true});
  }
});
