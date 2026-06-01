# C 盘垃圾清理（Ops Center 本机工具）

位于 `local-tools/disk-cleaner/`，通过运营中心「工具 → C 盘垃圾清理」访问。

## 本机使用

双击 `一键清理.bat`，或在 PowerShell 中：

```powershell
cd D:\Projects\ops-center\local-tools\disk-cleaner
.\Start-Cleanup.ps1
```

## 云端分发

员工从门户下载 `packages/disk-cleaner-win.zip`，解压后双击 `run-cleanup.bat`（或「一键清理.bat」）。

## 保护目录

永不删除：Tencent（QQ/微信）、百度网盘、WPS Office、Cursor、飞书、剪映。
