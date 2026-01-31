# Quick Start - Replay Controller

## TL;DR

The **Stateful Replay Controller** lets you time-travel through agent execution.

### Try It Now

```bash
# Generate a trace
npm run demo

# Then try one of these:

# Interactive exploration
npm run replay:control traces/trace_*.json

# See all features in action
npm run demo:controller traces/trace_*.json
```

## The 5 Most Useful Commands

### 1. **Jump to Any Step**
```typescript
controller.jumpToStep(5);
```
Instantly jump to a specific moment in execution. Perfect for going straight to the error.

### 2. **Play Through Automatically**
```typescript
controller.play(500); // 500ms per step
```
Watch the execution unfold step-by-step. Great for understanding the flow.

### 3. **Compare Two States**
```typescript
const diff = controller.compareSteps(0, 5);
// Shows what changed: memory, status, context, etc.
```
See exactly how agent state evolved between any two points.

### 4. **Search for Specific Behavior**
```typescript
const results = controller.searchSteps('book_restaurant');
// Finds all steps mentioning that tool
```
Find exactly where something happened in a long trace.

### 5. **Get Current Context**
```typescript
const step = controller.getCurrentStep();
const state = controller.getAgentState();
const status = controller.getStatus();
```
Inspect exactly what happened at this moment.

## Common Workflows

### Debugging an Error
```typescript
// Jump to the last error step
const results = controller.searchSteps('error');
const lastError = results[results.length - 1];
controller.jumpToStep(lastError.stepNumber);

// See what the error was
console.log(controller.getCurrentStep());

// Look at state just before
controller.stepBackward();
```

### Understanding State Evolution
```typescript
// Compare start vs end
const comparison = controller.compareSteps(0, 8);

// See what changed
comparison.stateDifferences.forEach(diff => {
    console.log(diff);
});
```

### Finding Tool Usage
```typescript
// Get all tool calls
const toolSteps = controller.getStepsByType('tool');

// Jump to first one
controller.jumpToStep(toolSteps[0].stepNumber);
```

### Replaying Specific Segment
```typescript
// Get steps 3-7
const segment = controller.getStepRange(3, 7);

segment.forEach(step => {
    console.log(`Step ${step.stepNumber}: ${step.stepType}`);
    console.log(`Input: ${JSON.stringify(step.input)}`);
    console.log(`Output: ${JSON.stringify(step.output)}`);
});
```

## API Cheat Sheet

| What You Want | Method |
|---------------|--------|
| Jump to step | `jumpToStep(n)` |
| Move forward/back | `stepForward()` / `stepBackward()` |
| Start/End | `jumpToStart()` / `jumpToEnd()` |
| Auto-play | `play(speed)` |
| Pause/Stop | `pause()` / `stop()` |
| Current snapshot | `getCurrentStep()` |
| Current state | `getAgentState()` |
| Status bar | `getStatus()` |
| Search | `searchSteps(query)` |
| Filter | `getStepsByType(type)` |
| Compare | `compareSteps(n1, n2)` |
| Range | `getStepRange(start, end)` |
| History | `getNavigationHistory()` |
| Reset | `reset()` |

## CLI Menu

```bash
npm run replay:control trace.json
```

Opens interactive menu:
```
⏮️  Jump to Start
◀️  Step Backward
▶️  Step Forward
⏭️  Jump to End
🎯 Jump to Step...
🔍 Search Steps...
⚖️  Compare Two Steps...
▶️  Auto-Play...
📊 Show Overview
❌ Exit
```

## Full Documentation

See [REPLAY_CONTROLLER.md](./REPLAY_CONTROLLER.md) for complete reference.

## What This Enables

- 🐛 **Debug** - See exactly what the agent did
- ⏱️ **Time Travel** - Jump to any moment
- 📊 **Analyze** - Compare states and find changes
- 🔍 **Search** - Find specific behaviors
- 🎯 **Test** - Create regression tests on execution patterns
- 🚀 **Optimize** - Find inefficiencies and loops

Happy debugging! 🎉
