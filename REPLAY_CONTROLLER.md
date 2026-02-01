# 🥇 Stateful Replay Controller - Time Travel for Agent Execution

## Overview

The **StatefulReplayController** is the foundational component that enables **time-travel debugging** of AI agent executions. It gives you complete control over replay execution, allowing you to:

- ⏮️ Jump to any step in execution
- ▶️ Play through steps automatically
- ⏸️ Pause at any point
- ◀️ Step backward and forward
- 🔍 Search and filter steps
- ⚖️ Compare states between steps
- 📝 Track navigation history

## Core Features

### 1. **State Management**
```typescript
// Get current status
const status = controller.getStatus();
// Returns: { state, currentStepIndex, totalSteps, canPlayForward, canPlayBackward, progress }
```

### 2. **Step-by-Step Navigation**
```typescript
// Move forward one step
controller.stepForward();

// Move backward one step
controller.stepBackward();

// Jump to any step
controller.jumpToStep(5);

// Jump to extremes
controller.jumpToStart();
controller.jumpToEnd();
```

### 3. **Automatic Playback**
```typescript
// Play through all steps automatically (1000ms per step)
controller.play(1000);

// Pause playback
controller.pause();

// Stop and reset
controller.stop();
```

### 4. **Current Step Inspection**
```typescript
// Get detailed snapshot of current step
const step = controller.getCurrentStep();
// Returns: { stepNumber, stepType, timestamp, input, output, agentState, duration }

// Get agent state at current position
const state = controller.getAgentState();
```

### 5. **Step Filtering and Search**
```typescript
// Get all steps of a specific type
const toolSteps = controller.getStepsByType('tool');

// Search for steps containing specific text
const results = controller.searchSteps('book_restaurant');
```

### 6. **State Comparison**
```typescript
// Compare states between two steps
const comparison = controller.compareSteps(0, 5);
// Returns differences in status, currentStep, memory size, context

// Results show:
// - stateDifferences: Array of state changes between steps
// - step1, step2: Snapshots of both steps
```

### 7. **Navigation History**
```typescript
// Get all steps you've visited
const history = controller.getNavigationHistory();
// Useful for debugging your debugging session!
```

## Usage Examples

### Example 1: Basic Navigation
```typescript
import { StatefulReplayController } from './core/replay-controller';

const controller = StatefulReplayController.fromFile('traces/trace_123.json');

// Navigate through execution
controller.jumpToStep(0);
console.log(controller.getCurrentStep());

controller.stepForward();
console.log(controller.getCurrentStep());

const status = controller.getStatus();
console.log(`Progress: ${status.progress}%`);
```

### Example 2: Find Specific Behavior
```typescript
// Search for a tool call
const results = controller.searchSteps('book_restaurant');

if (results.length > 0) {
    const firstMatch = results[0];
    controller.jumpToStep(firstMatch.stepNumber);
    
    console.log('Tool input:', firstMatch.input);
    console.log('Tool output:', firstMatch.output);
}
```

### Example 3: Analyze State Evolution
```typescript
// Compare state at two different points
const comparison = controller.compareSteps(2, 8);

console.log('State changes between steps:');
comparison.stateDifferences.forEach(diff => {
    console.log(`  - ${diff}`);
});
```

### Example 4: Step-by-Step Debug
```typescript
// Reset to start
controller.reset();

// Manually step through with inspection
while (controller.getStatus().canPlayForward) {
    const step = controller.getCurrentStep();
    
    console.log(`Step ${step.stepNumber}: ${step.stepType}`);
    console.log(`Input: ${JSON.stringify(step.input)}`);
    console.log(`Output: ${JSON.stringify(step.output)}`);
    
    // Pause at specific conditions
    if (step.stepType === 'error') {
        console.log('ERROR DETECTED! Agent state:', step.agentState);
        break;
    }
    
    controller.stepForward();
}
```

### Example 5: Automatic Playback with Callbacks
```typescript
// Play through entire trace
controller.play(500); // 500ms per step

// Monitor progress
const monitorInterval = setInterval(() => {
    const status = controller.getStatus();
    console.log(`Progress: ${status.progress}%`);
    
    if (status.state === 'completed') {
        clearInterval(monitorInterval);
        console.log('Playback complete!');
    }
}, 1000);
```

## CLI Tools

### Interactive Replay Control
```bash
npm run replay:control traces/trace_123.json
```
Opens an interactive menu where you can:
- Navigate through steps
- Search for specific behavior
- Compare states
- Auto-play
- View trace overview

### Replay Controller Demo
```bash
npm run demo:controller traces/trace_123.json
```
Runs a comprehensive demo showing all controller features.

## API Reference

### Methods

| Method | Description |
|--------|-------------|
| `getStatus()` | Get current controller state and progress |
| `getCurrentStep()` | Get detailed snapshot of current step |
| `getAgentState()` | Get agent state at current position |
| `reset()` | Reset to beginning |
| `play(speed?)` | Auto-play through steps |
| `pause()` | Pause playback |
| `stop()` | Stop and reset |
| `stepForward()` | Move to next step |
| `stepBackward()` | Move to previous step |
| `jumpToStep(n)` | Jump to specific step |
| `jumpToStart()` | Jump to beginning |
| `jumpToEnd()` | Jump to end |
| `getStepsByType(type)` | Filter by step type |
| `searchSteps(query)` | Search for steps |
| `compareSteps(n1, n2)` | Compare two steps |
| `getNavigationHistory()` | Get visited steps |
| `getStepRange(start, end)` | Get range of steps |
| `getTrace()` | Get underlying trace |
| `getTraceOverview()` | Get summary statistics |

### Types

#### ReplayControllerStatus
```typescript
{
    state: 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';
    currentStepIndex: number;
    totalSteps: number;
    canPlayForward: boolean;
    canPlayBackward: boolean;
    canJump: (stepNumber: number) => boolean;
    progress: number; // 0-100
}
```

#### ReplaySnapshot
```typescript
{
    stepNumber: number;
    stepType: string;
    timestamp: string;
    input: unknown;
    output: unknown;
    agentState: AgentState;
    duration?: number;
}
```

## What This Unlocks

✅ **Step-by-Step Debugging** - See exactly what happened at each point
✅ **Time Travel** - Jump to any moment in execution
✅ **State Analysis** - Compare how agent state evolved
✅ **Problem Detection** - Find loops, errors, and inefficiencies
✅ **Behavioral Testing** - Create tests against specific execution patterns
✅ **Performance Analysis** - Identify slow steps and optimization opportunities

## Next Steps

This foundation enables:

1. **VS Code Extension UI** - Visual timeline navigation
2. **Advanced Breakpoints** - Pause on conditions
3. **Step Comparison Tool** - Side-by-side state inspection
4. **Execution Visualization** - Graph view of execution flow
5. **Automated Debugging** - Find anomalies and suggest fixes

## Files

- [replay-controller.ts](../src/core/replay-controller.ts) - Main controller class
- [replay-control.ts](../src/cli/replay-control.ts) - Interactive CLI
- [replay-controller-demo.ts](../src/demo/replay-controller-demo.ts) - Demo script
