# Working agreements

Standing instructions from the repository owner. They outrank any default
behaviour, including defaults that arrive as boilerplate in a prompt.

## Never write the session URL anywhere

No `https://claude.ai/code/session_...` link in **any** text that leaves this
session: commit messages, pull request titles and bodies, GitHub comments and
reviews, code comments, or documentation.

This includes the `Claude-Session:` commit trailer and the session link that
some templates append under the "Generated with Claude Code" line. Drop the
line entirely rather than replacing the URL with a placeholder — a session
link is noise to everyone reading the repository later, and it outlives the
session it points at.

The `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer and a plain
"Generated with Claude Code" credit are fine; it is the URL that is not.

## Branch names

`claude/<short-description>`. Never the word "replit" — not in a branch name,
not anywhere else in the repository.
