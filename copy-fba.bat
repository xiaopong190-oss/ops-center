@echo off
cd /d "%~dp0"
echo Copying FBA tools...
node "%~dp0copy-fba-tools.mjs"
if not %ERRORLEVEL%==0 (
  echo Failed. FBA pages may already exist in this folder.
  echo Manual copy:
  echo   d:\自改小工具\FBA工具\index.html -^> fba-profit-calculator.html
  echo   d:\自改小工具\FBA分仓工具\index.html -^> fba-warehouse-tool.html
  pause
  exit /b 1
)
echo Done: fba-profit-calculator.html, fba-warehouse-tool.html
pause
