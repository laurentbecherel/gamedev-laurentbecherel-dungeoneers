# Bash Heredoc Safe File Writing

When writing JavaScript/TypeScript files via bash/PowerShell on Windows, avoid here-string variable expansion corrupting template literals and jQuery-style selectors.

## Problem

PowerShell here-strings expand `${var}` and `$(cmd)` patterns:
- JS template literal ``fetch(`/api/${x}`)`` becomes ``fetch(`/api//`)`` (empty)
- jQuery `$(\"#id\")` becomes syntax error
- Result: \"Unexpected token\" errors, broken JS, tests timeout

## Solution

**Option 1 - Avoid template literals in generated JS:** Use string concatenation:
```js
// BAD in heredoc:
fetch(`/api/assets/${c}/${n}`)
// GOOD:
fetch("/api/assets/" + c + "/" + n)
```

**Option 2 - Escape dollar signs:** Use backtick escape in PowerShell here-string.

**Option 3 - Single-quoted here-string:** `@'@` does no expansion.

**Option 4 - Write via Node.js:** Use node -e with fs.writeFileSync instead of shell heredoc.

## When to apply

Generating .js/.ts/.mjs files via bash tool. Prefer Option 1 for generated code - simplest and most robust.

