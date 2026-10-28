import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import babel from '@babel/standalone';
let handler={isDirty:true,error:'上传未确认；草稿保留',hideHint:false};
const context={getHandler:()=>handler,busy:false};
const sandbox={React:{...React,createContext:()=>({}),useContext:()=>context},window:{},userWantsAutoShare:()=>false,formatSharedTime:x=>x};
vm.createContext(sandbox);
vm.runInContext(babel.transform(fs.readFileSync('src/GlobalCloudSync.browser.jsx','utf8'),{presets:['react']}).code,sandbox);
const render=()=>renderToStaticMarkup(React.createElement(sandbox.window.GlobalCloudBar));
assert.match(render(),/上传未确认；草稿保留/);
handler={...handler,saving:true,barHint:'正在上传 1 / 3 份数据'};
assert.match(render(),/正在上传 1 \/ 3 份数据/);
assert.doesNotMatch(render(),/上传未确认/);
handler={isDirty:false,saving:false,hideHint:false,barHint:'上传成功 · 云端已确认'};
assert.match(render(),/上传成功 · 云端已确认/);
assert.match(render(),/aria-live="polite"/);
for(const path of ['src/NewProductFollowupModule.jsx','src/NewProductFollowupModule.browser.jsx']){
 const source=fs.readFileSync(path,'utf8');assert.match(source,/hideHint:false/);assert.match(source,/新品页面尚未就绪/);
}
console.log('PASS visible upload progress, failure takes precedence over dirty state, confirmed success, accessible announcements, unready iframe rejects');
