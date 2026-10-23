# GitHub公开共享数据

用户已明确确认报价、账单及分类结果可公开。固定仓库xiaopong190-oss/ops-center，固定文件data/logistics/shared.json，分支main。网页从该文件读取共享数据，本地仅为缓存和待提交草稿。确认提交后通过现有登录鉴权后端写入GitHub，GitHub返回文件SHA/commit/时间后才显示入库成功。多人提交按加载时SHA检查，冲突不覆盖。首次遇到本机旧数据不静默丢弃；可提交本机数据或核对后加载GitHub版本。

写入凭证：Cloudflare ops-center-cloud Secret LOGISTICS_GITHUB_TOKEN。请使用仅授权ops-center、Contents Read and write的细粒度Token，不写进聊天、网页或GitHub。现有gh CLI账号凭证不会复制给后端。读取公开数据无需此凭证；未配置时不能提交。

不再把D1备份作为入库目标。大请求可在D1暂存分片，24小时清理；成功后最终数据是GitHub文件。以前D1备份不自动搬到公开仓库，也不擅自删除。Git提交历史保留旧文件，30天D1历史清理不等于删除Git历史。Demo不上传GitHub。当前无线上真实提交验证，等待配置写入Secret。

数据目录提交不会触发网页构建。不要在文件中加入密钥、登录凭证或不希望公开的信息。
