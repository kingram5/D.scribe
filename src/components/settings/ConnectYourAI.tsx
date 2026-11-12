"use client";

import { useEffect, useState } from "react";
import { AGENTS_MD_URL, CONNECT_PROMPTS, type ConnectPrompt } from "@/lib/chatgpt-app/connect-prompts";

/**
 * "Connect your AI": three prompts to paste into ChatGPT so it can save
 * material from a chat (or what it remembers about the author) into a book.
 *
 * Shown only while /agents.md answers 200, which is the same server switch as
 * /mcp (CHATGPT_APP_MCP). The flag is server-only, so the card asks the page
 * the prompts point at rather than adding a public twin of the flag: when the
 * page is off, no prompt here can lead to a dead link.
 */
export function ConnectYourAI({ cardStyle, h2Style, subStyle }: {
  cardStyle: React.CSSProperties;
  h2Style: React.CSSProperties;
  subStyle: React.CSSProperties;
}) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/agents.md", { method: "HEAD", cache: "no-store" })
      .then((r) => { if (!cancelled) setLive(r.ok); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!live) return null;

  return (
    <div style={cardStyle}>
      <h2 style={h2Style}>Connect your AI</h2>
      <p style={subStyle}>
        Let ChatGPT save material from your chats, or what it remembers about your life, into your book as source material.
        It only sends what you ask for, it costs no Ink, and it never changes anything already in D.scribe.
        Works with ChatGPT for now.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CONNECT_PROMPTS.map((p) => <PromptRow key={p.id} prompt={p} />)}
      </div>
      <p style={{ ...subStyle, marginTop: 14, marginBottom: 0 }}>
        What ChatGPT is told:{" "}
        <a href={AGENTS_MD_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#F0A878" }}>
          d-scribe.app/agents.md
        </a>
      </p>
    </div>
  );
}

function PromptRow({ prompt }: { prompt: ConnectPrompt }) {
  const [done, setDone] = useState(false);
  const labelId = `connect-ai-${prompt.id}`;
  return (
    <div style={{ border: "1px solid rgba(249,247,242,0.1)", borderRadius: 12, padding: "14px 16px", background: "rgba(249,247,242,0.03)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <span id={labelId} style={{ color: "#F9F7F2", fontSize: 14, fontWeight: 600 }}>{prompt.label}</span>
        <button
          type="button"
          aria-describedby={labelId}
          onClick={() => {
            navigator.clipboard?.writeText(prompt.text).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            }).catch(() => undefined);
          }}
          style={{ background: "rgba(193,122,71,0.15)", color: "#F0A878", border: "1px solid rgba(193,122,71,0.4)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", flexShrink: 0 }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <p style={{ color: "#C8C0B4", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 6px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{prompt.text}</p>
      <p style={{ color: "#A89F94", fontSize: 12.5, lineHeight: 1.5, margin: 0 }} aria-live="polite">{done ? "Copied. Paste it into ChatGPT." : prompt.hint}</p>
    </div>
  );
}
