// Package only whitelisted application resources. No repository, user data or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const version=require('./package.json').version;
const root=path.resolve(__dirname,'../..'),out=process.argv[2],node=process.argv[3],license=process.argv[4];
if(!out||!node||!license)throw Error('Usage: node pack-portable.cjs OUTPUT_DIR NODE_EXE NODE_LICENSE');
if(fs.existsSync(out))throw Error('Output directory already exists; choose a fresh directory');
const {routes}=require('./dev-server.cjs'),files=new Set([...routes.values(),path.join(__dirname,'dev-server.cjs'),path.join(__dirname,'portable-supervisor.cjs'),path.join(__dirname,'portable-auto-update.cjs'),path.join(__dirname,'package.json'),path.join(__dirname,'shared-logic.json')]);
for(const file of files){const relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Resource outside application');const target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target)}
fs.mkdirSync(path.join(out,'bin'),{recursive:true});fs.copyFileSync(node,path.join(out,'bin/node.exe'));fs.copyFileSync(license,path.join(out,'bin/NODE-LICENSE.txt'));
fs.writeFileSync(path.join(out,'bin/launcher.ps1'),'\ufeff'+fs.readFileSync(path.join(__dirname,'portable-start.ps1'),'utf8'));
fs.writeFileSync(path.join(out,'启动航序.cmd'),'@echo off\r\nchcp 65001 >nul\r\nsetlocal\r\ncd /d "%~dp0"\r\nif not exist "%~dp0bin\\node.exe" (echo 缺少运行环境，请完整解压下载包。 & pause & exit /b 1)\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\\launcher.ps1"\r\nif errorlevel 1 (echo. & echo 启动未完成。请把上面的错误截图发给管理员；不要清除浏览器数据。 & pause)\r\n','utf8');
fs.writeFileSync(path.join(out,'使用说明.txt'),'航序 v'+version+' 完整本地端\r\n\r\n1. 完整解压，不要在压缩包里面运行。\r\n2. 唯一启动入口：双击 启动航序.cmd。\r\n3. 自动检查旧版航序进程并切换；仅关闭已验证的航序，不关闭其他软件。\r\n4. 本地数据在原浏览器里，继续使用同一个浏览器、普通模式和 http://127.0.0.1:4318/input。无需重新录入。\r\n5. 若启动报错，窗口会保留，请截图错误；服务日志在 logs/startup.log。\r\n6. 此包不带业务数据或账号。上传失败与本机启动是两个阶段，启动成功不代表云端发布成功。\r\n','utf8');
const hashes={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else hashes[path.relative(out,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}}walk(out);fs.writeFileSync(path.join(out,'SHA256.json'),JSON.stringify(hashes,null,2));console.log(JSON.stringify({files:Object.keys(hashes).length,output:out}));
