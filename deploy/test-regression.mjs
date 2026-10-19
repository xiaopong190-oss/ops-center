import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const prepared=spawnSync(process.execPath,['deploy/build-followup-page.mjs'],{cwd:root,stdio:'inherit'});
if(prepared.error)throw prepared.error;
if(prepared.status!==0)process.exit(prepared.status||1);
const suites=[
  'cloud/test-permissions.mjs',
  'deploy/test-tracker.mjs',
  'deploy/test-followup-chunks.mjs',
  'deploy/test-followup-upload-auth.mjs',
  'deploy/test-followup-navigation.mjs',
  'deploy/test-workspace-maximize.mjs',
  'deploy/test-perf-intelligence.mjs',
  'deploy/test-perf-intelligence-ui.mjs',
];
for(const suite of suites){
  console.log('\nRunning '+suite);
  const result=spawnSync(process.execPath,[suite],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPASS all '+suites.length+' regression suites (isolated data only)');
