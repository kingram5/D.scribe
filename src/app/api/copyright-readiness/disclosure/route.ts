import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { loadBookReadiness } from "@/lib/copyright-readiness-data";
import { DISCLOSURE_SYSTEM, disclosurePrompt } from "@/lib/prompts/disclosure";

// POST /api/copyright-readiness/disclosure — draft USCO + KDP AI disclosures.
// The only model call in Copyright Readiness. One quality (Sonnet) call, metered.
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const inkCheck = await checkInk(user.id, "disclosure");
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const loaded = await loadBookReadiness(project_id, user.id);
  if (!loaded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prompt = disclosurePrompt({
    title: loaded.title,
    readiness: loaded.readiness,
    editTotals: loaded.editTotals,
  });

  try {
    const { text, usage } = await askClaudeWithUsage(DISCLOSURE_SYSTEM, prompt, {
      model: "quality",
      temperature: 0.3,
      maxTokens: 2048,
    });
    await recordInkUsage(user.id, project_id, "disclosure", "quality", usage).catch((err) =>
      logger.error("recordInkUsage failed", {
        route: "/api/copyright-readiness/disclosure",
        userId: user.id,
        error: err,
      })
    );

    const parsed = JSON.parse(cleanJson(text)) as {
      copyrightOfficeStatement?: unknown;
      kdpAnswer?: unknown;
    };
    const copyrightOfficeStatement =
      typeof parsed.copyrightOfficeStatement === "string" ? parsed.copyrightOfficeStatement.trim() : "";
    const kdpAnswer = typeof parsed.kdpAnswer === "string" ? parsed.kdpAnswer.trim() : "";
    if (!copyrightOfficeStatement || !kdpAnswer) {
      return NextResponse.json(
        { error: "Couldn't read the disclosure draft — please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ copyrightOfficeStatement, kdpAnswer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disclosure draft failed";
    logger.error(message, {
      route: "/api/copyright-readiness/disclosure",
      userId: user.id,
      error: err,
      meta: { project_id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
