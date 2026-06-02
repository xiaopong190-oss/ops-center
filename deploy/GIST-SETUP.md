# GitHub Gist 云端共享

## 1. 生成 Token（免费，只勾 gist）

https://github.com/settings/tokens → Generate new token (classic)

## 2. 本机配置（勿提交 Token）

```bash
copy src\cloud-sync-config.secret.example.js src\cloud-sync-config.secret.js
```

编辑 `src/cloud-sync-config.secret.js`，填入 `GITHUB_GIST_TOKEN`。

`src/cloud-sync-config.js` 和 `gist-config.js` 只有 **Gist ID**，可提交 Git。

## 3. 本地运行

```bash
rebuild-bundle.bat
```

会生成 `gist-config.local.js`（已 gitignore），本机刷新即可用。

## 4. 推到 GitHub（线上）

GitHub 会拦截含 `ghp_` 的提交，**不要把 Token 写进任何会 commit 的文件**。

### 4a. 在 GitHub 仓库加 Secrets

Settings → Secrets and variables → Actions → New repository secret：

| Name | Value |
|------|--------|
| `OPS_GIST_TOKEN` | 你的 gist token |
| `OPS_GIST_ID` | `d4c6e4e873edfef595350da3ecc5c4da` |

### 4b. 若上次 push 被拒

```bash
git reset --soft HEAD~1
git restore --staged app.bundle.js
rebuild-bundle.bat
git add .
git commit -m "feat: GitHub Gist 云端同步（Token 不进仓库）"
git push
```

**不要** `git add -f app.bundle.js` 若里面还有 token；当前 bundle 不应含 token。

CI 构建时会把 Token 写入 `docs/gist-config.js`（仅部署产物，不进 Git）。

## 5. 共享模块

物流头程、任务跟进、精品生产、工具在线文档 → Gist；首页今日最优先 → 本机 localStorage。
