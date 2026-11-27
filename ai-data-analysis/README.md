# AI 数据分析系统

从本机 4187 端口的 /system/ 进入演示。先启动原 sp-review 的 API（3001）及前端（4173），再运行 node ai-data-analysis/demo.mjs。广告入口通过系统同源网关加载原版总览。账户和广告演练接口从已发布的共享版本读取；复盘、审核等业务操作转交原生服务。真实源没有广告账户映射时，广告账户列表为空。全局服务只读原生复盘账户和广告演练数据，发布 /api/workspace；订单和新品继续使用原有的订单核对和利润计算逻辑。

模型以广告 profile、原生商品 ID 和店铺 SID 关联数据。广告演练的美国、英国、日本样本有订单投影；复盘总览的合成账户保留独立身份及活动。每个商品按原生归因订单数合成单件订单，在币种最小单位分摊销售额，余数逐单补齐。订单日期取归因期间末日。采购、头程、佣金与物流单号均为演示假设。该模型只覆盖广告归因订单，不估算自然单。

原生服务、店铺或商品读取失败时，全局同步保留上一次发布的数据。同步通过左下角全局菜单触发。历史演示的浏览器记录、服务费和快照保存在原命名空间。

## 真实领星接入

使用 Node.js 22+，运行 node --env-file=/path/to/order-system/.env ai-data-analysis/shared/server.mjs，在 4188 端口访问 /system/。LINGXING_TRANSPORT 选 api 或 mcp。API 使用 LINGXING_APP_ID、LINGXING_APP_SECRET 和领星已授权的出口 IP。

MCP 先运行 npm ci --prefix ai-data-analysis。配置 LINGXING_MCP_URL 和三个只读工具名 LINGXING_MCP_SHOPS_TOOL、LINGXING_MCP_ORDERS_TOOL、LINGXING_MCP_DETAILS_TOOL，认证可使用 LINGXING_MCP_TOKEN。服务端复用 Streamable HTTP 会话。工具参数分别为 {}、领星订单列表分页参数、{order_id}，返回结构化对象或 JSON 文本，含 data 数组，列表另需 total。实际服务的工具契约需与上述适配器匹配。真实领星源目前覆盖店铺和订单，演示模型的拆单及成本假设仅用于 4187。

回归命令为 node --test ai-data-analysis/demo.test.mjs ai-data-analysis/model.test.mjs ai-data-analysis/shared/regression.test.mjs。
