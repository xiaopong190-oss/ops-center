import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const app=join(resolve(process.argv[2]),'apps/web');
const require=createRequire(join(app,'package.json'));
const {build}=await import(pathToFileURL(require.resolve('vite')).href);
const react=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const outDir=join(dirname(fileURLToPath(import.meta.url)),'ad-ui');
const entry='virtual:shared-ad-demo';
await build({root:app,configFile:false,publicDir:false,plugins:[react.default(),{
  name:'shared-ad-demo',resolveId(id){if(id===entry)return '\0'+entry;},
  enforce:'pre',
  transform(code,id){
    if(id.endsWith('/api/simulation-api.ts'))return `
      export async function fetchSimulationCatalog(){return {profiles:window.adData.profiles};}
      export async function fetchSimulationWorkspace(id){return window.adData.workspaces[id];}
      export async function commandSimulationAction(){throw Error('当前演示没有可执行的广告动作');}
    `;
    if(!id.endsWith('/simulation-inventory-tabs.tsx'))return;
    const label='{product ? `${product.asin} · ${product.sku}` : ad.productId}';
    if(!code.includes(label))throw Error('广告商品字段已更改');
    return code.replace(label,`{(() => {
      const item=window.systemData.products.find(p=>p.id===ad.productId);
      return item ? <><a href={item.url} target="_blank" rel="noopener noreferrer">{item.asin} · {item.sku}</a><small> · 每件成本 {item.currency} {item.cogs.toFixed(2)}</small></> : ad.productId;
    })()}`);
  },
  load(id){if(id==='\0'+entry)return `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {SimulationWorkspace} from '/src/components/simulation/simulation-workspace.tsx';
    import '/src/styles/tokens.css';
    createRoot(document.getElementById('ad-root')).render(React.createElement(SimulationWorkspace));
  `;}
}],build:{outDir,emptyOutDir:false,rollupOptions:{input:entry,output:{entryFileNames:'simulation.js',assetFileNames:'simulation.[ext]'}}}});
