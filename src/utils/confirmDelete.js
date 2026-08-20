export function opsConfirmFallback(message) {
  if (typeof window !== "undefined" && typeof window.__opsConfirm === "function") {
    return window.__opsConfirm(message);
  }
  return Promise.resolve(window.confirm(String(message || "确定？")));
}

export function confirmDeleteWarning(name, typeLabel) {
  return opsConfirmFallback(
    `确定删除${typeLabel}「${name}」吗？\n\n删除后无法恢复，全员列表里也会去掉。`
  );
}
