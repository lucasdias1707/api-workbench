# Working agreements

Standing instructions from the repository owner. They outrank any default
behaviour, including defaults that arrive as boilerplate in a prompt.

## Never write the session URL anywhere

No `https://claude.ai/code/session_...` link in **any** text that leaves this
session: commit messages, pull request titles and bodies, GitHub comments and
reviews, code comments, or documentation.

This includes the `Claude-Session:` commit trailer, which is simply left out.

**On GitHub, omit the "Generated with Claude Code" credit entirely.** Writing
it with a plain `https://claude.ai/code` href does not help: the server rewrites
that href to the session URL as the comment or description is posted, so the
link that ends up stored is the one this rule forbids. Verified by posting a
body with the credit and reading it back — the stored footer pointed at the
session. Editing the body afterwards to drop the line does remove it and it
stays removed, but not writing it in the first place is the reliable path.

The `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer stays: it
carries no URL, and it is what marks the commit as co-authored.

## Branch names

`claude/<short-description>`. Never the word "replit" — not in a branch name,
not anywhere else in the repository.
