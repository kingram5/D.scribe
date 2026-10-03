"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

/**
 * OAuth consent screen for Supabase Auth's OAuth 2.1 server. Supabase sends the
 * browser here with ?authorization_id=... when ChatGPT (or another approved
 * client) asks to connect a D.scribe account. Middleware already requires a
 * signed-in, confirmed, allow-listed user before this page renders, and keeps
 * the authorization_id through the login round trip.
 *
 * Configure in Supabase: Authentication > OAuth Server > Authorization path =
 * /oauth/consent (see docs/chatgpt-app/deployment.md).
 */

interface Details {
  authorization_id: string;
  redirect_uri: string;
  scope: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
}

const SCOPE_TEXT: Record<string, string> = {
  openid: "Confirm who you are",
  email: "See your account email",
  profile: "See your basic profile",
};

function ConsentContent() {
  const params = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [details, setDetails] = useState<Details | null>(null);
  const [fetchError, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const error = authorizationId
    ? fetchError
    : "This link is missing its authorization request. Start the connection again from ChatGPT.";

  useEffect(() => {
    if (!authorizationId) return;
    const supabase = createBrowserClient();
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: err }) => {
      if (err || !data) {
        setError("This connection request expired or is no longer valid. Start it again from ChatGPT.");
        return;
      }
      if ("redirect_url" in data) {
        // Already approved earlier for these scopes: continue straight back.
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data as Details);
    });
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!authorizationId || busy) return;
    setBusy(true);
    const supabase = createBrowserClient();
    const res = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (res.error || !res.data?.redirect_url) {
      setBusy(false);
      setError("Something went wrong. Nothing was connected. Try again from ChatGPT.");
      return;
    }
    window.location.assign(res.data.redirect_url);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg, #fffdf9)" }}>
      <section className="w-full max-w-md rounded-2xl border p-6" style={{ borderColor: "rgba(0,0,0,0.1)" }} aria-labelledby="consent-title">
        {error ? (
          <>
            <h1 id="consent-title" className="text-xl font-semibold mb-2">Connection not available</h1>
            <p>{error}</p>
          </>
        ) : !details ? (
          <p role="status">Loading the connection request...</p>
        ) : (
          <>
            <h1 id="consent-title" className="text-xl font-semibold mb-1">
              Connect {details.client.name || "this app"} to D.scribe?
            </h1>
            <p className="text-sm opacity-75 mb-4">Signed in as {details.user.email}</p>
            <p className="mb-2">It will be able to:</p>
            <ul className="list-disc pl-5 mb-3">
              {details.scope
                .split(/\s+/)
                .filter(Boolean)
                .map((s) => (
                  <li key={s}>{SCOPE_TEXT[s] ?? s}</li>
                ))}
              <li>Save book plans you approve as new D.scribe projects</li>
              <li>List your projects and show their outlines and progress</li>
            </ul>
            <p className="text-sm opacity-75 mb-5">
              It cannot delete or overwrite your projects, change your plan, or spend Ink unless you ask D.scribe to build a plan for you.
              You can disconnect anytime in Settings.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 rounded-xl px-4 py-2 font-semibold text-white"
                style={{ background: "#b4542b" }}
              >
                Connect
              </button>
              <button type="button" onClick={() => decide(false)} disabled={busy} className="flex-1 rounded-xl border px-4 py-2 font-semibold">
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<p role="status">Loading...</p>}>
      <ConsentContent />
    </Suspense>
  );
}
