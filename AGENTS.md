# AGENTS.md

## Scope
- The instructions in this file apply to everything under `C:\Users\sakan\SEK_Interface\SEKI_ONLINE`.
- If another `AGENTS.md` exists in a deeper directory, that one takes precedence.

## Language
- Provide explanations and reports to the user in Japanese.
- Match existing style for comments in code.

## Workflow
- Before making changes, read the target area and confirm existing behavior (especially role handling, turn progression, and logs).
- Keep changes minimal and do not mix in unrelated refactors or formatting.
- Do not roll back existing uncommitted changes.
- Do not create fallback behavior; instead, output logs and stop processing.

## Shell
- Use PowerShell
- Use encoding utf-8
- Prefer `npm.cmd` / `npx.cmd` over `npm` / `npx` in PowerShell (ExecutionPolicy-safe)

## Validation
- If you edit JavaScript, run at least a minimal syntax check.
- When running npm/npx commands in PowerShell, use `npm.cmd` / `npx.cmd`.
- In the work report, explicitly list syntax-check commands run (if one fails, also report the reason and whether processing was stopped).
- When adding public/private logs, verify send timing and target types.

## Game-Specific Rules
- When adding a new role or effect, always verify the following.
- For out-of-target guidance, use a `disabled` button and a note by default; do not open a separate modal when an out-of-target item is clicked.
1. Activation conditions (own turn / already-used checks)
2. Target selection UI (out-of-target display and guidance on press)
3. Execution guard (prevent bypassing UI restrictions)
4. Turn progression (whether the turn ends or continues)
5. Effect removal conditions (including removal logs)

## User Interface
- Do not use hard-to-read color combinations such as yellow text on a white background.

## Font Rules
- Set the base UI fonts to `Orbitron` for English and `WDXL Lubrifont JP N` for Japanese.
- Prioritize readability in rules, role lists, and modal content, and use `M PLUS 1`.
- For modal titles only, use `Orbitron` for English and `WDXL Lubrifont JP N` for Japanese.
- Keep direct font-name literals to a minimum; use CSS variables or shared classes by default.
- Inline `font-family` declarations (inside `style=""`) are prohibited in principle (temporary debugging only is an exception).
- When adding or changing fonts, centralize loading definitions in one place and verify impact on existing screens (readability/layout breaks).

## Out of Scope Defaults
- Unless explicitly requested, do not change file structure, add dependencies, or make large-scale design changes.
