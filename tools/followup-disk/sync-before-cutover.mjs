import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'data'),store=openStore(dir),bytes=fs.readFileSync(path.join(dir,'cloud-latest-verified.json')),snapshot=JSON.parse(bytes);
if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1)throw Error('Invalid migration snapshot');
store.sql.exec('BEGIN IMMEDIATE');
try{
 const writes=store.sql.prepare("SELECT count(*) n FROM journal WHERE method='POST'").get().n;
 if(writes)throw Error('Local uploads already exist; refusing to replace them');
 const local=JSON.parse(store.sql.prepare('SELECT value FROM records WHERE key=?').get('_new-product-followup').value);
 if(local.revision>snapshot.revision)throw Error('Refusing version rollback');
 store.sql.prepare('UPDATE records SET value=? WHERE key=?').run(bytes.toString('utf8'),'_new-product-followup');
 store.sql.exec('COMMIT');fs.writeFileSync(path.join(dir,'latest-backup.json'),bytes);
 console.log(JSON.stringify({synced:true,revision:snapshot.revision,sha256:createHash('sha256').update(bytes).digest('hex')}));
}catch(error){store.sql.exec('ROLLBACK');throw error;}finally{store.close();}
