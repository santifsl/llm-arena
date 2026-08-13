# Scope: LLM Arena

Send one prompt, watch up to three AI models answer it at the same time, and vote for the best one. Over time those votes and the real per-call numbers, speed, tokens, cost, build an honest leaderboard of which model is actually worth using.

Build it in a thin, working slice first, one prompt actually reaching a model and coming back, before making any single part of it fuller. Then thicken it piece by piece. Before building anything, decide what you're doing and why in a few plain sentences, then build it, and if the plan turns out wrong once it's actually built, say so and fix the plan too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its own short list of what's genuinely being done, and check each part off as it's finished, right in this file. That way this file can be opened fresh, in a brand new conversation, and it's obvious what's already done and what's still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: Next.js (App Router), TypeScript, Tailwind, shadcn for components (card, button, popover, loading skeleton, and whatever else the UI actually needs as it gets built), Prisma with Postgres, Clerk for auth, Arcjet in front of the endpoint, PostHog for analytics and observability.

## Sketches

There are rough hand-drawn sketches for the arena screen, the leaderboard, and the models page. Treat them as structure only, where things sit, what exists on the page, not as the final design or the actual colors, all of that is already decided elsewhere in this file. If something in a sketch genuinely contradicts what's written here, stop and ask which one actually wins rather than guessing.

## At a glance

| #   | Feature                                     | Phase      | Status      |
| --- | ------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to a model                       | Foundation | done; verified end to end against real accounts |
| 2   | Coding standards & tooling                  | Foundation | not started |
| 3   | Data model                                  | Foundation | not started |
| 4   | Design & look                               | Foundation | not started |
| 5   | Model picker                                | Slice 1    | not started |
| 6   | Send a prompt, parallel streams, and voting | Slice 1    | Arcjet half built & verified; streams, voting, persistence not started |
| 7   | App shell & thread history                  | Slice 2    | not started |
| 8   | Public thread visibility & sharing          | Slice 3    | not started |
| 9   | Leaderboard: global & personal              | Slice 4    | not started |

## Foundation

### 1. How the app actually connects to a model

The Next.js project itself gets created manually first, `create-next-app`, fast and simple, no reason to spend agent time or tokens on something that easy.

Two real decisions still open once that exists: how the app calls OpenRouter to get a model's answer, and how streaming three models back to the browser at once should actually work. This one's worth real thought: routing all three through one shared connection looks simpler, but if that one connection drops, all three answers die together, which breaks the whole point of one model failing never affecting the others. Decide both properly, then wire them, along with Prisma, Clerk, and Arcjet, into the project that already exists.

PostHog should be wired in from the start too, session replay and heatmaps turned on, and tied to the signed-in user once Clerk resolves, so events are attached to a real person, not left anonymous.

- [x] Decide the approach
- [x] Half A: env validation, failing at server boot (`env.ts`, `instrumentation.ts`)
- [x] Half A: OpenRouter provider and the pure metrics function (`features/model-call/`)
- [x] Half A: per-model streaming route (`app/api/arena/stream/route.ts`)
- [x] Half A: throwaway proof harness at `/proof`
- [x] Half A: typecheck, lint, and production build all clean
- [x] Half A: a real prompt reaching real models, streaming back with real metrics, verified with `curl`
- [x] Half B: Clerk wired through `proxy.ts`, provider mounted, nothing protected yet
- [x] Half B: Prisma 7 with the `@prisma/adapter-pg` driver adapter, client generating
- [x] Half B: PostHog started in `instrumentation-client.ts`, session replay and heatmaps on, identity bound to the Clerk user
- [x] Half B: verified against the real accounts, 2026-08-13. Postgres accepts a real query, the server boots with every key present, Clerk's proxy runs and the stream route refuses a signed-out caller with a plain sentence, and PostHog's key resolves with heatmaps on and the host bundled into the client.
- [x] Half B: PostHog session replay switched on, 2026-08-13. Worth remembering if it ever reads as off again: this is a toggle in PostHog's own project settings, and `disable_session_recording: false` in `posthog.init` cannot turn it on from code.
- [x] Half B: the model call, Arcjet's rules, and PostHog events all confirmed in a real signed-in browser at `/proof`, 2026-08-13. This was the last thing `curl` could not prove, since the route refuses signed-out callers and Arcjet denies every scripted one. One narrower question is deliberately still open under feature 6: whether a browser request is *allowed* by bot detection rather than 403'd was not checked on purpose, so it is not claimed here.

**The approach, decided 2026-08-12.**

