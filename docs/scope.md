# Scope: LLM Arena

Send one prompt, watch up to three AI models answer it at the same time, and vote for the best one. Over time those votes and the real per-call numbers, speed, tokens, cost, build an honest leaderboard of which model is actually worth using.

Build it in a thin, working slice first, one prompt actually reaching a model and coming back, before making any single part of it fuller. Then thicken it piece by piece. Before building anything, decide what you're doing and why in a few plain sentences, then build it, and if the plan turns out wrong once it's actually built, say so and fix the plan too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its own short list of what's genuinely being done, and check each part off as it's finished, right in this file. That way this file can be opened fresh, in a brand new conversation, and it's obvious what's already done and what's still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: Next.js (App Router), TypeScript, Tailwind, shadcn for components (card, button, popover, loading skeleton, and whatever else the UI actually needs as it gets built), Prisma with Postgres, Clerk for auth, Arcjet in front of the endpoint, PostHog for analytics and observability.

## Sketches

There are rough hand-drawn sketches for the arena screen, the leaderboard, and the models page. Treat them as structure only, where things sit, what exists on the page, not as the final design or the actual colors, all of that is already decided elsewhere in this file. If something in a sketch genuinely contradicts what's written here, stop and ask which one actually wins rather than guessing.

## At a glance

| #   | Feature                                     | Phase      | Status                                                               |
| --- | ------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| 1   | Connecting to a model                       | Foundation | done; verified end to end against real accounts                      |
| 2   | Coding standards & tooling                  | Foundation | done; hook tested in both directions                                 |
| 3   | Data model                                  | Foundation | done; migrated and verified against the real database                |
| 4   | Design & look                               | Foundation | done; checked by eye in a real browser                               |
| 5   | Model picker                                | Slice 1    | done; live catalog, and the spending gate checked in a real browser  |
| 6   | Send a prompt, parallel streams, and voting | Slice 1    | done; both halves verified in a real browser, PostHog events landing |
| 7   | App shell & thread history                  | Slice 2    | UI built; not wired to real threads                                  |
| 8   | Public thread visibility & sharing          | Slice 3    | not started                                                          |
| 9   | Leaderboard: global & personal              | Slice 4    | UI built on placeholder rows; real query not started                 |

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
- [x] Half B: the model call, Arcjet's rules, and PostHog events all confirmed in a real signed-in browser at `/proof`, 2026-08-13. This was the last thing `curl` could not prove, since the route refuses signed-out callers and Arcjet denies every scripted one. One narrower question is deliberately still open under feature 6: whether a browser request is _allowed_ by bot detection rather than 403'd was not checked on purpose, so it is not claimed here.

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

### 2. Coding standards & tooling

Write down the real conventions for this project once it actually exists, then install linting, formatting, and a pre-commit hook that actually enforces them.

- [x] Decide the approach
- [x] Prettier with `prettier-plugin-tailwindcss`, plus `eslint-config-prettier` so ESLint stops arguing about formatting
- [x] Four typescript-eslint rules that encode this project's own rules, on top of `eslint-config-next`
- [x] `typecheck`, `lint:fix`, `format`, `format:check`, and `verify` scripts
- [x] Husky pre-commit running `lint-staged` plus a whole-project typecheck, self-installing via `prepare`
- [x] `docs/coding-standards.md` written from what the codebase already does, `CLAUDE.md` pointing at it
- [x] Whole repo formatted, and `pnpm verify` clean: typecheck, lint, format check, and a real production build
- [x] The hook exercised for real, both directions: a file with `any` is refused, a clean file is formatted and re-staged

**The approach, decided and built 2026-08-13.**

_Prettier, not Biome._ The only styling rule in `CLAUDE.md` a machine can enforce is Tailwind class order, and `prettier-plugin-tailwindcss` is the maintained sorter that understands Tailwind v4 taking its config from the stylesheet rather than a JS file. It is pointed at `app/globals.css` for that reason. Biome would be faster and would not sort classes, which is the one thing worth having.

_Lint adds four rules, not a strict preset._ `eslint-config-next` stays, and on top of it: `no-explicit-any` as an error, because "no `any`" was a stated rule with literally nothing enforcing it; `consistent-type-imports`; `prefer-readonly`; and `no-floating-promises`. The last one is the reason typescript-eslint's project service is turned on, which makes lint slower. Worth it here: the whole app is async and streaming, and an un-awaited promise does not throw, it just resolves into nothing and the stream quietly stops. A broad `recommendedTypeChecked` preset was deliberately not used, since most of what it would flag is framework noise rather than this project's rules.

_`pnpm verify` exists because the rule was not being kept._ `CLAUDE.md` requires typecheck, lint, and a real build after every change, and `typecheck` was not even a script, so it only happened when someone remembered the raw `tsc` invocation. One command makes the rule cheap enough to actually follow.

_The hook is fast on purpose._ `lint-staged` touches only staged files; the typecheck runs over the whole project because types are cross-file and a staged-only typecheck would go green while the project is broken. The production build stays out, because a hook slow enough to resent is a hook that gets bypassed.

_Husky and lint-staged over a hand-rolled hook._ Two dev dependencies against writing staged-file filtering by hand, which lint-staged already does correctly including stashing unstaged work. `prepare` installs the hook on `pnpm install`, so a fresh clone is protected without a remembered setup step.

**What building it changed about the plan.**

_The hook needed `set -e`, and only a real test found it._ A husky hook is a plain shell script with no `set -e` by default, so its exit code is whatever the last line returned. The first version ran `lint-staged` then `typecheck`; `lint-staged` correctly refused a file containing `any`, the script carried on to the typecheck anyway, and the hook exited 0. It would have printed a convincing wall of errors and let the commit through. This is exactly the failure the feature exists to prevent, and reading the script would not have caught it.

_The standards doc splits enforced from judgment._ Writing it made clear that most of `CLAUDE.md`'s rules, the functional style, immutable data, folder-by-feature, never showing a raw error, are things no tool will ever check. Marking each one honestly is more useful than a flat list that implies the tooling has them covered.

_Formatting the repo touched this file too._ Prettier reflows markdown tables and normalises emphasis, so the first run rewrote parts of `docs/scope.md`. Expected, and it means future diffs to the scope are content rather than whitespace.

### 3. Data model

The core things every feature depends on: users tied to Clerk, threads, each model's own messages inside a thread, and votes. A vote should only ever be possible on a turn where two or more models actually answered.

- [x] Decide the approach
- [x] `prisma/schema.prisma`: `Thread`, `Turn`, `Answer`, `Vote`, replacing the placeholder comment
- [x] The initial migration, `20260813214444_arena_data_model`, applied to the real Postgres and committed
- [x] `pnpm verify` clean: typecheck, lint, format check, and a real production build
- [x] Verified by hand against the real database, 2026-08-13: a thread with two turns, three answers on the first one including a failed one, and a vote, all inserted and read back through the join the leaderboard will use; a vote pointing at another turn's answer refused by Postgres with `23503 Vote_answerId_turnId_fkey`; a second vote on the same turn refused with `23505 Vote_turnId_key`; deleting the thread leaving no turns, answers, or votes behind

**The approach, decided 2026-08-13.**

_The shape is `Thread → Turn → Answer`, plus `Vote`._ A `Turn` is one prompt round: it holds the single prompt text every selected model received, and an `index` unique per thread so turns are addressable rather than only sortable. An `Answer` is one model's reply to one turn, unique on `(turnId, modelId)`.

