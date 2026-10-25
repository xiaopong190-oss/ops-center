import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const file of ['src/ToolsModule.jsx','src/ToolsModule.browser.jsx']) {
 const source=fs.readFileSync(file,'utf8');
 const fn=source.match(/const visibleToolsForUser = (.*);/)[1];
 const filter=vm.runInNewContext('('+fn+')');
 const links=[...source.matchAll(/\{ id: "hstc-ledger-[^\n]+/g)].map(match=>vm.runInNewContext('('+match[0].replace(/,\s*$/,'')+')'));
 assert.equal(links.length,2);
 assert.equal(links[0].url,'https://hstc-amz-cw.akolojutet24.chatgpt.site/');
 assert.equal(links[1].url,'https://xiaopong190-oss.github.io/hstc-amz-cw-viewer/?v=1.04&r=22');
 const catalog=[{id:'ordinary'},...links];
 for(const user of [null,{}, {auth:'ops'}, {auth:'staff'}, {role:'admin'}, {name:'超级管理员'}, {auth:'SUPER'}])assert.equal(filter(catalog,user).length,1);
 for(const user of [{auth:'super'},{role:'super'}])assert.equal(filter(catalog,user).length,3);
 assert.match(source,/const allTools = visibleToolsForUser\(\[\.\.\.onlineDocTools, \.\.\.TOOL_CATALOG\], currentUser\)/);
 console.log(file+': exact URLs and role visibility passed');
}