_Calling OpenRouter._ Vercel AI SDK with `@openrouter/ai-sdk-provider`. Chosen over a hand-rolled fetch client for its tested streaming, abort handling, and `onFinish` usage callback, accepting the abstraction between us and OpenRouter's raw response. Where a provider-specific field is needed and the SDK doesn't surface it typed, we add a narrow typed accessor of our own rather than reaching for `any`. The free-tier catalog in feature 5 still comes from a plain `fetch` of `/api/v1/models`; that endpoint isn't an inference call and doesn't belong to the SDK.

_Streaming three models at once._ Three fully independent connections, never one multiplexed stream. The browser fires one `POST` per selected model at a route that takes a single model id, each with its own `AbortController`. A dropped connection, a provider error, or a slow model kills exactly one card. One merged stream would be simpler to write and would quietly make "one model failing never affects the others" untrue at the transport layer, which is the whole point of the product. The real cost, auth and rate-limit checks running three times per prompt instead of once, is accepted; feature 6's Arcjet budget is keyed on the user across calls precisely so this stays correct.

_The wire format._ The AI SDK's UI message stream, with our per-call metrics as typed data parts rather than invented text. Metrics are derived by a pure function from timestamps plus the final usage object: time-to-first-token measured server-side at the first content chunk, tokens per second from usage over elapsed, total tokens from usage. That one function feeds the response card, the database write, and the PostHog LLM event, so those three can never disagree. Cost is captured and will read $0.0000, which is honest, not a bug.

_Environment._ One `env.ts` that validates every required key at module load and throws on a missing one, so a bad deploy dies at startup instead of at the first prompt.

_Sequencing._ Half A first, a prompt actually reaching a model and streaming back, verified with `curl` and a real browser, before any other integration exists. Half B only installs and initializes Clerk, Prisma, and PostHog and proves each one boots; their real use lands in features 3, 6, and 9.

_Correction to this file._ Feature 1's original text said wire Arcjet here, while feature 6 says Arcjet sits in front of the prompt endpoint. Feature 6 wins: there is no endpoint to protect until it exists, and installing it earlier is dead config. Feature 1 no longer touches Arcjet.

_That correction has since expired, 2026-08-12._ Half A built the stream route, so the endpoint the correction said did not exist now does, and Arcjet is no longer dead config. Feature 6's Arcjet half was therefore built early, against the real route. The reasoning still holds as written; it just stopped applying once the route shipped. Feature 6 still owns the rest of its scope: voting, follow-ups, persistence, and the PostHog events.

**What building half A changed about the plan.**

_Metrics come from the SDK, not from our own stopwatch._ The decision above assumed we would time the stream by hand. AI SDK 7 already reports `timeToFirstOutputMs`, `outputTokensPerSecond`, and `responseTimeMs` per model call through `onLanguageModelCallEnd`, measured closer to the wire than anything we could do from the outside. `toCallMetrics` is still the one pure function every consumer reads, but it now maps the SDK's numbers rather than computing them from timestamps. This is a straightforward win from the AI SDK choice and worth remembering when feature 6 writes these to the database.

_Cost is real, not hardcoded._ Every call sets OpenRouter's `usage: { include: true }`, so spend comes back from the provider and is parsed with a schema rather than assumed. Free-tier models genuinely report $0.0000, which is an honest measurement instead of a placeholder. If a paid model is ever added, the number is already correct.

_Env is read through a function, not a module constant._ Parsing at module scope made `next build` itself fail without production secrets, which would break any build environment that legitimately has none. `serverEnv()` is called at boot from `instrumentation.ts`, so a missing key still kills the server before it serves a single request, verified by hand. Builds no longer need secrets. Re-parsing per call is pure and cheap, and avoids a cached singleton.

_The request schema drops non-text parts instead of rejecting them._ The client sends bookkeeping parts the model has no use for, so a strict schema would reject legitimate follow-up turns. Text survives, everything else is dropped, and a message with no text left is rejected.

_The proof harness makes no design choices._ `/proof` is deliberately unstyled plain semantic HTML. It is a harness for this feature, not a screen, and it gets deleted once the real arena exists in slice 1. No visual direction is committed here; that is feature 4's job.

**What the verification pass on 2026-08-13 turned up.**

_A second, broken Prisma client existed._ `lib/prisma.ts` was a duplicate of `features/database/client.ts`, importing from `app/generated/prisma/client`, a path that does not exist since the generator output moved. It failed typecheck, was referenced by nothing, sat in a layer folder rather than a feature folder, and reached for `process.env.DATABASE_URL!` instead of the validated env. Deleted. `features/database/client.ts` is the only database client.

