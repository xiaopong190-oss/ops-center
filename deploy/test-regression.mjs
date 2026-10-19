import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const suites=[
  'cloud/test-permissions.mjs',
  'deploy/test-tracker.mjs',
  'deploy/test-followup-chunks.mjs',
  'deploy/test-followup-upload-auth.mjs',
  'deploy/test-followup-navigation.mjs',
  'deploy/test-workspace-maximize.mjs',
];
for(const suite of suites){
  console.log('\nRunning '+suite);
  const result=spawnSync(process.execPath,[suite],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPASS all '+suites.length+' regression suites (isolated data only)');