This was a real fork against a flat `Message` table with `role`, `modelId`, and a parent pointer, which is closer to this file's own original wording and closer to a generic chat log. Turn plus Answer wins because the arena is strictly lockstep, one prompt, up to three answers, repeat, and modelling that directly makes "how many models actually answered this prompt" a property of one turn instead of a group-and-count over a self-join. It also gives the vote a natural parent. A model's own separate conversation, which feature 6 needs for follow-ups, is reconstructed by walking the thread's turns and taking that model's answer from each; a turn where it failed simply contributes nothing, which is the correct behaviour and is awkward to express against a flat log.

_No mirrored `User` table._ Clerk is the system of record for identity. A local copy has to be kept in sync by webhook, and drift between the two is a real bug class for no gain: every user attribute the product shows belongs to Clerk, and nothing here needs one of our own. `clerkUserId` sits indexed on `Thread` and on `Vote`. The personal leaderboard and the sidebar's thread list are both filters on that column. If we ever genuinely own per-user data, adding the table is a migration, not a redesign.

_No `Model` table._ The catalog is OpenRouter's and it changes without us; feature 5 fetches it live. `modelId` is a string on `Answer`, indexed, and the leaderboard groups by it. A local mirror would go stale silently, which is the same failure as the user table for the same reason.

_Answers carry the metrics inline, mapped one to one from `CallMetrics`._ The seven fields in `features/model-call/types.ts` become seven columns, nullable exactly where that type is nullable, because `null` there means the provider did not report it and that is genuinely different from zero. Feature 1 already established that one pure function feeds the card, the row, and the PostHog event; keeping the column set identical to the type is what stops the row from being the one that drifts.

_Cost is `Decimal(12, 8)`, not a float._ It reads $0.0000 today and that is an honest measurement, not a placeholder. Storing it as a float would be the usual money mistake, and the existing rule is that the number is already correct the moment a paid model lands. Prisma hands back a `Decimal`, so conversion to `number` happens in exactly one mapper at the edge rather than leaking the type through the app.

_An answer has a status, and its failure text is never rendered._ `STREAMING`, `COMPLETE`, `FAILED`. A failed answer keeps a short `failureReason` for the server log, and that column is for people reading logs, never for a screen. The rule that a person only ever sees a plain sentence plus a retry is unchanged by the row existing.

_The vote invariant is split honestly in two, because only half of it is a schema constraint._

- The winner must belong to the turn being voted on. This one is enforceable and is enforced: `Answer` carries `@@unique([id, turnId])`, and `Vote` holds a composite foreign key on `(answerId, turnId)`. A vote pointing at another turn's answer is rejected by Postgres, not by our code remembering to check.
- Two or more models must actually have answered. No check constraint can count rows in another table, and a trigger is more machinery than this project should carry. This is enforced in feature 6's single transactional vote write, and it is the one invariant in the app that the database itself does not hold. Recorded here rather than left implied, because a `@@unique` nearby makes it easy to assume the whole rule is covered when it is not.

_One vote per turn, no per-user vote._ Only the thread's owner can vote, so `turnId` is unique on `Vote`. `clerkUserId` is still stored on the vote for the personal leaderboard, so that query never has to join back through the thread.

_Ids are cuid2._ A thread id is a public URL in slice 3, so it wants to be short and URL-safe, and cuid2 is not guessable the way a sequential integer is.

_Cascade on delete, from the thread down._ Deleting a thread takes its turns, answers, and votes with it. There is no orphan state worth preserving and no soft delete, since feature 8 already decided a deleted thread is just a plain not-found page.

_No `visibility` column._ Slice 3 decided every thread is readable by link; there is no private mode to represent. Adding the column now would be a field with one value forever, which is dead schema of the same kind feature 1's Arcjet correction called out.

_What this feature deliberately does not build._ Schema, migration, and a hand-verified round trip only. No query functions, no repository layer. Their only callers arrive in feature 6, and data access written ahead of a caller is exactly how a `lib/`-shaped layer folder starts, which this codebase has already had to delete once.

**What building it changed about the plan.**

_The composite foreign key needed a redundant unique index to be declarable._ Prisma refuses a one-to-one relation whose fields are not covered by a single unique constraint, so `Vote` carries `@@unique([answerId, turnId])` on top of `turnId` and `answerId` each already being unique alone. It constrains nothing new and exists only to make the relation expressible. Worth knowing before someone reads it as a real rule and tries to reason from it.

_The first version of the verification proved nothing, and only running it showed that._ The cross-turn vote was rejected, which looked like a pass, but the error code said `23505 Vote_answerId_key`: the test had aimed the bad vote at an answer that already had one, so the plain unique index fired first and the composite foreign key was never reached. Aimed at an unvoted answer instead, the refusal comes back as `23503 Vote_answerId_turnId_fkey`, which is the constraint the design actually rests on. A test that passes for the wrong reason is worse than one that fails, and reading the schema would never have caught this; only the error code did.

_Cost comes back as a string, not a number._ `Decimal` crosses the wire as `"0.00000000"`. That confirms the mapper this feature deferred is genuinely needed rather than a nicety, and it is feature 6's job when it writes the first real row.

_`durationMs` is nullable, unlike in `CallMetrics`._ The type says a duration is always present, which is true for a call that finished. A row exists from the moment a stream starts and can end in `FAILED`, so the column has to tolerate a call that never produced one. This is the one place the column set deliberately does not match the type, and it is the row being more permissive than the type, never less.

### 4. Design & look

A coffee or dark brown background, warm, not neutral gray or true black. One accent color, rust, used only for things you interact with, buttons, links, focus states, the win-rate bar, never as decoration. Because the background and the accent are both warm tones from the same family, the accent has to stay clearly brighter and more saturated than the background, enough that a button never blends into the page behind it, that's a real risk with two warm colors this close and worth checking by eye, not just by the numbers. Blue, indigo, and purple are never the accent, under any circumstance. Green is reserved only for marking a winner, red only for errors, never reused for anything else. Contrast should genuinely hold up in both light and dark mode, not just look fine at a glance.

_This was blocked on a person from 2026-08-13 until the plugin was installed._ `CLAUDE.md` requires Anthropic's `frontend-design` plugin to actually be invoked for any UI work, not assumed active, and it was absent from `~/.claude/plugins/installed_plugins.json` rather than merely not firing on its own. It was installed with `/plugin install frontend-design@claude-plugins-official` and invoked before any of the approach below was decided. Kept here because the same trap applies to any later plugin the project comes to depend on: absent and not-firing look identical from inside a conversation, and only reading that file tells them apart.

- [x] Install the `frontend-design` plugin (a person has to do this)
- [x] Decide the approach, with `frontend-design` invoked first
- [x] Build: initialise shadcn first, so its token layer is the one the palette is written into
- [x] Build: the full token system in `globals.css`, dark and clay light
- [x] Build: the three fonts wired in `app/layout.tsx`, `Geist` dropped, placeholder metadata replaced
- [x] Build: the trace, one shared component at all three of its scales
- [x] Build: a throwaway `/design` harness, the only way to see any of this before slice 1 exists
- [x] Build: `pnpm verify` clean
- [x] Build: checked by eye in a real browser, 2026-08-14. The palette, the type scale, the focus ring, and the trace at all three scales all read correctly on the `/design` harness. This was the last thing feature 4 owed, and it is also what unblocks deleting that harness at the end of feature 6's half B.

**What building it settled, 2026-08-13.**

