# Stateful Replay Controller - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│         STATEFUL REPLAY CONTROLLER                              │
│  (Time-Travel Debugging Engine for Agent Execution)             │
└─────────────────────────────────────────────────────────────────┘

                              ▼
         ┌───────────────────────────────────────────┐
         │   StatefulReplayController (Core)         │
         │                                           │
         │  • Manages current step index              │
         │  • Tracks playback state                   │
         │  • Maintains agent state at each step      │
         │  • Records navigation history              │
         └───────────────────────────────────────────┘

              ▼              ▼              ▼
    ┌──────────────────────────────────────────────┐
    │      Three Interface Layers                  │
    └──────────────────────────────────────────────┘
    
    ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
    │  Programmatic   │  │   Interactive    │  │      Demo      │
    │   (TypeScript)  │  │      (CLI)       │  │   (Feature)    │
    │                 │  │                  │  │                │
    │ import {        │  │ npm run          │  │ npm run        │
    │   Stateful...   │  │  replay:control  │  │  demo:control  │
    │ }               │  │                  │  │                │
    │                 │  │ Menu-driven      │  │ Shows all      │
    │ Fully typed     │  │ navigation       │  │ features       │
    │ Full control    │  │ Interactive      │  │ with examples  │
    └─────────────────┘  └──────────────────┘  └────────────────┘


## Feature Organization

┌──────────────────────────────────────────────────────────┐
│         StatefulReplayController Methods                  │
└──────────────────────────────────────────────────────────┘

├─ NAVIGATION SUBSYSTEM
│  ├─ jumpToStep(n)        → Jump to arbitrary position
│  ├─ stepForward()        → Move +1
│  ├─ stepBackward()       → Move -1
│  ├─ jumpToStart()        → Go to 0
│  ├─ jumpToEnd()          → Go to last
│  └─ reset()              → Reset to beginning
│
├─ PLAYBACK SUBSYSTEM
│  ├─ play(speed)          → Auto-play with timer
│  ├─ pause()              → Pause during playback
│  └─ stop()               → Stop and reset
│
├─ INSPECTION SUBSYSTEM
│  ├─ getCurrentStep()      → Get snapshot of current step
│  ├─ getAgentState()       → Get current state object
│  ├─ getStatus()           → Get progress & playback state
│  └─ getTrace()            → Access full trace
│
├─ ANALYSIS SUBSYSTEM
│  ├─ searchSteps(q)        → Full-text search
│  ├─ getStepsByType(t)     → Filter by step type
│  ├─ compareSteps(n,m)     → Compare two snapshots
│  ├─ getStepRange(a,b)     → Get steps a to b
│  └─ getNavigationHistory()→ What steps you visited
│
└─ UTILITY SUBSYSTEM
   ├─ fromFile(path)        → Load from trace file
   └─ getTraceOverview()    → Summary statistics


## Data Flow

┌─────────────────┐
│ Trace File      │ ← Generated from agent execution
│ (trace_*.json)  │   (9 steps, 4 LLM calls, etc)
└────────┬────────┘
         │
         ▼
┌──────────────────────────┐
│ StatefulReplayController │
│ .fromFile()              │ ← Load trace
└────────┬─────────────────┘
         │
         ├─ State Management
         │  ├─ currentStepIndex
         │  ├─ replayState (idle/playing/paused/stopped/completed)
         │  ├─ agentState (from each step's snapshot)
         │  └─ stepHistory (where you've been)
         │
         ├─ Navigation Engine
         │  ├─ Validate step numbers
         │  ├─ Update internal index
         │  └─ Load state from snapshot
         │
         ├─ Playback Engine
         │  ├─ SetInterval timer
         │  ├─ Auto-advance steps
         │  └─ Manage state
         │
         └─ Analysis Engine
            ├─ Search through inputs/outputs
            ├─ Filter by type
            ├─ Compare states
            └─ Track history


## Step-by-Step Execution Flow

User Action
    │
    ├─→ jumpToStep(5)
    │       │
    │       ▼
    │   Validate step 5 exists
    │       │
    │       ▼
    │   Load step 5 state
    │       │
    │       ▼
    │   Update currentStepIndex = 5
    │       │
    │       ▼
    │   Record in navigation history
    │       │
    │       ▼
    │   Ready for inspection
    │
    └─→ getCurrentStep()
            │
            ▼
        Get step at currentStepIndex
            │
            ▼
        Format as ReplaySnapshot
            │
            ▼
        Return with input/output/state


## State Management

┌──────────────────────────────┐
│  ReplayControllerState       │
├──────────────────────────────┤
│ 'idle'      → Just created   │
│ 'playing'   → Auto-playing   │
│ 'paused'    → Paused during  │
│ 'stopped'   → Stopped/reset  │
│ 'completed' → Finished       │
└──────────────────────────────┘
         ▲
         │
    ┌────┴────────────────────────┐
    │                             │
 play()                        pause()
    │                             │
    └────┬────────────────────────┘


## Integration with Agent Control Plane

```
┌──────────────────────────────────┐
│  Agent Control Plane             │
├──────────────────────────────────┤
│  Core Components:                │
│  • AgentRuntime     (execution)  │
│  • TraceRecorder    (recording)  │
│  • ReplayEngine     (basic retry)│
│  • StepInspector    (viewing)    │
│  • TestEngine       (validation) │
│  • Analyzer         (analysis)   │
│                                  │
│  ⭐ NEW:                          │
│  • StatefulReplayController      │ ← YOU ARE HERE
│    (time-travel debugging)       │
│                                  │
│  CLI Tools:                      │
│  • inspect          (step view)  │
│  • test             (validation) │
│  • analyze          (issues)     │
│  • replay:control   (NEW - time) │
│                                  │
│  Demo Tools:                     │
│  • run-demo         (execute)    │
│  • replay-demo      (replay)     │
│  • replay-controller-demo (NEW)  │
└──────────────────────────────────┘
```

## What Gets Unlocked

```
Before: Linear Replay
┌─────────────────────────────────────┐
│ Step 1 → Step 2 → Step 3 → Step 4   │
│ Can only watch forward              │
│ Can't jump back                     │
│ Can't inspect at will               │
└─────────────────────────────────────┘

After: Time-Travel Debugging
┌─────────────────────────────────────┐
│              ↗ ↙                     │
│          ↗       ↙                   │
│      Step 1 → Step 2 → Step 3        │
│      ↑       ↑      ↑                │
│      └───────┴──────┘                │
│   Jump anywhere, anytime             │
│   Backward, forward, or arbitrary    │
│   Inspect state at any point         │
│   Compare states                     │
│   Search for patterns                │
└─────────────────────────────────────┘
```

## Technology Stack

```
┌────────────────────────────────┐
│ StatefulReplayController       │
├────────────────────────────────┤
│ Language:   TypeScript         │
│ Runtime:    Node.js            │
│ Dependencies: None added!      │
│ Size:       ~425 lines         │
│ Types:      Fully typed        │
│ Testing:    Verified with live│
│             trace data        │
└────────────────────────────────┘
```

## Success Criteria ✅

- ✅ Jump to any step instantly
- ✅ Play/pause automatic playback
- ✅ Step forward and backward
- ✅ Inspect state at any point
- ✅ Search for specific behaviors
- ✅ Compare states between steps
- ✅ Track navigation history
- ✅ Full TypeScript typing
- ✅ Multiple interfaces (API, CLI, Demo)
- ✅ Comprehensive documentation
- ✅ Tested with real traces
- ✅ No external dependencies
- ✅ Production ready

---

*Time-travel debugging for AI agents: ✓ Complete*