_The proof harness could no longer prove anything._ Once feature 6's Arcjet work put an auth gate in front of the stream route, `/proof` had no way to sign in, so every request from it returned 401. It now shows a Clerk sign-in button when signed out. Clerk 7 removed `<SignedIn>`/`<SignedOut>` in favour of `<Show>`, which is a server component, so the harness asks `useAuth()` directly instead.

_Refusals now show the sentence the server actually wrote._ The route returns real human sentences for 401, 400, and 429, but the harness was overwriting all of them with one generic fallback, which hid exactly the behaviour worth checking. It parses the JSON body and shows that sentence, falling back to the generic one if the body is anything else, so a raw error still never reaches the screen.

**What building half B changed about the plan.**

_The middleware file is called `proxy.ts`._ Next.js 16 renamed the convention and deprecated `middleware`. Clerk's helper is still named `clerkMiddleware`, so the file reads oddly but is correct. Anything later reaching for `middleware.ts` will silently not run.

_Nothing is protected there._ `clerkMiddleware()` only makes the signed-in user available. Which routes actually require sign-in is a real product decision that belongs to the features that need it: sending a prompt and voting in slice 1, and public thread viewing in slice 3, where the whole point is that a signed-out visitor can read a thread.

_Prisma 7 requires a driver adapter._ The old `datasourceUrl` option is gone; the client is constructed with `@prisma/adapter-pg`. The generated client is written to `features/database/generated` and is gitignored, so `prisma generate` has to run after a fresh clone. It is built on first use rather than at import, for the same reason the env read is deferred.

_Prisma's CLI reads `.env.local` through Node, not dotenv._ `prisma init` assumes a `dotenv` dependency and its own `.env` file. `prisma.config.ts` calls Node's built-in `process.loadEnvFile('.env.local')` instead, which keeps one env file for the whole project and one fewer dependency. The stray `.env` that `prisma init` wrote, containing a fake connection string, was deleted; a real value there would have quietly satisfied the startup check with a database that does not exist.

_Public environment variables are validated separately._ Next.js only inlines `NEXT_PUBLIC_` values that are referenced literally in source, so they cannot be read off a `process.env` sweep the way secrets can. `publicEnv()` lists them by hand for that reason. Both sets are checked at boot.

_Analytics failing never breaks the app._ `instrumentation-client.ts` contains its own errors. A misconfigured PostHog key still fails loudly at server boot, which is where a person can actually act on it, rather than in a browser console nobody is reading.

_Startup now needs every key, including PostHog._ This follows directly from the fail-fast rule and is deliberate, but it does mean the app cannot run at all while accounts are still being created. If that proves annoying in practice, the honest fix is to make analytics genuinely optional in the schema, not to weaken the check on the keys the app actually depends on.

_Analytics only start in production._ `startAnalytics` returns early when `NODE_ENV !== "production"`. The dev server shares one PostHog project key with production, so an unguarded `posthog.init` sent every local dev crash to the same error-tracking inbox as real user errors. One such crash (a `ReferenceError` from an uncommitted local `/design` edit, off `localhost:3000`, one occurrence, one user) opened its own issue next to the genuine ones. The gate keeps that dev noise out of the shared inbox so the signal stays trustworthy. The trade-off is no local PostHog debugging; if that is ever wanted back, the alternative is to keep init on and register a distinct `environment` property so dev events are filterable instead of gone.

### 2. Coding standards & tooling

Write down the real conventions for this project once it actually exists, then install linting, formatting, and a pre-commit hook that actually enforces them.

- [ ] Decide the approach
- [ ] Install lint, format, and whatever else is needed, and write it up in a coding-standards doc

### 3. Data model

The core things every feature depends on: users tied to Clerk, threads, each model's own messages inside a thread, and votes. A vote should only ever be possible on a turn where two or more models actually answered.

- [ ] Decide the approach
- [ ] Build it

### 4. Design & look

A coffee or dark brown background, warm, not neutral gray or true black. One accent color, rust, used only for things you interact with, buttons, links, focus states, the win-rate bar, never as decoration. Because the background and the accent are both warm tones from the same family, the accent has to stay clearly brighter and more saturated than the background, enough that a button never blends into the page behind it, that's a real risk with two warm colors this close and worth checking by eye, not just by the numbers. Blue, indigo, and purple are never the accent, under any circumstance. Green is reserved only for marking a winner, red only for errors, never reused for anything else. Contrast should genuinely hold up in both light and dark mode, not just look fine at a glance.

- [ ] Decide the approach
- [ ] Build it

## Slice 1: Core arena loop

### 5. Model picker

