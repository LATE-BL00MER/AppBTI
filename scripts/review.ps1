# scripts/review.ps1 - Run an automated Claude Code review (called by Codex).
# Claude may only read code, run git/test commands, and write docs/REVIEW.md.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$prompt = "Follow the review procedure in CLAUDE.md. Review all commits since the last review round, then add a new round at the top of docs/REVIEW.md. Do not modify any other file. End your reply with exactly one line: VERDICT: LGTM or VERDICT: CHANGES_REQUESTED"

claude -p $prompt `
  --permission-mode default `
  --allowedTools "Read" "Grep" "Glob" `
    "Bash(git log:*)" "Bash(git diff:*)" "Bash(git show:*)" "Bash(git status:*)" `
    "Bash(pytest:*)" "Bash(python -m pytest:*)" `
    "Bash(./gradlew test:*)" "Bash(gradlew test:*)" "Bash(gradlew.bat test:*)" `
    "Bash(npm run build:*)" `
    "Edit(docs/REVIEW.md)" "Write(docs/REVIEW.md)"
exit $LASTEXITCODE
