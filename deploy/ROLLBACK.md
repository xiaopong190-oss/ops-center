# 整站版本与回滚

当前稳定版本：`ops-v2026.10.20.3`。页面标题旁与管理员侧栏显示同一版本号。

每次正式发布更新 `release.json` 和 `src/App.jsx` 的 `APP_BUILD`，创建对应 Git 标签。
线上 `release.json` 包含前端提交、版本标签、构建时间及配套 Cloudflare Worker 版本。
GitHub Actions 额外保留每次发布的静态站点文件 90 天；Git 标签持续保留源代码。

## 回滚前端

在 GitHub → Actions → Deploy GitHub Pages → Run workflow 中，选择 main，
在 ref 输入要恢复的标签（例如 `ops-v2026.10.20.2`）。流水线会检出该版本、测试并发布。
发布成功后检查页面版本及 `/ops-center/release.json`。

## 回滚配套云端服务

本版本使用 Worker `6953c67d-d3e2-4853-aec1-82dab51efd1b`。
可在 Cloudflare → Workers → ops-center-cloud → Deployments 中选择这个版本并执行回滚。
配套源代码另存为 Git 标签 `ops-v2026.10.20.3-worker`（提交 `89e76c8`），可独立检出核对和重新部署。
今后每次部署 Worker 后，将对应版本 ID 写入下一版 `release.json`。

回滚前端不自动回滚 Worker。整站恢复时核对发布清单中的配套版本。
应用代码回滚保留当前 D1 数据、员工账号和模块开关，不恢复旧数据库快照。
