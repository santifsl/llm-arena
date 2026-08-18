# Scope: LLM Arena

Send one prompt, watch up to three AI models answer it at the same time, and vote for the best one. Over time those votes and the real per-call numbers, speed, tokens, cost, build an honest leaderboard of which model is actually worth using.

Build it in a thin, working slice first, one prompt actually reaching a model and coming back, before making any single part of it fuller. Then thicken it piece by piece. Before building anything, decide what you're doing and why in a few plain sentences, then build it, and if the plan turns out wrong once it's actually built, say so and fix the plan too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its own short list of what's genuinely being done, and check each part off as it's finished, right in this file. That way this file can be opened fresh, in a brand new conversation, and it's obvious what's already done and what's still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: Next.js (App Router), TypeScript, Tailwind, shadcn for components (card, button, popover, loading skeleton, and whatever else the UI actually needs as it gets built), Prisma with Postgres, Clerk for auth, Arcjet in front of the endpoint, PostHog for analytics and observability.

## Sketches

There are rough hand-drawn sketches for the arena screen, the leaderboard, and the models page. Treat them as structure only, where things sit, what exists on the page, not as the final design or the actual colors, all of that is already decided elsewhere in this file. If something in a sketch genuinely contradicts what's written here, stop and ask which one actually wins rather than guessing.

## At a glance

| #   | Feature                                      | Phase      | Status                                                               |
| --- | -------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| 1   | Connecting to a model                        | Foundation | done; verified end to end against real accounts                      |
| 2   | Coding standards & tooling                   | Foundation | done; hook tested in both directions                                 |
| 3   | Data model                                   | Foundation | done; migrated and verified against the real database                |
| 4   | Design & look                                | Foundation | done; checked by eye in a real browser                               |
| 5   | Model picker                                 | Slice 1    | done; live catalog, and the spending gate checked in a real browser  |
| 6   | Send a prompt, parallel streams, and voting  | Slice 1    | done; both halves verified in a real browser, PostHog events landing |
| 7   | App shell & thread history                   | Slice 2    | wired to real threads; the by-eye check is the only box left         |
| 8   | Public thread visibility & sharing           | Slice 3    | built and probed signed out; the by-eye check is the only box left   |
| 9   | Leaderboard: global & personal               | Slice 4    | done; counts cross-checked against the real database                 |
| 10  | Arcjet on the public thread read             | Slice 3    | built and proven locally; one production check left, see the feature |
| 11  | Analytics depth: errors, sharing, and a flag | Slice 5    | built and probed locally; the by-eye and PostHog checks are left     |

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

_Nothing enforced the five minutes the takeover assumed._ Follow-up review of the recovery above, and valid: "far longer than any call here survives" was an assumption, not a rule. `updatedAt` is written when the claim is taken and never renewed while tokens arrive, and no timeout bounded the call, so a slow but perfectly live stream could cross the window and be evicted by a second request, which would then spend a second provider call and discard the first one's answer. Renewing the claim as a heartbeat was the other option and was rejected: it means writing to the row throughout the stream, which is what would actually make `updatedAt` a poor claim timestamp, and it keeps the failure mode of a call that hangs forever. Instead the assumption is now enforced at its source. `streamText` gets `timeout: { totalMs: MODEL_CALL_TIMEOUT_MS }`, two minutes, and `STALE_CLAIM_MS` is derived as that plus a minute of margin rather than typed in separately. An abort is not an error to the SDK, so `onError` never sees it and the row would have been left streaming; `onAbort` writes the failure and releases the claim. A claim old enough to take is now necessarily a call that ended or a process that is gone, and the two numbers cannot drift apart, because one is defined in terms of the other. Proven against the real provider with the constant temporarily at three seconds: aborted at ~3.0s every run, row `FAILED`, claim null, and with the constant back at two minutes a normal call still lands `COMPLETE` with its metrics.

_Two endings raced for the same row, and the timeout is what exposed it._ Found by running the proof above rather than by reading: on an abort the SDK fires `onAbort` **and** `onLanguageModelCallEnd`, about two milliseconds apart, and both carry a terminal write. The claim only made the second write a no-op, it did not decide which one that was, so the race was live. One run in five, the complete write won and stored a sentence the model had been cut off in the middle of as a finished 65-character answer with metrics that looked real. That is worse than the eviction it came from: a truncated answer is votable and reaches the leaderboard, where a failed one is honestly excluded. The same race sat on the error path already, unnoticed, where it could store an empty `COMPLETE`. `streamModelAnswer` now settles once in the process that knows, a single guard all three endings pass through, first ending wins, and the database's claim goes back to being only what it was built for, which is the other process. `LiveAnswer` has guarded its hand-up this way since feature 1, for the same reason. Six of six runs `FAILED` after the change, with the complete write never firing at all.

_Two things that turned up while proving it, both worth knowing._ A provider error was being stored as the literal text `[object Object]`, because `describe` fell through to `String(error)` on a plain object; it serialises properly now. It was never reader-facing, only useless in the log. And the dev server on this machine predated the `streamClaimId` migration, so it was serving a stale Prisma client and failing every claim with a validation error; a restart fixed it, and it is worth suspecting first the next time a query fails on a column that plainly exists.

_A retry could reopen an answer that was already finished._ Review read `reopenAnswer` as letting a retry duplicate a live provider call, and asked for the transition to be atomic and restricted to failed, unclaimed answers. Half of that is right and half would break the feature. Atomic is right: it read the row for ownership and then updated it by id, which is the same read-decide-write shape both earlier bugs had, and the whole filter fits in the update. The status rule is right too, and stronger than asked: it checked no status at all, so a direct call to the action could wipe a `COMPLETE` answer, clearing text a vote may already point at. It now refuses anything not still open. But refusing a _claimed_ row would break the two cases the retry button exists for, since both carry a live claim: a connection that dropped while the server's own call kept draining, and a claim whose process died. Both read as failed on the card, correctly, and a person clicking retry has to be able to win. Letting them win is safe for the reason the claim was built: the abandoned call's terminal writes are conditional on a claim it no longer holds. The cost is one wasted free-tier call, against a rate-limited route, to un-stick a person who is looking at a failure. Proven against the real database through the query itself: a failed row and a live-claimed row both reopen, a complete row and another account's row are both refused, and the complete row's text is untouched afterwards.

_Two submissions to one thread could collide on the turn index._ Both counted the existing turns before either insert committed, both picked the same index, and the unique on `(threadId, index)` then rejected one of them. That is a valid prompt lost to a race, and it is reachable: two tabs do it, and so does pressing enter twice quickly, because the composer's guard is React state that has not re-rendered yet. The thread's row is now locked with `SELECT … FOR UPDATE` before the index is allocated, which serialises only submissions to the same thread and doubles as the ownership check. A new thread skips the lock, since nothing else can know its id yet. Reproduced in psql first, `Turn_threadId_index_key` with one session's prompt lost, then re-run with the lock and both landed at indexes 1 and 2.

