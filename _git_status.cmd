@echo off
cd /d D:\Projects\ops-center
echo === STATUS === > push_result.txt
git status >> push_result.txt 2>&1
echo === DIFF STAT === >> push_result.txt
git diff --stat >> push_result.txt 2>&1
echo === UNTRACKED === >> push_result.txt
git ls-files --others --exclude-standard >> push_result.txt 2>&1
echo === LOG === >> push_result.txt
git log -1 --oneline >> push_result.txt 2>&1
echo === REMOTE === >> push_result.txt
git remote -v >> push_result.txt 2>&1
