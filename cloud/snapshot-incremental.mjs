import {checkManifest} from './workspace-shards.mjs';
export function incrementalManifest(value){
 if(!value||!/^[a-f0-9]{64}$/.test(value.baseHash||''))throw Object.assign(Error('快照增量基线无效'),{status:502});
 checkManifest({schemaVersion:2,storage:'encrypted-parts-v1',...value});return value;
}