_shadcn was initialised first, and that ordering was the point._ `shadcn init` writes `app/globals.css` itself, so hand-writing the palette and then initialising later would have thrown the palette away. It ran first, and the palette is written into the token names shadcn already owns: `--primary` is rust, `--background` is the coffee ground, `--destructive` is the error rose, `--ring` is rust. Anything added later with `shadcn add` arrives already wearing this design instead of neutral gray, and nothing has to be re-skinned component by component. It pulled in `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `tw-animate-css`, plus `lib/utils.ts` with `cn`. The preset chosen was `radix / nova`; the preset's own font choice is irrelevant, since `app/layout.tsx` sets all three faces itself.

_Every hex appears exactly once._ `globals.css` holds a raw scale at the top, `--coffee-950` through `--rose-deep`, and everything below it only points a role at one of those. Light mode is eleven lines of re-pointing, not a second palette. The copy-paste rule in `CLAUDE.md` applied to colour would otherwise have been broken by definition, because a theme override has to restate every role.

_Dark is `:root`, light is the override._ A visitor who has stated no preference gets dark, because that is the product's identity, and light applies under `prefers-color-scheme: light` or an explicit `.light` class. shadcn's `dark:` variant was redefined to fire on both the class and the media query; its own definition only covers the class, so a shadcn component using `dark:` would have quietly disagreed with the tokens around it for anyone on system dark. No theme library was added: the real toggle is the app shell's job in slice 2, and the class it will set already works.

_Contrast was computed for every role pair before it was drawn, and every one clears 4.5:1._ Rust on the coffee ground is 5.4:1 and roughly thirty-eight times the ground's luminance, which is the "a button must never blend into the page" risk answered with a number rather than a hope. It still wants a human eye, which is the one open box above.

_The error colour moved, and the first candidate is worth recording as a rejected one._ A deep crimson `#C13B45` was the obvious answer and it fails twice: 3.4:1 on the ground, and close enough to rust in hue that a failed card in a row of three would read as merely another interactive card. The colour used is a rose-leaning red, `#E85C74` dark and `#B32B4A` light, which clears contrast and is unmistakably not orange. Colour still never carries the meaning alone.

_The trace lives in `components/`, outside `features/`._ The project files by feature and this is the deliberate exception: the arena, the leaderboard, and the top bar all render the same object, and three copies is exactly what the shared-component rule exists to stop. `Bar` is the private primitive, `Trace` and `WinRate` are what the app imports. The clock stays with the parent, so `Trace` is a pure function of its props even mid-stream.

_`/design` is a throwaway harness, like `/proof` before it._ Nothing else in the app can show a palette, a type scale, a focus ring, or the trace, and the project's rules require checking by eye in a real browser rather than reading the code. It has its own light-mode button so both modes can be checked without touching system settings. It is deleted alongside `/proof` when slice 1 lands, and it is deliberately not linked from anywhere.

**The approach, decided 2026-08-13, with `frontend-design` invoked first.**

_What was actually open._ The paragraph above already fixes the palette family, and the sketches already fix where things sit. Neither is reopened here. What genuinely had to be decided was typography, what the layout's character is beyond its structure, what light mode is, and the one element this app is remembered by.

_The read._ This is a race that produces evidence. Three models answer at once at different speeds, and the product's entire claim is that the numbers are honestly measured. Warm brown and rust pull analog and physical while the content is cold measurement, and the direction leans into that tension rather than resolving it: a warm instrument panel, measurement rendered in brass on wood instead of the cool blue-gray every dashboard defaults to. This is also what keeps the palette from landing on the cream-and-terracotta look that most generated design currently converges on, which is a real risk given rust sits right next to terracotta.

_The signature is the trace, and it is the only place boldness gets spent._ A hairline rust rule sits under each answer card's header. While the model streams it grows left to right, and the instant the first token lands a notch is stamped into it permanently. When the call ends the rule freezes. Three cards side by side means the race is literally visible, and afterwards the three traces stay on screen as a record of it: notch position is time-to-first-token, length is duration. The leaderboard's win-rate bar is the same object frozen, same hairline and same rust, and the per-model win badges in the top bar are its smallest version. One device at three scales, encoding something true about the content rather than decorating it. Everything around it stays quiet.

_Typography, three roles._ **Archivo** on its expanded axis, used sparingly, for page titles, the big win-rate number, and model badges; an expanded grotesk reads as signage and a leaderboard is signage. **Literata** for model answer text, because a warm reading serif makes an answer feel like something you read rather than log output, and it is the sharpest available separation between what a model said and what our UI says. **JetBrains Mono** with tabular figures for every measured number and label; numbers that change width while streaming would visibly undercut the honesty claim the whole product rests on. `Geist` and `Geist_Mono`, still wired into `app/layout.tsx` from `create-next-app`, get dropped.

_Dark palette, the primary identity._ `ground #1A120C`, `surface #241811`, `surface-raised #2F2118`, `rule #3D2C21`, `ink #F2E6DC`, `ink-dim #B39C8C`, `rust #E4622D`, `rust-quiet #8A3A18` for a bar's unfilled track, `win #4FA46A`, `fail #C13B45`. Rust at `#E4622D` clears the ground in both brightness and saturation by enough that a button cannot sink into the page, which is the risk the paragraph above names; it gets confirmed by eye in a real browser during the build, not signed off from a ratio.

_Light mode is unbleached clay, not cream._ `ground #E8DCCF`, `surface #F2EAE0`, `ink #241811`, with rust darkened to `#B4441C` so small text and thin rules still hold. A step deeper than paper white, so it reads as card stock in daylight rather than as the default cream background, and it stays in the same warm family as the dark mode instead of becoming a second unrelated identity. Dark-only was considered and rejected: it would have meant editing both the sketch's theme toggle and this feature's own both-modes line, and neither is wrong.

_Two corrections to the paragraph above, made because building the plan exposed them rather than worked around them._

_Red and rust collide, so hue alone can never carry an error._ "Rust for interaction, red for errors" reads fine written down, but an orange-leaning rust and an error red are genuinely hard to tell apart sitting next to each other, which is exactly the situation a failed card in a row of three creates. Error red is pushed to a deeper crimson that leans away from orange, and on top of that an error always carries an icon and the plain sentence too. The rule is that nothing in this app means anything by color alone, which the accessibility baseline in `CLAUDE.md` wanted anyway.

_The rust rule needed one word changed._ It said rust is only for things you interact with, then listed the win-rate bar, which nobody interacts with. The real rule is that rust means interaction **or** a measured record, and the trace is the second kind. Stated here rather than quietly broken during the build.

_Motion is one moment._ The three traces starting together on submit and diverging is the only orchestrated animation in the app. Nothing else moves. Under `prefers-reduced-motion` the traces render at their final state without growing, so the information survives and only the animation is dropped.

_Where all of this lives._ Every value above becomes a token in `globals.css`, per the shared-values rule in `CLAUDE.md`, and the trace is one component used by the arena card, the top-bar badge, and the leaderboard row. If any of those three ends up reimplementing it with raw classes, that is the rule being broken, not a special case.

## Slice 1: Core arena loop

_Slice 1 is done as of 2026-08-14._ One prompt reaches up to three real models at once, each streams and fails on its own, every answer's real numbers are measured server-side and stored, and the thread's owner picks a winner that the database actually enforces. Everything left in this file is a screen reading real data instead of placeholder rows, plus PostHog configuration that had nothing to watch until now.

### 5. Model picker

An "Add model" popover pulling OpenRouter's live free-tier list, sorted by context window, capped at three models, defaulting to all three selected, with removable chips next to the prompt box. Also render that same catalog as a simple `/models` page, name, context window, and pricing for each one, so anyone can browse the full list without opening the picker.

_The screens exist and are empty of anything real._ Feature 7's UI build made the popover, the chips, the three-model cap, and the `/models` table, all reading five invented models from `features/placeholder/`. What this feature still owes is the only part that matters: the live fetch of OpenRouter's `/api/v1/models`, filtered to the free tier and sorted by context window. It also replaces `features/model-call/catalog.ts`, which currently enforces the free-tier rule by checking for a `:free` suffix, deliberately conservatively, because it had no catalog to check against.

