@echo off
cd /d "%~dp0"
echo === git status ===
git status --short
echo.
echo === committing ===
git add sync-amazon-news.mjs amazon-news.json ^
  src/HomeModule.jsx src/HomeModule.browser.jsx ^
  serve-open.ps1 deploy/build-pages.mjs ^
  .github/workflows/sync-amazon-news.yml ^
  src/ToolsModule.jsx src/ToolsModule.browser.jsx
git commit -m "Add automated Amazon news and unit converter tool" -m "Sync Amazon news via RSS on build and scheduled workflow; expose on homepage and /api/amazon-news. Add mass/length unit converter in Tools."
if errorlevel 1 (
  echo commit failed or nothing to commit
  pause
  exit /b 1
)
echo === pushing ===
git push origin main
echo === done ===
git log -1 --oneline
pause
