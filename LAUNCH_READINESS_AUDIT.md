# Launch Readiness Audit (May 4, 2026)

## Verdict
Not ready for a commercial launch today.

## Critical blockers
1. **CI/lint gate currently fails** (`npm run lint` exits non-zero).
   - 3 lint errors in production UI code (`InkMeter`, `TtsMeter`, `InkUpgradeModal`).
   - Fix: resolve React hook rule violations and browser navigation mutation issue, then enforce clean lint in CI.

2. **Rate limiting is single-instance and in-memory**.
   - `src/lib/rate-limit.ts` explicitly notes it is not suitable for multi-instance deployment.
   - Fix: move to shared distributed limiter (e.g., Upstash Redis / Cloudflare KV / Postgres-based token bucket), keyed by user + IP + route.

3. **No observable automated test suite for core billing/credits flows**.
   - `package.json` has no `test` script, only lint/build/dev/start.
   - Fix: add integration tests for Stripe checkout, webhook processing, credits/ink accounting, and authz on project resources.

## High-risk issues before paid traffic
4. **Webhook idempotency and event durability are weak**.
   - Webhook handler updates state directly without visible persistent event-log/idempotency table.
   - Fix: store Stripe event IDs and ignore duplicates; process with transactional upserts and retry-safe semantics.

5. **Potential async workload bottlenecks**.
   - Multiple heavy AI/transcription routes appear synchronous per request path.
   - Fix: push long-running processing into queue workers, return job IDs immediately, apply concurrency controls.

6. **Operational documentation maturity is low**.
   - Root README is still default Next.js template and does not document production runbooks.
   - Fix: add explicit production runbook: env vars, deployment topology, incident response, billing reconciliation, data retention.

## Capacity estimate (very rough)
Given current architecture signals (Next.js API routes + Supabase + synchronous AI jobs + in-memory limiter), likely sustainable throughput is:
- **Low hundreds of daily active users** and bursty API usage if carefully monitored.
- **Not trustworthy for large paid launch traffic** (thousands of concurrent users or sustained high RPS) without queueing, distributed limits, and stronger observability/load testing.

## Recommended remediation sequence
1. Make lint/type/build mandatory green in CI.
2. Replace limiter with distributed limiter.
3. Add Stripe webhook idempotency table + reconciliation job.
4. Add integration tests for billing/auth/credits/transcription lifecycle.
5. Add queue-backed workers and per-user concurrency limits.
6. Run load tests (k6/Locust) on critical routes and publish SLOs.
7. Ship production runbook and on-call alerts/dashboards.
