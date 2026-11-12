import Columns from '../tools/logistics-workspace/table-columns.js';
import {encodeIds} from '../cloud/query-index.mjs';
export function buildTableColumns(rows){
 const parts=[],fields={};
 for(const definition of Columns.definitions){
  fields[definition.id]={};
  for(const mode of definition.dynamic?['base','ranked']:['base']){
   const key=definition.id+'-'+mode,unique=new Map(),cells=rows.map(row=>Columns.cell(row,definition.id,mode==='ranked'));
   for(const cell of cells){const value=JSON.stringify(cell.value);if(!unique.has(value))unique.set(value,cell);}
   const values=[...unique.values()].sort((a,b)=>Columns.compare(a,b,definition.type)),ids=new Map(values.map((value,id)=>[JSON.stringify(value.value),id]));
   const rowValues=cells.map(cell=>ids.get(JSON.stringify(cell.value))),orders={};
   for(const direction of ['asc','desc'])orders[direction]=encodeIds(rows.map((_,id)=>id).sort((a,b)=>Columns.compare(cells[a],cells[b],definition.type,direction==='asc'?1:-1)||a-b));
   const pages=[];let entries=[],bytes=2,start=0;
   function flush(){if(!entries.length)return;const part='column-'+key+'-values-'+pages.length;pages.push({part,start,end:start+entries.length});parts.push({part,value:entries});start+=entries.length;entries=[];bytes=2;}
   for(const [id,cell] of values.entries()){const entry={value:id,label:cell.label},size=Buffer.byteLength(JSON.stringify(entry))+1;if(entries.length&&(bytes+size>24000||entries.length>=200))flush();entries.push(entry);bytes+=size;}
   flush();const part='column-'+key+'-index';parts.push({part,value:{schema:1,field:definition.id,type:definition.type,count:rows.length,valueCount:values.length,rowValues:encodeIds(rowValues),orders,pages}});fields[definition.id][mode]=part;
  }
  if(!definition.dynamic)fields[definition.id].ranked=fields[definition.id].base;
 }
 return {schema:1,fields,parts};
}
