---
name: code_review
description: Structured code review with severity levels
---

## Code Review Protocol

Review the code with focus on:

### 1. Correctness
- Logic errors, off-by-one, null handling
- Missing edge cases, race conditions
- Incorrect API usage

### 2. Security
- Injection risks (SQL, XSS, command)
- Hardcoded secrets, unsafe deserialization
- Missing input validation at boundaries

### 3. Performance
- Unnecessary loops, redundant computation
- N+1 patterns, missing pagination
- Memory leaks, blocking in async

### 4. Maintainability
- Unclear naming, complex logic
- Missing error handling for external calls
- Dead code, unreachable branches

### Output Format

## Critical (must fix)
- [issue]: [fix]

## Important (should fix)
- [issue]: [fix]

## Suggestions (nice to have)
- [issue]: [fix]

If clean: say so. Don't invent issues.
