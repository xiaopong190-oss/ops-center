# AI 数据分析系统

使用 Node.js 22+，在仓库根目录运行 `node ai-data-analysis/demo.mjs`，打开 http://127.0.0.1:4187/system/ ，从左下角全局菜单切换模块。广告模块沿用原广告智控台本机预览服务（4173 端口）。

增长模块默认载入示例店铺 A（SID 101）在 2026 年 10 月的 B0C9X1PL7A，显示两笔与订单页对应的模拟订单、采购成本、头程费和模拟运单。可切换为 SID 102 和 B0D7K2M9QX 查看无运单的订单。

虚拟客户端使用与真实接口相同的归集、持久化及共享读取流程。4187 服务只使用模拟数据，JSON 包含 mode=demo，保存到用户目录的 .amazon-growth/demo-snapshots。真实领星服务仍使用 4186。虚拟模式无需 API 密钥。

回归命令：`node --test ai-data-analysis/demo.test.mjs amazon-growth/asin-data/regression.test.mjs`。
