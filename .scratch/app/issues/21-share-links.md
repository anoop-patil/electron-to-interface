# 21: Share links

**What to build:** A learner can share a link that carries their program. Whoever opens it sees the code and chooses whether to run it.

**Blocked by:** 19: Code editor, file upload and the 20-line limit

**Status:** ready-for-agent

- [x] The program is compressed into the URL fragment (`#...`). No server and no storage are involved (ADR 0004).
- [x] A Share link opens with the code visible and a Run button, and never runs by itself.
- [x] A 20-line Program round-trips exactly.

## Comments

- Ticket 16: the page starts by showing hello world's Analysis, made when the site was built, with its code in the editor. A Share link puts its own code in the editor instead, so it shouldn't also show hello world's Analysis as if it were that code's.
- Ticket 19: new code in `App.tsx`'s `code` state goes into the editor by itself. Code that differs from what the zoom view shows gets the out-of-date note, which suits a Share link before its Run. `fileName` holds an uploaded file's name; a Share link that carries only the code would use `program.py`.

Built in `app/`. Decisions made along the way:

- A Share button sits beside Upload. It puts the link on the clipboard and shows it under Run in a text field, with a note that whoever opens it sees the code, and that it runs only when they click Run. Where the browser won't allow the clipboard, the note asks the learner to copy the link. The link goes once the code is edited, since it carries the code as it was.
- The link is `/zoom/1#code=` and then the Program's UTF-8 bytes, compressed with deflate (the browser's own `CompressionStream`, so no new package) and written in base64url. It carries only the code, so its commands use `program.py`. It always opens zoom level 1, where the code is. `src/share/shareLink.ts` makes and reads it.
- A link opens with its Program in the editor and nothing run. The zoom view and the Terminal still show hello world, and the note at the top of the zoom view says so in place of the out-of-date note: "This program came from a Share link. Nothing from a link runs until you click Run, so the zoom view and the Terminal still show the hello world Example." A link whose code is hello world's exactly shows hello world's Analysis as the Example, as picking it would.
- A link pasted into a tab already showing the page changes only the fragment, so the page reads it again. An Example pick or Run still going is then left to finish unseen. Its note names whatever the zoom view shows.
- The fragment stays in the address, at every zoom level, until an Example or an uploaded file takes the place of the link's Program; then the page removes it, so a reload doesn't bring the link's Program back. A Run leaves it.
- A link cut short or changed by hand doesn't decompress into UTF-8 text. The editor keeps hello world, and a note says the link couldn't be read. A link that unpacks into more than 1 MB is refused with its own note: deflate can shrink repeated text about 1,000 times, so a link of a megabyte could unpack into a gigabyte and freeze the page. Windows line endings become plain newlines.
- The clipboard gets the link as a promise, through a `ClipboardItem`, because Safari allows the clipboard only while it handles the click, and making the link takes a moment. Only Chromium was tested.
- Tests: `src/share/shareLink.test.ts` round-trips a 20-line Program with accents, emoji, tabs and a backslash, and checks broken and oversized links; `e2e/share.spec.ts` shares a 20-line Program, opens the link in a new tab, checks the editor holds it exactly and nothing has run once Python is ready, then Runs it. It also checks the link goes when the code changes, a link opened in a tab already showing the page, the fragment going at an Example pick, and a link cut short.
