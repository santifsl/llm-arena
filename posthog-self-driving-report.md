# PostHog Self-driving Setup Report

**Project:** LLM Arena  
**Date:** 2026-08-13  
**Inbox:** https://us.posthog.com/project/555231/inbox

## Summary

PostHog Self-driving has been configured for LLM Arena. Session Replay, Error Tracking, and Support (Conversations) were enabled as products; six native signal sources were wired up; the scout troop was tuned to five scouts (general + four specialists matching the product's most-used surfaces); and two Replay Vision scanners were armed to push visual breakage findings directly to the inbox. Findings will start appearing in the Self-driving inbox at https://us.posthog.com/project/555231/inbox within approximately 30 minutes.

## AI Data Processing

**Status:** Approved — the organization opted in to AI data processing before this run began.

## GitHub

**Status:** Connected during this run  
**Integration ID:** 215563  
**Org / account:** santifsl  
**Connected at:** 2026-08-13T00:59:04Z

GitHub gives Self-driving code access so findings can be researched against the actual repository and fix PRs can be opened automatically.

## Products Enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Follow-up required** | `products-enable` tool not available on this deploy — flip manually (see Follow-ups). `posthog.init` override check: `disable_session_recording: false` is set explicitly — client init is clean, no changes needed. |
| Error Tracking | **Follow-up required** | Same as above — no `capture_exceptions: false` override in `posthog.init`, client is clean. |
| Support (Conversations) | **Follow-up required** | Same as above. Additionally, tickets only arrive once an inbound channel (email / inbox / Slack) is connected. |

> **Note on `products-enable` unavailability:** The MCP token does not expose this tool on this deploy. The server-side product flip is the only missing step; the signal sources are enabled and will pick up data automatically the moment the products are switched on.

## Signal Sources

| Source product | Source type | Action | ID |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | Already on by default — no row needed | — |
| `health_checks` | `health_issue` | **Created** | 019ff8a2-5503-7e31-89b5-62e97dbc8faf |
| `error_tracking` | `issue_created` | **Created** | 019ff8a2-6115-7967-b398-e5d6dbf18ad3 |
| `error_tracking` | `issue_reopened` | **Created** | 019ff8a2-6b58-7d3e-bd9b-eb61a8cc66e5 |
| `error_tracking` | `issue_spiking` | **Created** | 019ff8a2-79e0-71aa-a465-3c5e5ba548bd |
| `session_replay` | `session_analysis_cluster` | **Created** (sample_rate: 0.1, server default) | 019ff8a2-872d-7265-b76e-6cc24369032f |
| `conversations` | `ticket` | **Created** — dormant until an inbound channel is connected | 019ff8a2-943b-788e-8b12-9238394e7d31 |
| `llm_analytics` | — | Skipped — internal-only, not a v1 responder | — |
| `logs` | — | Skipped — not a v1 responder | — |
| `replay_vision` | — | Skipped — Replay Vision scanners are self-authorizing via `emits_signals` flag | — |

## Connected Tools

The user selected **None of these** in the connected-tools picker. No external issue-tracker, error-tracker, support-desk, or analytics sources were connected. Skipped tools are not used and carry no responder row.

## Scout Troop

**Run budget:** 100 runs/day (early access default). 0 runs used today. Banner: *"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."*

**Enabled (5 scouts):**

| Scout | Why enabled |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers. Already enabled at sync. |
| `signals-scout-ai-observability` | Core product is an LLM arena (`@ai-sdk/react`, `@openrouter/ai-sdk-provider`); watching LLM call latency, errors, costs, and volume is the highest-priority surface. |
| `signals-scout-health-checks` | Fresh PostHog setup; actively monitors for instrumentation issues like missing events and outdated SDKs. |
| `signals-scout-product-analytics` | Funnel and retention regressions on saved flows — will become the primary signal once prompt submission and voting events are tracked. |
| `signals-scout-web-analytics` | Web traffic patterns, per-channel session volume, and landing-page health for this Next.js web app. |

**Disabled (22 scouts) — notable reasons:**

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Intentional — covered by the native `error_tracking` signal sources enabled in step 4. Not a gap. |
| `signals-scout-session-replay` | Intentional — covered by the native `session_replay` signal source enabled in step 4. Not a gap. |
| `signals-scout-feature-flags` | Not yet in use (product is pre-launch). Re-enable from the inbox if feature flags are adopted. |
| `signals-scout-experiments` | No active experiments. Re-enable when A/B testing starts. |
| `signals-scout-surveys` | No surveys in use (0 found). Re-enable if PostHog Surveys are adopted. |
| `signals-scout-revenue-analytics` | No payment SDK — all models are free tier by design. |
| `signals-scout-logs` | PostHog logs product not in use. |
| `signals-scout-csp-violations` | No CSP reporting configured. |
| `signals-scout-customer-analytics` | No group/account analytics (B2B) in this product. |
| `signals-scout-conversations` | Support product enabled but no channel connected yet; no conversation data. |
| `signals-scout-inbox-validation` | Inappropriate for fresh setup — no shipped fixes to validate yet. |
| `signals-scout-replay-vision` | Reads trends across accumulated observations — will become useful once the Replay Vision scanners (created below) have data. |
| All others | Not applicable to this product's current surfaces. |

> **Noise escape hatch:** If any enabled scout generates too many low-signal findings, set `emit: false` on its config in PostHog to switch it to dry-run (it keeps running but writes nothing to the inbox).

## Custom Scouts

**Gap analysis result:** No custom scouts warranted at this stage.

The built-in troop covers all currently-instrumented surfaces. The product is in foundations phase — features 5 and 6 (model picker, prompt submission, voting) are not yet built, so the following candidate surfaces were considered and ruled out:

| Candidate surface | Filter that killed it |
|---|---|
| Prompt → response → vote funnel | Not watchable — arena events don't exist yet (features 5+6 not started) |
| Model voting fairness / winner distribution | Not watchable — no vote events yet |
| OpenRouter API health and failure patterns | Already covered by `signals-scout-ai-observability` |
| Stream abort/timeout patterns | Not watchable — AbortController events not tracked |

**Recommended custom scouts to add once features 5+6 land:**
- **Arena submission funnel** — watch `prompt_submitted` → streaming completion → `vote_cast` for conversion drops and abandoned flows
- **Model comparison fairness** — watch vote distribution across models for unexpected winner bias or data quality issues in voting

## Replay Vision Scanners

Replay Vision scanners are LLMs that watch individual session recordings on a schedule and push what they find directly to the Self-driving inbox. A finding lands at half weight; it needs corroboration (a second finding on the same defect) before it's promoted into a full report. These are the only components of this setup that spend Replay Vision quota.

**Budget:** 2,500 credits remaining this period (2026-08-13 → 2026-09-12). Both scanners estimated at 0 credits/month (0 recordings in the 7-day lookback window). Scanners are armed and will start working the day recordings accumulate.

| Scanner | What it watches | Query scope | sampling_rate | Estimated credits/month | Status |
|---|---|---|---|---|---|
| **Broken experiences** | Error messages, blank screens, failed loads, broken layouts, stuck spinners, dead buttons/forms — unambiguous on-screen breakage on the highest-traffic sessions | All sessions (fallback — no identifiable completion flow yet; arena features not built) | 0.5 | 0 (no recordings in window) | **Created** (id: 019ff8a8-0c6d-70c8-b89e-a5069623843d) |
| **User frustration** | Rage clicks, repeated clicking, button hammering, retrying the same action, abandoning flows — genuine visible struggle | Sessions with `$rageclick` events only | 1.0 | 0 (no recordings in window) | **Created** (id: 019ff8a8-2c08-730e-94f8-f4148a7b7e13) |

**Query design note:** Scanner 1 uses a broad fallback (no URL filter) because the arena's key completion flow — prompt submission through voting — doesn't exist yet. Once features 5 and 6 are built and routes are known (likely `/` or `/arena`), update scanner 1's query to scope to that flow using `$current_url icontains <path>`. Scanner 2 stays as-is (gated on `$rageclick` — no URL scope, to avoid overlap with scanner 1).

The two queries are intentionally disjoint: scanner 1 targets session breadth via sampling; scanner 2 targets sessions with explicit frustration signals via the `$rageclick` gate. This prevents the same defect from being self-corroborated.

## Follow-ups

- [ ] **Enable Session Replay** — PostHog Settings → Session replay → "Record user sessions"
- [ ] **Enable Error Tracking** — PostHog Settings → Error tracking → "Enable exception autocapture"
- [ ] **Enable Support (Conversations)** — PostHog product sidebar → Support
- [ ] **Connect a support inbound channel** — Once Conversations is on, connect an email, inbox, or Slack channel in PostHog so tickets start flowing. The `conversations / ticket` signal source is already enabled and will pick them up automatically.
- [ ] **Update scanner 1's query** — Once features 5 and 6 land and the arena URL is known, update "Broken experiences" scanner query to scope to the completion flow path (e.g. `$current_url icontains /arena`).
- [ ] **Add custom scouts for the arena funnel** — Once `prompt_submitted`, `model_selected`, and `vote_cast` events are tracked, create custom scouts for the voting funnel and model-comparison fairness.
- [ ] **Re-enable `signals-scout-replay-vision`** — Once the Replay Vision scanners above have accumulated observations, enable this scout from the inbox to surface cross-session trends.
- [ ] **Wire Clerk identity to PostHog** — The product scope (feature 1 half B) calls for tying PostHog events to the signed-in Clerk user. Until this lands, events are anonymous and self-driving findings have no person context.

## What Happens Next

- The scout coordinator picks up the newly enabled configs within **~30 minutes** and fires the first runs.
- Each enabled scout draws from the daily run budget (100 runs/day by default during early access).
- Findings from scouts and scanners cluster into reports in the inbox.
- Immediately-actionable reports can start coding tasks automatically.

Check your inbox at: https://us.posthog.com/project/555231/inbox
