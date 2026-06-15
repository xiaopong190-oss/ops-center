@echo off
cd /d D:\Projects\ops-center
(
  echo === status before ===
  git status --short
  echo === diff ===
  git diff --stat tools/fba-hanhai-converter/
  echo === pull rebase ===
  git pull --rebase origin main
  echo === add ===
  git add tools/fba-hanhai-converter/
  echo === commit ===
  git commit -m "FBA Hanhai converter: embed 100x100 product images, fix hyperlink import, auto-save on ZIP import"
  echo === push ===
  git push origin main
  echo === status after ===
  git status --short
  git log -1 --oneline
  echo exit=%ERRORLEVEL%
) > _push-out.txt 2>&1
type _push-out.txt