_Worth keeping in mind for later features._ Both bugs were the same shape: a read, a decision, and a write, with no guarantee that the world stood still in between. The vote already avoided it by doing its counting inside the transaction. Anything that reads state to decide what to write next in this codebase should be assumed to have a second caller.

_The two harnesses went at the end of half B, and one thing had to happen first._ Feature 1 said `/proof` is deleted once the real arena exists and feature 4 said the same about `/design`, and half B is that moment. But feature 4's by-eye check is still open and `/design` is the page it needs, so that check has to be done before the harness is removed, or the box gets closed by deleting its evidence.

## Slice 2: App shell & thread history

### 7. App shell & thread history

The frame everything else sits inside: a top bar and sidebar that stay in place while the page scrolls, the thread's name, and each model's win record shown right there (shrinking down to a small dot and number if it gets crowded). The sidebar lists a signed-in user's own past threads so the tool actually feels usable across visits, not just in one sitting.

- [x] Decide the approach
- [x] Build the UI, on placeholder data, out of order
- [x] Wire it: the sidebar lists the signed-in user's real threads, newest activity first, with the active one marked
- [x] `pnpm verify` clean, and the signed-out page probed on a running server
- [ ] Checked by eye in a real browser, both modes, phone width, keyboard only

**What wiring it changed about the plan, 2026-08-15.**

_Two of the three things this box asked for were already true, and feature 6 is what made them true._ The box said real threads, the real thread name, and win records counted from real votes. `ArenaScreen` has passed `thread.title` into the breadcrumb and counted each model's `winnerAnswerId` across the loaded thread's turns since feature 6 half B; `ModelRecord` was reading real numbers before this feature reopened. Only the sidebar's list was still invented. Checking the boxes without saying so would have credited this feature with work another one did, and would have hidden that the arena's top bar was never actually waiting on anything.

_The list is read in the layout and handed down, because the sidebar is a client component._ It needs shell context and owns the focus trap, so it cannot fetch. `app/(app)/layout.tsx` becomes an async server component that reads the Clerk user, loads that person's threads, and passes them through `AppShell` to `Sidebar` as props. This is the same rule feature 5 set for the catalog, and it is what keeps the browser away from the database without adding a second public route for Arcjet to cover.

_The query lives in `features/arena/queries.ts`, and its own docstring had to be widened to admit it._ That file says it is every read and write the arena makes, and the sidebar is not the arena. It goes there anyway: that file owns reading a thread and filtering it by owner, and a second Prisma thread query in `features/shell/` would be the same query written twice, which is the duplication the shared-value rule exists to stop. The shell keeps what is genuinely its own, which is how a date is worded.

_The ordering column and its index disagreed, and the index moved._ `appendTurn` has touched `updatedAt` since feature 6 "so the sidebar's newest-first list is honest about activity", while the schema indexed `[clerkUserId, createdAt]` for a list that did not exist yet. A list ordered by last activity is the honest one, since a thread you were typing in a minute ago is not the oldest thing you own, so the index follows the ordering rather than the ordering following the index. One migration, `20260815181124_thread_list_ordered_by_activity`, applied to the real database.

_The relative label is computed on the server and crosses as a finished string._ Formatting it in the sidebar would have the browser and the server each read their own clock, which is a hydration mismatch on any thread near a boundary, and the boundaries here are a minute and a midnight. The cost is that the label is written in the server's timezone rather than the reader's, which for "Just now", "Yesterday", and a weekday name is invisible, and it is the better half of the trade: a word that changes on hydration is a defect a person can actually see. `Intl` is pinned to `en-US` so the label never depends on the server's own locale settings either.

_This revalidation was wrong where it was put, and feature 8's testing is what exposed it. See the correction under feature 8; the paragraph below records the reasoning, which still holds, not the call site, which moved._

_A new thread reaches the list because the submit action revalidates the layout, and only when it creates one._ A layout is not re-rendered by the client navigation that follows, so without this a person's first prompt of the sitting would be missing from their own sidebar until a full page load, which reads as the list being broken rather than as a cache. `revalidatePath("/", "layout")` runs on creation only: a follow-up turn merely moves a thread that is already at the top of the list, and paying a round trip on every prompt for that is not worth it. It fires before the streams open, and client state survives an RSC refresh, so the lanes are not torn down.

_A thread created by the first prompt is not marked active until a navigation, and that is known rather than missed._ The active row comes from `usePathname()` matching `/t/[threadId]`, and the arena gets that URL through `window.history.replaceState`, which feature 6 chose precisely so the streams are not unmounted. The router's own pathname is still `/`, so the new thread appears in the list unmarked. Navigating to it, or reloading, marks it. Fixing this properly would mean either navigating, which kills the streams, or teaching the sidebar a second source of truth about the current thread, which is worse than the symptom.

_A failed list read is a sentence, not a 500._ The layout wraps the query and passes `null` on a failure, which the sidebar renders as a plain line with a reload. Letting it throw would take the whole app's frame down over a list, and the rule that a person never sees a raw error applies to the shell as much as to a model call.

_`features/placeholder/` is down to the leaderboard's standings._ `PLACEHOLDER_THREADS` and its type are gone, and the folder's own docstring names feature 9 as the only thing still standing on it.

**The UI was built on 2026-08-13, ahead of features 5 and 6, deliberately.**

_Why out of order._ The shell is the frame every other screen sits in, and building the arena first would have meant building it twice: once free-floating, once inside a sidebar and a top bar that change its widths and its scroll container. Everything visual in slice 1 and slice 4 got built at the same time for the same reason. Nothing here makes those features true; each one keeps its own boxes, and each says below what it still owes.

_Every invented value lived in `features/placeholder/`, and nothing else in the app invented one._ That folder was the whole fake surface, and it is now deleted: feature 9 was its last consumer. It did what it was built to do at every step, because the compiler listed every consumer as a type error the moment a slice of it was removed, so no placeholder survived by being forgotten in a file nobody reopened. That is what kept "we'll wire it later" from quietly becoming permanent.

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