- [x] Decide the approach
- [x] Build: `features/models/catalog.ts`, the fetch, the zod parse, the free-tier filter, the sort, and the `ArenaModel` type
- [x] Build: `/models`, the arena, and the leaderboard become server components that fetch the catalog and pass it down
- [x] Build: the picker, the chips, and the default three read the live list; `features/placeholder/` loses every model
- [x] Build: the route's spending gate checks the live catalog, with the regex as the fallback
- [x] Build: `pnpm verify` clean
- [x] Verified with a running dev server, 2026-08-13: all fifteen free models on `/models` with their real vendors, real context windows, and a computed $0.0000; the arena defaulting to Nemotron 3 Ultra, Laguna S 2.1, and Gemma 4 31B, three vendors as designed; and all three screens falling back to the plain sentence and a retry when the catalog host was pointed somewhere unreachable
- [x] The spending gate confirmed in a signed-in browser, 2026-08-13. `openai/gpt-4o` came back as "That request was not something the arena could read"; a `:free` id that is not in the live catalog came back as "That model isn't one the arena can send a prompt to". Both plain sentences, no raw error either time. `curl` could not have shown this, since the route refuses a signed-out caller before it ever reaches the gate, the same reason feature 6's bot-detection box is still open
- [x] Checked by eye in a real browser, 2026-08-13: the picker's fifteen-model list and the `/models` table both read correctly in light and dark, and keyboard-only navigation works

_The two layers of the gate answer with two different sentences, and that is worth knowing before someone reads one as the other._ A paid id never reaches the catalog check: it fails the `:free` test inside the request schema, so the route answers with the generic "could not read" sentence that covers every malformed request. Only an id that looks free but is not listed gets the specific one. Both are plain sentences with no rule name and no provider text, which is what the rule actually requires, but if the specific sentence is ever the one being looked for in a log, a paid id will not produce it.

**What building it changed about the plan.**

_The free-tier test could not stay in `features/model-call/`._ The plan said that file would keep the regex as the fallback gate, but the models feature needs the same test to filter the catalog it fetches, and the model-call feature needs the catalog to check membership. Written as planned, those two files import each other. The suffix test moved into `features/models/catalog.ts`, which is the feature that owns what a model is, and `features/model-call/catalog.ts` was deleted; `request.ts` imports the test from its new home. This is a better split than the one that was planned, not just a workaround: there is now exactly one file that decides what counts as a callable model.

_Deleting the placeholder models reached the leaderboard too._ The plan only named the picker, the chips, and `/models`. The leaderboard renders a model badge and name on every row, so it had to take the real catalog as well, and its page became a server component for the same reason the other two did. This is the placeholder folder doing exactly what it was built to do: the compiler listed every consumer the moment the models were removed, and none of them could be missed.

_The order needs a tie-break, and the live data proves it._ Two NVIDIA models both advertise a 1,000,000 window and four models share 262,144, so sorting on context alone leaves their order up to whatever OpenRouter happened to send. Name ascending settles ties, which is what keeps the picker, the table, and the default three from quietly reshuffling between requests.

_The `/proof` harness was already pointing at a delisted model._ Its hardcoded `inclusionai/ling-3.0-tiny:free` is not in the live catalog any more, so the new gate would have started refusing it. The id was updated and the harness now says out loud that a typed-in id goes stale. Worth recording as the shape of a real failure this feature introduces on purpose: a model that disappears from OpenRouter becomes a refusal rather than a broken provider call, which is the right end of that trade, and any stored thread naming a delisted model will hit it too.

_A model shows the same badge letter as its siblings, and that is now visible rather than theoretical._ Ten of the fifteen free models are NVIDIA, so the picker shows a column of identical `N` marks. The vendor line under each name is what makes the row readable; the badge was never carrying the identification on its own. Giving each model a distinct mark stays on the "not doing right now" list, but this is the first place where that decision has a real cost.

**The approach, decided 2026-08-13.**

_The live catalog was read before deciding, not assumed._ 411 models, 15 of them `:free`. All 15 price at zero on both prompt and completion, all 15 output text, and no paid model carries the suffix, so the conservative regex in `features/model-call/catalog.ts` is still exactly right today. Three models price at zero _without_ the suffix: `google/lyria-3-pro-preview` and `google/lyria-3-clip-preview`, which output audio, and `openrouter/free`, which is a router that picks some model for you rather than a model you can name. None of the three belongs in a screen whose entire point is comparing named models side by side. So the free tier here is defined as the `:free` suffix **and** zero prices **and** text among the output modalities, not as price alone. Widening it to "anything that costs nothing" would have quietly put an audio generator in the picker.

_Fetched on the server, cached for an hour, never from the browser._ Both screens become server components calling `fetch(..., { next: { revalidate: 3600 } })`. The endpoint needs no key, but handing the browser a third-party fetch buys nothing: Next's data cache makes one request an hour serve every visitor, and it avoids adding a second public route of our own that Arcjet would then have to cover. `Composer` stays a client component and receives the list as props, which is also what lets the picker keep working without a loading state.

_Parsed with zod, and a bad row is dropped rather than fatal._ Same precedent `request.ts` already set with message parts: a model whose shape we do not recognise is skipped and the rest of the list survives. One field rename at OpenRouter should not take the whole picker down.

_The context number shown is what a provider will actually serve._ `top_provider.context_length`, falling back to `context_length`. These already disagree in the live data, Gemma 4 26B advertises 262,144 and its top provider serves 131,072, and this product's whole claim is that its numbers are honest. Sorting uses the same number, so the order and the column can never tell different stories.

_Vendor, display name, and badge letter are derived, not stored._ OpenRouter's `name` reads `NVIDIA: Nemotron 3 Ultra (free)`: vendor before the colon, `(free)` trimmed off the end since every model on these screens is free and repeating it in fifteen rows is noise, and the badge letter from the vendor. Ten of the fifteen are NVIDIA, so badge letters will repeat; accepted, because the badge is plain gray by design and the full name sits immediately beside it. Distinct per-model icons are already on the "not doing right now" list.

_The default three are the first model of each distinct vendor, walking the context-window sort._ Today that is NVIDIA Nemotron 3.5 Lightning at 1M, Poolside Laguna S 2.1 at 262k, and Google Gemma 4 31B at 262k. A flat top-three by context is the simpler rule and was rejected: two of its three picks are the same vendor right now, and since NVIDIA publishes ten of the fifteen free models, the default could drift to three NVIDIA siblings without anything in the app changing. A first-time visitor's first race should show three genuinely different models, because "watch models that differ answer the same prompt" is the product. The rule stays deterministic and needs no hand-maintained list.

_The price column is computed from the real number, not typed as a string._ `pricing.prompt` is a per-token price as a string; the column is that times a million, formatted to four decimals. It renders $0.0000, which is correct, but it is now a real division of a real measurement rather than a literal in the JSX, which is what the cost rule in `CLAUDE.md` actually asks for.

_The spending gate becomes two layers and fails safe._ `streamRequestSchema` keeps the regex, sync and unchanged, as the cheap first cut. The route then checks the parsed id against the live free list and returns a plain 400 sentence if it is not there. If the catalog fetch itself fails, the regex alone still gates the call: conservative, and sound because no paid model carries the suffix. The gate never widens because a fetch failed, which is the failure mode worth designing against, since the whole point of it is that nobody can spend our money.

_A failed fetch shows a sentence and a retry, with no local fallback list._ Shipping a hardcoded set of models to fall back on is the stale-mirror failure feature 3 already rejected twice, once for users and once for models, and it would be worse here: the fallback would be the one list nobody notices is wrong. The screen says plainly that the model list could not be loaded and offers a retry.

