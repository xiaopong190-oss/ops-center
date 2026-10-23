# DeepSeek 智能识别配置

后端：Cloudflare Worker `ops-center-cloud`。在控制台 Workers & Pages → ops-center-cloud → Settings → Variables and Secrets 添加 Secret `DEEPSEEK_API_KEY`，由管理员自行粘贴密钥并部署；不要在聊天或GitHub填写。可选普通变量 `DEEPSEEK_MODEL` 为 `deepseek-flash`（默认）或 `deepseek-v4-pro`。

后端代码部署：仓库 cloud 目录运行 `npx wrangler deploy`。前端Pages部署不等于Worker部署。使用运营中心原有登录，在同源工具箱进入本工具，选择Excel后先“检查连接”。本地8767不会共享线上登录。

每用户每日最多20次；仅用户明确勾选后发送文件名、表名和最多400格/每格80字符。服务器另外限制20张表、每表144格、请求45000字符。模型仅返回公司与表类型/字段说明建议及引用坐标，不写业务库。采用建议后仍须清洗、校验和确认入库。建议可能错误，不应省略人工核对。

Secret未配置前只展示配置状态，不会调用模型。未使用真实密钥完成调用前，不得将模拟测试标记为真实联调成功。演示功能保持。