- [x] Decide the approach
- [x] Build: `loadThread` reads by id alone and returns the owner, and the queries file's ownership rule is corrected to name the exception
- [x] Build: the third answer state, so a row still in flight is not called a failure
- [x] Build: `/t/[threadId]` stops requiring sign-in; a made-up thread is the same 404 either way
- [x] Build: `ArenaScreen` takes `isOwner`, and a visitor gets no composer, no pick, no retry, no clock
- [x] Build: the copy-link control, and a per-thread page title
- [x] Build: a delisted model renders its id instead of vanishing
- [x] Build: `pnpm verify` clean
- [x] Build: probed on a running server, 2026-08-15. Signed out, a real thread is a 200 carrying its own `<title>`, its prompts, its answers, and the copy-link control, with no composer and no pick control anywhere in the markup; a made-up id is a plain 404 with no thread title; `/`, `/models`, and `/leaderboard` are unchanged and the stream route still refuses a signed-out caller with a 401
- [x] Build: the mid-race state proven against the real database rather than reasoned about, 2026-08-15. A throwaway thread with one `COMPLETE` answer and one `STREAMING` row: with the streaming row's `updatedAt` at now it renders "still answering" and the finished answer beside it, and with the same row aged ten minutes it renders the failed card instead, with no retry offered to a visitor. The same probe carried a made-up `ghostvendor/delisted-model:free` id, which rendered as a card labelled with the raw id rather than disappearing. Rows deleted afterwards
- [x] Build: the mid-race tear-down found by testing and fixed, 2026-08-15. Not a feature 8 defect: `revalidatePath` in the submit action was refreshing the router onto the URL `replaceState` had just set, unmounting the arena and all three lanes. Recorded in full below
- [ ] Checked by eye in a real browser: a signed-out window reading a shared link, a mid-race link, another account's link, the copy-link button, and the owner's own view streaming live again

**What building it changed about the plan, 2026-08-15.**

_The delisted-model fix needed a narrower type than the plan assumed, and that is the better shape._ It was written as "render the card with the raw model id", which reads as building a fake `ArenaModel` to stand in for the missing one. That would mean inventing a context window and a price, and every invented number in this app has so far turned into something a screen eventually shows. The card takes a `ModelIdentity` instead, a badge letter and a label and nothing else, so there is no field to fabricate: `modelIdentity` either finds the catalog entry or derives what little the id itself says. The rule this project keeps landing on is that the honest fix is usually a smaller type rather than a more careful caller.

_That fix reached the composer, which the plan did not name._ The chips were skipping unlisted models the same way the cards were, and the consequence there is worse than a missing chip: `isCallableModelId` refuses the prompt because a delisted model is selected, and the person is told one of their models cannot be sent while the chip that would let them remove it is invisible. A dead end, reachable by anyone reopening a thread from a week ago. The chips render from the same identity now.

_Whether a card is live had to be a prop, not an inference._ The plan spoke of a third state as though the state enum could carry it, and it cannot: `AnswerCard` is rendered both by a lane that is receiving a stream and directly by the thread for a stored row, and "streaming" is true in both. Only the parent knows which. `live` is passed by `LiveAnswer` and by nothing else, so the card can tell "filling in as you watch" from "running in somebody else's browser" without either one guessing. Reading a status enum to infer whether something is happening is the same mistake feature 6 half A recorded, in a smaller place.

_A visitor gets a line where the composer would be, which was not planned._ Removing the composer left the page simply stopping at the last answer, and a screen that ends where a control used to be reads as broken rather than as read-only. One sticky line saying this is a shared thread, with a link to run your own prompt. It is also the only invitation in the app to become a user, which is what sharing is for.

_The thread was being read twice per page load, and `generateMetadata` is why._ Next calls it separately from the page, so both were running the same query with all the turns and answers included. Neither the plan nor the review of it caught this, because each function is obviously correct on its own. `readThread` is wrapped in React's `cache`, which is per request, so the two calls are one query. Worth being precise about what that is not: it does not cache the thread between requests, and it must not, because a reload is exactly the control this page offers a visitor watching a race they are not part of.

**What testing it found, 2026-08-15: a feature 7 bug wearing feature 8's clothes.**

_The symptom._ Sending a new prompt as the owner showed all three cards reading "This model is still answering" instead of streaming text, immediately, every time. That is feature 8's new mid-race message, so it looked like the visitor path leaking into the owner's. It is not, and reading it that way would have fixed the wrong thing.

_What is actually happening._ `send` calls `window.history.replaceState` to give the new thread its URL without navigating, which feature 6 chose precisely so the streams are not torn down. Next patches `replaceState` and adopts it as the router's own URL; its source says so in as many words, that it does this "to ensure external changes to the history are reflected in the Next.js Router". `submitPrompt` then called `revalidatePath("/", "layout")`, so the router refreshed, and by that point the URL it refreshed was `/t/[threadId]`, a different page component. `ArenaScreen` unmounted and took all three lanes with it, then remounted with `startedAt` empty and the thread read back from the database, where the rows were still `STREAMING`. With no lane driving them, the parent renders them as stored answers, and feature 8 had just taught a stored streaming row to say "still answering".

_The two mechanisms were each right and could not both be there._ `replaceState` exists so a refresh cannot tear the streams down. `revalidatePath` exists so the sidebar sees a new thread. Together, the first is what aims the second at the page it must not reload.

_This predates feature 8 and was invisible for one reason._ `revalidatePath` came from feature 7's sidebar wiring earlier the same day, and feature 7's by-eye browser check is the box that was never ticked. Before feature 8, a read-back `STREAMING` row mapped bluntly to `failed`, so the same tear-down showed three failed cards with retry buttons. Worse, and equally unseen. What feature 8 changed is the costume, not the defect.

_Why the database looked fine throughout._ `consumeSseStream` keeps the server draining its own copy of each stream, so all three answers completed with full text and real metrics while the browser was showing nothing. That is the same signature as feature 6 half A's `status === "ready"` bug, and it is worth naming as a recurring one: in this app, "the rows are correct and the screen is empty" means the client threw its half away, never that the model call failed.

_The fix is to refresh the router only when there is nothing live to lose._ `revalidatePath` moves out of `submitPrompt` into its own `refreshThreadList` action, which the arena calls once the last lane has settled. The sidebar gains its entry a few seconds later than before, which is the entire cost. A follow-up turn never calls it at all, since that thread is already in the list. The remount that still follows is now harmless: the rows are `COMPLETE`, so the screen it comes back with is the same one that was already there.

_What this says about the codebase._ Feature 6 recorded that anything reading state to decide what to write should assume a second caller. This is that lesson one layer up: the arena depends on not being remounted, and nothing said so out loud, so a revalidation added by a different feature for a different reason could quietly break it. The dependency is now written at both ends, at the `replaceState` that creates it and at the refresh that must respect it.

**Answers render as Markdown, 2026-08-15.**

