# 按 ASIN 同步领星订单

Node.js 22+。在服务端复用订单系统的 LINGXING_APP_ID、LINGXING_APP_SECRET 环境变量，或指定已有的服务端环境文件。从本目录运行：

```sh
node --env-file-if-exists=/path/to/order-system/.env server.mjs
```

服务仅监听 127.0.0.1:4186。在增长模块填写 ASIN、店铺 SID 和下单日期，日期含首尾，最多 31 天。程序自动分页获取该店铺订单、按 ASIN 匹配商品并批量查询详情。成本、头程和 FBA 发货费为商品行的领星原值，未推算采购单价或跨币种汇总。无订单时返回空结果。物流包含配送方式、发货时间和领星提供的运单号。

同机其他模块或自动化可 POST JSON 到 /api/sync，例如：
```json
{"asin":"B0ABC49975","sid":"101","from":"2026-10-01","to":"2026-10-07"}
```
成功返回 id 和 snapshot。GET /api/snapshots/{id} 读取同一范围最近一次成功的结果。重复查询完整替换，失败保留上次成功快照。浏览器可下载 JSON 交给其他同事，或使用本机共享链接。同一机器上的系统账户应受信任。服务没有对公网提供认证，不要向网络暴露本机端口。GROWTH_DATA_DIR 可指定私有共享目录，默认保存在用户目录 .amazon-growth/asin-snapshots 下。

回归命令为 `node --test regression.test.mjs`。真实账号需要开通订单列表、订单详情权限和领星出口 IP 白名单。

[领星订单列表文档](https://apidoc.lingxing.com/new/api-docs/Sale/Orderlists/) · [领星订单详情文档](https://apidoc.lingxing.com/new/api-docs/Sale/OrderDetail/)
