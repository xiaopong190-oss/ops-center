# Cursor 交接入口

用 Cursor 直接打开本目录：

`D:\systemDir\Desktop\Hubstudio\新建环境3\xiyou-amz-console`

打开后可在命令面板选择 **Tasks: Run Task**：

- **启动亚马逊运营调用台**：启动 `http://localhost:8787/`
- **运行完整测试**：运行边界、对抗、连接、本地报告和 31 场景报告测试

Cursor 会自动读取 `.cursor/rules/project.mdc`，其中记录了接口数量、来源区分、数据持久化和报告生成规则。连接密钥请放入本地 `.env` 或页面连接设置，不要写入 Cursor 规则或源码。

建议给 Cursor 的首条指令：

> 先阅读 HANDOFF.md 和 .cursor/rules/project.mdc，只打开与当前任务直接相关的文件，再基于现有 31 个场景继续开发。品牌格局与集中度（s5）必须保留四条判断：搜索量 360/90、转化前三、价格带偏离 30%、点击 vs 购买。保留 IndexedDB 历史结果，修改后运行 npm test，并把完成内容和验证结果写回 HANDOFF.md。不要把任何 Token 写入源码。
