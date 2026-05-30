# Ops Center 云端部署说明

**GitHub 上传步骤见 [GITHUB.md](./GITHUB.md)** · 数据上云规划见 [DATA-API-PLAN.md](./DATA-API-PLAN.md)

一键打包：

```powershell
cd D:\Projects\ops-center
npm run pack:pages
```

## 上云时要上传的内容

```
app.html
src/*.browser.jsx
src/index.css
logo.svg
fba-profit-calculator.html
fba-warehouse-tool.html
tools/disk-cleaner/index.html
packages/disk-cleaner-win.zip
```

## 不要当作服务端逻辑上传

```
local-tools/disk-cleaner/*.ps1
local-tools/disk-cleaner/*.bat
serve-open.ps1
run.bat
```

说明：`local-tools/` 是 Windows 本机脚本，仅用于打包 zip 或本地 `run.bat` 开发。云端 Nginx/静态托管**不要**执行这些脚本。

## C 盘清理工具（本机专用）

| 场景 | 行为 |
|------|------|
| 员工访问云端门户 | 工具页显示「下载 disk-cleaner-win.zip」 |
| 员工本机双击 run.bat | 工具页显示本机按钮，可启动扫描/清理 |

打包 zip（更新脚本后执行）：

```powershell
cd D:\Projects\ops-center
powershell -ExecutionPolicy Bypass -File .\deploy\pack-disk-cleaner.ps1
```

## 推荐部署方式

### 静态托管（当前可用）

- 腾讯云 COS / 阿里云 OSS / GitHub Pages / 公司 Nginx
- 根目录指向 ops-center 项目根
- 确保 `packages/disk-cleaner-win.zip` 可下载

### 下一步：业务数据上云

任务 / 物流 / 精品模块目前数据在浏览器内存，正式公司使用需：

- API 服务（Node 或 Python）
- 数据库（PostgreSQL / MySQL）
- 登录与权限

FBA 工具与 C 盘清理 zip **继续静态托管即可**。

## 本地开发

```text
双击 run.bat → http://127.0.0.1:8765/app.html
```

本地服务器含 `/api/disk-cleaner/*` 接口，仅监听 127.0.0.1，不会随静态站上传到云端。
