const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../matrix-import.js');
const r=(row,items)=>({row,cells:items.map(([col,v,formulaText])=>({cell:col+row,v,formulaText}))});
const source={name:'US明细',merges:[],rows:[r(1,[['A','仓库代码'],['B','按KG包税']]),r(2,[['A','ABE8'],['B','16.09']])]};
const query={name:'美国加拿大FBA快捷查价',kind:'说明',merges:[],rows:[r(19,[['C','ABE8']]),r(22,[['A','US海卡'],['B','16.09','IFERROR(VLOOKUP("*"&$C19&"*",US明细!A:C,2,0),"-")']])]};
const meta={company:'测试物流',date:'2026-10-24',templates:[{warehouse:'ABE8',country:'美国'}]};
test('查价引用必须核验来源单元格、仓库与金额，不能仅凭表名说明跳过',()=>{const b={sheets:[source,query]},x=M.workbook(b,meta),a=x.referenceAudits[0];assert.equal(a.links.length,1);assert.equal(a.links[0].sourceCell,'B2');assert.equal(a.links[0].unit,'kg');assert.match(x.omissions.find(o=>o.row===22).reason,/已从明细生成/);assert.equal(x.records.length,1);assert.equal(M.referenceAudit(b,{records:[]})[0].missing.length,1);const stale=structuredClone(b);stale.sheets[1].rows[1].cells[1].v='99';assert.equal(M.referenceAudit(stale,x)[0].missing.length,1);});
test('快捷查价命名下真实仓库矩阵照常导入，旧说明标记不屏蔽有效内容',()=>{const s={...source,name:'美国快捷查价',kind:'说明'};const x=M.workbook({sheets:[s]},meta);assert.equal(x.records.length,1);assert.equal(x.records[0].values[3],'ABE8');});
test('未保留公式或未知公式不能冒充已核验引用',()=>{const s=structuredClone(query);s.rows[1].cells[1].formulaText='VLOOKUP(未知公式)';const x=M.workbook({sheets:[source,s]},meta);assert.equal(x.referenceAudits[0].links.length,0);assert.equal(x.referenceAudits[0].missing.length,1);});