_Found by testing feature 8, and it belongs to feature 6 rather than here._ Models answer in Markdown whether or not anyone asks them to, and the card printed the text raw, so `**`, `###`, and `*` sat on screen as literal characters. That is worse in this product than in most: the arena exists to compare answers side by side, and formatting noise is not a difference between models, it is a difference the app was adding on top of them.

_`react-markdown` with `remark-gfm`, and deliberately no `rehype-raw`._ Model output is untrusted text from a third party, so embedded HTML is escaped rather than rendered, which is `react-markdown`'s default and the reason it was chosen over a `marked`-plus-sanitiser pair. Proven rather than assumed: a `<script>` tag in an answer comes back escaped in the markup. Links get `target="_blank"` and `rel="noopener noreferrer nofollow"`, because anything a model links to is somebody else's page.

_The styles live in `globals.css` on the existing tokens, not in a typography plugin._ Every rule hangs off `.answer-prose`, stays in the reading serif, and separates headings by weight and space rather than by size, since a model emitting `###` on its third line should not out-shout the page title above it. Rust appears for links and nowhere else, which is the interaction half of the accent's rule. Code blocks and tables scroll inside themselves, because a wide one would otherwise push a three-across row of cards out of shape.

_Two things the build changed._ The answer container had to stop being a `<p>`, since lists, headings, and code blocks are not legal inside one, and the streaming caret moved into CSS on the last child so it still rides the end of the final line now that the line might be a list item. And the first version leaked `node="[object Object]"` into every anchor, because `react-markdown` hands each custom component its own `node` and the code spread the rest of the props onto the DOM. It names the props it wants instead. That one was visible in the rendered markup and would not have been visible by reading the code.

**The three-models-fail-at-once failure: OpenRouter's free daily cap, 2026-08-15.**

_Proven against OpenRouter, not inferred._ A direct call with the app's own key to `google/gemma-4-31b-it:free` comes back `429`: `Rate limit exceeded: free-models-per-day`, with `X-RateLimit-Limit: 50`, `X-RateLimit-Remaining: 0`, and a reset at the next UTC midnight. The account is on the free tier, so it gets 50 free-model requests a day across every model, and a day of building and testing the arena spends them three at a time.

_This is why the failure looks like one shared thing, because it is one._ The cap is per account, not per model, so every selected model fails at the same instant with the same generic sentence. It also explains the shape in the log: `[arena] model call failed` arrives in bursts of six, which is three models each logging twice, once from the stream's `onError` and once from the error path that writes the row.

_It is not a bug in this codebase, and it is worth writing down anyway,_ because it will happen again to anyone building on this project, it looks exactly like three unrelated provider outages, and nothing on screen or in the log currently says the word quota. Every model in this app is free tier by design, so the ceiling is a permanent property of the product, not a temporary condition.

_What the app said about it was wrong, and that was a real defect._ The failed card read "This model didn't answer. The other answers are unaffected." When the cap is what failed, the other answers are not unaffected, they are all failing for the same reason at the same instant, and the sentence pointed a person away from the truth and toward a retry that could not work.

**The quota fix, built 2026-08-17.**

_A failure now carries a kind, and the kind is stored._ `AnswerFailure` is a two-value enum on `Answer`, `PROVIDER` or `QUOTA`, alongside the existing `failureReason`. The two are deliberately separate rather than one column doing both jobs: `failureReason` is free text for whoever reads the log and feature 3 decided it is never rendered, and that decision stands. The new column is the opposite thing, a small closed set that a screen is allowed to speak. Storing it rather than deriving it is what makes a reload and a shared link say what the live card said, which matters more since feature 8 made a thread readable by a stranger. Migration `20260817200413_answer_failure_kind`, applied to the real database. Rows that predate it have a null kind and fall back to the generic sentence, which is correct: nothing knows why they failed.

_The classifier matches OpenRouter's own marker, not the status code, and testing proved that was the right call._ A `429` from OpenRouter is not one thing. The daily cap answers with `free-models-per-day` in the body and lasts until midnight; a model being briefly throttled upstream answers with "temporarily rate-limited upstream" and clears in seconds. Both were observed on the real account within two days of each other. Had this keyed on the status alone, the second case would have told a person the arena was out of requests for the day when one model was busy for a moment and the other two were answering fine. Only the marker gets the quota sentence; everything else keeps the generic one, because guessing wrong in that direction is the expensive mistake.

_The error arrives wrapped, which the plan did not anticipate._ Run against the real provider, a refused call comes back as an `AI_RetryError` wrapping the last `AI_APICallError`, so `responseBody` is one or two links down rather than on the thrown error. The wrapper's message does embed the inner one, so text matching alone would have worked, but the body is now read from where it actually lives by walking `lastError` and `cause`, so the check does not rest entirely on how the SDK happens to phrase a wrapper today.

_The live card and the stored row cannot disagree._ The kind travels to the browser as a typed data part, the same mechanism `CallMetrics` already uses, written in the same guarded ending that writes the row. It is not re-derived in the browser from the error text. The transport-level path, where the request never reached the provider, has no data part to read and defaults to `provider`, which is honest: a call that never arrived cannot be known to be a quota refusal.

_What is deliberately not built._ No pre-emptive blocking of the composer when the cap is known to be spent. That would mean holding a piece of account-wide state in the app and keeping it true, and the provider is the only thing that actually knows; a refusal costs one round trip and tells the truth. The retry button also stays on a quota failure, because the sentence now says what is really going on and a person who adds credits should not have to reload to act on it.

_Proven, and one gap named honestly._ Rendering was checked through the public thread page against three real rows, `QUOTA`, `PROVIDER`, and a null-kind row from before the migration: the first gets the quota sentence, the other two get the generic one. The classifier was run end to end through `streamModelAnswer` against a genuinely 429-ing model and correctly returned `provider`. The quota branch itself was verified against the recorded body text rather than by re-triggering the cap, because triggering it means spending the account's entire daily allowance, which is a bad way to test a thing whose whole problem is that the allowance is small.

**A defect the investigation exposed: the error log said `{}`, 2026-08-15.**

_Every catch site in the app was written as `console.error("...", { error })`, which looks obviously correct and is not._ An `Error`'s `name`, `message`, and `stack` are all non-enumerable, so the structured logger serialised the whole thing as the two characters `{}`. Real failures were recorded as nothing at all: `[arena] could not start a turn {}`, `[arena] could not record a vote {}`, `[arena] model call failed {}`. That is worse than having no log, because it looks like the failure was captured.

_The first fix was wrong about the mechanism, and only counting the log proved it._ The obvious explanation is that an `Error`'s fields are non-enumerable, so the object serialised empty. That is true and it is not the cause: the model-call site logged `{ modelId, error }`, and `modelId` is a plain string that would have shown. Counted across the whole dev log, 77 of 83 lines carrying a second argument rendered as `{}`, and the survivors were all errors Next surfaced itself rather than ours. Next's development log writer discards the second `console.error` argument outright. So the detail is interpolated into the message string instead, which is uglier at every call site and is the only version that reaches a log file. Confirmed by logging a fake `P2028` through a throwaway route and reading the code, the message, and the stack back out of the file.

