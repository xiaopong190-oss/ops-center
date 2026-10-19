import assert from 'node:assert/strict';
import {mount,settle} from './perf-test-harness.mjs';
const t=await mount({withD3:false,rootSelector:'#app'});
try{
  const doc=t.window.document;
  assert.equal(doc.querySelector('#perf-intelligence-root'),null);
  assert.equal(doc.querySelector('script[src*="d3@"]'),null);
  assert.ok(t.root().textContent.includes('经营数据'));
  assert.ok(t.root().textContent.includes('单件利润测算'));
  assert.ok(t.root().textContent.includes('周期数据'));
  assert.equal(t.root().querySelectorAll('[data-pf]').length,16);
  assert.ok(t.root().querySelector('[data-f="econ.cogs"]'));
  assert.equal(t.root().querySelector('[data-f="econ.cogs"]').closest('details'),null,'cost editor remains directly accessible');
  for(const range of ['4w','12w','all']){
    t.root().querySelector('[data-act="range"][data-v="'+range+'"]').click();await settle();
    for(const metric of ['net','tacos','cvr','ret','cpa']){
      t.root().querySelector('[data-act="metric"][data-v="'+metric+'"]').click();await settle();
      assert.ok(t.root().querySelector('[data-act="metric"][aria-pressed="true"][data-v="'+metric+'"]'));
    }
  }
  for(let i=0;i<5;i++){
    doc.querySelector('nav [data-v="overview"]').click();await settle();
    doc.querySelector('nav [data-v="perf"]').click();await settle();
    assert.ok(t.root().querySelector('[data-form="perf"]'));
  }
  assert.equal(t.writes(),0,'navigation never uploads');
  const input=t.root().querySelector('[data-pf="r0"][data-field="sales"]');input.value='12000';input.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();
  const cost=t.root().querySelector('[data-f="econ.cogs"]');cost.value='25';cost.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();
  assert.equal(t.writes(),0,'manual draft behavior retained');
  assert.equal(t.snapshot.data.trackerV1.docs['perf/r0'].sales,10000,'unsaved changes do not replace cloud data');
  await t.window.saveOpsFollowup();await settle();
  assert.equal(t.writes(),1);
  assert.equal(t.snapshot.data.trackerV1.docs['perf/r0'].sales,12000);
  assert.equal(t.snapshot.data.trackerV1.docs['links/test'].econ.cogs,25);
  assert.equal(t.snapshot.data.trackerV1.docs['perf/r1'].sales,8400);
  assert.equal(t.snapshot.data.events.length,2,'two edits keep before/after history');
  assert.equal(t.errors.length,0,t.errors.join('\n'));
  console.log('PASS restored classic UI: visible original editors, period/range/metric/view navigation, per-user manual drafts, saved cost/sales edits, unchanged other periods and audit history; no D3 dependency');
}finally{t.window.close();}
