import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {analyzePerformance,simulatePerformance} from '../src/perf-intelligence-model.js';
const source=fs.readFileSync(new URL('../modules/new-product-tracker/index.html',import.meta.url),'utf8');
const math=source.slice(source.indexOf('function unitEcon('),source.indexOf('function perfHealth('));
const scope=vm.createContext({num:value=>typeof value==='number'&&Number.isFinite(value),PF:['sessions','units','sales','adSpend','adSales','adOrders','returns'],shipAvgHead:id=>id==='auto'?5:null});
vm.runInContext(math+'\nthis.calculate=perfCalc;this.unit=unitEcon;',scope);
const link={id:'test',econ:{price:100,cogs:20,fba:10,head:5,commission:15,other:2,unsellable:50,targetMargin:20}};
const row={id:'r1',from:'2026-10-05',to:'2026-10-11',sessions:1000,units:100,sales:10000,adSpend:1800,adSales:5000,adOrders:50,returns:5};
const original=structuredClone({link,row});
const c=scope.calculate(link,[row]);
assert.ok(Math.abs(c.net-2622.5)<1e-8);
assert.equal(analyzePerformance(link,[row],c).profitReady,true);
const simulation=simulatePerformance(link,c,{price:10,advertising:-20,returns:2},scope.unit);
assert.ok(Math.abs(simulation.net-4041.4)<1e-8);
assert.ok(Math.abs(simulation.targetBudget-3281.4)<1e-8);
assert.equal(simulation.adSpend,1440);
assert.ok(Math.abs(simulation.sales-11000)<1e-8);
assert.deepEqual({link,row},original,'simulations must not mutate source records');
for(const field of ['units','sales','adSpend','returns']){
  const incomplete={...row,[field]:null};
  assert.equal(analyzePerformance(link,[incomplete],scope.calculate(link,[incomplete])).profitReady,false);
}
for(const field of ['cogs','fba','head','commission']){
  const incomplete={...link,econ:{...link.econ,[field]:null}};
  assert.equal(analyzePerformance(incomplete,[row],scope.calculate(incomplete,[row])).profitReady,false);
}
const auto={...link,id:'auto',econ:{...link.econ,head:null}};
assert.equal(analyzePerformance(auto,[row],scope.calculate(auto,[row])).profitReady,true);
for(const invalid of [{...row,returns:101},{...row,units:-1},{...row,from:'2026-02-30'},{...row,to:'2026-09-01'},{...row,from:42}])assert.equal(analyzePerformance(link,[invalid],scope.calculate(link,[invalid])).profitReady,false);
const overlapping=[row,{...row,id:'r2',from:'2026-10-10',to:'2026-10-17'}];
assert.equal(analyzePerformance(link,overlapping,scope.calculate(link,overlapping)).overlap,true);
const negative={...link,econ:{...link.econ,cogs:-1}};
assert.equal(analyzePerformance(negative,[row],scope.calculate(negative,[row])).profitReady,false);
const empty=scope.calculate(link,[]);assert.equal(analyzePerformance(link,[],empty).profitReady,false);assert.equal(simulatePerformance(link,empty,{price:0,advertising:0,returns:0},scope.unit),null);
assert.equal(simulatePerformance(link,c,{price:NaN,advertising:0,returns:0},scope.unit),null);
const loss={...row,adSpend:6000};assert.ok(analyzePerformance(link,[loss],scope.calculate(link,[loss])).issues.some(issue=>issue.kind==='loss'));
console.log('PASS verified profit/scenario equations, unchanged source data, missing-vs-zero costs, automatic freight, invalid dates/numbers, overlapping periods, empty data and explainable loss diagnosis');
