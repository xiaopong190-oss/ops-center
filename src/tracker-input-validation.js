// Validate before the workbench's optimistic UI and durable draft handlers run.
export function validateTrackerControl(control){
  const key=control.dataset.f||control.dataset.sp||control.dataset.field||control.name||'';
  if(key.split('.').some(part=>['__proto__','prototype','constructor'].includes(part)))return '无效字段';
  if((control.dataset.f||control.dataset.sp)&&!control.id.endsWith('-'+key.replace(/\./g,'-')))return '字段与输入框不一致，请刷新页面';
  if(control.dataset.pf&&!['to','sessions','units','sales','adSpend','adSales','adOrders','returns'].includes(key))return '无效经营数据字段';
  const value=control.type==='checkbox'?control.checked:control.value;
  if(typeof value==='string'&&value.length>20000)return '单个输入最多 20000 个字符，请拆分记录';
  if(control.required&&typeof value==='string'&&!value.trim())return '请填写必填项';
  if(control.matches('select')&&![...control.options].some(option=>option.value===value))return '请选择有效选项';
  if((control.type==='date'||/^(from|to|shipDate|launchDate|etaPlanned|etaLatest|date)$/.test(key)||/\.(date|dues\.(copy|image|video))$/.test(key))&&value){
    const date=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return '请输入有效日期';
  }
  if(control.hasAttribute('data-front')&&value.trim()){
    try{
      if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&!/^https?:\/\//i.test(value))return '前台链接仅支持 http 或 https';
      const url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
      if(!url.hostname||url.username||url.password)return '请输入有效的前台链接';
    }catch{return '请输入有效的前台链接';}
  }
  if(key.startsWith('econ.'))return ''; // Unit economics has its own stricter rules.
  if(control.type==='number'||control.dataset.kind==='num'||(control.dataset.pf&&key!=='to')||/^(qty|headFreight|sessions|units|sales|adSpend|adSales|adOrders|returns)$/.test(key)){
    if(value==='')return control.validity.badInput?'请输入有效数字':'';
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return '请输入大于或等于 0 的有限数字';
    if(n>1e12)return '数值超过上限 1000000000000';
    if(key==='reviews.rating'&&n>5)return '评分须在 0 至 5 之间';
    const leaf=key.split('.').at(-1);
    const count=/^(qty|sessions|units|adOrders|returns|count|target|vineSent|vineReviewed|rar|orders7d)$/.test(leaf)||key.startsWith('reviews.dist.');
    if(count&&(!Number.isSafeInteger(n)||n>1e9))return '数量须为 0 至 1000000000 的整数';
  }
  return '';
}
