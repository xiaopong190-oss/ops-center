import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

for (const role of ['', 'super']) {
  const data = new Map(role ? [['ops-center-auth-v6', role], ['ops-center-current-user', JSON.stringify({id:'test-admin',name:'Test',auth:role,role})]] : []);
  const storage = { getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k), key:i=>[...data.keys()][i], get length(){return data.size;} };
  let tree;
  const root = {replaceChildren(){}};
  const context = {React, ReactDOM:{createRoot:()=>({render:e=>{tree=e;}})}, localStorage:storage, sessionStorage:storage,
    document:{getElementById:()=>root,documentElement:{classList:{toggle(){}}}},
    location:{href:'https://xiaopong190-oss.github.io/ops-center/'}, URL, URLSearchParams, console, setTimeout, clearTimeout,
    fetch:()=>Promise.reject(new Error('Network disabled in render test')), CustomEvent:class {}};
  context.window=context;
  context.addEventListener=()=>{};
  context.removeEventListener=()=>{};
  vm.runInNewContext(fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8'),context);
  const html=renderToString(tree);
  assert.ok(html.includes(role ? 'ops-sidebar' : '进入运营中心'));
  console.log(`${role || 'guest'} render passed`);
}
