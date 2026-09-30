# ElectronToInterface

## Working in this repo

- This repository is public, at github.com/anoop-patil. Never commit secrets, tokens, API keys, personal details or local machine paths. Secrets live only in GitHub Actions secrets.
- Everything in this folder may be published. Don't copy files in from outside it.
- Prototypes: each iteration is a new file, `prototype/hello-zoom-vN.html`, and every earlier version stays as it was. From v8 the page is generated: `prototype/tools/build-hello-zoom-vN.py` builds it from `hello-zoom-vN.template.html` and `prototype/data/`, so a new version starts by copying both to the next number.
- Explanations are plain English, in one voice for everyone.
- Never claim precision you can't back. Anything labeled Observed must be captured with CPython 3.14.2 on the stated platform, and no instruction count appears without real data.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
