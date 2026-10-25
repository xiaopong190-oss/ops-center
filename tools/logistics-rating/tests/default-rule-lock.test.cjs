const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),lock=JSON.parse(fs.readFileSync(path.join(base,'default-rule-lock.json'),'utf8'));
function mismatches(read){return Object.entries(lock.files).filter(([file,expected])=>crypto.createHash('sha256').update(read(file).replace(/\r\n/g,'\n'),'utf8').digest('hex')!==expected).map(([file])=>file);}
const hooks=[
 ['/* rating-name-import-approved */Companies.recordRatingProviderImport?.([...mapped,...mappedRegions].map(r=>r.companyId),today());',''],
 ['const confirmedNameIds=new Set();const result=ImportResolution.resolve(db,keys,action,edits,today(),actor,company=>{const id=Companies.imported(company).id;confirmedNameIds.add(id);return id;});write(result.db);/* rating-name-resolution-approved */Companies.recordRatingProviderImport?.([...confirmedNameIds],today());','const result=ImportResolution.resolve(db,keys,action,edits,today(),actor,company=>Companies.imported(company).id);write(result.db);']
];
const source=file=>fs.readFileSync(path.join(base,file),'utf8');
const read=file=>file==='quotes.js'?hooks.reduce((s,[hook,original])=>s.replace(hook,original),source(file)):source(file);
test('approved name-only seams occur exactly once; baseline hashes remain unchanged',()=>{for(const [hook] of hooks)assert.equal(source('quotes.js').split(hook).length-1,1);});
test('default shared logic stays at reviewed baseline; new rules belong in separate extensions',()=>{assert.deepEqual(mismatches(read),[],'Default rule changed. Propose the conflict and use a separate PR; do not silently refresh the lock.');});
test('lock detects altered logic and tolerates platform line endings',()=>{assert.deepEqual(mismatches(file=>read(file).replace(/\r?\n/g,'\r\n')),[]);assert.deepEqual(mismatches(file=>read(file)+(file==='channel-score.js'?'\n// synthetic unapproved edit':'')),['channel-score.js']);});
