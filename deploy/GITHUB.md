# 上传 GitHub 并开启 Pages

## 一、本地打包（可选预览）

打包前如缺少 FBA 大页面，可先执行（本机有源文件时）：

```powershell
cd D:\Projects\ops-center
.\copy-fba.bat
```

然后：

```powershell
npm run pack:pages
```

生成目录：`docs/`（静态站，入口 `index.html`）

本地预览：

```powershell
cd docs
python -m http.server 8888
# 浏览器打开 http://127.0.0.1:8888/
```

## 二、首次推送到 GitHub

```powershell
cd D:\Projects\ops-center
git init
git add .
git commit -m "Initial ops-center portal"
git branch -M main
git remote add origin https://github.com/你的用户名/ops-center.git
git push -u origin main
```

> 不要提交 `.env`、私钥、真实邮箱密码。MailWatch 的 `.env` 在独立项目 `mailwatch` 里，勿放进本仓库。

## 三、开启 GitHub Pages

1. 仓库 **Settings → Pages**
2. **Source** 选 **GitHub Actions**
3. 推送 `main` 后 Actions 会自动跑 `Deploy GitHub Pages`
4. 部署完成后访问：`https://你的用户名.github.io/ops-center/`

若仓库名不是 `ops-center`，URL 会带仓库名路径。

## 四、云端 vs 本机

| 功能 | GitHub Pages | 本机 run.bat |
|------|--------------|--------------|
| 任务 / 物流 / 精品 | ✅ 界面可用，数据在浏览器内存 | ✅ |
| 全局员工名单 | ✅ localStorage | ✅ |
| FBA / 在线文档 / 推广追踪 | ✅ | ✅ |
| C 盘清理 | 仅下载 zip | 可一键启动 |
| MailWatch | 仅说明页，需本机 Python | 可一键启动 |

## 五、下一步：数据上云（规划）

当前任务、物流、精品数据**刷新即丢失**。正式使用前建议：

1. **后端 API**（Node / Python FastAPI）
2. **数据库**（PostgreSQL 或 SQLite 起步）
3. **登录**（公司账号或 GitHub OAuth）
4. 前端把 `INIT_TASKS` 等改为 `fetch('/api/...')`

静态工具（FBA 计算器、disk-cleaner zip）继续放 Pages/CDN 即可。

详细接口草案见 [DATA-API-PLAN.md](./DATA-API-PLAN.md)。