_The placeholder models are deleted, not repointed._ `PLACEHOLDER_MODELS`, `PLACEHOLDER_SELECTED_MODEL_IDS`, `findPlaceholderModel`, and the invented `initial` field all go. The turns and standings that are still fake stop naming model ids and carry a slot index instead, resolved against the real selection, so features 6 and 9 keep the scaffolding they were built on while the app has exactly one source of truth about what a model is. Repointing the fake ids at real ones would have left two catalogs that look alike and drift apart.

_Where it lives._ `features/models/catalog.ts` owns the fetch, the parse, the filter, the sort, and the `ArenaModel` type that every screen reads. `features/model-call/catalog.ts` keeps `isFreeTierModelId` as the fallback gate, and its comment, which currently says feature 5 will replace it, gets corrected to say feature 5 demoted it.

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
- [x] Arcjet: a real signed-in browser passes bot detection, settled by the half A and half B browser runs on 2026-08-14. This was left open deliberately because `curl` could never show it, `allow: []` denies every scripted caller, and the earlier `/proof` run had not checked it on purpose. Prompts streaming, retries running, and votes writing from a browser are that confirmation: every one of those is a request the rule would have 403'd if it read the browser as a bot.

**What code review changed, 2026-08-13.**

_The model id was a spending hole._ `modelId` accepted any nonempty string and was handed straight to OpenRouter under the app's own key, so any signed-in person could have posted `openai/gpt-4o` and spent real money. "Every model here is free tier" was a product rule that nothing actually enforced. `features/model-call/catalog.ts` now enforces it on the server: an id must be an OpenRouter `:free` variant. Checked against the live catalog, all 15 `:free` models price at zero and no paid model carries the suffix. It is deliberately conservative, three zero-cost models without the suffix are refused, because refusing a free model is far cheaper than accepting a paid one. Feature 5 replaces this with the live free-tier catalog it already has to fetch for the picker.

_Feature 5 did that on 2026-08-13, and moved the file._ The suffix test now lives in `features/models/catalog.ts` alongside the live catalog, and `features/model-call/catalog.ts` is gone; the route checks the id against the live list after Arcjet has allowed the request, and narrows to the suffix alone if that fetch fails. Anything looking for the old path will not find it.

_Fail-open is now real, and deliberately narrow._ The comment promised the request survives an Arcjet outage, but nothing in our code made that true; it happened to hold only because the SDK converts transport failures into an `ERROR` decision internally. The `protect()` call is now guarded so the guarantee belongs to us rather than to a dependency's implementation detail. Building the client is deliberately left outside the guard: it throws on a missing key or bad rule options, and that has to stay loud, because silently allowing every request when the app is misconfigured would turn a broken deploy into an unprotected one.

_Process-wide client caches are down to one place._ Review flagged the `globalThis` cache as against the functional-style rule. Removing it would be wrong: the database pool genuinely needs to survive hot reload or development keeps opening connections until Postgres refuses more, and a rebuilt Arcjet client throws away its local decision cache. The real problem was that Arcjet had copied the trick, so there were two hand-rolled caches and two unchecked casts. `singleton.ts` now owns it, both clients read as ordinary functions, and the "one place in the app that keeps state" claim is true again.

Every prompt sent, every answer finishing, and every vote cast should be tracked as a real PostHog event, so there's an honest funnel from prompt to answer to vote. A model failing should also be logged properly on the server, not just shown to the user and forgotten. Separately from that funnel, every actual model call should also be wrapped so PostHog captures its own real tokens, cost, and latency per call, that's PostHog's own LLM analytics, not the same thing as the funnel events or the numbers already shown on the response card.

_Three PostHog chores are waiting on this feature._ All three were deferred when PostHog was configured on 2026-08-13, because the product had no arena and no traffic yet: no route to point a query at, no events to watch, and no session recordings to draw trends from. They are recorded here rather than in the setup report that produced them, because this is the feature whose completion unblocks them. None of them is a code change; all three are configuration in PostHog itself. They come unblocked at slightly different moments, so each one says what it is actually waiting for.

_The screen exists and reaches nothing._ Feature 7's UI build made the arena: the prompt, the answer cards with the trace above each one, the collapsible metrics, the streaming and failed states, the winner badge, and the composer. All of it runs on `features/placeholder/`. Picking a winner moves local state and writes nothing. The vote rule is already expressed in the UI, the pick control is disabled until two models have answered, but it is expressed twice now and this feature owns the real one: the database is what actually enforces it. Everything this feature was already going to build is still ahead of it, and the Arcjet half above is the only part genuinely done.

- [x] Decide the approach
- [x] Half A: the wire contract, one `answerId` per request, with each model's own conversation rebuilt on the server
- [x] Half A: the submit action, writing the thread, the turn, and one answer row per selected model in a single transaction
- [x] Half A: Arcjet's budget moves to the action; the stream route keeps shield, bot detection, and an ownership check
- [x] Half A: three lanes in the browser, each owning its own stream and its own abort, plus single-model retry
- [x] Half A: the server writes text, metrics, and status, and finishes writing even if the browser is closed
- [x] Half A: `/t/[threadId]` reads a real thread back out of the database on load
- [x] Half A: `pnpm verify` clean, and the routes probed on a running server: `/` renders the empty arena, an unknown thread is a plain 404, and the stream route still refuses a signed-out caller
- [x] Half A: two bugs found by the browser check on 2026-08-14 and fixed, root cause confirmed in the SDK's own source rather than guessed
- [x] Half A: re-checked in a signed-in browser, 2026-08-14, and correct: text appears live in every lane, a failed model fails alone, follow-ups continue each model's own conversation, a retry actually runs, and a reload shows the same thread
- [x] Half B: the vote action, one transaction, ownership and the two-answers rule
- [x] Half B: the winner state in the UI, optimistic and put back if the write is refused, with a plain sentence
- [x] Half B: `posthog-node` and `@posthog/ai`, four server events, the client-side `model_selected`, and `$ai_generation` per call
- [x] Half B: `pnpm verify` clean, and the app smoke-tested on a running server
- [x] Half B: `/proof` and `/design` deleted, and `features/placeholder/` cut down to what features 7 and 9 still stand on
- [x] Half B: verified in a signed-in browser, 2026-08-14. A vote landed and survived a reload; a second tab voting on the same turn got the "already picked" sentence with the original winner intact; and all five events arrived in PostHog, `prompt_submitted`, `model_selected`, `answer_completed`, `vote_cast`, and the `$ai_generation` LLM event carrying a correct $0.00 cost.
- [ ] PostHog, now unblocked: rescope the "Broken experiences" Replay Vision scanner. It was armed against all sessions at a 0.5 sample rate as a fallback, because no arena URL existed to scope it to, so it currently watches everything rather than the flow that matters. Point it at the real completion flow with `$current_url icontains <path>`. Leave the "User frustration" scanner alone, it is gated on `$rageclick` with no URL scope on purpose, so the two stay disjoint and cannot corroborate each other on the same defect.
- [ ] PostHog, now unblocked (all three events ship as of 2026-08-14): add the two custom scouts that were ruled out at setup for having no events to watch. An arena submission funnel scout, prompt through streaming completion through vote, looking for conversion drops and abandoned flows; and a model-comparison fairness scout, watching vote distribution across models for unexpected winner bias or bad vote data.
- [ ] PostHog, once the two Replay Vision scanners have accumulated observations: re-enable the `signals-scout-replay-vision` scout from the inbox. It reads trends across observations rather than watching sessions itself, so it has nothing to work from until the scanners have produced some. This is the one of the three waiting on real traffic rather than on shipped code, so it will probably come good later than the other two.

