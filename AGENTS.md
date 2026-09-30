# ElectronToInterface

## Working in this repo

- This repository is public, at github.com/anoop-patil. Never commit secrets, tokens, API keys, personal details or local machine paths. Secrets live only in GitHub Actions secrets.
- Everything in this folder may be published. Don't copy files in from outside it.
- The app is in `app/`. The README says how to run it and its tests.
- Prototypes: each iteration is a new file, `prototype/hello-zoom-vN.html`, and every earlier version stays as it was. From v8 the page is generated: `prototype/tools/build-hello-zoom-vN.py` builds it from `hello-zoom-vN.template.html` and `prototype/data/`, so a new version starts by copying both to the next number.
- Explanations are plain English, in one voice for everyone. They share one kitchen metaphor: disk = pantry, RAM = counter, interpreter = cook, bytecode = recipe, stack = plates, heap = shelves, CPU = stove.
- Never claim precision you can't back. Anything labeled Observed must be captured with CPython 3.14.2 on the stated platform, and no instruction count appears without real data.
- Proposals go in chat. A requirement enters the docs only after the user approves it.
- When the user pastes reviewer feedback, check each point against the repo before acting on it.

## Every commit

Ask the user before each commit and each push. One approval covers one commit or one push. Before committing:

1. **Sweep the docs.** Read every document in the repo: `README.md`, `AGENTS.md`, `Requirements.md`, `CONTEXT.md`, everything in `docs/`, and every ticket in `.scratch/`. Bring each one in line with the repo as it will stand after this commit: fix what the change made stale, tick the ticket boxes it finished, and delete what no longer holds. The sweep is done when every document has been read and each one is either edited or still true.
2. **Write plainly** in every edit: short sentences, concrete facts, the terms from `CONTEXT.md`, and only sentences a reader needs. Cut filler, hype, hedging and recaps. The README gets the closest read: a newcomer should learn from it what the project is, what works today and how to run it.
3. **Run the checks** if `app/` changed: in `app/`, `npm run typecheck`, `npm test`, `npm run test:e2e` and `python -m pytest`.
4. **Scan the staged files** for secrets, email addresses, personal details and local machine paths.

## Windows gotchas

- On Windows, Python's `write_text` writes CRLF line endings, but the repo stores LF. Write bytes, or pass `newline="\n"`.
- Git Bash heredocs mangle `\\`. Write the script to a file with the editor, then run it.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
