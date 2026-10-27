import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const prepared=spawnSync(process.execPath,['deploy/build-followup-page.mjs'],{cwd:root,stdio:'inherit'});
if(prepared.error)throw prepared.error;
if(prepared.status!==0)process.exit(prepared.status||1);
const suites=[
  'cloud/test-logistics-workspace.mjs',
  'tools/logistics-workspace/snapshot.test.cjs',
  'tools/logistics-workspace/runtime.test.cjs',
  'tools/logistics-workspace/quality-workflow.test.cjs',
  'tools/logistics-workspace/workbook-cleaning.test.cjs',
  'tools/logistics-workspace/import-evidence-ui.test.cjs',
  'cloud/test-logistics-github.mjs',
  'cloud/test-logistics-backup.mjs',
  'cloud/test-logistics-ai.mjs',
  'cloud/test-permissions.mjs',
  'deploy/test-tracker.mjs',
  'deploy/test-followup-chunks.mjs',
  'deploy/test-followup-upload-auth.mjs',
  'deploy/test-followup-navigation.mjs',
  'deploy/test-workspace-maximize.mjs',
  'deploy/test-followup-adversarial.mjs',
  'deploy/test-classic-perf-ui.mjs',
  'deploy/test-perf-live-input.mjs',
  'deploy/test-perf-linked-analysis.mjs',
  'deploy/test-perf-latest-period.mjs',
  'deploy/test-perf-three-states.mjs',
];
for(const suite of suites){
  console.log('\nRunning '+suite);
  const result=spawnSync(process.execPath,[suite],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPASS all '+suites.length+' regression suites (isolated data only)');
