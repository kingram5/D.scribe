import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logger } from "@/lib/logger";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST /api/partners/apply — public "become a partner" form. Lands as a pending
// partner for Kyle to approve or decline; nothing is created in Stripe until he does.
export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${clientIp(req)}`, "partners/apply", 3, 10 * 60_000, "local");
  if (!allowed) return NextResponse.json({ error: "Too many applications from here. Try again later." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (clip(body.company_website, 200)) return NextResponse.json({ ok: true }); // honeypot: bots fill every field

  const name = clip(body.name, 80);
  const email = clip(body.email, 200).toLowerCase();
  const links = clip(body.links, 1000);
  const audience = clip(body.audience, 200);
  const pitch = clip(body.pitch, 1500);
  if (name.length < 2) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add a valid email." }, { status: 400 });
  if (isDisposableEmail(email)) return NextResponse.json({ error: "Use your real email so we can reach you." }, { status: 400 });
  if (links.length < 4) return NextResponse.json({ error: "Add at least one link to where your audience follows you." }, { status: 400 });

  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("partners").select("id, status").ilike("email", email).in("status", ["pending", "active", "paused"]).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, already: true });

  const { error } = await supabase.from("partners").insert({ name, email, links, audience, pitch, status: "pending", source: "application" });
  if (error) {
    logger.error("Partner application insert failed", { route: "/api/partners/apply", error });
    return NextResponse.json({ error: "Something went wrong. Try again in a minute." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
