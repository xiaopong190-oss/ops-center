configs.cost.push(['costMode','计算方式','select',['按单价计算','直接填写金额']],['unitPrice','产品单价（元 / 件）','number'],['quantity','数量（件）','number'],['freightMode','物流费口径','select',['单件物流费','整批物流费']],['freightFee','物流费（元）','number']);
const calculatedCostOpen=open;
open=function(kind,row){
 calculatedCostOpen(kind,row);if(kind!=='cost')return;
 const form=document.getElementById('record-form');
 const field=name=>form.querySelector('[name="'+name+'"]');
 field('costMode').value=typeof row?.body.unitPrice==='number'?'按单价计算':row?.body.costMode|| (row?'直接填写金额':'按单价计算');
 field('freightMode').value=row?.body.freightMode||'单件物流费';
 const output=document.createElement('div');output.id='cost-calculation';output.className='verification-note';output.setAttribute('aria-live','polite');form.querySelector('.form-footer').before(output);
 const recalculate=(event)=>{
  if(event?.target.name==='costMode'&&field('costMode').value==='直接填写金额')for(const key of ['unitPrice','quantity','freightFee'])field(key).value='';
  if(['unitPrice','quantity','freightFee'].includes(event?.target.name))field('costMode').value='按单价计算';
  const automatic=field('costMode').value==='按单价计算';
  for(const name of ['unitPrice','quantity','freightMode','freightFee']){field(name).closest('label').hidden=!automatic;field(name).required=automatic;field(name).closest('label').style.setProperty('display',automatic?'flex':'none','important');}
  field('actual').readOnly=automatic;
  field('actual').required=!automatic;
  field('actual').closest('label').querySelector('span').textContent=automatic?'头程合计（自动计算，元）':'成本金额（元）';
  if(!automatic){output.textContent='沿用直接填写的金额；旧记录不会自动重算。';return;}
  const input={costMode:field('costMode').value,freightMode:field('freightMode').value};
  for(const name of ['unitPrice','quantity','freightFee'])input[name]=field(name).value===''?null:Number(field(name).value);
  try{const result=calculateFollowupCost(input);field('actual').value=result.total.toFixed(2);output.textContent='货款 '+money(result.goods)+' ＋ 物流 '+money(result.shipping)+' ＝ 头程合计 '+money(result.total)+(input.freightMode==='单件物流费'?'；公式：（产品单价＋单件物流费）×数量':'；公式：产品单价×数量＋整批物流费');}
  catch(error){field('actual').value='';output.textContent=error.message;}
 };
 form.addEventListener('input',recalculate);form.addEventListener('change',recalculate);recalculate();
};
const calculatedCostRecord=record;
record=function(row){const html=calculatedCostRecord(row);if(row.kind!=='cost'||row.body.costMode!=='按单价计算')return html;const result=calculateFollowupCost(row.body);return html.replace('</article>','<p>单价 '+money(row.body.unitPrice)+' × '+esc(row.body.quantity)+'件；'+esc(row.body.freightMode)+' '+money(row.body.freightFee)+'<br>货款 '+money(result.goods)+' ＋ 物流 '+money(result.shipping)+' ＝ 头程合计 '+money(result.total)+'</p></article>');};
