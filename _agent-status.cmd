@echo off
cd /d "D:\Projects\ops-center"
echo === GIT STATUS === > _agent-status.txt
git status -sb >> _agent-status.txt 2>&1
echo. >> _agent-status.txt
echo === RECENT LOG === >> _agent-status.txt
git log -3 --oneline >> _agent-status.txt 2>&1
echo. >> _agent-status.txt
echo === REMOTE === >> _agent-status.txt
git remote -v >> _agent-status.txt 2>&1
echo. >> _agent-status.txt
echo === BUNDLE CHECK === >> _agent-status.txt
findstr /c:"cloud-14" /c:"configVersion" app.bundle.js >> _agent-status.txt 2>&1
echo DONE >> _agent-status.txt
