import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";
import {
  requestOrigin,
  safeNextPath,
  safeVercelShareToken,
  urlOnRequestHost,
} from "@/lib/auth-redirect";

// Email sign-in lands here. Work-email security (Microsoft Safe Links, other
// link scanners) opens every link in a message before, or a second before, the
// person does. A one-time token spent on a plain GET is gone by the time the
// human clicks: they see "sign-in failed" (Kyle's Greentech address, 2026-11-25).
//
// So a GET never spends the token. It renders a page with one button; only the
// button's POST calls verifyOtp. Scanners fetch pages, they don't press buttons.
// Supabase documents this as the fix for email prefetching ("Option 2").

const VERIFY_TYPES = new Set(["signup", "email", "magiclink"]);
type VerifyType = "signup" | "email" | "magiclink";

const EXPIRED_MESSAGE =
  "That sign-in link has expired or was already used. Send yourself a new one below.";

function verifyType(value: string | null): VerifyType | null {
  return value && VERIFY_TYPES.has(value) ? (value as VerifyType) : null;
}

// The email template passes the original emailRedirectTo as `redirect_to`
// (`/auth/confirm?next=...`). Only its same-site `next` path and preview share
// token are used; its host is never followed.
function nextFromRedirectTo(value: string | null): { next: string | null; share: string | null } {
  if (!value) return { next: null, share: null };
  try {
    const url = new URL(value);
    return {
      next: url.searchParams.get("next"),
      share: url.searchParams.get("_vercel_share"),
    };
  } catch {
    return { next: null, share: null };
  }
}

function loginErrorUrl(request: NextRequest, vercelShare: string | null): URL {
  const loginUrl = urlOnRequestHost(request, "/login", vercelShare);
  loginUrl.searchParams.set("error", "auth");
  loginUrl.searchParams.set("message", EXPIRED_MESSAGE);
  return loginUrl;
}

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = verifyType(searchParams.get("type"));
  const fromRedirect = nextFromRedirectTo(searchParams.get("redirect_to"));
  const next = safeNextPath(searchParams.get("next") ?? fromRedirect.next);
  const vercelShare = safeVercelShareToken(
    searchParams.get("_vercel_share") ?? fromRedirect.share
  );

  // No token_hash: an older email that used Supabase's default
  // {{ .ConfirmationURL }}. Those verify at Supabase and return here with the
  // session in the URL hash, which the server can't read, so a tiny page posts
  // the hash to /api/auth/hash-session.
  if (!token_hash) {
    const failUrl = loginErrorUrl(request, vercelShare);
    return new NextResponse(hashFallbackPage(next, failUrl.pathname + failUrl.search), {
      headers: PAGE_HEADERS,
    });
  }

  if (!type || token_hash.length > 512) {
    return NextResponse.redirect(loginErrorUrl(request, vercelShare));
  }

  return new NextResponse(confirmPage({ token_hash, type, next, vercelShare }), {
    headers: PAGE_HEADERS,
  });
}

// Login-CSRF guard: the POST must come from our own page. Browsers send Origin
// on form posts; Sec-Fetch-Site covers the rare one that doesn't.
function isSameOriginPost(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin === requestOrigin(request);
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return true;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(loginErrorUrl(request, null), 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : null;
  };
  const token_hash = field("token_hash");
  const type = verifyType(field("type"));
  const next = safeNextPath(field("next"));
  const vercelShare = safeVercelShareToken(field("_vercel_share"));

  if (!isSameOriginPost(request) || !token_hash || !type || token_hash.length > 512) {
    return NextResponse.redirect(loginErrorUrl(request, vercelShare), 303);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    return NextResponse.redirect(loginErrorUrl(request, vercelShare), 303);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(urlOnRequestHost(request, "/unauthorized", vercelShare), 303);
  }
  return NextResponse.redirect(urlOnRequestHost(request, next, vercelShare), 303);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function confirmPage(p: {
  token_hash: string;
  type: VerifyType;
  next: string;
  vercelShare: string | null;
}): string {
  const share = p.vercelShare
    ? `<input type="hidden" name="_vercel_share" value="${escapeAttr(p.vercelShare)}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in to D.Scribe</title></head>
<body style="background:#0f0d0b;color:#e8e0d4;font-family:Georgia,'Times New Roman',serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box">
<main style="max-width:420px;width:100%;text-align:center">
<p style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#C17A47;margin:0 0 18px">D.Scribe</p>
<h1 style="font-weight:400;font-size:30px;line-height:1.2;margin:0 0 12px">You're one tap away.</h1>
<p style="font-size:17px;line-height:1.5;color:#b8ad9e;margin:0 0 32px">Tap the button to finish signing in.</p>
<form method="post" action="/auth/confirm">
<input type="hidden" name="token_hash" value="${escapeAttr(p.token_hash)}">
<input type="hidden" name="type" value="${escapeAttr(p.type)}">
<input type="hidden" name="next" value="${escapeAttr(p.next)}">
${share}
<button type="submit" style="display:block;width:100%;background:#C17A47;color:#0f0d0b;border:0;border-radius:999px;padding:16px 24px;font:600 17px/1 system-ui,-apple-system,'Segoe UI',sans-serif;cursor:pointer">Continue to D.Scribe</button>
</form>
<p style="font-size:13px;line-height:1.5;color:#7d7368;margin:28px 0 0">This link works once. If it says it expired, send yourself a new one from the sign-in page.</p>
</main></body></html>`;
}

function hashFallbackPage(next: string, failUrl: string): string {
  // Escape "<" so nothing in the values can close the script tag.
  const data = JSON.stringify({ next, failUrl }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signing you in…</title></head>
<body style="background:#0f0d0b;color:#e8e0d4;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><p>Signing you in…</p>
<script>
(function () {
  var d = ${data};
  var h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  var at = h.get("access_token"), rt = h.get("refresh_token");
  if (!at || !rt) { location.replace(d.failUrl); return; }
  fetch("/api/auth/hash-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ access_token: at, refresh_token: rt, next: d.next })
  }).then(function (r) { return r.json(); })
    .then(function (j) { location.replace(j && j.redirect ? j.redirect : d.failUrl); })
    .catch(function () { location.replace(d.failUrl); });
})();
</script></body></html>`;
}
