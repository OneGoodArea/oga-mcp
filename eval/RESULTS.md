# Tool-selection eval

50 prompts sent to `claude-haiku-4-5` with the twelve tool definitions of `@oga-mcp/server` 1.0.13 attached, scored on which tool was called and with which arguments. Run on 2026-10-20. The eval never calls the OneGoodArea API; the places in the prompts are illustrative.

| Group | Cases | Tool choice | Pass |
|---|---|---|---|
| Compare named places | 8 | 8 | 8 |
| Rank or find neighbourhoods | 8 | 8 | 8 |
| Places like this one | 4 | 4 | 4 |
| History and changes | 5 | 5 | 5 |
| Watch a portfolio | 4 | 4 | 4 |
| Resolve a place | 5 | 5 | 5 |
| One place | 6 | 6 | 6 |
| Must not call a tool | 10 | 9 | 9 |
| All | 50 | 49 | 49 |

Overall: 49 of 50 passed (98%). Tool choice right in 49 of 50 (98%). 0 prompts went through resolve_place first.

## Failures

- `none-06`: expected no tool, called find_areas. Prompt: "Which neighbourhoods in Belfast have the lowest crime?"

## How to read it

Tool choice: the expected tool was among the calls of the decisive turn, or no tool was called when none should be. Pass: tool choice right and every argument check met. A first turn that calls only resolve_place is answered with a fixture and the second turn is the decisive one, because the resolve_place description asks for that path when an input may be retired or ambiguous.
