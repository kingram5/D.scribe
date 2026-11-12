# Publisher-Ready scoreboard

Blind test of four arms on the same real chapters. Nothing ships until arm C
clearly beats arm B.

| Arm | What it is |
|---|---|
| A | Today: one pass, Sonnet 4.6, today's prompt |
| B | Today's prompt on Sonnet 5 (the model upgrade by itself) |
| C | Publisher-Ready, production mix: Sonnet 5 draft, Fable 5.1 editor, Opus 5.5 revise, Sonnet 5 final check |
| D | Publisher-Ready, budget mix: Opus 5.5 editor, Sonnet 5 revise |

Scoring: the Publisher-Ready rubric (`src/lib/publisher-ready/rubric.ts`), two
judges (Opus 5.5 and Sonnet 5), lower score per criterion wins, chapters shown
in shuffled order with no arm label. Plus the free checks (tells score,
rhythm variation). Cost is measured from real token usage.

It spends money on the project's Anthropic key and only reads the database.
Fixtures, results and answer sheets hold real book content and stay out of git.

## Run it

1. **Export** 3-5 real chapters (read-only):
   `PR_EVAL_PHASE=export PR_EVAL_CHAPTERS=<chapter uuid>,<chapter uuid> npm run eval:pr`
2. **Questions**: prints the price first; add `PR_EVAL_CONFIRM=yes` to spend.
   Runs A and B fully and C and D up to the editor, then writes one answer
   sheet per chapter per arm to `answers/`.
   `PR_EVAL_PHASE=questions PR_EVAL_CONFIRM=yes npm run eval:pr`
3. **Answer**: the author fills `"answer"` in each sheet in their own words.
   Blank = unanswered (the reviser must not invent it).
4. **Final**: finishes C and D, judges all four blind, writes the scoreboard
   to `results/`.
   `PR_EVAL_PHASE=final PR_EVAL_CONFIRM=yes npm run eval:pr`
