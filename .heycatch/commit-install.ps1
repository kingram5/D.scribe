# HeyCatch SDK install (2026-09-10): create the four commits.
#
# BMO's sandbox session could not reach the network (npm registry, heycatch.ai),
# could not run node/npm/npx, and could not `git add` / `git commit`. The code
# changes are in the working tree; each intended commit's files are snapshotted
# under .heycatch/snapshots/install-N/. This script:
#   1. resolves the `latest` dist-tag of @heycatch/sdk, refuses any -dev/-beta/-rc
#      build, installs it, and commits package.json + lockfiles;
#   2..4. replays the snapshots and commits them in order.
#
# Run from the worktree root (C:\Answer\worktrees\dscribe-heycatch) on branch
# marketing/heycatch-quick-wins:
#
#   powershell -ExecutionPolicy Bypass -File .heycatch\commit-install.ps1
#
# Nothing is pushed. .heycatch/, WORK-ORDER*.md and HEYCATCH-*REPORT.md stay untracked.

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root ".heycatch\snapshots\install-2"))) { throw "Run this from the worktree root; .heycatch\snapshots\install-2 not found." }

$branch = (git branch --show-current).Trim()
if ($branch -ne "marketing/heycatch-quick-wins") { throw "Expected branch marketing/heycatch-quick-wins, on '$branch'." }

$trailer = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"

# ---- Commit 1: the dependency -------------------------------------------------
$ver = (npm view @heycatch/sdk version).Trim()
if ($LASTEXITCODE -ne 0 -or -not $ver) { throw "npm view @heycatch/sdk version failed." }
if ($ver -notmatch '^\d+\.\d+\.\d+$') {
  throw "Refusing to install '$ver': the latest dist-tag must be a plain x.y.z. A -dev.N build sends every event to a non-production backend."
}
Write-Output ("@heycatch/sdk latest = " + $ver)

npm install ("@heycatch/sdk@" + $ver)
if ($LASTEXITCODE -ne 0) { throw "npm install @heycatch/sdk@$ver failed." }

$installed = (Get-Content (Join-Path $root "node_modules\@heycatch\sdk\package.json") -Raw | ConvertFrom-Json).version
if ($installed -ne $ver) { throw "Installed version '$installed' does not match resolved latest '$ver'." }

$depPaths = @("package.json", "package-lock.json")
$bun = Get-Command bun -ErrorAction SilentlyContinue
if ($bun) {
  # CI installs with `bun install --frozen-lockfile`, so bun.lock must carry the new dependency too.
  bun install
  if ($LASTEXITCODE -ne 0) { throw "bun install failed (bun.lock not refreshed)." }
  $depPaths += "bun.lock"
} else {
  Write-Warning "bun is not on PATH: bun.lock was NOT refreshed. CI (bun install --frozen-lockfile) will fail until you run `bun install` and commit bun.lock."
}

git add -- $depPaths
if ($LASTEXITCODE -ne 0) { throw "git add failed on commit 1" }
git commit -q -m ("HeyCatch: add @heycatch/sdk " + $ver) -m ("Latest dist-tag resolved with 'npm view @heycatch/sdk version' at commit time; the replay script refuses -dev/-beta/-rc builds. Regular dependency, caret range like the rest of package.json.") -m $trailer -- $depPaths
if ($LASTEXITCODE -ne 0) { throw "git commit failed on commit 1" }
Write-Output ("commit 1  " + (git rev-parse --short HEAD).Trim() + "  HeyCatch: add @heycatch/sdk " + $ver)

# ---- Commits 2-4: replay the snapshots ----------------------------------------
$steps = @(
  @{ n = 2; subject = "HeyCatch: init the SDK in the client entry and allow in.heycatch.ai in the CSP";
     body = "init runs once at module scope in instrumentation-client.ts, next to Sentry.init (the repo's existing client entry). Static import, no window guard, no once-flag, project key inlined as a literal, no apiHost, install metadata {framework: nextjs, frameworkVersion: 15, agent: claude-code}. next.config.ts adds https://in.heycatch.ai to script-src and connect-src of the Content-Security-Policy-Report-Only header (the only CSP in force; it reports, it does not block)." },
  @{ n = 3; subject = "HeyCatch: identity, signup_completed and subscription_started events";
     body = "src/lib/heycatch.ts wraps every SDK call after init. useAuth (the one place the client sees a Supabase session) calls setIdentity(user.id, {email, name}) when a session is detected, fires signup_completed once at the first confirmed session (last_sign_in_at within 5 minutes of created_at, deduped per user id in localStorage) and resetIdentity() on SIGNED_OUT and in signOut(). subscription_started with the plan is emitted client-side by CheckoutOutcome (mounted in the (main) layout) when Stripe Checkout returns to /dashboard?upgraded=true&plan=<tier>; the checkout route's success_url now carries the tier. Webhook, Ink ledger and PUBLIC_SIGNUP untouched." },
  @{ n = 4; subject = "HeyCatch: short-link redirect /:l -> /?utm_source=heycatch&utm_campaign=:l";
     body = "Rule verbatim from https://heycatch.ai/agents.md in next.config.ts redirects(). Redirects resolve before middleware, so /x never reaches the auth gate. permanent: false yields a 307 in Next.js; swap to statusCode: 302 if a literal 302 is required." }
)

foreach ($step in $steps) {
  $snap = Join-Path $root (".heycatch\snapshots\install-" + $step.n)
  $files = Get-ChildItem -Path $snap -Recurse -File
  $paths = @()
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($snap.Length + 1)
    $dest = Join-Path $root $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    Copy-Item -Path $f.FullName -Destination $dest -Force
    $paths += $rel
  }
  git add -- $paths
  if ($LASTEXITCODE -ne 0) { throw ("git add failed on commit " + $step.n) }
  git commit -q -m $step.subject -m $step.body -m $trailer -- $paths
  if ($LASTEXITCODE -ne 0) { throw ("git commit failed on commit " + $step.n) }
  Write-Output ("commit " + $step.n + "  " + (git rev-parse --short HEAD).Trim() + "  " + $step.subject)
}

Write-Output ""
Write-Output "Done. Now verify for real (work order step 5):"
Write-Output "  npx tsc --noEmit ; echo tsc=$LASTEXITCODE"
Write-Output "  npm run build   ; echo build=$LASTEXITCODE"
Write-Output "  npm run dev  -> open http://localhost:3000 in Chrome, click around, read the [HeyCatch] console line"
Write-Output "  curl -sI http://localhost:3000/x | findstr /i 'HTTP location'"
git status --short