**The approach, decided 2026-08-14. Two halves, streams first.**

_Why halved._ Half A is a prompt actually reaching three models, streaming back, and landing in the database; half B is the vote and the analytics on top of it. The streaming half is the risky one and the only one that can be checked honestly on its own, and a vote written against a stream shape that then has to change is work done twice. Feature 1 was split for the same reason and it was right there too.

_A thread exists before a single token does._ Submitting the first prompt calls a server action that writes the `Thread`, the `Turn`, and one `Answer` row per selected model, all `STREAMING`, in one transaction, and the browser then navigates to `/t/[threadId]` and opens its streams. Three parallel requests cannot each create the turn without racing for it, and the alternative, letting whichever request arrives first win, means a retry either duplicates the turn or has to reason about who got there first. Writing the ids up front also means the prompt survives every model failing, which is the honest record of what happened, and it hands the browser the ids the vote will need. `/` stays the new-thread screen; the URL is the thread, which is what slice 3's sharing needs anyway and what lets feature 7's sidebar link to something real.

_The wire contract changes: a request carries an `answerId`, not a model and a transcript._ Today the browser posts a model id and the whole message list. That was right when there was nothing to check it against, and it is wrong now: the client would be choosing which model gets called and what history it is given. The route now takes one `answerId`, loads that row, refuses it unless the thread belongs to the caller, and rebuilds that model's own conversation from the database by walking the thread's turns and taking that model's completed answer from each. A turn where it failed contributes nothing, which is exactly the behaviour feature 3's `Turn`/`Answer` shape was designed for, and it means the per-model conversation is a property of the data rather than of whatever the browser happened to send.

_The numbers are written by the server, never reported by the client._ `onFinish` writes the text, the seven `CallMetrics` fields, and `COMPLETE`; the failure path writes `FAILED` with a `failureReason` for the log and nothing for the screen. A leaderboard built from numbers the browser could edit would not be worth building, and this is the same principle as the model-id gate: if the client can assert it, it is not measured. The stream is consumed server-side, so closing the tab mid-answer still lands a finished row.

_A row left `STREAMING` is read as failed._ A crashed server or a lost connection can leave one, and nothing goes back to rescue it. On load, a `STREAMING` row is rendered as the failed card, since nothing is streaming into it any more. A retry overwrites the row rather than adding a second one, which is what the `(turnId, modelId)` unique already requires.

_Arcjet's budget moves to the submit action, and this corrects the half already built._ The token bucket is charged once per prompt, in prompts, and the `MODELS_PER_PROMPT` multiplication goes away: the action is the one place that knows a prompt happened, so the unit stops needing conversion. Prompt-injection detection moves with it, since it reads the prompt text and there is now exactly one place the text arrives instead of three copies of it. The stream route keeps shield, bot detection, and sign-in, and gains the check that actually matters there: the answer row has to belong to a thread the caller owns. That is a stronger gate than a rate limit, because it makes streaming into somebody else's thread impossible rather than merely expensive. The verified behaviour recorded above, injection caught at 0.995 and the bucket denying on the 31st request, stays true; the numbers just stop being multiplied and the rules move one layer out.

_Three lanes, one component each, and no shared stream state._ Each selected model renders a lane that owns its own `useChat`, its own request, and its own abort. A parent hands every lane the new turn's ids and nothing else. Independence is then structural rather than promised: there is no shared object a slow model can hold, and no lane can observe another. This is feature 1's transport decision carried all the way into the component tree, and it is why the answer card can already render three unrelated states side by side.

_What the browser holds during a session is what it streamed; the database is what a reload reads._ There is no refresh after each turn. Re-reading the server's copy mid-session would either flicker or fight the live stream for the same card, and the two only diverge if a write failed, which is a case the UI has to handle with a sentence anyway. Load reads the thread; the session runs on what it saw.

_The thread's title is the first prompt, trimmed._ Roughly sixty characters, cut at a word boundary, written when the thread is created. Asking a model to name the thread costs a call and a wait on every first prompt for something the first prompt already says, and it is the kind of feature that looks clever and reads worse.

_The vote is one action and one transaction._ It checks that the caller owns the thread, counts the turn's `COMPLETE` answers, refuses below two, and inserts the row. That count is the invariant feature 3 recorded as the one the database cannot hold, so it is enforced exactly once, here, inside the transaction rather than in a check the UI also happens to make. The unique on `turnId` turns a double vote into a refusal rather than a second row, and the person sees a plain sentence saying the winner for that prompt is already picked. The UI keeps showing its optimistic winner until the action says otherwise.

_PostHog takes two dependencies, and the funnel events are captured on the server._ `posthog-node` for `prompt_submitted`, `answer_completed`, and `vote_cast`, keyed to the Clerk user id so they join with the client-side identity already being bound, and `@posthog/ai` to wrap the model call so PostHog's own LLM analytics gets real tokens, cost, and latency per call. That wrapper needs a node client regardless, so the funnel may as well be captured where the truth already is: an answer completing is a server fact, and a vote is a transaction.

_One of the four events is a client one, and the plan above had it in the wrong place._ `model_selected` is somebody opening the picker and choosing a model. It never reaches a server, it belongs to the composer in feature 5's UI, and it is captured with `posthog-js` there. Recorded because the PostHog chore below lists it alongside the other two as though all three arrive together.

_What this feature deliberately does not build._ Public thread viewing stays in slice 3: the route requires sign-in and only the owner reads a thread, and slice 8 is what opens that up. The leaderboard's real query stays in feature 9. The sidebar's real thread list stays in feature 7's open box; this feature makes the threads it will list, and wiring the list is not smuggled in here.

**What building half A changed about the plan.**

_The persistence lands in one callback, and that was luck the plan did not count on._ It assumed the text would have to be collected separately from the numbers, since `onLanguageModelCallEnd` was known to carry usage and timings. It carries the finished `content` too, so the text, the seven metric fields, and the write all happen in one place at one moment. The card, the row, and half B's analytics event now read from a single event rather than from three things that agree by convention.

_A closed tab is handled by `consumeSseStream`, not by hope._ `createUIMessageStreamResponse` takes a callback that drains its own copy of the stream, so the model call runs to completion and the row lands even when the browser has gone. Without it the promise in the decision above, that a closed tab still lands a finished row, would have been untrue.

_The clock is per answer, not per turn._ Feature 4's design put the clock in the parent so the trace stays pure, and the plan carried that over as one start time per turn. Retrying a single model breaks that: the other lanes finished minutes ago, and a per-turn start would have the retried lane's trace begin at whatever the turn's original length was. Start times are keyed by answer id instead, which also happens to be what makes a retried lane rescale correctly against its neighbours.

_The browser keeps a message list it never sends._ Each lane runs `useChat` because it already handles the SSE parsing, the abort, and the error path, but `prepareSendMessagesRequest` replaces the body with just the answer id. So the prompt sits in the lane's local list for its own sake and the wire carries one field. Worth knowing before someone reads the transport and assumes the history is being posted.

_`/proof` is gone already, half a step early._ It spoke the old wire contract, a model id and a message list, so the moment the route changed it could only ever produce a 400. A harness that cannot prove anything is worse than no harness, and the real arena now does what it was there to do. `/design` stays until half B, and feature 4's by-eye check still needs it.

_Both bugs the browser check found were one line, and it was `status === "ready"`._ Each lane decided it had finished by reading `useChat`'s status, and `ready` does not mean finished, it means "not currently streaming", which is also true before the first request has left. `ReactChatState` initialises `status` to `"ready"`, so every lane settled on the effect that ran at mount: it handed the parent an empty, completed answer and was replaced by a stored card before its own stream had produced anything. The cards went blank, the traces froze, and the retry looked like it did nothing at all.