An "Add model" popover pulling OpenRouter's live free-tier list, sorted by context window, capped at three models, defaulting to all three selected, with removable chips next to the prompt box. Also render that same catalog as a simple `/models` page, name, context window, and pricing for each one, so anyone can browse the full list without opening the picker.

- [ ] Decide the approach
- [ ] Build it

### 6. Send a prompt, parallel streams, and voting

The heart of the product. One prompt goes to every selected model at once, each streaming and failing independently, so one being slow or down never blocks the others. Each answer shows its own real time-to-first-token, tokens per second, and total tokens. No cost shown, every model here is free tier, so it would always read zero. A vote only exists once two or more models have answered, and picking one writes exactly one vote and marks that answer as the winner, while every answer stays visible the whole time. A follow-up continues each model's own separate conversation.

Arcjet sits in front of this endpoint before any model is ever called: rate limiting, bot protection, and prompt-injection detection, plus a real limit on how much one person can use across all three models at once, not just a limit on the endpoint overall.

**The Arcjet half, built 2026-08-12.** Four rules in `features/security/arcjet.ts`, layered on the shared client and run by one `protect()` call inside the route handler, never in `proxy.ts`.

_Correction to the wording above._ This originally read "a shield against prompt injection", which conflates two separate Arcjet rules. `shield` is the WAF, SQLi and XSS and the rest of the OWASP top ten; it protects the app from bad requests. `detectPromptInjection` reads the prompt text; it protects the models from bad prompts. The arena runs both, and they are not interchangeable.

_The budget is keyed on the signed-in user, not the IP or the endpoint._ This is the rule feature 1's transport decision depends on. One prompt to three models is three separate HTTP requests, so a per-endpoint limit would silently let one person spend three times their share. The `tokenBucket` carries `characteristics: ["userId"]` so all three calls draw from one person's bucket. Written in prompts and converted to requests in code: a burst of 10 prompts, refilling 5 prompts an hour.

_The route now requires sign-in._ An anonymous caller has no bucket to charge, so there is nothing to key a per-person budget on. The route returns 401 before anything else happens. This is the first place in the app where Clerk actually protects something rather than just being mounted, and it is a deliberate change from feature 1's "nothing is protected here" note in `proxy.ts`, which stays true, the gate is in the route, not the proxy. Cost: the `/proof` harness and plain `curl` can no longer reach the route signed out.

_Arcjet failing open._ If Arcjet itself is unreachable the request is allowed through. A person losing the product because a security service is having an outage is the worse of the two failures, and shield still runs locally.

_Bot detection allows nothing._ `allow: []`. Every legitimate caller here is a signed-in person in a browser; nothing legitimate scripts this endpoint. Verified: `curl` is denied even with a full browser header set.

- [x] Arcjet: `ARCJET_KEY` in `env.ts` and `.env.example`, failing at boot like every other secret
- [x] Arcjet: shield, bot detection, per-user token bucket, and prompt-injection detection wired into the stream route
- [x] Arcjet: denials mapped to plain sentences with a retry action and a `Retry-After` header, never a rule name
- [x] Arcjet: sign-in required on the stream route, keyed on the Clerk `userId`
- [x] Arcjet: typecheck, lint, and production build clean
- [x] Arcjet: verified against the real service, decisions recorded in the console, injection caught at score 0.995, bucket denying on the 31st request
- [x] Arcjet: fail-open enforced in our own code rather than assumed from the SDK
- [ ] Arcjet: confirm a real signed-in browser passes bot detection (needs a browser, cannot be done from `curl`, since `allow: []` denies every scripted caller). The signed-in `/proof` run on 2026-08-13 probably exercised this, but it was not checked deliberately, so it stays open until someone confirms a browser request is actually allowed rather than 403'd.

**What code review changed, 2026-08-13.**

_The model id was a spending hole._ `modelId` accepted any nonempty string and was handed straight to OpenRouter under the app's own key, so any signed-in person could have posted `openai/gpt-4o` and spent real money. "Every model here is free tier" was a product rule that nothing actually enforced. `features/model-call/catalog.ts` now enforces it on the server: an id must be an OpenRouter `:free` variant. Checked against the live catalog, all 15 `:free` models price at zero and no paid model carries the suffix. It is deliberately conservative, three zero-cost models without the suffix are refused, because refusing a free model is far cheaper than accepting a paid one. Feature 5 replaces this with the live free-tier catalog it already has to fetch for the picker.

