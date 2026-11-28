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

const fullscreenButton = document.createElement('button');
fullscreenButton.type = 'button';
const fullscreenLabel = document.createElement('span');
const escapeHint = document.createElement('kbd');
escapeHint.textContent = 'Esc 退出';
fullscreenButton.className = 'fullscreen-toggle';
fullscreenButton.append(fullscreenLabel, escapeHint);
globalPanel.prepend(fullscreenButton);

function updateFullscreenButton() {
  fullscreenButton.disabled = !document.fullscreenEnabled;
  fullscreenLabel.textContent = fullscreenButton.disabled ? '浏览器未开放全屏' :
    document.fullscreenElement ? '退出全屏' : '进入全屏';
  escapeHint.hidden = fullscreenButton.disabled;
}
updateFullscreenButton();
document.addEventListener('fullscreenchange', updateFullscreenButton);
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    globalPanel.hidePopover();
  } catch {
    fullscreenLabel.textContent = '全屏切换失败，点击重试';
  }
});
// Browsers also handle Escape natively when focus is inside a module iframe.
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.fullscreenElement) {
    document.exitFullscreen().catch(updateFullscreenButton);
  }
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
  const settingsLink=document.createElement('a');
  settingsLink.href='./connections.html';
  settingsLink.textContent='API 与模型接入';
  globalPanel.append(heading, status, settingsLink, button);
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
