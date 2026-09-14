import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../amazon-growth/',import.meta.url)),out=fileURLToPath(new URL('./public/',import.meta.url));
function copy(dir,dest){fs.mkdirSync(dest,{recursive:true});for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const s=path.join(dir,entry.name),d=path.join(dest,entry.name);if(entry.isDirectory())copy(s,d);else if(/\.(html|js|css|svg|png|jpg|woff2?|json|ico)$/i.test(entry.name)&&!/(private|evidence-cache|\.env)/.test(entry.name)){let data=fs.readFileSync(s);if(entry.name.endsWith('.html'))data=Buffer.from(data.toString().replace(/<head>/i,'<head><script src="/growth-auth.js"></script>'));fs.writeFileSync(d,data);}}}
for(const d of ['assets','asinscope/assets','watchlist/assets','keywords','launch-plan'])copy(path.join(source,d),path.join(out,d));
for(const p of ['index.html','asinscope/index.html','watchlist/index.html']){const target=path.join(out,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(path.join(source,p),'utf8').replace(/<head>/i,'<head><script src="/growth-auth.js"></script>'));}
fs.copyFileSync(new URL('./growth-auth.js',import.meta.url),path.join(out,'growth-auth.js'));
// Serve the shared budget module with a browser JavaScript extension and MIME type.
fs.copyFileSync(path.join(source,'launch-plan/budget-math.cjs'),path.join(out,'launch-plan/budget-math.js'));
const plan=path.join(out,'launch-plan/app.html');
fs.writeFileSync(plan,fs.readFileSync(plan,'utf8').replace('/launch-plan/budget-math.cjs','/launch-plan/budget-math.js'));
console.log('Growth browser assets prepared; server files excluded');
