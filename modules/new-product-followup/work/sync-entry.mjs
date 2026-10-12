import fs from 'node:fs';
const root=new URL('../',import.meta.url);
for(const [src,out] of [['outputs/产品跟进工作台-独立完整版.html','index.html'],['outputs/产品跟进工作台-复杂示例预览.html','demo.html']])fs.copyFileSync(new URL(src,root),new URL(out,root));
