// Shared deterministic cost calculation for the form, save path, and cloud validation.
export function calculateFollowupCost(body) {
  const hasInputs = ['unitPrice','quantity','freightFee'].some(key=>typeof body[key]==='number');
  if (body.costMode !== '按单价计算' && !hasInputs) return null;
  const cents = (value,label) => {
    if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('请填写有效的'+label);
    const result=Math.round(value*100);
    if(!Number.isSafeInteger(result)||Math.abs(value*100-result)>0.00001)throw Error(label+'最多保留两位小数');
    return result;
  };
  if(!Number.isSafeInteger(body.quantity)||body.quantity<=0)throw Error('数量需为大于0的整数');
  const unit=cents(body.unitPrice,'产品单价'),freight=cents(body.freightFee,'物流费');
  if(!['单件物流费','整批物流费'].includes(body.freightMode))throw Error('请选择物流费口径');
  const goods=unit*body.quantity,shipping=body.freightMode==='单件物流费'?freight*body.quantity:freight;
  const total=goods+shipping;
  if(!Number.isSafeInteger(goods)||!Number.isSafeInteger(shipping)||!Number.isSafeInteger(total))throw Error('成本金额过大');
  return {goods:goods/100,shipping:shipping/100,total:total/100};
}
