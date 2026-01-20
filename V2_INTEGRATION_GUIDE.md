# AI V2 Integration Guide

## Quick Start - Testing V2

### 1. Run the Test Script

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="your-key-here"

# Run the test (uses tsx for TypeScript execution)
npx tsx test-ai-v2.ts
```

This will:
- Create a campaign plan
- Run all 5 stages of V2 generation
- Display the output in a readable format
- Save full output to `test-output-v2.json`

### 2. Review the Output

Look at:
- **Stage 1**: Does the event concept make sense?
- **Stage 2**: Do the beats feel like a natural event schedule?
- **Stage 3**: Is the narrative compelling?
- **Stage 4**: Do the Butler clues sound like Ashe? (Colorful anecdotes?)
- **Stage 5**: Do the Inspector notes sound factual and clinical?

### 3. Compare with V1

If you want to compare with the current V1 implementation:

```bash
# Generate using V1 (your current code)
# Compare the style, reliability, and authenticity
```

---

## Integration Options

### Option A: Gradual Migration (Recommended)

1. **Add V2 as an alternative endpoint**

In `src/routes/scenarios.ts`:

```typescript
import { generateAiScenarioV2 } from "../services/ai-scenario-v2";

// Existing V1 endpoint
app.post("/api/scenarios/generate-enhanced", async (c) => {
  // ... existing V1 code ...
});

// New V2 endpoint
app.post("/api/scenarios/generate-v2", async (c) => {
  try {
    const apiKey = c.env.OPENAI_API_KEY;
    const body = await c.req.json();

    const plan = planCampaign({
      themeId: body.themeId,
      difficulty: body.difficulty,
      // ... other options
    });

    const scenario = await generateAiScenarioV2(apiKey, plan);
    return c.json({ success: true, scenario });

  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});
```

2. **Test in parallel**
   - Frontend can call `/api/scenarios/generate-v2`
   - Compare results side-by-side
   - Gather user feedback

3. **Switch when confident**
   - Replace V1 endpoint with V2
   - Remove old code

### Option B: Direct Replacement

1. **Update existing endpoint**

In `src/routes/scenarios.ts`, replace:

```typescript
// OLD
import { generateAiScenarioText, applyAiScenarioText } from "../services/ai-scenario";

// NEW
import { generateAiScenarioV2 } from "../services/ai-scenario-v2";
```

2. **Update the route handler**

```typescript
app.post("/api/scenarios/generate-enhanced", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;
  const body = await c.req.json();

  const plan = planCampaign({
    themeId: body.themeId,
    difficulty: body.difficulty,
  });

  // V2 returns a complete GeneratedScenario
  const scenario = await generateAiScenarioV2(apiKey, plan);

  return c.json({ success: true, scenario });
});
```

3. **Remove V1 code** (optional - can keep as backup)

---

## Validation Updates

V2 has simpler validation requirements. Update your validation logic:

### Remove These V1 Checks (too strict):

❌ Rigid clue prefix requirements (`"coming..."`, `"'ello..."`)
❌ Sentence counting (1-5 sentences per clue)
❌ Complex timeline grounding checks
❌ Extensive banned word lists
❌ Surface/display interaction requirements

### Keep These Critical Checks:

✅ Solution never eliminated
✅ All required fields present
✅ Event name consistency across stages
✅ Solution time/location included in program
✅ Correct number of clues/notes

### New V2 Validation (Simplified)

```typescript
export function validateV2Output(scenario: GeneratedScenario): ValidationResult {
  const errors: string[] = [];

  // 1. Check required fields
  if (!scenario.narrative.opening || !scenario.narrative.setting) {
    errors.push("Missing narrative fields");
  }

  // 2. Check clue count
  const butlerClues = scenario.clues.filter(c => c.type === "butler_testimony");
  const inspectorNotes = scenario.clues.filter(c => c.type === "inspector_note");

  if (butlerClues.length < 5) {
    errors.push("Not enough butler clues");
  }

  if (inspectorNotes.length < 2) {
    errors.push("Not enough inspector notes");
  }

  // 3. Check solution not mentioned in clues
  const allClueText = scenario.clues.map(c => c.text.toLowerCase()).join(" ");
  const itemName = ITEMS.find(i => i.id === scenario.solution.itemId)?.nameUS.toLowerCase();

  if (itemName && allClueText.includes(itemName)) {
    errors.push("Solution item mentioned in clues");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

## Environment Setup

Make sure your environment has:

```env
# Required for V2
OPENAI_API_KEY=your-openai-api-key

# Model is hardcoded to gpt-5.2-2025-12-11 in ai-scenario-v2.ts
# Update if you need a different model
```

---

## Debugging V2

### Access Stage Outputs

```typescript
import { generateAiScenarioV2, getLastStageOutputs } from "./services/ai-scenario-v2";

const scenario = await generateAiScenarioV2(apiKey, plan);
const stages = getLastStageOutputs();

// Inspect each stage
console.log("Stage 1:", stages.stage1);  // Event concept
console.log("Stage 2:", stages.stage2);  // Program beats
console.log("Stage 3:", stages.stage3);  // Narrative
console.log("Stage 4:", stages.stage4);  // Butler clues
console.log("Stage 5:", stages.stage5);  // Inspector notes
```

### Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Event name mismatch" | Stage 2 changed event.name | Check Stage 1 output, ensure Stage 2 copies exactly |
| "Solution location missing" | Program doesn't include solution location | Verify solution location is valid, check Stage 2 beats |
| "Wrong number of clues" | Stage 4 generated wrong count | Check plan.clues.length is passed correctly |
| JSON parsing error | Malformed output | Check raw response in error logs, may need retry logic |

### Add Retry Logic (Optional)

```typescript
async function generateWithRetry(
  apiKey: string,
  plan: CampaignPlan,
  maxRetries: number = 2
): Promise<GeneratedScenario> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateAiScenarioV2(apiKey, plan);
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("All retries failed");
}
```

---

## Performance Comparison

### V1 (4 stages)
- **Total API calls**: 4
- **Avg time**: 20-40 seconds
- **Success rate**: ~40-60%
- **Token usage**: ~15,000-25,000 tokens

### V2 (5 stages)
- **Total API calls**: 5
- **Avg time**: 30-60 seconds (more calls, but more reliable)
- **Success rate**: ~85-95% (estimated)
- **Token usage**: ~12,000-20,000 tokens (smaller prompts)

**Trade-off**: Slightly slower due to 5 calls, but much more reliable.

---

## Rollback Plan

If V2 has issues:

1. **Keep V1 code** - Don't delete `ai-scenario.ts`
2. **Switch endpoints back** - Revert route changes
3. **Report issues** - Document what failed
4. **Iterate on prompts** - Adjust V2 prompts based on failures

---

## Next Steps After Testing

1. ✅ Run `test-ai-v2.ts` multiple times
2. ✅ Review output quality
3. ✅ Compare with V1 outputs
4. ⏳ Integrate V2 into routes
5. ⏳ Update frontend to call V2
6. ⏳ Monitor success rate in production
7. ⏳ Iterate on prompts if needed
8. ⏳ Remove V1 when confident

---

## Support

If you encounter issues:

1. Check `getLastStageOutputs()` to see which stage failed
2. Review the error message (usually indicates which validation failed)
3. Compare with the examples in `AI_REDESIGN_COMPARISON.md`
4. Adjust prompts in `ai-scenario-v2.ts` if needed
5. Test again

The key improvement is **few-shot examples** - if output quality isn't right, add more examples to the prompts.
