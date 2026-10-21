# 亚马逊增长中心 UI 优化交接

本包用于界面与交互优化，包含当前工作区中的前端源码，不包含 API Key、MCP 私有连接、Cloudflare Worker、代理服务端或测试缓存。

## 页面入口

- `index.html`：运营调用台
- `asinscope/index.html`：完整竞品分析
- `watchlist/index.html`：监控清单
- `launch-plan/index.html`：推品计划入口
- `launch-plan/app.html`：推品计划应用
- `keywords/index.html`：关键词库入口
- `keywords/app/index.html`：关键词库应用
- `settings/index.html`：数据与连接（全局层管理页）
- `shared/growth-core.js`：全局数据层，所有页面需在各自脚本之前加载

## 本地预览

不要直接双击 HTML。请在本目录启动静态 HTTP 服务，例如：

```powershell
npx serve .
```

然后打开命令行显示的本地地址。脱离正式运营中心后，登录、MCP、云保存和 AI 调用可能不可用，但不影响 UI 布局与样式调整。

## 主要样式文件

- `assets/style.css`
- `asinscope/assets/style.css`
- `watchlist/assets/style.css`
- `keywords/app/styles.css`

请保留现有 DOM id、表单 name、脚本路径和业务事件绑定；可以调整结构时，需同步更新对应 `assets/app.js`。
