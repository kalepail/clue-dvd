# AI Prompt Redesign Notes

## Current Problems

### Stage 4 is Doing Too Much
- Trying to generate narrative (4 fields) + 7 clues + 2 inspector notes
- 400+ lines of instructions
- Too many constraints competing with each other
- No concrete examples of good output

### Validation Fighting the AI
59 different error conditions suggest prompts aren't working:
- Theft/crime language appearing when it shouldn't
- Clues not grounded to timeline
- Alibi/clearance language showing up
- Event names drifting between stages
- Complex suspect timeline requirements failing

### Negative Instructions Don't Work Well
Current prompts have many "DO NOT" rules:
- "Do NOT mention theft/crime/investigation"
- "Do NOT use these banned words..."
- "Do NOT highlight the solution..."

LLMs struggle with negative instructions. Positive examples work much better.

## Proposed Solution

### 1. Use Few-Shot Examples (from DVD transcripts)
Instead of describing what Ashe sounds like, SHOW examples:

```
Here are 3 authentic Butler testimonies from the 2006 Clue DVD game:

Example 1: "'ello... I was tidying up the Conservatory after tea time, and I noticed
the display case had been disturbed. The velvet cloth was slightly askew, you see."

Example 2: "coming... By the time I escorted the guests to the Dining Room for dinner,
Mrs. Peacock had already retired to the Library. I recall she seemed rather flustered."

Example 3: "good day... I must say, during the afternoon games in the Ballroom, I was
occupied serving refreshments. Professor Plum asked for brandy twice, if memory serves."

Now generate a testimony in this same style...
```

### 2. Split Stage 4 into Focused Sub-Stages

Instead of one massive prompt, create 3 smaller prompts:

**Stage 4a: Narrative Wrapper** (opening, setting, atmosphere, closing)
- Single focused task
- 100-150 lines of instructions
- Clear examples of each field

**Stage 4b: Butler Clues** (7 testimonies)
- Generate one at a time OR in small batches
- Each with clear constraints from timeline
- Few-shot examples for each clue type

**Stage 4c: Inspector Notes** (2 notes)
- Separate from clues (different voice/style)
- Clear examples of evidence format
- Simpler constraints

### 3. Simplify Earlier Stages

**Stage 1** should ONLY define:
- Event type (specific, not generic)
- Event name
- Why it's happening
- Guest of honor (optional)

Remove complexity about beats, times, locations (that's Stage 2's job)

**Stage 2** should ONLY create:
- 5-7 beat titles
- Time for each beat
- 1-2 locations for each beat
- What happened (1 sentence)

Remove "attentionShift" and other extra fields

**Stage 3** should be OPTIONAL:
- Do we really need every suspect in every beat?
- Could simplify to just "which suspects were in which general area"
- OR skip this entirely and generate clues directly from Stage 2

### 4. Loosen Validation Where Safe

Some validation rules might be too strict:
- "Clue must reference a beat title OR time OR location" - too rigid?
- Sentence counting - is this critical?
- Exact name matching between stages - necessary?

### 5. Add Retry Logic with Adjustments

If validation fails:
1. Parse the error
2. Adjust the prompt with specific feedback
3. Retry (max 2-3 times)
4. Log failures for prompt improvement

## Next Steps

1. **Get DVD transcript examples** - This is critical for few-shot prompting
2. **Prototype simplified Stage 1** - Test if clearer focus improves reliability
3. **Split Stage 4** - Break into 3 sub-stages
4. **Add examples to all prompts** - Show, don't just tell
5. **Measure improvement** - Track validation pass rate before/after

## Questions to Answer

1. Do we need Stage 3 at all? (Full suspect timeline seems overly complex)
2. Can we generate clues one at a time instead of all 7 at once?
3. Should narrative fields be generated separately from clues?
4. What validation rules are truly critical vs. nice-to-have?
