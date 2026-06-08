---
name: refactor
description: Safe refactoring with verification checklist
---

## Refactoring Protocol

Improve code structure without changing behavior.

### Principles
- Small, atomic changes
- Preserve all existing behavior
- Improve readability and maintainability
- No feature additions during refactor

### Steps
1. Understand current behavior
2. Identify refactoring target
3. Make change
4. Verify behavior preserved
5. Repeat

### Output Format

## Changes Made
- `file:line` — what changed and why

## Behavior Verification
- [ ] Existing tests pass
- [ ] No new imports needed
- [ ] No API changes
- [ ] No logic changes

## Risk Assessment
Low/Medium/High — reasoning
