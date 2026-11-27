# AI 数据分析系统

运行 `node ai-data-analysis/demo.mjs`，从 http://127.0.0.1:4187/system/ 进入系统。演示用虚拟领星接口提供 2026 年 10 月的店铺与订单。订单页直接从共用数据计算明细、筛选和汇总；新品跟踪按 SID 和 SKU 在现有经营指标中计算订单数、件数和销售额。广告归因指标由广告系统独立核算。

真实模式使用 Node.js 22+，运行 `node --env-file=/path/to/order-system/.env ai-data-analysis/shared/server.mjs` 并访问 http://127.0.0.1:4188/system/ 。服务端复用 LINGXING_APP_ID 和 LINGXING_APP_SECRET，须授权店铺列表、订单列表和订单详情，配置领星出口 IP 白名单。系统统一读取最近 30 天的已授权店铺及订单，缓存五分钟，访问时更新。任一上游失败会保留上次完整结果并标记错误。GET /api/workspace 为同源系统数据接口。手工服务费按 SID 和订单号保存。新品链接、广告归因和手工试算保持各自业务含义。

回归命令为 `node --test ai-data-analysis/demo.test.mjs ai-data-analysis/shared/regression.test.mjs`。
