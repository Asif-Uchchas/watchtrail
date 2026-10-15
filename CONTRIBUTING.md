# Contributing to Watchtrail

Thanks for helping. Watchtrail is a small project, so the process is light: open an issue or a pull request, keep changes focused, and make sure the checks pass.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug.** Use the bug template and include the (redacted) file link that misbehaved. Most bugs are a file-naming style the parser does not know yet.
- **Add a naming style.** Send the link pattern and the expected show, season and episode.
- **Suggest a feature.** Open a feature request and describe the problem before the solution.
- **Improve the docs.** Anything that confused you while setting it up is worth fixing.

Good first areas: more link patterns in `src/lib/parse.ts`, more server presets for the userscript, accessibility fixes, and tests.

## Set up

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/Asif-Uchchas/watchtrail.git
cd watchtrail
npm install
cp .env.example .env.local        # set AUTH_SECRET; TMDB keys are optional
npm run dev                       # http://localhost:3000
```

Development uses a local SQLite file under `data/`, which is git-ignored. Delete it any time to start fresh. Use a **separate** `DATABASE_URL` for experiments so you never touch a real Turso database:

```bash
DATABASE_URL=file:data/scratch.db npm run dev
```

> **Heads up:** this project uses a recent Next.js with breaking changes. Read the matching guide in `node_modules/next/dist/docs/` before changing routing, caching or server actions, and do not assume older APIs still exist.

## Before you open a pull request

Run all of these. CI runs the same ones.

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run check:parser   # prints how the link parser reads sample links
npm run build          # production build
```

For UI changes, check both a phone-width and a desktop-width window, and attach a screenshot to the PR.

## Project conventions

- **Server vs client.** Database access lives in `src/lib/*.ts` marked `server-only`. Pure helpers that the browser also needs (`parse.ts`, `time.ts`, `play.ts`) must not import server code.
- **All writes go through server actions** in `src/app/actions.ts`, which call `requireUser()` first. Every query is scoped by `userId`; never read or write another user's rows.
- **Schema changes** need two edits in `src/lib/schema.ts`: the Drizzle table, and an idempotent line in `MIGRATIONS_SQL` (an `ALTER TABLE ... ADD COLUMN`, or `CREATE TABLE IF NOT EXISTS` in `SCHEMA_SQL`). Existing databases upgrade themselves on first request, so a migration must be safe to run twice.
- **Link parsing is pure and tested by example.** When you add a pattern, add a sample to `scripts/check-parser.ts`.
- **No secrets in code or logs.** Tokens, passwords and TMDB keys come from the environment or the user's own settings.
- **Never store or proxy video.** Watchtrail only stores links and metadata.
- **UI style.** Calm and simple: one accent colour, the tokens in `src/app/globals.css`, components in `src/components/ui.tsx`. Prefer lists over cards, and keep a clear primary action on each screen.
- **Plain ASCII in source where practical**, and short comments that explain *why*.

## Commits and pull requests

- One logical change per PR. Small PRs get reviewed faster.
- Write commit messages in the imperative: "Add season tabs to the show page".
- Describe what changed and how you tested it. Link the issue if there is one.
- Do not commit `.env*`, database files, or build output.

## Making a launch video (optional)

The repo includes the [`brag-slim`](https://github.com/latent-spaces/brag) agent skill (see `.agents/skills/brag-slim`). In Claude Code, from the project folder, run `/brag-slim` to produce a short video and share copy in `brag-output/`, which is git-ignored. If you add a feature, a clip makes a nice release announcement. Install the skill into another agent with:

```bash
npx skills add https://github.com/latent-spaces/brag --skill brag-slim
```

## Reporting security problems

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