The database still filled up, which is what made this look like a rendering-only problem: `consumeSseStream` keeps the server draining its own copy of the stream, so the model calls ran to completion and wrote real rows while the browser had already thrown its half away. That guarantee did its job here; it just also hid the defect until a reload showed the answers that were never on screen.

_Settling now comes from the SDK's finish callback, never from a status read._ `onFinish` fires once, with the finished message and with flags for abort, disconnect, and error; `onError` covers the rest. Neither can fire before a request has been made, which is the property the old code needed and did not have. Reading a status enum to infer "did this thing happen yet" is the mistake worth remembering, not this one call site.

_A freshly created answer row was also being read as failed._ The rule that a `STREAMING` row read back later means a dead stream is right, and it was being applied to rows created microseconds earlier by the action that returns them. The mapper now takes that as a parameter: reading a thread applies it, starting a turn does not. It was invisible while the lanes rendered live and would have surfaced the moment anything else went wrong.

_The fix could not be verified the way the bug was found._ A throwaway harness, a fake stream route and a page mounting the real lane component, confirmed the transport end of it: chunks arrive incrementally, 120 ms apart, through the dev server. What it cannot do is prove the React timing, because that needs a browser and this project has deliberately decided against browser automation. Both harness files were deleted. The root cause is confirmed from the SDK source; the fix is confirmed only by a person opening the page, which is exactly the box left open above.

_The pick control is rendered disabled, with a title that says so._ Half A has no vote to write. The alternative, hiding the control entirely and adding it in half B, would have left the card's header laid out differently in each half for no reason. It is the one place in the app where a control is visible and honestly says it is not wired up yet, and half B removes that state.

**What building half B changed about the plan.**

_PostHog's Vercel wrapper could not be used, and casting past that would have been a lie._ `@posthog/ai` exposes `withTracing` for an AI SDK language model, and it accepts a v2 or v3 model. The OpenRouter provider is already on v4, so the wrapper does not typecheck against it and forcing it through would mean asserting a shape that is not there. The package documents `captureAiGeneration` as the primitive every wrapper funnels into, for exactly the case of a client it does not know. That is what the route calls, with the numbers `toCallMetrics` already measured. It is a better fit than the wrapper would have been: the LLM event now comes from the same single measurement as the card and the row, rather than from a second observer of the same call.

_The cost is passed to PostHog explicitly rather than inferred._ PostHog prices a generation from its own model price list, which has never heard of a `:free` variant, so it would have invented a number for a call that genuinely cost nothing. The measured zero is sent instead. This is the same rule the whole product rests on, applied one layer further out than it had been so far.

_`features/placeholder/` is not deleted, and the plan saying it would be was wrong._ Feature 6 emptied its own half of that folder, the turns and the answers, and nothing in the arena imports it any more. The rest of it is still load bearing: the sidebar's thread list belongs to feature 7's open box and the leaderboard's standings belong to feature 9. Deleting the folder now would have meant building both of those features early, inside a feature that had already said it would not. What is left is trimmed to exactly those two consumers and the file says so. The compiler-as-a-list-of-what-is-still-fake property is unchanged; the list is just shorter.

_Both harnesses are gone._ `/proof` went early in half A because the wire contract it spoke no longer existed. `/design` went here, after feature 4's by-eye check was done on 2026-08-14, which is the ordering the plan asked for.

_A refused vote puts the winner back._ The border moves the instant the pick is clicked, because waiting on a round trip to move something already on screen reads as a click that did not register. If the write is refused, the previous winner is restored and the sentence appears above the composer. The only refusal a person can realistically hit is a second vote on a turn already decided in another tab, and it says exactly that.

**What code review changed, 2026-08-15.** Two concurrency findings, both valid, both fixed and both reproduced against the real database before and after.

_Two streams could own one answer row._ Nothing stopped a second request naming the same answer from passing the ownership lookup and starting its own model call: a duplicate submit, a reconnect, or a retry fired while the first call was still running. Both would then write the same row, so a stale call finishing late could overwrite a retry's answer, and both would spend provider quota and emit analytics. `Answer` now carries `streamClaimId`, and a stream claims the row by moving it off null in a single conditional update, which only one request can win. Every terminal write is conditional on still holding that claim, and retrying clears it, which is what makes the abandoned call's late write land nowhere. Proven in psql: a second claim updates no rows, and a stale write after a retry leaves the row untouched.

_A claim whose process died was never released._ Follow-up review of the claim above, and valid: `completeAnswer` and `failAnswer` are the only things that clear `streamClaimId`, and neither runs if the process holding the claim goes away mid-call, which a deploy, a crash, or a function hitting its time limit all do. The row then sat `STREAMING` with a claim nobody held, and every later request for it was refused. Reading the thread back already showed such a row as failed with a retry, so a person was not stuck, but the row needed a manual retry to become writable again. A claim is now takeable over when the row is still `STREAMING` and has not been written to for five minutes, using `updatedAt` as the claim's own timestamp, since nothing writes to the row between claiming it and finishing it. The takeover is safe for the same reason a retry is: it moves the claim to a new id, so the abandoned call's terminal writes are conditional on a claim it no longer holds. Five minutes is far longer than any call here survives, so it can only fire on a call whose process is gone.

_A retry could reopen an answer that was already finished._ Review read `reopenAnswer` as letting a retry duplicate a live provider call, and asked for the transition to be atomic and restricted to failed, unclaimed answers. Half of that is right and half would break the feature. Atomic is right: it read the row for ownership and then updated it by id, which is the same read-decide-write shape both earlier bugs had, and the whole filter fits in the update. The status rule is right too, and stronger than asked: it checked no status at all, so a direct call to the action could wipe a `COMPLETE` answer, clearing text a vote may already point at. It now refuses anything not still open. But refusing a _claimed_ row would break the two cases the retry button exists for, since both carry a live claim: a connection that dropped while the server's own call kept draining, and a claim whose process died. Both read as failed on the card, correctly, and a person clicking retry has to be able to win. Letting them win is safe for the reason the claim was built: the abandoned call's terminal writes are conditional on a claim it no longer holds. The cost is one wasted free-tier call, against a rate-limited route, to un-stick a person who is looking at a failure. Proven against the real database through the query itself: a failed row and a live-claimed row both reopen, a complete row and another account's row are both refused, and the complete row's text is untouched afterwards.

_Two submissions to one thread could collide on the turn index._ Both counted the existing turns before either insert committed, both picked the same index, and the unique on `(threadId, index)` then rejected one of them. That is a valid prompt lost to a race, and it is reachable: two tabs do it, and so does pressing enter twice quickly, because the composer's guard is React state that has not re-rendered yet. The thread's row is now locked with `SELECT … FOR UPDATE` before the index is allocated, which serialises only submissions to the same thread and doubles as the ownership check. A new thread skips the lock, since nothing else can know its id yet. Reproduced in psql first, `Turn_threadId_index_key` with one session's prompt lost, then re-run with the lock and both landed at indexes 1 and 2.

_Worth keeping in mind for later features._ Both bugs were the same shape: a read, a decision, and a write, with no guarantee that the world stood still in between. The vote already avoided it by doing its counting inside the transaction. Anything that reads state to decide what to write next in this codebase should be assumed to have a second caller.

_The two harnesses went at the end of half B, and one thing had to happen first._ Feature 1 said `/proof` is deleted once the real arena exists and feature 4 said the same about `/design`, and half B is that moment. But feature 4's by-eye check is still open and `/design` is the page it needs, so that check has to be done before the harness is removed, or the box gets closed by deleting its evidence.

**What a Signals report changed, 2026-08-15.** A rate-limited free-tier model could not be recovered by the retry, and half of the failure reasons were being lost to `[object Object]`.

