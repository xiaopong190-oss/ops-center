const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),lock=JSON.parse(fs.readFileSync(path.join(base,'default-rule-lock.json'),'utf8'));
function mismatches(read){return Object.entries(lock.files).filter(([file,expected])=>crypto.createHash('sha256').update(read(file).replace(/\r\n/g,'\n'),'utf8').digest('hex')!==expected).map(([file])=>file);}
const hooks=[
 ["LegacyReclean.explain(window.ImportEvidence?ImportEvidence.pendingOnly(db):db,today())", "LegacyReclean.explain(db,today())"],
 ["/* import-evidence-merge-approved */result.db.importExceptions=window.ImportEvidence?ImportEvidence.mergeExceptions(result.db.importExceptions||[],pendingExceptions):Q.mergeExceptions(result.db.importExceptions||[],pendingExceptions);", "result.db.importExceptions=Q.mergeExceptions(result.db.importExceptions||[],pendingExceptions);"],
 ["另有 '+pendingExceptions.filter(e=>!e.status||e.status==='pending').length+' 条待处理", "另有 '+pendingExceptions.length+' 条待处理"],
 ["/* import-evidence-reference-approved */if(window.ImportEvidence)pendingExceptions.push(...ImportEvidence.referenceExceptions(e.detail.referenceRecords||[],today(),e.detail.fileName));",''],
 ["const exceptionCount=pendingExceptions.filter(e=>!e.status||e.status==='pending').length;","const exceptionCount=pendingExceptions.length;"],
 ["/* cargo-filter-approved */return window.CargoFilter?CargoFilter.filterCargoRows(window.N001UI.rows(rows),[...document.querySelectorAll('#cargoFilter input:checked')].map(input=>input.value)):window.N001UI.rows(rows);","return window.N001UI.rows(rows);"],
 ['/* rating-name-import-approved */Companies.recordRatingProviderImport?.([...mapped,...mappedRegions].map(r=>r.companyId),today());',''],
 ['const confirmedNameIds=new Set();const result=ImportResolution.resolve(db,keys,action,edits,today(),actor,company=>{const id=Companies.imported(company).id;confirmedNameIds.add(id);return id;});write(result.db);/* rating-name-resolution-approved */Companies.recordRatingProviderImport?.([...confirmedNameIds],today());','const result=ImportResolution.resolve(db,keys,action,edits,today(),actor,company=>Companies.imported(company).id);write(result.db);']
];
const source=file=>fs.readFileSync(path.join(base,file),'utf8');
const transportHook=["for(const b of document.querySelectorAll('[data-transport]'))b.onclick=()=>{const value=root.TransportExclusion.nextTransportExclusion(b.dataset.state);b.dataset.state=value;api.states[b.dataset.transport]=value;b.textContent=b.dataset.transport+' · '+(value==='exclude'?'排除':'不限');api.invalidate();render();};", "for(const b of document.querySelectorAll('[data-transport]'))b.onclick=()=>{const states=['neutral','include','exclude'],value=states[(states.indexOf(b.dataset.state||'neutral')+1)%3];b.dataset.state=value;api.states[b.dataset.transport]=value;b.textContent=b.dataset.transport+' · '+({neutral:'不限',include:'纳入',exclude:'排除'})[value];api.invalidate();render();};"];
const otherHook=["return mode==='待确认'?/* transport-other-approved */(root.TransportOther||(typeof require==='function'?require('./extensions/transport-other.js'):null))?.unknownStatus(states)||'unknown':", "return mode==='待确认'?'unknown':"];
const read=file=>file==='quotes.js'?hooks.reduce((s,[hook,original])=>s.replace(hook,original),source(file)):file==='n001.js'?source(file).replace(transportHook[0],transportHook[1]).replace(otherHook[0],otherHook[1]):source(file);
test('approved exclusion-only UI hook occurs once',()=>{assert.equal(source('n001.js').split(transportHook[0]).length-1,1);});
test('approved import, name and count seams occur exactly once; historical baseline hashes remain unchanged',()=>{for(const [hook] of hooks)assert.equal(source('quotes.js').split(hook).length-1,1);});
test('default shared logic stays at reviewed baseline; new rules belong in separate extensions',()=>{assert.deepEqual(mismatches(read),[],'Default rule changed. Propose the conflict and use a separate PR; do not silently refresh the lock.');});
test('lock detects altered logic and tolerates platform line endings',()=>{assert.deepEqual(mismatches(file=>read(file).replace(/\r?\n/g,'\r\n')),[]);assert.deepEqual(mismatches(file=>read(file)+(file==='channel-score.js'?'\n// synthetic unapproved edit':'')),['channel-score.js']);});

test('approved other transport visibility seam occurs once without altering classifier',()=>{assert.equal(source('n001.js').split(otherHook[0]).length-1,1)});
