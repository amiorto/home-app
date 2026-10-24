#!/usr/bin/env bash
# Claude Code Stop hook: remind to commit/push when the repo has unsaved or unpushed work.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

changed=$(git status --porcelain | wc -l | tr -d ' ')
ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)

parts=()
[ "$changed" != 0 ] && parts+=("${changed} קבצים שונו ולא נשמרו")
[ "$ahead" != 0 ] && parts+=("${ahead} שמירות עוד לא עלו ל-GitHub")
[ ${#parts[@]} -eq 0 ] && exit 0

joined="${parts[0]}"
[ ${#parts[@]} -gt 1 ] && joined="${joined}, ${parts[1]}"
printf '{"systemMessage": "📌 תזכורת Git: %s. כדי לשמור ולהעלות, כתוב: תשמור ותעלה לגיט"}\n' "$joined"
