import fs from 'node:fs';
export function buildTrackerDocument(root) {
  let html = fs.readFileSync(new URL('modules/new-product-tracker/index.html',root),'utf8');
  const inline=path=>fs.readFileSync(new URL(path,root),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function');
  const adapter=inline('src/tracker-cloud-adapter.js')+'\n'+inline('src/tracker-drafts.js');
  const runtime = fs.readFileSync(new URL('src/tracker-runtime.js',root),'utf8');
  const intelligence=inline('src/perf-intelligence-model.js')+'\n'+inline('src/perf-intelligence.js');
  const intelligenceStyles=fs.readFileSync(new URL('src/perf-intelligence.css',root),'utf8');
  if(!html.includes('/* ---------- events ---------- */'))throw Error('Tracker event hook changed');
  html=html.replace('</style>',intelligenceStyles+'\n</style>');
  html=html.replace('/* ---------- events ---------- */',intelligence+'\n/* ---------- events ---------- */');
  const begin = html.indexOf('function localDb(){');
  const end = html.indexOf('\nrender(true);',begin);
  if (begin < 0 || end < 0) throw Error('Tracker storage hooks changed');
  html = html.slice(0,begin) + adapter + '\n' + runtime + '\n' + html.slice(end);
  html = html.replace("db=localDb();state.me={id:'local',isOwner:true};state.names.local='本机';",'db=localDb();state.me=null;');
  html = html.replace("db._load(o);toast('已导入 '+Object.keys(o).length+' 条记录');",'db._load(o).catch(e=>toast(e.message));');
  html = html.replace("function writeErr(e){const c=e&&e.code;", "function writeErr(e){if(e?.message){toast(e.message);return;}const c=e&&e.code;");
  html = html.replaceAll('本地模式','共享模式').replaceAll('导入数据','合并导入数据');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+html+'</body></html>';
}