_`lib/errors.ts` now owns it._ `describeError` gives a short line including the database's or provider's own code, such as `P2028`, and is safe to store as well as log, so `Answer.failureReason` uses it too; `errorFields` adds the stack for a log. The private `describe` that already existed in `features/model-call/` for the `[object Object]` bug recorded under feature 6 is gone, folded into the shared one, so there is a single answer to "what went wrong" rather than one good one in the feature that had been burned already and nothing anywhere else. It sits outside `features/` on the test `docs/coding-standards.md` states: the number of consumers, not the folder.

_The owner's own path is the one thing a probe could not check._ Everything a visitor sees was confirmed with `curl` against a running server, because a signed-out reader is precisely what `curl` is. That the composer, the pick control, and the retry all still work for the owner cannot be shown that way, since the route refuses to hand a scripted caller a session, which is the same limit feature 5 and feature 6 both hit. It is the open box above.

**What that log then caught: "That prompt could not be sent", 2026-08-17.**

_The first real failure the fixed logger described, and it was one line._ `[arena] could not start a turn: P2028: Transaction API error: Unable to start a transaction in the given time`, with a stack running through `submitPrompt`. Under the old `{}` logging this was the generic refusal sentence and nothing else, which is exactly the class of bug the logging fix was made for. Worth recording as the payoff: the previous entry was not housekeeping.

_P2028 is the transaction failing to start, not to finish, and that distinction is the whole diagnosis._ The budget it blew is `maxWait`, which covers taking a connection from the pool and issuing `BEGIN`, and Prisma defaults it to two seconds. Measured against the real database rather than assumed: opening a connection to `pooled.db.prisma.io` costs about 966ms, and a bare `BEGIN`/`SELECT 1`/`COMMIT` about 604ms. So a cold connect plus `BEGIN` can spend the entire allowance before any of the app's own work runs.

_What made it intermittent was `pg`'s ten-second idle reap._ The log timeline shows activity, then a two-minute gap, then the failure on the first prompt after it. The pool had dropped its connections in the meantime, so that submission paid a full handshake inside a budget that could not afford one. It fails after a quiet spell and succeeds while warm, which is why it looked random and why the prompt's content, typos included, never mattered.

_Ruled out rather than assumed, at the time of the failure._ `pg_stat_activity` showed eight idle and one active against a `max_connections` of 50, and zero ungranted locks. Not pool exhaustion, not lock contention, not the free tier's ceiling. Latency against a budget written for a database on the same machine.

_The fix is two changes, because the cause is two things._ `transactionOptions` sets `maxWait` to ten seconds and `timeout` to twenty, so the budget suits a remote pooler; and the adapter gets `min: 1` with a five-minute `idleTimeoutMillis`, so an idle session stops paying the handshake repeatedly. `min` is what actually does that work: `pg` only reaps an idle client while the pool is above its minimum, confirmed in `pg-pool`'s own source. Neither pre-opens anything, so the first call after the process starts still pays full price, and only that one.

_The generous timeout is a backstop, and the transaction got shorter anyway._ `startTurn` was running its read-back inside the transaction: a query returning the thread's entire history, every turn with every answer and vote, while holding a row lock it did not need, alongside writes that touch three rows. It now returns two ids and reads the thread after the commit. Measured at today's data the read-back is 169ms on the largest existing thread, which has three turns, so this is a small win now and a growing one, and it is the right shape regardless: the turn is durable by then, so a reader can only see more than it would have, never less.

_That also removed a latent race nobody had reported._ The turn's id used to be inferred from whichever turn sorted last in the read-back, which is wrong if another tab appends between the write and the read. It comes from the insert now.

_What was considered and rejected: folding the turn count into the locking query._ One fewer round trip, and incorrect. A scalar subquery would be evaluated against the snapshot taken before the lock was granted, which reintroduces precisely the index race the `FOR UPDATE` exists to prevent. The count stays a separate statement after the lock. Noted here because it is an obvious-looking optimisation and the next person to read this function will think of it.

- [x] The transaction budget, the warm pool, and the shorter `startTurn`, built and `pnpm verify` clean, 2026-08-17
- [ ] Checked by eye in a real browser: send a prompt after leaving the app idle for several minutes, which is the exact condition that produced P2028
- [ ] `startTurn` returning `null` for a thread that is missing or not yours lands on the same "could not be sent" sentence as a genuine crash. Two different things a person would act on differently. Deliberately left for later, 2026-08-17

**The approach, decided 2026-08-15.**

_Only one route opens up._ `/t/[threadId]` and nothing else. The sidebar's list, the submit, vote, and retry actions, and the stream route's claim all keep exactly the gates they have. This feature is a read becoming public, not the app becoming public, and the smaller that surface is the easier it is to say truthfully what a stranger can reach.

_The single-thread read stops filtering on the owner, and that contradicts a rule this codebase already wrote down._ `features/arena/queries.ts` opens by saying every function that touches a thread takes the Clerk user id and filters on it, so ownership is part of the query rather than a check somebody has to remember. A public read cannot do that. `loadThread` takes the id alone and returns the thread together with its owner id; the page compares that against the caller and decides what the reader may do. The rule is corrected in place rather than quietly broken: it holds for every write and for the list, and the single-thread read is the one deliberate exception, which is exactly why it hands the owner id back instead of a bare thread. A caller that forgets to compare gets a thread it cannot do anything with, because every write still checks for itself.

_A visitor is a reader, not an owner with the buttons greyed out._ `ArenaScreen` takes one `isOwner` prop. False removes the composer, the pick control, the retry, and the clock. The winner badge stays, because who won is part of the record being shared. The pick control is removed rather than rendered disabled: feature 6 rendered a disabled one on purpose, because it was about to be wired and hiding it would have moved the card's header between halves, and neither reason survives here. A visitor will never be able to click it, and a dead control that explains itself in a tooltip is worse than no control.

_A signed-in stranger is a visitor too._ There is no half state where someone who happens to have an account can add a turn to a thread they do not own. The server already refuses it, because `startTurn` allocates the index behind a `SELECT … FOR UPDATE` that only matches this person's row, so the UI is matching a rule that exists rather than inventing one.

