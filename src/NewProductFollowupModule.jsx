import { useRef, useEffect } from "react";
import { useGlobalConfig } from "./GlobalConfig.jsx";
import { useCurrentUser } from "./context/UserContext.jsx";
import { canCurrentUserEdit } from "./utils/storage.js";
import { NEW_PRODUCT_FOLLOWUP_HTML } from "./NewProductFollowupDocument.js";

export function NewProductFollowupPanel({ active }) {
  const frame = useRef(null);
  const { staff } = useGlobalConfig();
  const user = useCurrentUser();
  const context = {
    staff: staff.map(person => ({ name: person.name, role: person.role })),
    user: user ? { id: user.id, name: user.name, auth: user.auth || user.role } : null,
    canEdit: canCurrentUserEdit(user),
    requireCloud: true,
    active,
    cloudRequest: window.OpsCloud?.request,
  };
  const publish = () => frame.current?.contentWindow?.setOpsFollowupContext?.(context);
  useEffect(publish, [JSON.stringify(context), active]);
  return <section style={{ height: "calc(100vh - 150px)", minHeight: 600, display: "flex", flexDirection: "column" }}>
    <div style={{ fontSize: 12, color: "var(--tm)", padding: "0 0 10px" }}>新品跟进 v0.5.0 · 共用运营中心人员 · 保存成功后自动共享，请定期导出备份</div>
    <iframe ref={frame} onLoad={publish} srcDoc={NEW_PRODUCT_FOLLOWUP_HTML} title="新品跟进" style={{ flex: 1, width: "100%", border: "1px solid var(--border)", borderRadius: 12, background: "white" }} />
  </section>;
}





