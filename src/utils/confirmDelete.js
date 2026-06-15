export function confirmDeleteWarning(name, typeLabel) {
  return window.confirm(
    `⚠️ 警告\n\n确定删除${typeLabel}「${name}」吗？\n\n删除后无法恢复，链接与配置将从本机浏览器中永久移除。`
  );
}
