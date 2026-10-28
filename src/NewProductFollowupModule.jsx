import { useRef, useEffect, useState } from "react";
import { useGlobalConfig } from "./GlobalConfig.jsx";
import { useCurrentUser } from "./context/UserContext.jsx";
import { canCurrentUserEdit, userWantsAutoShare } from "./utils/storage.js";
import { useCloudSyncPage } from "./GlobalCloudSync.jsx";
import { NEW_PRODUCT_FOLLOWUP_HTML } from "./NewProductFollowupDocument.js";

export function NewProductFollowupPanel({ active }) {
  const frame = useRef(null);
  const [syncState,setSyncState] = useState({isDirty:false});
  const [uploadProgress,setUploadProgress] = useState(null);
  const { staff } = useGlobalConfig();
  const user = useCurrentUser();
  const context = {
    staff: staff.map(person => ({ name: person.name, role: person.role })),
    user: user ? { id: user.id, name: user.name, auth: user.auth || user.role } : null,
    canEdit: canCurrentUserEdit(user),
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
    ...syncState,label:'新品跟进',hideHint:false,
    isDirty:syncState.isDirty,
    barHint:syncState.saving&&uploadProgress?'正在上传 '+uploadProgress.completed+' / '+uploadProgress.total+' 份数据':syncState.barHint,
    save:async()=>{
      try{const save=frame.current?.contentWindow?.saveOpsFollowup;if(!save)throw Error('新品页面尚未就绪，请稍后重试');return await save();}
      finally{setUploadProgress(null);}
    },
    reload:()=>frame.current?.contentWindow?.reloadOpsFollowup?.(),
  });
  const publish = () => {
    const initialized = frame.current?.contentWindow?.setOpsFollowupContext?.(context);
    initialized?.catch?.(error => setSyncState(current => ({...current,error:error.message || '新品页面加载失败，请重试'})));
  };
  useEffect(publish, [JSON.stringify(context)]);
  return <section data-ops-workspace-frame style={{ height: "calc(100vh - 150px)", minHeight: 600, display: "flex", flexDirection: "column" }}>
    <iframe ref={frame} onLoad={publish} srcDoc={NEW_PRODUCT_FOLLOWUP_HTML.tracker} title="新品跟进" style={{ flex: 1, width: "100%", border: "1px solid var(--border)", borderRadius: 12, background: "white" }} />
  </section>;
}
