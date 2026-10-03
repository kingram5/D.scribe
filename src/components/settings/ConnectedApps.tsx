"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

interface Grant {
  client: { id: string; name: string };
  scopes: string[];
  granted_at: string;
}

/**
 * Lists apps connected through D.scribe's OAuth server (e.g. ChatGPT) and lets
 * the user disconnect one. Revoking deletes that client's sessions and refresh
 * tokens, so the next ChatGPT call is rejected and must re-link.
 * Renders nothing when the OAuth server is not enabled or no app is connected.
 */
export function ConnectedApps({ cardStyle, h2Style, subStyle, buttonStyle }: {
  cardStyle: React.CSSProperties;
  h2Style: React.CSSProperties;
  subStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
}) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.oauth
      .listGrants()
      .then(({ data, error }) => setGrants(error || !data ? [] : (data as Grant[])))
      .catch(() => setGrants([]));
  }, []);

  async function disconnect(clientId: string, name: string) {
    setBusy(clientId);
    setMessage(null);
    const { error } = await createBrowserClient().auth.oauth.revokeGrant({ clientId });
    setBusy(null);
    if (error) {
      setMessage(`Could not disconnect ${name}. Try again.`);
      return;
    }
    setGrants((g) => (g ?? []).filter((x) => x.client.id !== clientId));
    setMessage(`${name} is disconnected. Projects it saved stay in your account.`);
  }

  if (!grants || (grants.length === 0 && !message)) return null;

  return (
    <div style={cardStyle}>
      <h2 style={h2Style}>Connected apps</h2>
      <p style={subStyle}>Apps you allowed to use your D.scribe account. Disconnecting stops access immediately; anything already saved stays.</p>
      {grants.map((g) => (
        <div key={g.client.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <span style={{ color: "#F9F7F2", fontSize: 14 }}>
            {g.client.name || "App"}{" "}
            <span style={{ color: "#A89F94", fontSize: 12.5 }}>since {new Date(g.granted_at).toLocaleDateString()}</span>
          </span>
          <button onClick={() => disconnect(g.client.id, g.client.name || "App")} disabled={busy === g.client.id} style={buttonStyle}>
            {busy === g.client.id ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ))}
      {message && (
        <p role="status" style={{ ...subStyle, marginBottom: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}
