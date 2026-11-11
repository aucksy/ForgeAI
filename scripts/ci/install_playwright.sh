#!/usr/bin/env bash
# Installs Playwright's Chromium for the admin-app checks (ci.yml "Panel crawl", qa-journeys.yml).
# Run from apps/dashboard (the folder whose node_modules holds Playwright).
#
# 11 Nov 2026 (CI 43039545112, three tries): inside GitHub's runner the Ubuntu mirror
# azure.archive.ubuntu.com would not resolve ("Temporary failure resolving"), so
# "playwright install --with-deps" could not fetch its fonts and failed the whole check, though
# every test had passed. GitHub's status page showed no outage. So, in order:
#   1. the normal install, with apt retrying each download 5 times;
#   2. the same with apt pointed at archive.ubuntu.com instead of the Azure mirror;
#   3. the browser alone (the runner image already carries Chrome's libraries), with a warning.
set -u

echo 'Acquire::Retries "5";' | sudo tee /etc/apt/apt.conf.d/80-retries >/dev/null

if npx playwright install --with-deps chromium; then
  exit 0
fi

echo "::warning::Playwright's system packages failed to install; trying archive.ubuntu.com instead of the Azure mirror"
for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [ -f "$f" ] && sudo sed -i 's#azure\.archive\.ubuntu\.com#archive.ubuntu.com#g' "$f"
done
sudo apt-get update -o Acquire::Retries=5 >/dev/null 2>&1 || true
if npx playwright install --with-deps chromium; then
  exit 0
fi

echo "::warning::Ubuntu's mirrors are unreachable; installing the browser without its system packages (the runner image has Chrome's libraries; a few extra fonts may be missing)"
npx playwright install chromium
