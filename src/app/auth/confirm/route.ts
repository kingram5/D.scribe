import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";
import {
  safeNextPath,
  safeVercelShareToken,
  urlOnRequestHost,
} from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email" | null;
  const next = safeNextPath(searchParams.get("next"));
  const vercelShare = safeVercelShareToken(searchParams.get("_vercel_share"));

  if (token_hash && type) {
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
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isAllowedEmail(user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(urlOnRequestHost(request, "/unauthorized", vercelShare));
      }
      return NextResponse.redirect(urlOnRequestHost(request, next, vercelShare));
    }
  }

  const loginUrl = urlOnRequestHost(request, "/login", vercelShare);
  loginUrl.searchParams.set("error", "auth");
  loginUrl.searchParams.set("message", "Email confirmation failed. Please try again.");

  // No token_hash: the email used Supabase's default {{ .ConfirmationURL }}, which
  // verifies at Supabase and returns here with the session in the URL hash. The
  // server can't read a hash, so serve a tiny page that posts it to
  // /api/auth/hash-session. A template we forget to customize still signs in.
  if (!token_hash) {
    return new NextResponse(hashFallbackPage(next, loginUrl.pathname + loginUrl.search), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return NextResponse.redirect(loginUrl);
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