_A row still in flight gets its own state, and this is the one thing the feature genuinely adds rather than opens up._ The mapper's rule so far is that a `STREAMING` row read back later means a dead stream, which is right for the owner reloading a thread from yesterday and wrong the moment a link is shared, because the most common way a link gets shared is pasted the second the prompt is sent. `staleStreamingIsFailed` becomes a judgement the mapper can actually make now that `MODEL_CALL_TIMEOUT_MS` bounds every call: a `STREAMING` row written to inside that window is genuinely in flight, and an older one has lost its process and is a failure. `STALE_CLAIM_MS` already derives from that same constant for the claim takeover, and this is the second reader of the same fact, which is a reason to keep it derived rather than typed twice. A visitor sees the model still answering, with no text and no retry, and the page does not refresh itself to find out how it ended: a reload is the honest control, and polling somebody else's stream is a second live surface this feature is not building. The owner's own mid-race reload gets more honest for free, since today it reads as a failure too.

_Hiding unfinished turns from visitors was the other option and was rejected._ It can never show anything false, which is its whole appeal, but a link shared the instant a prompt is sent would render as an empty page, and an empty page reads as broken rather than as pending. Saying "still answering" is both true and legible.

_A missing thread is one page for everyone._ The route currently calls `notFound()` on a signed-out caller before it looks anything up, and that goes. A made-up id, a deleted thread, and a thread that exists are decided by the same lookup for every reader, so nothing about the response says whether a given id is real to someone who is not allowed to see it. Feature 3 chose cuid2 for thread ids naming this slice as the reason, so ids are not walkable.

_Sharing needs a control, or it is only shareable in principle._ A copy-link button sits in the thread's top bar, for the owner and the visitor both, and falls back to selecting the URL where the clipboard API is unavailable. A per-thread `<title>` comes from `generateMetadata`, because fifty shared links all reading "LLM Arena" in a tab strip is the cheapest possible thing to get wrong. Rich link previews and an OG image stay on the not-doing list; a page title is not one.

_A delisted model currently vanishes from a shared record, and this feature is what makes that reachable._ The arena skips any answer whose model id is not in the live catalog, which feature 5 recorded as a known consequence of gating on the live list. It was close to theoretical while the only reader of a thread was the person who had just made it. Sharing is precisely what causes an old thread to be read by a stranger a week later, and an answer disappearing out of a record somebody was sent is the worst place for it. The card renders with the raw model id in place of the display name instead of being dropped.

_This is the app's first unauthenticated database read, and that is recorded rather than skipped._ Every existing surface Arcjet covers is behind sign-in. No rule is added here: the page is one row fetched by primary key with its turns, it is a server render Next can cache, and adding a per-render Arcjet decision to a page is more machinery than the exposure warrants. What makes this an acceptance instead of an oversight is that it is written down: if the thread page ever grows a second query, a search, or a listing, this paragraph is the reason to revisit it.

_Half of that acceptance was wrong, and the revisit happened on 2026-08-17 rather than on the trigger it named._ The paragraph above reasons entirely about what a stranger can **see**, and that half still holds exactly as written: one row, by primary key, an unguessable id, nothing leaked. It then spends that reasoning on a different question it never asked, which is how **often** a stranger can ask. Those are not the same risk and the second one does not shrink just because the first is small. It also says the page "is a server render Next can cache", which is untrue: the page calls `auth()`, so it is dynamic, nothing is cached, and every request is a real render and a real query returning every answer in the thread. One shared link plus a loop is therefore an open bill against our database, and it is the one thing sharing made reachable that sign-in used to prevent for free. The trigger the paragraph set, a second query or a search or a listing, would have caught a leak and would never have caught this. See feature 10 for what was actually built.

_What this feature deliberately does not build._ No forking or continuing somebody else's thread. No visibility toggle, since feature 3 already refused the column on the grounds that a field with one value forever is dead schema, and nothing here changes that. No public index of threads: a link is shareable, the set of links is not browsable, and those are different products.

### 10. Arcjet on the public thread read

Feature 8 opened one route to strangers and left it unguarded on reasoning that only covered half the risk. This closes the other half: how often one address may ask, and which non-humans are welcome to ask at all.

- [x] Decide the approach
- [x] Build: a third Arcjet client for the public read, with shield, a bot rule that allows link unfurlers and search engines, and a sliding window keyed on the source address
- [x] Build: the decision runs before the query, and once per request, so a refused read costs a decision and not a database read
- [x] Build: a refused read renders a sentence and a real retry instead of the thread, and is never indexed
- [x] Build: the rate-limit sentence for a reader is its own copy, because a visitor has not sent any prompts
- [x] Build: an `ERROR` decision is logged instead of failing open silently
- [x] Build: `pnpm verify` clean
- [x] Build: every rule proven firing against the real Arcjet service, 2026-08-17, decisions recorded in the console. `curl` denied with `botV2.denied: ["CURL"]`; Slack, Discord, and Twitter unfurlers allowed through to a rendered thread while an unrecognised scripted client was denied; 200 concurrent reads produced 150 `REASON_RATE_LIMIT` denials carrying the reader's sentence
- [ ] Checked in the real deployment: one shared link opened, then the Arcjet console showing an `ALLOW` for it carrying a real client IP rather than an empty one

**What building it changed about the plan, 2026-08-17.**

_A sliding window, not a token bucket, and the two rate limits now say different things._ A bucket refills slowly because it prices a scarce thing, which is right for prompts and wrong for reads: a visitor who reloads three times to watch a race finish and then meets a ten-minute wall would be a bug, not a defence. A window forgets. The ceiling is 120 reads a minute per address, deliberately far above any human and any office sharing one outbound address, and far below any loop, because the cost of guessing high is one extra database read and the cost of guessing low is a shared link that fails for a roomful of people at once. The two limits also needed separate copy: the prompt budget's sentence says you have sent a lot of prompts, which is simply false told to somebody who has opened a link and sent nothing.

_The bot rule is the opposite posture from everywhere else in the app, on purpose._ Every other entry point runs `allow: []`, because nothing legitimate scripts the arena. A shared link is the case where the automated traffic is the point: the first thing Slack, Discord, iMessage, and the rest do with a pasted URL is fetch it to build a preview card, and denying those does not stop abuse, it just makes shared links render as bare URLs, which is the feature failing quietly. `SEARCH_ENGINE` is in the allow list too, and that one is a product decision rather than a technical one: shared threads are meant to be findable. `THREAD_READERS` is where that changes if it ever stops being true.

_A denial had to become a screen, which the plan underestimated._ A page cannot set a 429 the way a route handler can, so a refused read is a 200 carrying a sentence and a retry, and the honest consequence is that the status code no longer tells the whole story on this route; the console does. The refusal is `noindex`ed in `generateMetadata`, which matters precisely because search engines are allowed through: the one page they must never record as a thread's content is the sentence saying we would not serve it.

