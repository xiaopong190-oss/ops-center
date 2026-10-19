import { useRef, useEffect, useState } from "react";
import { useGlobalConfig } from "./GlobalConfig.jsx";
import { useCurrentUser } from "./context/UserContext.jsx";
import { canCurrentUserEdit, userWantsAutoShare } from "./utils/storage.js";
import { useCloudSyncPage } from "./GlobalCloudSync.jsx";
import { NEW_PRODUCT_FOLLOWUP_HTML } from "./NewProductFollowupDocument.js";

export function NewProductFollowupPanel({ active }) {
  const frame = useRef(null);
  const [legacy,setLegacy] = useState(false);
  const [syncState,setSyncState] = useState({isDirty:false});
  const [uploadProgress,setUploadProgress] = useState(null);
  const { staff } = useGlobalConfig();
  const user = useCurrentUser();
  const context = {
    staff: staff.map(person => ({ name: person.name, role: person.role })),
    user: user ? { id: user.id, name: user.name, auth: user.auth || user.role } : null,
    canEdit: !legacy && canCurrentUserEdit(user),
    requireCloud: true,
    active,
    cloudRequest: window.OpsCloud?.request,
    autoShare:userWantsAutoShare(user),
    onSyncState:setSyncState,
  };
  useEffect(()=>{
    const update=event=>setUploadProgress(event.detail);
    window.addEventListener('ops-followup-upload-progress',update);
    return()=>window.removeEventListener('ops-followup-upload-progress',update);
  },[]);
  useCloudSyncPage(active,{
    ...syncState,label:'新品跟进',hideHint:true,
    isDirty:!legacy&&syncState.isDirty,
    barHint:legacy?'原版记录为只读；返回新品大屏可继续编辑和上传':syncState.saving&&uploadProgress?'正在上传 '+uploadProgress.completed+' / '+uploadProgress.total+' 份数据':syncState.barHint,
    save:async()=>{
      if(legacy)return '原版只读，请返回新品大屏上传';
      try{return await frame.current?.contentWindow?.saveOpsFollowup?.();}
      finally{setUploadProgress(null);}
    },
    reload:options=>legacy?frame.current?.contentWindow?.setOpsFollowupContext?.(context):frame.current?.contentWindow?.reloadOpsFollowup?.(options),
  });
  const publish = () => {
    const initialized = frame.current?.contentWindow?.setOpsFollowupContext?.(context);
    initialized?.catch?.(error => setSyncState(current => ({...current,error:error.message || '新品页面加载失败，请重试'})));
  };
  useEffect(publish, [JSON.stringify(context), active]);
  return <section style={{ height: "calc(100vh - 150px)", minHeight: 600, display: "flex", flexDirection: "column" }}>
    <div hidden style={{ display:"none", fontSize: 12, color: "var(--tm)", padding: "0 0 10px" }}>新品跟踪大屏 · 沿用共享库 · 原版记录保留 <button onClick={() => setLegacy(!legacy)} style={{marginLeft:12}}>{legacy ? "返回新品大屏" : "原版记录（只读）"}</button>{syncState.saving&&uploadProgress&&<span style={{marginLeft:12}}>上传进度 {uploadProgress.completed} / {uploadProgress.total}</span>}</div>
    <iframe ref={frame} onLoad={publish} key={legacy ? "legacy" : "tracker"} srcDoc={legacy ? NEW_PRODUCT_FOLLOWUP_HTML.legacy : NEW_PRODUCT_FOLLOWUP_HTML.tracker} title="新品跟进" style={{ flex: 1, width: "100%", border: "1px solid var(--border)", borderRadius: 12, background: "white" }} />
  </section>;
}








