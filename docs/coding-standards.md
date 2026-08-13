# Coding standards

The conventions this codebase actually follows, written down after there was
real code to describe rather than guessed at up front. `CLAUDE.md` states the
rules in one line each; this file is the long version, and it says for every
rule whether a machine enforces it or a person has to.

Two categories, and the difference matters:

- **Enforced** means a tool fails on it. You cannot commit a violation without
  deliberately bypassing the hook.
- **Judgment** means nobody will catch it but a reader. These are the ones worth
  actually reading, because the tooling is silent on them.

## Running it

| Command             | What it does                                                |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | Development server.                                         |
| `pnpm typecheck`    | `tsc --noEmit` over the whole project.                      |
| `pnpm lint`         | ESLint, including the type-aware rules.                     |
| `pnpm lint:fix`     | The same, applying every fix it can.                        |
| `pnpm format`       | Prettier, writing.                                          |
| `pnpm format:check` | Prettier, reporting only. This is what CI would run.        |
| `pnpm verify`       | Typecheck, lint, format check, and a real production build. |

`pnpm verify` is the one to run before calling any piece of work done. The
project rule is that a change is not finished until it has been typechecked,
linted, and built for real, and chaining those into one command is the only way
that reliably happens rather than being remembered three times out of four.

There is no test runner and no browser automation framework, deliberately.
Verification here is a running dev server and a real browser, or something as
light as `curl`. Do not install one to check that something works.

## The pre-commit hook

Husky runs `.husky/pre-commit`, which does two things:

1. `lint-staged` — ESLint with `--fix` and then Prettier, over staged files
   only. Fast, and it only ever touches what you were already committing.
2. `pnpm typecheck` — the whole project, every time.

The typecheck is not scoped to staged files on purpose. Types are cross-file: a
changed return type breaks its callers, and those callers are exactly the files
you did not stage. A staged-only typecheck would pass while the project is
broken, which is worse than no check at all because it reads as a green light.

The production build stays out of the hook. It is slow enough that a hook
running it would get bypassed within a week, and `pnpm verify` covers it at the
moment it actually matters.

The hook installs itself: `prepare` runs `husky` on `pnpm install`, so a fresh
clone is protected without anyone remembering a setup step.

## Enforced

**No `any`.** `@typescript-eslint/no-explicit-any` is an error. TypeScript is in
`strict` mode and this rule closes the escape hatch that would otherwise make
strictness optional. Where a dependency does not surface something typed — the
AI SDK not exposing a provider-specific field, for instance — the answer is a
narrow typed accessor of our own, parsed or asserted in one place, not `any`
spreading outward from the call site.

**No floating promises.** `@typescript-eslint/no-floating-promises` is an error,
and it is the reason the ESLint config turns on typescript-eslint's project
service at all. Everything load-bearing in this app is asynchronous and much of
it streams. An un-awaited promise there does not throw; it resolves into
nothing, and the symptom is a stream that quietly stops. This rule is worth the
slower lint.

**Consistent type imports.** Type-only imports are written as such, inline. It
keeps the runtime import graph honest, which matters in a codebase where the
server/client boundary is load-bearing.

**`prefer-readonly`.** A class field never reassigned must be `readonly`. Narrow
in reach, since this codebase is nearly all functions, but it points the same
direction as everything below.

**Formatting.** Prettier owns it entirely, with `eslint-config-prettier` last in
the ESLint config so the two never argue. Tailwind class order is sorted by
`prettier-plugin-tailwindcss`, pointed at `app/globals.css` because Tailwind v4
takes its configuration from the stylesheet rather than a JS config file. Class
order being automatic means a diff never contains a reordering argument.

**Generated code is excluded, not formatted.** `features/database/generated/`
is written by `prisma generate` and gitignored; `.next/` likewise. Both are in
`.prettierignore` and in ESLint's ignore list. Linting output nobody wrote is
noise.

## Judgment

**Functional style.** Pure functions by default. No shared mutable state. Side
effects pushed to the edges. In practice: a function that computes should not
also write, and a module should not do anything at import time.

**One place keeps state, and it is documented.** `singleton.ts` is the only
process-wide cache in the app, and it exists for two specific reasons — a
database pool that must survive hot reload or development opens connections
until Postgres refuses more, and an Arcjet client that loses its local decision
cache when rebuilt. Both callers read as ordinary functions. If something else
ever genuinely needs to outlive a reload, it goes through `processSingleton`
rather than casting `globalThis` again. Two hand-rolled caches is how the
previous version of this went wrong.

**Nothing reads the environment at import time.** `serverEnv()` and
`publicEnv()` are functions, called at boot from `instrumentation.ts`. Parsing
at module scope made `next build` itself require production secrets, which
breaks any build environment that legitimately has none. Same reasoning behind
building clients on first call rather than at import. A missing key still kills
the server before it serves a request — that is the fail-fast rule, and it is
satisfied at boot, not at import.

**Immutable data.** `const` and `readonly`, `map`/`filter`/`reduce` over
mutating loops. Not lintable without a preset strict enough to fight the
framework, so it is on the reader.

**Folder by feature, not by layer.** `features/model-call/`,
`features/security/`, `features/analytics/`, `features/database/`. There is no
`lib/`, no `utils/`, no `components/` at the root collecting unrelated things.
A duplicate Prisma client once lived in `lib/`, was referenced by nothing, and
failed typecheck unnoticed — a layer folder is where code goes to be forgotten.
Routes under `app/` stay thin: parse, protect, delegate to a feature.

**Never show a raw exception or a provider error.** Every failure a person can
see is a plain human sentence plus a retry action. The stream route's 401, 400,
and 429 responses are the reference: they say what happened in ordinary words
and never leak a rule name, a provider message, or a stack. This includes not
overwriting a real server sentence with a generic client-side fallback — the
fallback is for when the body is not something we recognise, not for every
failure.

**Analytics failing never breaks the app.** `instrumentation-client.ts`
contains its own errors. A misconfigured key fails loudly at server boot, where
someone can act on it, rather than in a browser console nobody reads.

**Every model is free tier, and cost still gets shown.** Cost comes back from
OpenRouter with `usage: { include: true }` and is parsed with a schema, not
assumed. It reads $0.0000 because that is the honest measurement. Do not hide
it, and do not hardcode it. Free-tier-only is enforced on the server in
`features/model-call/catalog.ts`, because a model id goes to OpenRouter under
this app's key and a paid id would spend real money.

**Shared values live in one place.** Spacing, color, and repeated UI patterns
belong in `app/globals.css` or a shared component, never copy-pasted as raw
Tailwind classes across files. The rule of thumb: the same handful of classes
in three places is a component, not a coincidence. Colors and the accent rules
are decided in `docs/scope.md`'s design feature — read that rather than
inventing values here.

**Accessibility baseline on every screen.** Real contrast, visible focus, full
keyboard operation. Not a pass at the end; part of building the screen.

## When a rule and the code disagree

Say so and fix the rule, not just the code. This file and `docs/scope.md` are
both meant to be corrected in place when building proves them wrong — there are
several such corrections recorded in the scope already, and they are the most
useful paragraphs in it. Quietly working around a documented rule is the one
thing that makes these documents worthless.
