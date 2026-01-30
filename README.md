# Agent Control Plane

A local-first developer tool for recording, replaying, and testing AI agent behavior.

## What This MVP Proves

1. **Agent behavior can be recorded as a deterministic trace** - Every step is captured with inputs, outputs, and state
2. **That trace can be replayed exactly** - Deterministic replay from recorded data
3. **Developers can inspect and test agent behavior, not just outputs** - Full step inspection and behavioral testing

## Installation

```bash
npm install
```

## Quick Start

### 1. Run the Agent

```bash
# Run the restaurant booking agent
npm start

# Run with a broken scenario (for testing failure detection)
npm start -- --broken
```

### 2. Inspect the Trace

```bash
# Interactive inspection
npm run inspect traces/<trace-file>.json

# View specific step
npm run inspect traces/<trace-file>.json 3
```

### 3. Run Behavioral Tests

```bash
# Run built-in tests
npm run test traces/<trace-file>.json

# Run custom tests from YAML
npm run test traces/<trace-file>.json tests/basic.yaml
```

### 4. Analyze for Issues

```bash
npm run analyze traces/<trace-file>.json
```

### 5. Replay the Trace

```bash
npm run replay traces/<trace-file>.json
```

## Architecture

```
Agent-Control-Plane/
├── src/
│   ├── core/                 # Core components
│   │   ├── types.ts          # Type definitions
│   │   ├── trace-recorder.ts # COMPONENT 2: Trace Recorder
│   │   ├── agent-runtime.ts  # COMPONENT 1: Minimal Agent Runtime
│   │   ├── replay-engine.ts  # COMPONENT 3: Deterministic Replay
│   │   ├── step-inspector.ts # COMPONENT 4: Step Inspector
│   │   ├── test-engine.ts    # COMPONENT 5: Behavioral Test Engine
│   │   └── analyzer.ts       # COMPONENT 6: Memory & Step Analysis
│   │
│   ├── cli/                  # CLI tools
│   │   ├── inspect.ts        # Step inspector CLI
│   │   ├── test-runner.ts    # Test runner CLI
│   │   └── analyze.ts        # Analyzer CLI
│   │
│   └── agent/                # Agent implementation
│       ├── llm-provider.ts   # LLM provider
│       ├── tools.ts          # Agent tools (restaurant booking)
│       ├── run.ts            # Agent runner
│       └── replay.ts         # Trace replay
│
├── vscode-extension/         # COMPONENT 7: VS Code Extension
│   └── src/extension.ts      # Extension implementation
│
├── tests/                    # Test definitions
│   ├── basic.yaml            # Basic behavioral tests
│   └── broken-agent.yaml     # Tests for broken agents
│
└── traces/                   # Generated trace files
```

## Trace Format

Each trace is a JSON file containing:

```json
{
  "traceId": "trace_1234567890_abc",
  "agentId": "restaurant-booking-agent",
  "taskId": "task_1234567890",
  "startTime": "2024-01-15T10:00:00.000Z",
  "endTime": "2024-01-15T10:00:05.000Z",
  "status": "completed",
  "steps": [
    {
      "stepNumber": 1,
      "stepType": "llm",
      "timestamp": "2024-01-15T10:00:01.000Z",
      "input": { "prompt": "..." },
      "output": { "response": "...", "action": "search" },
      "stateSnapshot": { "currentStep": 1, "memory": {}, ... },
      "duration": 150
    }
  ],
  "metadata": {
    "agentVersion": "1.0.0",
    "toolsUsed": ["search_restaurants", "book_restaurant"],
    "totalLLMCalls": 4,
    "totalToolCalls": 3
  }
}
```

## Test Format

Behavioral tests are defined in YAML:

```yaml
tests:
  - name: "Tool Should Be Called"
    assertions:
      - type: tool_called
        params:
          tool: search_restaurants
          minTimes: 1

  - name: "Step Limit"
    assertions:
      - type: max_steps
        params:
          count: 10
```

### Available Assertions

| Type | Description | Params |
|------|-------------|--------|
| `tool_called` | Verify a tool was called | `tool`, `minTimes` |
| `tool_not_called` | Verify a tool was NOT called | `tool` |
| `max_steps` | Maximum step count | `count` |
| `min_steps` | Minimum step count | `count` |
| `state_contains` | Final state contains value | `key`, `value` |
| `state_not_contains` | Final state doesn't contain value | `key`, `value` |
| `step_type_count` | Count of step type | `stepType`, `count`, `operator` |

## Analysis Warnings

The analyzer detects:

- **high_step_count** - Too many steps (critical/warning)
- **memory_growth** - Memory growing without cleanup
- **repeated_tool_calls** - Same tool called with same params
- **unused_memory** - Memory stored but never used
- **long_duration** - Steps taking too long
- **error_rate** - High percentage of error steps

## VS Code Extension

The VS Code extension provides:

- **Traces View** - List all traces in workspace
- **Steps View** - Browse steps of current trace
- **Trace Inspector Panel** - Visual step-by-step inspection

### Commands

- `ACP: Open Trace File` - Load a trace for inspection
- `ACP: Show Trace Inspector` - Open the inspector panel
- `ACP: Analyze Current Trace` - Run analysis on loaded trace
- `ACP: Run Agent` - Run the agent in terminal

## Success Metrics

| Metric | Status |
|--------|--------|
| Same trace produces same replay behavior | Yes |
| Same final state after replay | Yes |
| Any step can be inspected | Yes |
| Inputs, outputs, state visible | Yes |
| Behavioral tests exist | Yes |
| Tests catch logic regressions | Yes |
| Tests don't depend on exact text | Yes |
| Tool highlights inefficiencies | Yes |
| Broken agent scenario exists | Yes |
| Tool explains why it broke | Yes |

## Definition of Done

- You can run an agent
- Generate a trace
- Replay it deterministically
- Inspect steps
- Run regression tests
- Explain failures using the trace

## License

MIT
