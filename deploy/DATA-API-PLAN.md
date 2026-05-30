# 业务数据上云 — 接口草案

> 静态页已可上 GitHub Pages；本文档供第二阶段接 API 时参考。

## 存储范围

| 模块 | 建议集合/表 | 说明 |
|------|-------------|------|
| 全局员工 | `staff` | name, role |
| 任务跟进 | `tasks` | 与 App.jsx 中 task 结构一致 |
| 物流头程 | `logistics_groups` | 含 fbaShipments、exceptions |
| 精品生产 | `production_batches` | 含 exceptions、QC 字段 |

## 建议 API（REST）

```
GET/POST   /api/staff
GET/PATCH  /api/tasks
GET/PATCH  /api/tasks/:id
GET/PATCH  /api/logistics
GET/PATCH  /api/production
```

## 前端改造点

- `GlobalConfig.jsx`：`localStorage` → API + 离线缓存
- `App.jsx` / `LogisticsModule.jsx` / `ProductionModule.jsx`：`useState(INIT_*)` → `useEffect` 拉取
- 部署：Pages 托管静态，`api.xxx.com` 或同域 `/api` 反代到后端

## 最小可行方案

- **Supabase** 或 **Firebase**：免运维，表 + REST 自动生成
- **Vercel + Serverless + Postgres**：与 GitHub 联动方便
- **自建**：`ops-center-api` 子目录 + Docker + PostgreSQL

完成 API 后可在 GitHub Actions 增加「构建 Vite + 部署 API」流水线。
