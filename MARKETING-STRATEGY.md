# D. scribe — Marketing Strategy

## Target Audience

**Primary:** Speakers, pastors, and podcasters who have hours of spoken content but no book.
**Secondary:** Coaches, consultants, and course creators who want to repurpose talks into written products.
**Emotional core:** "I've been meaning to write a book for years but never start."

### Psychographics
- Already create long-form spoken content regularly
- Know a book would establish authority + open revenue streams
- Blocked by the writing process, not the ideas
- Value their authentic voice — don't want generic AI slop
- Willing to pay for tools that save months of ghostwriting cost

## Positioning

**Category:** AI-powered book creation platform
**Differentiation:** Voice-first. D. scribe doesn't ask you to type — it starts from how you already communicate.

**One-liner:** "Turn your talks into a book — without writing a word."

**vs. competitors:**
| | D. scribe | ChatGPT/Claude direct | BookBolt / Designrr | Traditional ghostwriter |
|--|-----------|----------------------|---------------------|----------------------|
| Input | Audio/video | Text prompts | Text/templates | Interviews |
| Voice preservation | High (voice profiling) | Low | None | Medium |
| Structure | Auto-generated | Manual | Template-based | Manual |
| Cost | $19-99/mo | $20/mo + effort | $29-67/mo | $10,000-50,000 |
| Time to first draft | Hours | Days-weeks | Days | Months |

## Channel Strategy

### 1. Organic Content (Primary — $0 budget)

**YouTube** — Target: pastor/speaker content creators
- "How I turned a 45-minute sermon into a 200-page book in one afternoon"
- "I let AI ghostwrite my book from a podcast episode — here's what happened"
- Screen recordings of the full D. scribe pipeline (upload → export)
- Partner with 2-3 mid-tier pastor/speaker YouTube channels for early reviews

**TikTok/Reels** — Quick visual hooks
- Split screen: "Speaking at a conference" → "Published book on Amazon"
- Time-lapse of the D. scribe pipeline (satisfying UI transitions)
- "POV: You've been saying you'll write a book for 5 years"
- Target trending audio that fits the transformation narrative

**Twitter/X** — Build-in-public thread
- Weekly product updates, user wins, and behind-the-scenes
- Engage in #buildinpublic, #indiedev, #aistartups communities
- Share specific metrics (word counts generated, books exported)

### 2. Community Infiltration (Low effort, high ROI)

**Where the audience already gathers:**
- Facebook Groups: "Pastors and Preaching", "Church Communicators", "Speaker Nation"
- Reddit: r/podcasting, r/selfpublish, r/pastors
- Slack/Discord: Podcast communities, coaching communities

**Approach:** Don't spam. Provide value first. Answer questions about book writing → mention D. scribe as a tool you've used. One genuine helpful comment > 50 link drops.

### 3. Direct Outreach (Week 4+)

- Cold email podcast hosts who've mentioned wanting to write a book
- Offer free 50-credit accounts to 10-15 pastors/speakers with audiences
- Ask for testimonials + permission to use their names
- "Write your book this month" challenge — 30-day email sequence

### 4. SEO / Content Marketing (Month 2+)

**High-intent keywords to target:**
- "turn sermon into book"
- "AI book writing from audio"
- "convert podcast to book"
- "ghostwriter alternative"
- "speech to book software"

**Content pieces:**
- "How to Turn Your Sermon Series into a Book (Step-by-Step Guide)"
- "Podcast to Book: The Complete Guide for 2026"
- "AI Ghostwriting vs. Traditional Ghostwriting: Cost, Quality, Speed"
- "The Pastor's Guide to Self-Publishing"

### 5. Paid Ads (Month 3+, after organic validation)

**Facebook/Instagram Ads** — targeting:
- Job titles: Pastor, Speaker, Podcast Host, Life Coach
- Interests: Self-publishing, Book writing, Public speaking, Sermon prep
- Lookalike audiences from early adopters

**Ad format:** Video testimonial (real user, 30-60 sec) showing before/after
**CPC target:** < $2.00 for US speakers/pastors

## Pricing Strategy

| Tier | Price | Credits | Target User |
|------|-------|---------|-------------|
| Free | $0 | 10 | Trial — enough for 1 short book analysis |
| Starter | $19/mo | 50 | Occasional user, 1-2 projects/month |
| Author | $49/mo | 150 | Active creator, multiple projects |
| Publisher | $99/mo | 500 | Agency/prolific creator |

**Free tier goal:** Get user to the "aha moment" (seeing their words structured into chapters) within 10 credits. The analysis step is the hook — generation is the paywall.

## Launch Sequence

### Week 1 (Now): Test Users
- [x] Security audit + deploy
- [x] Add test users to OAuth
- [ ] Collect feedback via DM or form
- [ ] Fix top 3 UX friction points from feedback

### Week 2: Polish + Content Prep
- [ ] Mobile responsiveness pass (DONE — shipped today)
- [ ] Record 2-3 demo videos (screen capture + voiceover)
- [ ] Write 3 Twitter threads for launch week
- [ ] Create landing page A/B variant (simpler, more direct)

### Week 3: Soft Launch
- [ ] Post to Twitter/X with demo video
- [ ] Post to 3-5 Facebook groups (value-first approach)
- [ ] Email 10 speakers/pastors with free accounts
- [ ] Submit to Product Hunt (prepare assets)

### Week 4: Push
- [ ] Product Hunt launch
- [ ] First paid ad test ($100 budget, FB)
- [ ] Collect + publish 3 testimonials
- [ ] Iterate based on conversion data

## Metrics to Track

| Metric | Target (Month 1) | Tool |
|--------|-----------------|------|
| Signups | 50 | Supabase auth |
| Free → Paid conversion | 10% | Stripe |
| Activation rate (complete first analysis) | 60% | Supabase jobs table |
| Day 7 retention | 30% | Supabase auth + jobs |
| CAC (when ads start) | < $30 | Ad platform |
| MRR | $500 | Stripe |

## Key Risks

1. **Voice quality concerns** — If output doesn't sound like the speaker, trust breaks immediately. Mitigation: voice profiling + prominent "edit your manuscript" step.
2. **Vercel timeout on generation** — Long chapters may hit 60s Hobby plan limit. Mitigation: job queue architecture (already built), upgrade to Pro if needed.
3. **Small initial market** — Speakers/pastors is a niche. Mitigation: expand to coaches, consultants, course creators in month 2.
4. **Free tier abuse** — 10 credits might not be enough to hook. Mitigation: track activation funnel, adjust if drop-off is before aha moment.