_A retry that fires straight back into a 429 cannot succeed._ A free-tier model returns 429 when it is busy, and the AI SDK has already spent its own three attempts by the time the card goes red. The retry reopened the row and called the provider again with no wait, so a person's only retry was one that failed the same way, which read as a spinner-then-error loop. Failures are now classified into a rate limit or a hard one, and a rate-limited card holds its retry for a short cooldown, counting down on the button, so the retry a person can make is one the limit has had a moment to clear for. A hard failure keeps its immediate retry.

_The failure kind rides the one signal a failed stream carries._ A stream that fails delivers exactly one thing to the browser: the error part's text, which the SDK hands the client as `new Error(errorText)`. So the reader-facing sentence, already chosen per kind on the server, doubles as the carrier, and the settled lane reads the kind back from it. This needs no schema column and no new data part. The trade is that a reload, which reads the row rather than the stream, cannot know the kind, so it settles for the plain sentence and an immediate retry. The live loop the report caught is the one that mattered, and it is a live-session path.

_A non-`Error` reason was being coerced with `String`._ `describe` fell back to `String(error)`, and a plain object stringifies to `[object Object]`. That string was written to the row and shipped as the `answer_failed` reason, which destroys the one diagnostic worth having after launch. It now serializes a non-`Error` as JSON, keeping the provider's own fields, and only coerces a value JSON cannot handle. The rule that a person never sees this reason is unchanged: the card still shows a plain sentence chosen by kind, never the raw text.

## Slice 2: App shell & thread history

### 7. App shell & thread history

The frame everything else sits inside: a top bar and sidebar that stay in place while the page scrolls, the thread's name, and each model's win record shown right there (shrinking down to a small dot and number if it gets crowded). The sidebar lists a signed-in user's own past threads so the tool actually feels usable across visits, not just in one sitting.

- [x] Decide the approach
- [x] Build the UI, on placeholder data, out of order
- [ ] Wire it: real threads for the signed-in user, the real thread name, and win records counted from real votes
- [ ] Checked by eye in a real browser, both modes, phone width, keyboard only

**The UI was built on 2026-08-13, ahead of features 5 and 6, deliberately.**

_Why out of order._ The shell is the frame every other screen sits in, and building the arena first would have meant building it twice: once free-floating, once inside a sidebar and a top bar that change its widths and its scroll container. Everything visual in slice 1 and slice 4 got built at the same time for the same reason. Nothing here makes those features true; each one keeps its own boxes, and each says below what it still owes.

_Every invented value lives in `features/placeholder/`, and nothing else in the app invents one._ That folder is the whole fake surface. Deleting it is how the real features start: the compiler then lists every consumer as a type error, so no placeholder can survive by being forgotten in a file nobody reopened. This is the one thing that keeps "we'll wire it later" from quietly becoming permanent.

_The route group `app/(app)/` is what gets the shell._ `/proof` and `/design` sit outside it on purpose. Both are throwaway harnesses, and dressing them in the product's own frame would make them look like screens rather than the scaffolding they are.

_The sidebar is hand-rolled rather than shadcn's._ shadcn's sidebar block is a large generated component with cookie-persisted state and a rail, and the sketch asks for a brand, three links, a thread list, and a footer. It would have been more overriding than using. The cost is that the mobile drawer, its backdrop, Escape, and moving focus into it are ours, and they are written rather than inherited.

_Desktop and mobile keep separate sidebar state, and that is not an oversight._ On a wide screen the sidebar is a column that starts open and collapses; on a phone it is an overlay that starts closed. One shared boolean gives you either a phone that opens with the sidebar covering the screen or a desktop that opens collapsed. Two states and a CSS breakpoint avoid measuring the viewport in JavaScript, which on the first paint either flashes or disagrees with the server. There are two toggle buttons for the same reason, and only one is ever visible.

_`next-themes` was added, and it is the only dependency this took._ The theme classes were already built in feature 4; what was missing is the blocking script that sets the class before first paint. Without it, someone who prefers light gets a frame of the dark ground first, which is a real defect rather than a rough edge. That script is the entire reason the library is here.

_Clerk v7 has no `<SignedIn>` or `<SignedOut>`._ They are replaced by `<Show when="signed-in">`, which is an async server component and therefore unusable inside a client sidebar. The sidebar uses the `useUser()` hook instead and renders neither branch until `isLoaded`, because showing "Sign in" for half a second to someone already signed in reads as the app having lost them. Worth recording: this is a v7 change, and older Clerk examples will not compile here.

_What code review changed._ Two findings, one fully valid and one half.

_The drawer was modal in looks only._ Opening it moved focus to its close button and Escape closed it, which was enough to look right and not enough to be right: Tab walked straight out of the drawer into the page behind the backdrop, and closing left focus stranded on whatever background control it had wandered onto. The drawer now traps Tab while it is open, returns focus to the control that opened it, and only claims `role="dialog"` and `aria-modal` while it actually is one. The backdrop left the tab order, since a full-screen tab stop reading "close" only duplicates Escape and the close button.

_That fix needed the two-state design to give a little._ A focus trap is correct in a drawer and a bug in a column, so "open" and "modal" have to mean the same thing. `AppShell` now closes the drawer when the viewport widens past `md`. This does measure the viewport, which that design deliberately avoided, but it does so after hydration in response to a resize rather than on first paint, so nothing can flash or disagree with the server. The original reason for avoiding it stands; this is a different moment.

_The second finding, that root `components/` and `lib/` break folder-by-feature, was right about one file and wrong about the rest._ `model-record.tsx` was only ever rendered by the arena, so it moved to `features/arena/`: composing shared pieces does not make something shared. `trace.tsx` and `model-badge.tsx` stay, because three features render each of them and `CLAUDE.md` separately requires a repeated UI pattern to become a shared component, so copying them into three features to satisfy one rule would break another. `components/ui/` and `lib/utils.ts` are fixed by `components.json` and moving them would break `shadcn add` for everything added later. The real problem was that `docs/coding-standards.md` stated the rule as an outright ban, which the design system had already made untrue; it now states the test as the number of consumers, not the folder, and names all four cases.

_A hydration flag cannot be a mount effect._ The theme toggle needs to know whether the browser is driving yet, and the obvious `useState(false)` plus `useEffect(() => setMounted(true))` is rejected by `react-hooks/set-state-in-effect` as a cascading render. It is `useSyncExternalStore` returning `true` on the client and `false` on the server instead. The lint rule was right, and the replacement is smaller.

## Slice 3: Public visibility & sharing

### 8. Public thread visibility & sharing

Anyone should be able to open a thread's link and see it, without an account, that's what actually makes it shareable. Only sending a prompt and voting need sign-in. A made-up or deleted thread just shows a plain not-found page either way. The thread's real owner sees everything everyone else sees, plus the ability to actually use it.

- [ ] Decide the approach
- [ ] Build it

## Slice 4: Leaderboard

### 9. Leaderboard: global & personal

Two leaderboards from the same votes, one for everyone, one just for the signed-in user. Each row's win rate is the big, bold number, in the accent color, with a small bar next to it, always written as "won 4 of 5," never a bare percentage or a made-up score. Smaller, quieter numbers underneath for average speed and time-to-first-token, each clearly labeled. No cost or "cheapest" stat, every model is free, so that number never means anything here. First place gets a subtle highlight, nobody else does.

_The screen exists on invented rows._ Feature 7's UI build made the table, the global and personal toggle, the first-place highlight, and the `WinRate` component that always prints "won 507 of 700" next to the percentage. What is missing is the query: counting real votes, per model, globally and for one `clerkUserId`, and averaging the real durations already stored on `Answer`.

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