_The decision is memoised per request, and this is a correctness fix rather than a saving._ `generateMetadata` and the page are called separately by Next, so an unmemoised guard would spend two decisions on one visitor and the rate limit would deny at half the number it advertises. `readThread` was already wrapped in `cache` for the same reason one line above, which is what made the mistake easy to see.

_Verifying this found that the whole guard can fail open silently, and that changed the code._ Running the built app locally, every rule stopped evaluating: `unable to generate fingerprint: requested `ip`characteristic but the`ip` value was empty`. Arcjet will not trust a forwarded-for header without a hosting platform it recognises, quite rightly, since headers are spoofable. Locally that is an artifact. In a real deployment it is the failure mode that matters most, because it does not deny anything, it allows everything, and the only sign is a line in a log nobody reads. This is also the app's first IP-keyed rule, which is why it never surfaced before: the prompt budget keys on the Clerk user id and needs no address. `decide` now logs an `ERROR` decision explicitly. It still fails open, which feature 6 decided and this does not reopen, but a deployment that hands Arcjet no client address is now loud instead of quiet.

_Local `next start` cannot prove an IP-keyed rule, and that is why one box above is still open._ It has no recognised platform, so there is no trustworthy client address and the rule cannot run. Everything provable without one was proven against the real service through the dev server, where Arcjet substitutes a development address. What is left is the one thing only the deployment can answer, and it is a check rather than a build.

## Slice 4: Leaderboard

### 9. Leaderboard: global & personal

Two leaderboards from the same votes, one for everyone, one just for the signed-in user. Each row's win rate is the big, bold number, in the accent color, with a small bar next to it, always written as "won 4 of 5," never a bare percentage or a made-up score. Smaller, quieter numbers underneath for average speed and time-to-first-token, each clearly labeled. No cost or "cheapest" stat, every model is free, so that number never means anything here. First place gets a subtle highlight, nobody else does.

_The screen existed on invented rows._ Feature 7's UI build made the table, the global and personal toggle, the first-place highlight, and the `WinRate` component that always prints the real count next to the percentage. What was missing was the query: counting real votes, per model, globally and for one `clerkUserId`, and averaging the real durations already stored on `Answer`. That is what this feature built, and with it `features/placeholder/` is gone.

- [x] Decide the approach
- [x] Build: `features/leaderboard/standings.ts` and `queries.ts`, the screen on real rows, the page counting both boards
- [x] `components/retry-button.tsx`, and `CatalogUnavailable` and `ThreadUnavailable` moved onto it
- [x] `features/placeholder/` deleted, its last consumer gone
- [x] `pnpm verify` clean: typecheck, lint, format check, and a real production build
- [x] Verified against the real database, 2026-08-17: the rendered global board's five rows, both counts and both averages on each, match the same aggregate run as raw SQL exactly

**The approach, decided 2026-08-17.**

_A model's denominator is the turns it contested, not every turn that was voted._ Contested means it completed an answer and that turn was then voted on. The arena's top bar does something different, dividing each model's wins by the whole thread's voted turns, and that is right there because the same three models race every turn of a thread. Across every thread it would be a lie in two directions: a model would be charged a loss for a race it was never entered in, and for a turn where it failed, which feature 6 will not even offer a vote on until two models complete. So a `FAILED` answer contributes nothing at all here, neither a win nor a loss, which is the honest reading of a model that did not turn up.

_The averages are taken over that same contested set._ Not over every answer the model has ever produced. It keeps one row describing one thing: these many contests, this record, and this is how fast it was in them. It also makes the personal board coherent all the way across, rather than a personal record sitting next to a global speed. Prisma's `_avg` skips nulls rather than counting them as zero, which is exactly right given feature 3's rule that a null metric means the provider did not report the number.

_Two typed `groupBy` calls, not one raw statement._ One over `Answer` grouped by `modelId`, filtered to `COMPLETE` and to turns that have a vote, carrying `_count` and `_avg`. One over `Answer` filtered to answers that are a vote's winner. They are merged and ranked by a pure function in `standings.ts`. Raw SQL would have done it in a single round trip, and it would also have been the one query in the app the compiler cannot check, for a table that will never be large enough to notice the difference.

_One function, one argument, for both boards._ `loadStandings(clerkUserId | null)`. Null counts everybody. A user id narrows the vote filter to `Vote.clerkUserId`, which is exactly the column feature 3 denormalised so this query never joins back through `Thread`. Filtering on the vote rather than on thread ownership is also the version that stays correct if somebody other than an owner is ever allowed to vote.

_Rows key off the real `modelId` and are named through `modelIdentity`._ The placeholder rows borrowed a model by its position in the live catalog, so a delisted model was unrepresentable. Now a model OpenRouter has dropped still appears, labelled with its raw id, which is feature 8's rule about a stored answer applied to a stored vote.

_A model with no contests has no row._ Not a row reading "won 0 of 0". A model nobody has raced has no record, and printing one would read as a loss it never took.

**What building it changed about the plan.**

_A catalog that fails to load no longer replaces the leaderboard._ It used to hand the whole table to `CatalogUnavailable`, which was correct while every row was invented and the catalog was the only real thing on the screen. With real standings that reasoning inverts: the votes are the real thing, and hiding them because a third party is unreachable is the same mistake feature 8 corrected when it stopped dropping answers from unlisted models. The board now renders with raw ids and a small note above it offering a retry.

_Three failure sentences meant the retry button became shared._ `ThreadUnavailable` had already written down that a third one is the point at which the button should be extracted, and the leaderboard's unreadable-standings case is that third one. `components/retry-button.tsx` now owns the refresh and the spinner, and both older components lost their `"use client"` along with it, since the client boundary moved into the button.

_Two states the invented rows never had to consider._ A board with no votes at all, and a personal board with nobody signed in. Neither is an empty table: the first says nobody has voted yet, the second offers a sign-in, and the page decides between them because it is the only place that knows whether there is a user.

_The panel got wired to its tab._ The toggle was already a `tablist` from feature 7's UI build, with no panel associated with it. The standings section is now the `tabpanel`, labelled by whichever tab is selected, so the table announces which set of votes it is rather than being an unnamed region next to two buttons.

## Slice 5: Analytics depth

### 11. What the funnel could not see

Feature 6 shipped an honest five-event funnel and PostHog's own LLM analytics on top of it. This feature is about what that funnel is structurally blind to, which turned out to be four separate things rather than one: every failure the product handles gracefully, everything a person does after receiving a shared link, the difference between leaving mid-answer and finishing, and the constant that decides most of the leaderboard's data.

