# AI 数据分析系统

运行 `node ai-data-analysis/demo.mjs`，从 http://127.0.0.1:4187/system/ 进入系统。演示用虚拟领星接口提供 2026 年 10 月的店铺与订单。订单页直接从共用数据计算明细、筛选和汇总；新品跟踪按 SID 和 SKU 在现有经营指标中计算订单数、件数和销售额。演示店铺、商品链接、采购成本与订单统一维护在 demo-catalog.mjs。新品经营周期使用共享订单及演示归因标记。广告入口嵌入原 sp-review 总览（本机 4173），由原模块提供界面、接口及业务逻辑。

真实模式使用 Node.js 22+，运行 `node --env-file=/path/to/order-system/.env ai-data-analysis/shared/server.mjs` 并访问 http://127.0.0.1:4188/system/ 。服务端复用 LINGXING_APP_ID 和 LINGXING_APP_SECRET，须授权店铺列表、订单列表和订单详情，配置领星出口 IP 白名单。系统统一读取最近 30 天的已授权店铺及订单，启动时加载磁盘快照，首次缺少快照时统一初始化。左下角全局菜单显示数据源、版本和共享数据同步按钮。切页和筛选只读取已发布数据，并发同步合并，全部店铺采集成功后才切换版本。任一上游失败会保留上次完整结果并标记错误。GET /api/workspace 为同源系统数据接口。手工服务费按 SID 和订单号保存。真实源目前提供店铺与订单，广告归因数据待上游接入。

回归命令为 `node --test ai-data-analysis/demo.test.mjs ai-data-analysis/shared/regression.test.mjs`。
