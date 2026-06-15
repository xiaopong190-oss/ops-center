cd /d D:\Projects\ops-center
git status --short > _push-out.txt 2>&1
echo === log === >> _push-out.txt
git log -1 --oneline >> _push-out.txt 2>&1
echo === push === >> _push-out.txt
git push >> _push-out.txt 2>&1
echo exit=%ERRORLEVEL% >> _push-out.txt
