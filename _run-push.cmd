@echo off
cd /d "D:\Projects\ops-center"
echo START > _push-log.txt
git status -sb >> _push-log.txt 2>&1
node sync-browser.mjs >> _push-log.txt 2>&1
node deploy/build-browser-bundle.mjs >> _push-log.txt 2>&1
git fetch origin >> _push-log.txt 2>&1
if %ERRORLEVEL%==0 git reset --soft origin/main >> _push-log.txt 2>&1
git checkout origin/main -- amazon-news.json >> _push-log.txt 2>&1
git add src app.html deploy sync-browser.mjs fx-rates.json tools local-tools packages CHECK-VERSION.bat DEPLOY-NOW.bat DEPLOY-NOW.ps1 >> _push-log.txt 2>&1
git add -f app.bundle.js >> _push-log.txt 2>&1
for %%f in (*.bat) do git add "%%f" >> _push-log.txt 2>&1
git status -sb >> _push-log.txt 2>&1
git diff --cached --quiet
if errorlevel 1 git commit -m "fix: cloud-14 tab keep-alive — stop tasks/logistics/production auto collapse" >> _push-log.txt 2>&1
git push origin main >> _push-log.txt 2>&1
echo EXIT:%ERRORLEVEL% >> _push-log.txt
echo DONE >> _push-log.txt
