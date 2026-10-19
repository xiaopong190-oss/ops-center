import assert from 'node:assert/strict';
import {mount,baseLink,settle} from './perf-test-harness.mjs';
let test=await mount();
try{
  const root=test.root();assert.equal(root.querySelectorAll('.perf-stat').length,4);
  assert.ok(root.querySelector('svg.perf-chart [data-chart-frame]'));
  assert.equal(root.querySelector('text[data-axis="x"]').textContent,'周期起始日期');
  assert.equal(root.querySelectorAll('[data-pf]').length,16,'original editable period fields remain available');
  assert.ok(root.querySelector('[data-f="econ.cogs"]'),'original cost save control remains');
  assert.ok(!root.innerHTML.includes('NaN'));assert.ok(!root.innerHTML.includes('Infinity'));
  const source=JSON.stringify(test.snapshot),before=root.querySelector('[data-perf-sim-results]').textContent;
  const price=root.querySelector('[data-perf-sim="price"]');price.value='10';price.dispatchEvent(new test.window.Event('input',{bubbles:true}));
  assert.notEqual(root.querySelector('[data-perf-sim-results]').textContent,before);
  assert.equal(test.writes(),0);assert.equal(JSON.stringify(test.snapshot),source,'scenario does not write the shared library');
  root.querySelector('[data-perf-reset]').click();assert.equal(root.querySelector('[data-perf-sim="price"]').value,'0');
  const period=root.querySelector('[data-perf-period]');period.value='r0';period.dispatchEvent(new test.window.Event('change',{bubbles:true}));
  assert.ok(root.querySelector('[data-perf-period-detail]').textContent.includes('2026-10-05'));
  root.querySelector('[data-perf-jump="records"]').click();assert.equal(root.querySelector('#perf-records').open,true);
  root.querySelector('.perf-metrics [data-v="tacos"]').click();await settle();
  const updated=test.root();assert.equal(updated.querySelectorAll('path.perf-series').length,2);
  const overlay=updated.querySelector('[data-chart-hover-overlay="cross-series"]');overlay.dispatchEvent(new test.window.MouseEvent('pointermove',{clientX:180,bubbles:true}));
  assert.equal(updated.querySelector('.perf-tooltip').hidden,false);
  const legend=updated.querySelector('[data-perf-series="tacos"]');legend.click();assert.equal(legend.getAttribute('aria-pressed'),'false');
  assert.equal(updated.querySelectorAll('path.perf-series').length,1);assert.equal(updated.querySelector('.perf-tooltip').hidden,true);
  legend.click();assert.equal(updated.querySelectorAll('path.perf-series').length,2);
  assert.equal(test.errors.length,0,test.errors.join('\n'));assert.equal(test.writes(),0);
}finally{test.dom.window.close();}
test=await mount({rows:[]});
try{assert.ok(test.root().textContent.includes('先录入一个完整经营周期'));assert.equal(test.root().querySelectorAll('[data-perf-sim]:disabled').length,3);assert.equal(test.errors.length,0,test.errors.join('\n'));}finally{test.dom.window.close();}
test=await mount({link:{...baseLink,econ:{...baseLink.econ,cogs:null}}});
try{assert.ok(test.root().querySelector('.perf-stats').textContent.includes('待补齐'));assert.equal(test.root().querySelectorAll('[data-perf-sim]:disabled').length,3);assert.equal(test.errors.length,0,test.errors.join('\n'));}finally{test.dom.window.close();}
console.log('PASS real D3 + JSDOM dashboard, original editor retention, hover/legend/period interactions, empty/missing states, read-only scenario isolation and zero shared-library writes');
