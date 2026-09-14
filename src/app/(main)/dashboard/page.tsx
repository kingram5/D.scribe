"use client";

import { useEffect, useState } from "react";
import { Project } from "@/types";
import PageShell from "@/components/ui/PageShell";
import UsageWidget from "@/components/ui/UsageWidget";
import Bookshelf, { type ShelfBook, type ShelfFilter } from "@/components/dashboard/Bookshelf";
import Wordmark from "@/components/dashboard/Wordmark";
import { useAuth } from "@/hooks/useAuth";

// ── Rotating quotes ────────────────────────────────────────────────────────
const WORKSPACE_QUOTES: { text: string; author: string }[] = [
  { text: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", author: "Colossians 3:23" },
  { text: "Commit to the Lord whatever you do, and he will establish your plans.", author: "Proverbs 16:3" },
  { text: "Then the Lord replied: ‘Write down the revelation and make it plain on tablets so that a herald may run with it.’", author: "Habakkuk 2:2" },
  { text: "Do not despise these small beginnings, for the Lord rejoices to see the work begin.", author: "Zechariah 4:10" },
  { text: "My mouth shall speak wisdom; the meditation of my heart shall give understanding.", author: "Psalm 49:3" },
  { text: "Start writing, no matter what. The water does not flow until the faucet is turned on.", author: "Louis L’Amour" },
  { text: "There is no greater agony than bearing an untold story inside you.", author: "Maya Angelou" },
  { text: "Creativity takes courage.", author: "Henri Matisse" },
  { text: "A professional writer is an amateur who didn’t quit.", author: "Richard Bach" },
  { text: "Write what should not be forgotten.", author: "Isabel Allende" },
  { text: "We are all apprentices in a craft where no one ever becomes a master.", author: "Ernest Hemingway" },
  { text: "Let the favor of the Lord our God be upon us, and establish the work of our hands upon us; yes, establish the work of our hands!", author: "Psalm 90:17" },
  { text: "You can always edit a bad page. You can’t edit a blank page.", author: "Jodi Picoult" },
  { text: "The scariest moment is always just before you start.", author: "Stephen King" },
  { text: "Faith is taking the first step even when you don’t see the whole staircase.", author: "Martin Luther King Jr." },
  { text: "Speak your mind, even if your voice shakes.", author: "Maggie Kuhn" },
  { text: "Your voice matters. Your story matters. Tell it.", author: "Unknown" },
  { text: "The Lord is my strength and my shield; my heart trusts in him, and he helps me.", author: "Psalm 28:7" },
  { text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.", author: "Joshua 1:9" },
  { text: "Every great story starts with someone who decided to write it down.", author: "Unknown" },
  { text: "The first draft is just you telling yourself the story.", author: "Terry Pratchett" },
  { text: "I can do all things through Christ who strengthens me.", author: "Philippians 4:13" },
  { text: "Don’t tell me the moon is shining; show me the glint of light on broken glass.", author: "Anton Chekhov" },
  { text: "Words are, in my not-so-humble opinion, our most inexhaustible source of magic.", author: "J.K. Rowling" },
  { text: "The Lord is my light and my salvation; whom shall I fear?", author: "Psalm 27:1" },
  { text: "Almost all good writing begins with terrible first efforts. You need to start somewhere.", author: "Anne Lamott" },
  { text: "If there’s a book you want to read, but it hasn’t been written yet, then you must write it.", author: "Toni Morrison" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", author: "Proverbs 3:5" },
  { text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.", author: "Stephen King" },
  { text: "We write to taste life twice, in the moment and in retrospect.", author: "Anaïs Nin" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [quoteIdx] = useState(() => Math.floor(Math.random() * WORKSPACE_QUOTES.length));
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [erasingId, setErasingId] = useState<string | null>(null);
  const [confirmEraseProject, setConfirmEraseProject] = useState<Project | null>(null);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeProjects = projects.filter((p) => p.status !== "erased");
  const filtered = filter === "all"
    ? activeProjects
    : projects.filter((p) => p.status === filter);

  const counts = {
    all: activeProjects.length,
    draft: projects.filter((p) => p.status === "draft").length,
    in_progress: projects.filter((p) => p.status === "in_progress").length,
    complete: projects.filter((p) => p.status === "complete").length,
    erased: projects.filter((p) => p.status === "erased").length,
  };

  const books: ShelfBook[] = filtered.map((p) => ({
    id: p.id,
    title: p.title,
    audience: p.audience,
    status: p.status,
    updated_at: p.updated_at,
    href: `/project/${p.id}`,
  }));

  async function eraseProject(projectId: string) {
    setErasingId(projectId);
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "erased" }),
    });
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, status: "erased" as const } : p));
    setErasingId(null);
    setEraseMode(false);
  }

  return (
    <PageShell>
      <Bookshelf
        ownerName={firstName}
        books={books}
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        eraseMode={eraseMode}
        onToggleErase={() => setEraseMode((v) => !v)}
        onEraseClick={(book) => {
          const p = projects.find((x) => x.id === book.id);
          if (p) setConfirmEraseProject(p);
        }}
        erasingId={erasingId}
        loading={loading}
        quote={WORKSPACE_QUOTES[quoteIdx]}
        brand={<Wordmark variant="underline" />}
        aside={<UsageWidget />}
      />

      {/* Erase confirmation modal */}
      {confirmEraseProject && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: "var(--z-modal)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
          onClick={() => setConfirmEraseProject(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmEraseProject(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="erase-project-title"
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "32px 28px",
              maxWidth: 380,
              width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden="true">⌫</div>
            <h2 id="erase-project-title" style={{ fontSize: 18, fontWeight: 700, color: "#2C2419", marginBottom: 8 }}>
              Erase this project?
            </h2>
            <p style={{ fontSize: 14, color: "#7A7358", lineHeight: 1.6, marginBottom: 24 }}>
              Are you sure you want to erase <strong>&ldquo;{confirmEraseProject.title}&rdquo;</strong>? It will be moved to your Erased tab.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setConfirmEraseProject(null)}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "transparent",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#7A7358",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const p = confirmEraseProject;
                  setConfirmEraseProject(null);
                  eraseProject(p.id);
                }}
                disabled={erasingId === confirmEraseProject.id}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#dc2626",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                Yes, Erase It
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
