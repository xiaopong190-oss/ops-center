import { createHash, createCipheriv } from 'node:crypto';

const ORIGIN = 'https://openapi.lingxing.com';
const shopsPath='/erp/sc/data/seller/lists';
const READ_PATHS = new Set([
  '/erp/sc/data/mws/orderDetail',
  '/erp/sc/data/mws/orders',
  shopsPath,
  '/erp/sc/routing/storage/shipment/getInboundShipmentList',
  '/erp/sc/routing/storage/shipment/getInboundShipmentListMwsDetailList',
  '/erp/sc/data/fba_report/shipmentList'
]);
export function sign(params, appId) {
  const key = Buffer.from(appId, 'utf8');
  if (![16, 24, 32].includes(key.length)) throw new Error('App ID 长度不符合领星 AES 签名要求');
  const text = Object.keys(params).filter(k => k !== 'sign' && params[k] !== '' && params[k] !== undefined).sort().map(k => {
    const value = typeof params[k] === 'object' && params[k] !== null ? JSON.stringify(params[k]) : String(params[k]);
    return `${k}=${value}`;
  }).join('&');
  const md5 = createHash('md5').update(text).digest('hex').toUpperCase();
  const cipher = createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  return Buffer.concat([cipher.update(md5, 'utf8'), cipher.final()]).toString('base64');
}

export class LingxingClient {
  constructor({appId, appSecret, fetchImpl = fetch, now = Date.now, pause = ms => new Promise(r => setTimeout(r,ms))}) {
    if (!appId || !appSecret) throw new Error('服务端尚未配置 LINGXING_APP_ID / LINGXING_APP_SECRET');
    Object.assign(this, {appId, appSecret, fetchImpl, now, pause, expires:0, token:null, tokenPending:null});
  }
  async tokenValue() {
    if (this.token && this.now() < this.expires) return this.token;
    if (this.tokenPending) return this.tokenPending;
    this.tokenPending = (async () => {
      const form = new FormData(); form.set('appId', this.appId); form.set('appSecret',this.appSecret);
      let response;
      try { response = await this.fetchImpl(`${ORIGIN}/api/auth-server/oauth/access-token`, {method:'POST',body:form,signal:AbortSignal.timeout(30000)}); }
      catch { throw new Error('领星授权网络请求失败'); }
      if (!response.ok) throw new Error(`领星授权 HTTP ${response.status}`);
      const result = await response.json();
      if (String(result.code) !== '200' || !result.data?.access_token) throw new Error('领星授权失败，请检查应用权限及 IP 白名单');
      const ttl = Number(result.data.expires_in);
      if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('领星 Token 有效期异常');
      this.token = result.data.access_token;
      this.expires = this.now() + Math.max(0,ttl-120)*1000;
      return this.token;
    })();
    try { return await this.tokenPending; } finally { this.tokenPending = null; }
  }
  async read(path, body, attempt=0) {
    if (!READ_PATHS.has(path)) throw new Error('此连接器只开放订单列表及详情只读接口');
    const token = await this.tokenValue();
    const params = {...body,access_token:token,app_key:this.appId,timestamp:String(Math.floor(this.now()/1000))};
    const url = new URL(path,ORIGIN);
    url.search = new URLSearchParams({app_key:params.app_key,timestamp:params.timestamp,sign:sign(params,this.appId)}).toString();
    let response;
    try { response = await this.fetchImpl(url,{method:path===shopsPath?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:path===shopsPath?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); }
    catch { throw new Error('领星业务网络请求失败'); }
    if (response.status === 429 && attempt < 3) { await this.pause(1000 * 2 ** attempt); return this.read(path,body,attempt+1); }
    if (response.status === 401 && attempt === 0) { this.token=null; return this.read(path,body,1); }
    if (!response.ok) throw new Error(`领星业务 HTTP ${response.status}`);
    const result=await response.json();
    if (String(result.code) === '3001008' && attempt < 3) { await this.pause(1100 * 2 ** attempt); return this.read(path,body,attempt+1); }
    if (String(result.code) !== '0') throw new Error(`领星业务返回错误码 ${String(result.code).replace(/[^\w-]/g,'').slice(0,32)}`);
    if (!Array.isArray(result.data)) throw new Error('领星响应结构变化，已停止同步');
    return result;
  }
  orderDetails(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id=>!/^\d{3}-\d{7}-\d{7}$/.test(id))) throw new Error('亚马逊订单号格式错误或数量超过200');
    return this.read('/erp/sc/data/mws/orderDetail',{order_id:ids.join(',')});
  }
}