_Fail-open is now real, and deliberately narrow._ The comment promised the request survives an Arcjet outage, but nothing in our code made that true; it happened to hold only because the SDK converts transport failures into an `ERROR` decision internally. The `protect()` call is now guarded so the guarantee belongs to us rather than to a dependency's implementation detail. Building the client is deliberately left outside the guard: it throws on a missing key or bad rule options, and that has to stay loud, because silently allowing every request when the app is misconfigured would turn a broken deploy into an unprotected one.

_Process-wide client caches are down to one place._ Review flagged the `globalThis` cache as against the functional-style rule. Removing it would be wrong: the database pool genuinely needs to survive hot reload or development keeps opening connections until Postgres refuses more, and a rebuilt Arcjet client throws away its local decision cache. The real problem was that Arcjet had copied the trick, so there were two hand-rolled caches and two unchecked casts. `singleton.ts` now owns it, both clients read as ordinary functions, and the "one place in the app that keeps state" claim is true again.

Every prompt sent, every answer finishing, and every vote cast should be tracked as a real PostHog event, so there's an honest funnel from prompt to answer to vote. A model failing should also be logged properly on the server, not just shown to the user and forgotten. Separately from that funnel, every actual model call should also be wrapped so PostHog captures its own real tokens, cost, and latency per call, that's PostHog's own LLM analytics, not the same thing as the funnel events or the numbers already shown on the response card.

_Three PostHog chores are waiting on this feature._ All three were deferred when PostHog was configured on 2026-08-13, because the product had no arena and no traffic yet: no route to point a query at, no events to watch, and no session recordings to draw trends from. They are recorded here rather than in the setup report that produced them, because this is the feature whose completion unblocks them. None of them is a code change; all three are configuration in PostHog itself. They come unblocked at slightly different moments, so each one says what it is actually waiting for.

- [ ] Decide the approach
- [ ] Build it
- [ ] PostHog, once the arena route exists: rescope the "Broken experiences" Replay Vision scanner. It was armed against all sessions at a 0.5 sample rate as a fallback, because no arena URL existed to scope it to, so it currently watches everything rather than the flow that matters. Point it at the real completion flow with `$current_url icontains <path>`. Leave the "User frustration" scanner alone, it is gated on `$rageclick` with no URL scope on purpose, so the two stay disjoint and cannot corroborate each other on the same defect.
- [ ] PostHog, once `prompt_submitted`, `model_selected`, and `vote_cast` are tracked: add the two custom scouts that were ruled out at setup for having no events to watch. An arena submission funnel scout, prompt through streaming completion through vote, looking for conversion drops and abandoned flows; and a model-comparison fairness scout, watching vote distribution across models for unexpected winner bias or bad vote data.
- [ ] PostHog, once the two Replay Vision scanners have accumulated observations: re-enable the `signals-scout-replay-vision` scout from the inbox. It reads trends across observations rather than watching sessions itself, so it has nothing to work from until the scanners have produced some. This is the one of the three waiting on real traffic rather than on shipped code, so it will probably come good later than the other two.

## Slice 2: App shell & thread history

### 7. App shell & thread history

The frame everything else sits inside: a top bar and sidebar that stay in place while the page scrolls, the thread's name, and each model's win record shown right there (shrinking down to a small dot and number if it gets crowded). The sidebar lists a signed-in user's own past threads so the tool actually feels usable across visits, not just in one sitting.

- [ ] Decide the approach
- [ ] Build it

## Slice 3: Public visibility & sharing

### 8. Public thread visibility & sharing

Anyone should be able to open a thread's link and see it, without an account, that's what actually makes it shareable. Only sending a prompt and voting need sign-in. A made-up or deleted thread just shows a plain not-found page either way. The thread's real owner sees everything everyone else sees, plus the ability to actually use it.

- [ ] Decide the approach
- [ ] Build it

## Slice 4: Leaderboard

### 9. Leaderboard: global & personal

Two leaderboards from the same votes, one for everyone, one just for the signed-in user. Each row's win rate is the big, bold number, in the accent color, with a small bar next to it, always written as "won 4 of 5," never a bare percentage or a made-up score. Smaller, quieter numbers underneath for average speed and time-to-first-token, each clearly labeled. No cost or "cheapest" stat, every model is free, so that number never means anything here. First place gets a subtle highlight, nobody else does.

- [ ] Decide the approach
- [ ] Build it

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- A "fastest" label on the leaderboard, tagging whichever model already has the best average speed, only for models with enough votes to mean anything. Nice to have, not required.
- Giving each model's own little icon a distinct look instead of plain gray. Nice to have, not required.
- Privacy policy and terms pages.
- Rich link previews when a thread gets shared somewhere.
- Any kind of admin or moderation page.
- A public API for the leaderboard data. Nobody's asked for this.
