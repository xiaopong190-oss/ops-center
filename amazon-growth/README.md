# 西柚数据调用台 · Xiyou MCP Amazon Ops Console

把西柚 MCP 的 **44 个接口**与卖家精灵中西柚明确缺少的 **19 个接口**分开标注，编排成 **31 条亚马逊运营作业流**。其中新增 6 条专业作业场景，并可调用 5 个卖家精灵交叉验证接口。填参数 → 点场景 → 按工具链依次调接口取数 → 由本地规则先生成结论，再按需交给 Codex 深度分析。

监控清单已独立到 `/watchlist/`：可把一组 ASIN、核心词和日期保存到本页，按名单调用西柚与卖家精灵的监控相关接口。导入文件限制为 1 MB、最多 200 份清单，并过滤未知字段和异常名称。调用台左栏不再存取清单。

最近一次工作流结果会保存在浏览器 IndexedDB。每个步骤完成后增量保存，刷新页面会自动恢复场景、参数、成功结果和错误信息；刷新时仍在执行的步骤会标为中断，重新运行即可。

纯静态前端 + 一个可选的轻量代理，零依赖、零构建，直接丢 GitHub Pages 就能跑。

---

## 目录结构

```
.
├── index.html              # 页面
├── assets/
│   ├── data.js             # 44 个西柚接口、19 个卖家精灵补充接口与 31 个场景
│   ├── mcp.js              # MCP Streamable HTTP 客户端 + 参数自动映射
│   ├── claude.js           # Claude API 分析层 + 极简 Markdown 渲染
│   ├── app.js              # 界面与运行调度
│   └── style.css
├── proxy/server.js         # 本地/自托管代理（Node 18+，零依赖，顺带托管静态页）
├── api/mcp.js              # Vercel 版 MCP 代理
├── api/claude.js           # Vercel 版 Claude 代理
└── .github/workflows/pages.yml   # GitHub Pages 自动部署
```

---

## 三种跑法

### A. 本地跑（最省事，推荐先这样验证）

```bash
git clone https://github.com/<你的用户名>/xiyou-amz-console.git
cd xiyou-amz-console

export MCP_ENDPOINT="https://西柚给你的/mcp"
export MCP_API_KEY="你的西柚密钥"
export ANTHROPIC_API_KEY="sk-ant-..."      # 只用来做分析，不填就只取数不分析

npm start        # 等同 node proxy/server.js
```

打开 http://localhost:8787 ，页面和代理是同一个进程，不会有跨域问题。

### B. GitHub Pages（静态页）+ 独立代理

1. 推到 GitHub，仓库 **Settings → Pages → Source 选 GitHub Actions**，`.github/workflows/pages.yml` 会自动发布。
2. 代理单独部署（Vercel / Railway / 自己的服务器都行），配置这些环境变量：

   | 变量 | 说明 |
   |---|---|
   | `MCP_ENDPOINT` | 西柚 MCP 的 URL |
   | `MCP_API_KEY` | 西柚密钥 |
   | `MCP_AUTH_HEADER` | 鉴权头名，默认 `Authorization` |
   | `MCP_AUTH_PREFIX` | 值前缀，默认 `Bearer `；若对方要 `X-Api-Key: xxx`，把 header 改成 `X-Api-Key`、这里设为空串 |
   | `ANTHROPIC_API_KEY` | 分析用 |
   | `ALLOW_ORIGIN` | 允许的页面来源，例如 `https://你的用户名.github.io`，不支持 `*` |
   | `PROXY_TOKEN` | 部署版必填的长随机访问令牌；页面设置中填写相同值 |

3. 打开 Pages 上的页面 → **⚙ 设置** → 模式选「经代理」→ 代理地址填你的代理域名、访问令牌填 `PROXY_TOKEN` → 测试连接。MCP 端点在服务端配置，页面留空。

Vercel 直接导入这个仓库即可：静态文件走根目录，`api/*.js` 自动变成 Serverless Function。

### C. 浏览器直连（不推荐）

设置里模式选「浏览器直连」，填 MCP 端点和密钥。前提是**西柚服务器允许跨域**，而且密钥会出现在浏览器请求里。只适合本机自用。

---

## 参数怎么传给接口

各家 MCP 的参数命名不统一（`asin` / `product_asin`、`marketplace` / `country_code`、`start_date` / `from_date`……），所以这里不写死：

1. 连接时调 `tools/list`，拿到每个工具的 `inputSchema`。
2. `assets/mcp.js` 里的 `ALIAS` 表把页面上的规范化参数（site / asin / asins / keyword / category / brand / 日期区间 / 月份区间）**按 schema 里的真实字段名匹配**，并做类型适配（string ↔ array、数字转换）。
3. schema 里没有的参数就不传；`required` 里还缺的，按字段名语义兜底猜一次。
4. 类目类接口跑完 `search_market_insight_categories` / `generate_category_insight_resource` 后，返回里的 `category_id`、`resource_id` 会被 `harvestContext()` 捞出来，自动注入后续步骤。

**如果某个接口报参数错误**：连接成功后打开「接口速查」标签，点「单独运行」，展开「原始 JSON」看服务端的报错信息，再回到 `assets/mcp.js` 的 `ALIAS` 表里补上真实字段名——通常改一行就好。

---

## 31 条作业流

**M1 选品与类目机会** — 类目快速体检 / 新品机会扫描 / 价格带卡位 / 季节性与备货节奏 / 品牌格局与集中度 / 类目搜索需求盘点 / 类目黑马产品雷达 / 功能特征与上升需求

**M2 竞品拆解与监控** — 竞品全景档案 / 流量结构拆解 / 爆单溯源 / 变体矩阵拆解 / 竞品改版监控 / 销量与排名走势 / 每日监控快照（12 步）

**M3 关键词研究与广告投放** — 关键词价值评估 / 广告位竞争侦察 / 广告词库搭建 / 关键词卡位追踪 / 关键词赛道格局 / 竞品词位反打

**M4 Listing 优化与效果复盘** — 上词掉词诊断 / 竞品词对比找差距 / 父体词覆盖体检 / 单词效果复盘

**M5 卖家精灵补强** — 竞品发现与历史全景 / 长尾需求与出单词机会 / 关联流量关系图谱 / 市场进入壁垒全检 / VOC 痛点与功能机会 / 销量预测三角校验

每条作业流都定义了：需要哪些参数、按什么顺序调哪几个接口、每一步查什么、最后要交付什么。改 `assets/data.js` 里的 `MODULES` 就能增删场景，不用动其他文件。

---

## 分析层怎么工作

点「复制给 Codex 分析」后：

- 把本次工作流每一步的**实参 + 返回数据**打包（长数组截断到前 60 行并注明原始条数，整体上限 12 万字符）
- 连同场景目标和交付要求复制到剪贴板，回到 Codex 粘贴发送
- 提示词里写死了几条约束：只用给到的数据下结论、每条结论标注来源接口、缺失就直说、流量得分和订单量按估算值措辞

模型默认 `claude-sonnet-4-6`，在设置里可改。

---

## 已知限制

- 广告放映机 `get_keyword_advertising_replay` 只支持 US / UK / DE。
- 多 ASIN 对比上限 20 个。
- 小时级排名按单日返回，页面取的是「结束日期」那天。
- 流量得分是相对值不是曝光量，订单量为模型推算——跨接口对不上时以趋势方向为准。
- 密钥存在浏览器 localStorage（直连模式）或服务端环境变量（代理模式）；公开部署请务必用代理模式并设 `ALLOW_ORIGIN`。

---

## License

MIT。西柚数据的版权与使用条款以西柚官方为准。
