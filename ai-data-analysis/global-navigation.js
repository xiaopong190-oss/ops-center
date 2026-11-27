const globalPanel = document.getElementById('global-panel');
globalPanel.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const destination = document.getElementById(link.hash.slice(1));
  if (!destination) return;
  event.preventDefault();
  globalPanel.hidePopover();
  destination.focus({ preventScroll: true });
  destination.scrollIntoView({ block: 'start' });
});

const source = window.systemData;
if (source) {
  const heading = document.createElement('h2');
  heading.textContent = '全局数据源 · ' + (source.dataset ? '共享演示模型' : source.mode === 'demo' ? '模拟领星' : '领星 '+(source.transport||'API'));
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '同步共享数据';
  let version = source.syncedAt ? '数据版本 ' + new Date(source.syncedAt).toLocaleString('zh-CN') : '尚无已同步数据';
  status.textContent = [version, source.syncError].filter(Boolean).join(' · ');
  globalPanel.append(heading, status, button);
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('workspace-sync') : null;
  async function update(result) {
    if (result.error) {
      status.textContent = '同步失败 · ' + result.error + ' · ' + version;
    } else if (result.syncedAt && result.syncedAt !== source.syncedAt) {
      const app=document.querySelector('iframe');
      if(app){
        const response=await fetch('/api/workspace');
        if(!response.ok)throw Error('共享版本读取失败');
        const latest=await response.json();
        Object.assign(source,latest);
        version='数据版本 '+new Date(latest.syncedAt).toLocaleString('zh-CN');
        status.textContent=version;
        app.contentWindow.location.reload();
      }else location.reload();
    }
  }
  if (channel) channel.onmessage = event => update(event.data).catch(error=>{status.textContent=error.message;});
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = '正在同步所有店铺…';
    try {
      const response = await fetch('/api/workspace/sync', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const result = await response.json();
      if (!response.ok && !result.error) throw Error('共享服务暂时不可用');
      channel?.postMessage(result);
      await update(result);
    } catch (error) {
      update({error:error.message});
    } finally {
      button.disabled = false;
    }
  };
}
