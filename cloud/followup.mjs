const key = '_new-product-followup';
const empty = () => ({ products: [], records: [], events: [] });
const reject = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function followup(req, env, user) {
  const stored = await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();
  const current = stored ? JSON.parse(stored.value) : { revision: 0, data: empty() };
  if (req.method === 'GET') return Response.json(current, { headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') reject(405, '方法不允许');
  if (user.canEdit === false && user.auth !== 'super') reject(403, '当前帐号没有编辑权限');
  const text = await req.text();
  if (text.length > 3000000) reject(413, '记录过大，请拆分数据');
  let input; try { input = JSON.parse(text); } catch { reject(400, '无效数据'); }
  if (input.revision !== current.revision) reject(409, '其它人员已更新，请刷新后重试；本次修改未覆盖云端');
  const data = input.data;
  if (!data || !['products', 'records', 'events'].every(name => Array.isArray(data[name]))) reject(400, '数据格式错误');
  if (input.migrate) {
    if (user.auth !== 'super') reject(403, '仅超级管理员可上传旧本机数据');
    if (current.data.products.length || current.data.records.length || current.data.events.length) reject(409, '云端已有记录，禁止覆盖导入');
  }
  const ids = new Set();
  for (const row of [...data.products, ...data.records]) {
    if (!row?.id || typeof row.id !== 'string' || ids.has(row.id) || !row.body || !Number.isSafeInteger(row.version) || row.version < 1) reject(400, '记录或版本无效');
    ids.add(row.id);
  }
  const products = new Set(data.products.map(row => row.id));
  for (const row of data.records) {
    if (!products.has(row.product_id) || !['operation','task','shipment','cost','campaign','optimization'].includes(row.kind)) reject(400, '关联产品或记录类型无效');
    if (row.body.operationId && !data.records.some(a => a.id === row.body.operationId && a.kind === 'operation' && a.product_id === row.product_id)) reject(400, '运营分工关联无效');
  }
  if (!input.migrate) {
    for (const old of [...current.data.products, ...current.data.records]) if (!ids.has(old.id)) reject(400, '请使用删除标记保留历史记录');
    const previousEvents = new Map(current.data.events.map(event => [event.id, event]));
    for (const old of current.data.events) if (!data.events.some(event => event.id === old.id && JSON.stringify(event) === JSON.stringify(old))) reject(400, '已有操作历史不可改写');
    for (const event of data.events) if (!previousEvents.has(event.id)) {
      event.actor = user.name; event.actor_id = user.id; event.created_at = new Date().toISOString();
    }
  } else data.events.unshift({id:crypto.randomUUID(),product_id:data.products[0]?.id || '',actor:user.name,actor_id:user.id,action:'上传本机记录',reason:'首次迁移到共享云端',created_at:new Date().toISOString(),before:null,after:'{}'});
  const next = { revision: current.revision + 1, data, updatedBy: user.name, updatedAt: new Date().toISOString() };
  const result = stored
    ? await env.DB.prepare("UPDATE records SET value=? WHERE key=? AND json_extract(value,'$.revision')=?").bind(JSON.stringify(next), key, input.revision).run()
    : await env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key, JSON.stringify(next)).run();
  if (Number(result.meta?.changes ?? result.changes) !== 1) reject(409, '其它人员已更新，请刷新后重试');
  return Response.json(next, { headers: { 'Cache-Control': 'no-store' } });
}
