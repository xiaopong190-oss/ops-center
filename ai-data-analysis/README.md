# AI 数据分析系统

从左下角切换新品跟踪、订单费用核对与盈亏追踪和广告智控台。新品跟踪复用 modules/new-product-tracker 中的大屏，可按运营、站点和链接查看六个业务标签。广告入口沿用 4173 本机预览。

使用 Node.js 22+。从仓库根目录运行 `node ai-data-analysis/demo.mjs`，打开 http://127.0.0.1:4187/system/tracker.html 。在「经营数据」展开「领星订单、成本与配送」，点击同步。示例链接预填店铺 101、ASIN B0C9X1PL7A 和 2026 年 10 月，可核对两笔模拟订单。

真实模式从同一目录运行 `node --env-file=/path/to/order-system/.env ai-data-analysis/shared/server.mjs`，打开 http://127.0.0.1:4188/system/tracker.html 。复用订单系统的 LINGXING_APP_ID 和 LINGXING_APP_SECRET。需领星订单列表、订单详情权限及出口 IP 白名单。真实模式先新增产品链接，再为该链接填写店铺、ASIN 与下单日期。

系统级 POST /api/sync 接受 sid、asin、from、to，GET /api/snapshots/{id} 提供最近成功快照。演示和真实环境分别保存到用户目录 .ai-data-analysis/demo-snapshots 和 live-snapshots。原始费用保留正负号和缺失值，不自动折算成人民币试算金额。产品资料保存在当前浏览器，线上运营中心的共享版本与人员权限由原系统管理。

回归命令为 `node --test ai-data-analysis/demo.test.mjs ai-data-analysis/shared/regression.test.mjs`。

订单核对、新品跟踪和广告工作区均可打开「领星订单、成本与配送」。共用数据范围来自服务端 GET /api/snapshots，选择已有范围不会再次调用领星。新品链接可绑定特定范围，其他页面进入时默认显示最近同步的范围。后续成功同步覆盖同店铺同 ASIN 的重叠下单日期。订单页录入服务费后，其他页面可读取同一条按店铺和订单号保存的费用记录。订单行费用与整单服务费分开展示。广告模块在工作区提供订单上下文，广告报表仍使用广告系统自身的数据源。
