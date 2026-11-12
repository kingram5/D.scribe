# Publisher-Ready visibility and rollout

Publisher-Ready is already present in the repository. The production deployment must have the correct environment scope before its First Draft, Editor Review, Interview and Final Draft navigation appears.

| Setting | Effect |
| --- | --- |
| `NEXT_PUBLIC_PUBLISHER_READY=true` | Selects the new project overview and PageShell navigation at build time. A deployment built without it keeps the original seven-step flow. |
| `PUBLISHER_READY=true` | Enables Publisher-Ready API routes, together with the v2 Ink meter. Otherwise their shared guard returns 404. |
| `INK_METER_V2=true` | Required by the server gate because each configured model needs its own rate. This is a billing setting; do not change it as a UI workaround. |

Environment variables scoped to a specific preview Git branch do not enable production or another preview branch. Align the client and server scopes for the intended deployment; the public flag requires a new build after a setting change. Local tests can use temporary nonsecret flag values without altering deployment configuration.

## Prerequisites to verify read-only

1. Confirm the production deployment's Git SHA matches the intended commit.
2. Confirm migration 027's meter schema/functions exist and the existing meter setting is appropriate; do not change billing as part of the visibility investigation.
3. Confirm migration 029's `pr_runs`, `pr_chapter_passes`, `pr_questions`, `pr_answers` and `pr_craft_notes` exist with their expected columns, RLS, ownership policies and uniqueness constraints.
4. Confirm `ink_rates` contains `sonnet5`, `fable51` and `opus55` rows matching the approved configuration. Model availability/pricing must be verified separately before any paid smoke test; row presence alone does not establish vendor availability.
5. Use a non-customer fixture to verify outlined chapters reach First Draft; readable chapters reach optional Editor Review/Interview; skipped review and completed interview reach Final Draft; existing hand-edited projects can open Final Draft.
6. Confirm PR preview environment scope separately from production scope. A hidden pipeline on a preview with missing flags is not evidence of missing page files.

Migration 030 changes plan allotments/pricing and is a separate rollout decision. It is not needed to diagnose navigation visibility and must not be applied as a shortcut. Likewise, the optional Analysis moments migration on PR #45 is separate from enabling the existing Publisher-Ready navigation.

Changing production flags, applying migrations, deploying or performing a paid generation requires the relevant authorization. This document makes no such changes.

## Project progression

`src/lib/pipeline-step.ts` chooses progression from existing project evidence rather than a project migration flag: outlined chapters lead to First Draft, all readable chapters lead to Editor Review, a live interviewing run leads to Interview, and edited chapters or revising/checking/done runs lead to Final Draft. Review and Interview are optional; once a draft exists, Final Draft and Export remain accessible.

The Generate page also probes the server run endpoint. If its server gate returns 404, that page intentionally keeps the original generation controls. The client navigation flag and server gate therefore both matter.