- [x] Decide the approach
- [x] Build: PostHog served from this origin, `next.config.ts` rewriting `/ingest` at both the ingestion and the assets host
- [x] Build: exception capture, `capture_exceptions` in the browser plus `reportServerException` on every handled server failure
- [x] Build: two error boundaries, `app/(app)/error.tsx` and `app/global-error.tsx`, both reporting and both showing a plain sentence
- [x] Build: `thread_shared` and `shared_thread_viewed`, the two halves of sharing
- [x] Build: `answer_abandoned`, `answer_retried`, and `turn_ready_for_vote`
- [x] Build: `retry_clicked`, with a required `surface`, on the shared retry button
- [x] Build: the opening model trio behind the `arena-default-models` flag, `features/models/default-models.ts`
- [x] Build: `pnpm verify` clean, 2026-08-17: typecheck, lint, format check, and a real production build
- [x] Build: the ingest proxy probed on a running server, 2026-08-17. `/ingest/decide` reaches PostHog and is answered `401` for an empty body rather than 404ing at Next; `/ingest/static/recorder.js` and `/ingest/static/array.js` both return the real scripts as `application/javascript`; `/`, `/models`, and `/leaderboard` still render
- [ ] Checked in a real signed-in browser: the seven new events arriving in PostHog, a session recording still recording through the proxy, and a thrown error appearing under error tracking
- [ ] The `arena-default-models` flag created in PostHog with a JSON payload of model ids, and a signed-in reload showing the flagged trio instead of the computed one
- [ ] PostHog, now unblocked by `shared_thread_viewed` and `answer_abandoned`: the two custom scouts from feature 6 can finally be written against a funnel that has a completion step and a drop-off step in it

**The approach, decided 2026-08-17.**

_Every failure this app handles well is a failure nobody will ever hear about._ The rule that a person is never shown a raw exception is right, and its consequence had not been followed through: a handled failure becomes a plain sentence on screen and a `console.error` in a serverless log that nobody opens, so the only record of a real defect happening to a real person is write-only. `reportServerException` keeps the log line exactly as it was, because that is what a person reads while a dev server runs, and sends the same failure to PostHog where instances of it group together. It is deliberately not a new logging layer: `lib/errors.ts` stays pure and every call site still reads as an ordinary catch.

_The exception carries no distinct id, on purpose._ PostHog's server client will take one, and the honest answer here is that a failed thread read or a failed catalog fetch often has nobody attached to it. Inventing an id would put people in PostHog who do not exist, and grouping an exception does not need a person.

_Analytics is served from this origin now._ Sending events straight to `eu.i.posthog.com` is what the default snippet does and it is exactly the pattern a content blocker recognises. A five-event funnel cannot afford that: a blocked event is not a gap in the data, it is a person who reads as never having shown up. Two rewrites rather than one, because ingestion and the replay assets live on different PostHog hosts, and the assets rule has to come first since rewrites match in order. `ui_host` is still the real host, so links out of a replay go to PostHog rather than to a path on this site.

_The proxy cannot be misconfigured into silence, and that is worth stating because it looks like it could._ The rewrite is only added when `NEXT_PUBLIC_POSTHOG_HOST` is present at build time, which reads like a silent fallback. It is not: the same variable is inlined into the browser bundle and validated by `publicEnv()`, so a build without it produces a client that refuses to start long before it would try to send anything. If the app runs in a browser at all, the rewrite was built alongside it.

_`shared_thread_viewed` is the one event that breaks this project's own rule about where events belong, and the reason is the reader._ Everything in feature 6's funnel is captured on the server, because the browser is not trusted for metrics and a closed tab loses events. A visitor reading a shared thread is usually signed out, so a server capture would have no distinct id: it would either invent one per thread, filling PostHog with people who never existed, or drop the person. Captured in the browser it lands on PostHog's own anonymous id, which is the same id that visit's pageviews and session recording already carry, so the view joins up with what the person did next. That is the entire question sharing raises and a server event could not have answered it. The trade is that a blocker can drop this one; the proxy is what makes that rare.

_`answer_abandoned` fires from the request's abort signal, and it deliberately over-counts._ The server drains its own copy of every stream on purpose, so a tab that closes mid-answer still produces `answer_completed` exactly as though somebody watched it, which means leaving was previously invisible. The abort signal is the only honest server-side evidence. A retry aborts its own request too and is counted here as well, because the server genuinely cannot tell the two apart at that moment. `answer_retried` exists to separate them in analysis rather than pretending the ambiguity is not there.

_`turn_ready_for_vote` fires on the completion that crosses two, not on every completion after it._ Without it "people are not voting" and "models are not finishing" are the same shape in the funnel, and they call for opposite fixes. Counting completed answers costs one indexed count per completion, which is cheap next to the model call that just finished.

_The default model trio was the highest-leverage constant in the product and did not look like one._ Almost nobody changes it before their first prompt, so it decides which models most votes are cast on, which means this function rather than any person decides the leaderboard's denominator. Changing it to find a better opening trio should not need a deploy. The flag falls back to `defaultSelectedModelIds` whenever it has nothing usable to say, which is most of the time, and its payload is filtered against the live catalog and capped at three, because a flag naming a delisted model would put a chip on screen that the submit action then refuses the whole turn for.

_Anonymous visitors do not get the flag._ Evaluating against an id invented per request would hand the same person a different trio on every reload, which is worse than no experiment. Signed in, the Clerk user id is the same id the rest of the funnel already keys on, so a person keeps their trio across sessions and the flag joins cleanly to every event they produce.

**What building it changed about the plan.**

_The shared retry button needed a required prop rather than an optional one._ A `retry_clicked` count with no surface on it says only that something somewhere is broken, and the three surfaces fail for completely unrelated reasons. Making `surface` required means the four call sites had to name themselves, which is the whole value of the event.

_Two of feature 6's three open PostHog chores stay open, and one is closer than it was._ All three are configuration inside PostHog rather than code, so none of them could be closed from here. The scouts one is genuinely unblocked further: the submission funnel it was meant to watch now has both a completion step and a drop-off step, which it did not when that chore was written.

_The catalog fetch is still the one handled failure that reports nothing._ `loadArenaCatalog` swallows with `.catch(() => null)` and never holds an error object, so there was nothing to report without restructuring it. Left deliberately: it is a third-party outage rather than a defect in this app, and it is noisy in exactly the way that trains people to ignore an error feed.

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- A "fastest" label on the leaderboard, tagging whichever model already has the best average speed, only for models with enough votes to mean anything. Nice to have, not required.
- Giving each model's own little icon a distinct look instead of plain gray. Nice to have, not required.
- Privacy policy and terms pages.
- Rich link previews when a thread gets shared somewhere.
- Any kind of admin or moderation page.
- A public API for the leaderboard data. Nobody's asked for this.
