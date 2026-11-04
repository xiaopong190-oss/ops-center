(function(root){
 'use strict';
 const Matrix=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null);
 const clean=value=>String(value??'').trim();
 const column=cell=>cell.match(/^[A-Z]+/)?.[0];

 function references(sheet){
  const countries=Matrix.geography(sheet.name).countries;
  if(countries.length!==1||!/仓库/.test(sheet.name))return [];
  const header=sheet.rows.find(row=>row.cells.some(cell=>/^(?:FBA|AMZ|仓库代码|仓库编号)$/i.test(clean(cell.v)))&&row.cells.some(cell=>/^(?:Address|地址)$/i.test(clean(cell.v))));
  if(!header)return [];
  if(header.cells.some(cell=>/单价|运费|\d\s*(?:KG|CBM|公斤|立方)/i.test(cell.v)))return [];
  const warehouseColumn=column(header.cells.find(cell=>/^(?:FBA|AMZ|仓库代码|仓库编号)$/i.test(clean(cell.v))).cell);
  const codes=new Set(sheet.rows.filter(row=>row.row>header.row).map(row=>clean(row.cells.find(cell=>column(cell.cell)===warehouseColumn)?.v)).filter(value=>/^[A-Z]{2,5}\d{1,3}$/.test(value)));
  return [...codes].map(warehouse=>({country:countries[0],warehouse,sourceSheet:sheet.name}));
 }

 function inspect(sheet){
  if(references(sheet).length)return {sheet:sheet.name,status:'reference',reason:'明确国家的仓库地址参考表',scannedRows:sheet.rows.length,blocks:[]};
  const countries=Matrix.geography(sheet.name).countries;
  if(countries.length!==1)return null;
  const blocks=[];
  for(const block of Matrix.scan(sheet)){
   const header=sheet.rows.find(row=>row.row===block.header);
   const destination=header?.cells.find(cell=>column(cell.cell)==='A'&&/^(?:空派|海派|空运|海运|卡派)$/.test(clean(cell.v)));
   if(!destination)continue;
   const priceColumns=new Set(block.columns.map(item=>column(item.cell)));
   const prices=[];
   for(const row of sheet.rows.filter(row=>row.row>block.header&&row.row<=block.end)){
    const countryCell=row.cells.find(cell=>column(cell.cell)==='A');
    if(Matrix.geography(countryCell?.v||'').countries.join()!==countries[0])continue;
    prices.push(...row.cells.filter(cell=>priceColumns.has(column(cell.cell))&&/^\d+(?:\.\d+)?$/.test(clean(cell.v))&&Number(cell.v)>0).map(cell=>cell.cell));
   }
   if(prices.length)blocks.push({start:block.header,end:block.end===Infinity?sheet.rows.at(-1).row:block.end,header:block.header,destinationCell:destination.cell,unitCell:block.columns[0].cell||header.cells.find(cell=>/KG|公斤/i.test(cell.v)).cell,priceCells:prices});
  }
  return blocks.length?{sheet:sheet.name,status:'quote',reason:'工作表明确国家，运输方式表头下有国家行与重量档报价',scannedRows:sheet.rows.length,blocks}:null;
 }

 const api={references,inspect};
 root.WorkbookReferenceContext=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:globalThis);
