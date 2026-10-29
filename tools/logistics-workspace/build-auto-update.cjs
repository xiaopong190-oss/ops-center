// Called by the release build: immutable content-addressed payloads prevent mixed releases.
const fs=require('node:fs'),path=require('node:path'),{hash,manifest}=require('./portable-auto-update.cjs');
function build(out){const root=path.resolve(__dirname,'../..'),{routes}=require('./dev-server.cjs'),files=new Map([...new Set(routes.values())].map(file=>[path.relative(root,file).replaceAll('\\','/'),fs.readFileSync(file)]));
 for(const name of ['dev-server.cjs','portable-supervisor.cjs','portable-auto-update.cjs','package.json','shared-logic.json'])files.set('tools/logistics-workspace/'+name,fs.readFileSync(path.join(__dirname,name)));
 files.set('bin/launcher.ps1',Buffer.from('\ufeff'+fs.readFileSync(path.join(__dirname,'portable-start.ps1'),'utf8')));
 const m=manifest({app:'hangxu-input',schema:1,version:require('./package.json').version,files:[...files].map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:hash(bytes)}))});
 fs.mkdirSync(path.join(out,'updates'),{recursive:true});for(const bytes of files.values())fs.writeFileSync(path.join(out,'updates',hash(bytes)),bytes);fs.writeFileSync(path.join(out,'auto-update.json'),JSON.stringify(m,null,2)+'\n');return m}
if(require.main===module)console.log('Automatic update resources:',build(path.resolve(process.argv[2]||'docs/tools/logistics-workspace')).files.length);
module.exports={build};
