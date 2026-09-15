# HeyCatch quick wins (2026-09-10): create the nine per-item commits.
#
# BMO's sandbox session could not run `git add` / `git commit` (permission gate,
# non-interactive), so each item's file state was snapshotted under
# .heycatch/snapshots/item-N/ instead. This script replays them in order and
# commits one item at a time with the intended messages.
#
# Run from the worktree root (C:\Answer\worktrees\dscribe-heycatch) on branch
# marketing/heycatch-quick-wins. The working tree may already contain the final
# state of every file; that is fine, the script overwrites each file with the
# item's snapshot before committing, and the last snapshot IS the final state.
#
#   powershell -ExecutionPolicy Bypass -File .heycatch\commit-items.ps1
#
# Nothing is pushed. .heycatch/, WORK-ORDER.md and HEYCATCH-REPORT.md stay untracked.

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root ".heycatch\snapshots"))) { throw "Run this from the worktree root; .heycatch\snapshots not found." }

$branch = (git branch --show-current).Trim()
if ($branch -ne "marketing/heycatch-quick-wins") { throw "Expected branch marketing/heycatch-quick-wins, on '$branch'." }

$trailer = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"

$items = @(
  @{ n = 1; subject = "Item 1: hero h1 names the category and buyer, subhead matches the title";
     body = "HeyCatch quick win 1. 'There's an Author Inside You' becomes 'Turn Your Voice Into a Published Book.' with the subhead from the work order. The Playfair italic copper accent stays on 'Published Book.' Desktop-only line breaks keep the widest line clear of the centered tagline; below 1280px the headline wraps naturally and centered." },
  @{ n = 2; subject = "Item 2: /about founder page and homepage footer founder block";
     body = "HeyCatch quick win 2. New server-rendered /about (was bouncing to /login; now a public path, in robots allow and the sitemap). Compact founder block in the homepage footer links to it. Headshot and the 'why I built this' story are Kyle's to supply and render as obvious placeholders (FOUNDER.headshot and FOUNDER_STORY in src/lib/founder.ts). No copy in his voice. Server data reaches the client landing component through LandingDataProvider because Next type-checks page components against PageProps." },
  @{ n = 3; subject = "Item 3: hero stats bar shows a live Supabase count of books generated";
     body = "HeyCatch quick win 3. The 'Your voice' stat slot now shows a real number: projects (not erased) with at least one generated or edited chapter, counted server-side with an inner-join filter in src/lib/landing-data.ts and revalidated hourly. Under 100 books the slot reads 'First 100 / Join the first 100 authors using D.scribe'; at 100+ it shows the live count. Never hard-coded; a missing env or failed query yields null and the honest framing, so local builds still pass." },
  @{ n = 4; subject = "Item 4: label the spoken brainstorming mock in the Human + AI section";
     body = "HeyCatch quick win 4. The brainstorm chat mock now carries an eyebrow, the label 'Talk it out with your ghostwriter.' and the one-liner 'Spoken AI brainstorming sessions on Pro and Premium.'" },
  @{ n = 5; subject = "Item 5: pricing page anchor line and Stripe / Apple Pay trust marks";
     body = "HeyCatch quick win 5. Above the tier cards: 'Traditional ghostwriters charge `$30,000-`$80,000 and take 12-24 months. D.scribe starts at `$25/month and delivers your first draft in under an hour.' Below every tier CTA: 'Secure checkout by Stripe' with a lock icon and an Apple Pay mark." },
  @{ n = 6; subject = "Item 6: secondary hero CTA becomes a 'See how it works' outline link";
     body = "HeyCatch quick win 6. The 'Your Story Starts -> HERE' button duplicated the primary /login CTA. Replaced with a lower-contrast outline link that smooth-scrolls (or jumps, under reduced motion) to the seven-step section, which now has id=how-it-works. The Cormorant Garamond Google Fonts import only served that script line and is removed with it." },
  @{ n = 7; subject = "Item 7: og/twitter images, Product JSON-LD, descriptive dashboard aria-label";
     body = "HeyCatch quick win 7. Generated social cards via next/og for / and /pricing (opengraph-image.tsx + twitter-image.tsx, shared renderer in components/landing/og-card.tsx), summary_large_image Twitter cards, and the image routes added to the middleware public prefixes so crawlers are not redirected to /login. Pricing page gains Product JSON-LD with three Offers built from TIERS. The dashboard mockup swaps aria-hidden for role=img with a descriptive aria-label." },
  @{ n = 8; subject = "Item 8: three new FAQ items from one shared list, rendered and emitted as FAQPage JSON-LD";
     body = "HeyCatch quick win 8. FAQ items move to components/landing/faq.ts so the visible list and the FAQPage schema cannot drift. Adds: 'Will the manuscript sound like me or like AI?', 'Can it maintain consistency across a full 40,000-word book?', 'How much editing will I need to do?'. Copy checked against the D.scribe voice rules (no banned words, no exclamation marks, addresses speakers/pastors/coaches, never labels output AI-generated)." },
  @{ n = 9; subject = "Item 9: hero video preload=metadata; poster confirmed 1280x720 at 100 KB";
     body = "HeyCatch quick win 9. preload=auto became preload=metadata so the poster paints before the MP4 is fetched. Poster bg-video-poster.jpg measured 1280x720, 100,575 bytes (about 0.87 bits per pixel), already compressed; left as is." }
)

foreach ($item in $items) {
  $snap = Join-Path $root (".heycatch\snapshots\item-" + $item.n)
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
  if ($LASTEXITCODE -ne 0) { throw ("git add failed on item " + $item.n) }
  git commit -q -m $item.subject -m $item.body -m $trailer -- $paths
  if ($LASTEXITCODE -ne 0) { throw ("git commit failed on item " + $item.n) }
  $hash = (git rev-parse --short HEAD).Trim()
  Write-Output ("item " + $item.n + "  " + $hash + "  " + $item.subject)
}

Write-Output ""
Write-Output "Done. Now run: npx tsc --noEmit ; npm run build"
git status --short
