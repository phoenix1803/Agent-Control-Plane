/**
 * Agent Control Plane - VS Code Extension
 *
 * Provides visual inspection of agent traces within VS Code.
 * Includes time-travel replay controller integration.
 */
import { StepInspector } from "../../dist/core/step-inspector";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Types (duplicated from core to avoid dependency issues)
interface Trace {
  traceId: string;
  agentId: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  status: string;
  steps: Step[];
  finalState?: unknown;
  metadata: {
    agentVersion: string;
    toolsUsed: string[];
    totalLLMCalls: number;
    totalToolCalls: number;
  };
}

interface Step {
  stepNumber: number;
  stepType: string;
  timestamp: string;
  input: unknown;
  output: unknown;
  stateSnapshot: unknown;
  duration?: number;
}

interface ReplayControllerState {
  state: "idle" | "playing" | "paused" | "stopped" | "completed";
  currentStepIndex: number;
  totalSteps: number;
  canPlayForward: boolean;
  canPlayBackward: boolean;
  progress: number;
}

let currentTrace: Trace | undefined;
let tracePanel: vscode.WebviewPanel | undefined;
let replayState: ReplayControllerState | undefined;
let autoPlayInterval: NodeJS.Timeout | undefined;
let inspector: StepInspector | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("Agent Control Plane extension activated");

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("acp.openTrace", openTraceCommand),
    vscode.commands.registerCommand("acp.showPanel", showPanelCommand),
    vscode.commands.registerCommand("acp.analyzeTrace", analyzeTraceCommand),
    vscode.commands.registerCommand("acp.runDemo", runDemoCommand),
    // Replay controller commands
    vscode.commands.registerCommand("acp.replay.play", replayPlayCommand),
    vscode.commands.registerCommand("acp.replay.pause", replayPauseCommand),
    vscode.commands.registerCommand("acp.replay.stop", replayStopCommand),
    vscode.commands.registerCommand("acp.replay.next", replayNextCommand),
    vscode.commands.registerCommand("acp.replay.prev", replayPrevCommand),
    vscode.commands.registerCommand("acp.replay.start", replayStartCommand),
    vscode.commands.registerCommand("acp.replay.end", replayEndCommand),
    vscode.commands.registerCommand("acp.replay.jump", replayJumpCommand),
    vscode.commands.registerCommand("acp.replay.search", replaySearchCommand),
  );

  // Register tree data providers
  const tracesProvider = new TracesTreeProvider();
  const stepsProvider = new StepsTreeProvider();

  vscode.window.registerTreeDataProvider("acp.tracesView", tracesProvider);
  vscode.window.registerTreeDataProvider("acp.stepsView", stepsProvider);

  // Watch for trace file changes
  const watcher = vscode.workspace.createFileSystemWatcher("**/traces/*.json");
  watcher.onDidCreate(() => tracesProvider.refresh());
  watcher.onDidChange(() => tracesProvider.refresh());
  watcher.onDidDelete(() => tracesProvider.refresh());
  context.subscriptions.push(watcher);
}

export function deactivate() {
  if (tracePanel) {
    tracePanel.dispose();
  }
}

/**
 * Open trace file command
 */
async function openTraceCommand(uri?: vscode.Uri) {
  let tracePath: string;

  if (uri) {
    tracePath = uri.fsPath;
  } else {
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { "JSON files": ["json"] },
      title: "Select Trace File",
    });

    if (!files || files.length === 0) {
      return;
    }

    tracePath = files[0].fsPath;
  }

  try {
    const content = fs.readFileSync(tracePath, "utf-8");
    currentTrace = JSON.parse(content) as Trace;
    inspector = new StepInspector(currentTrace as any); // for inspection of seach step

    // Initialize replay state
    initializeReplayState();

    // Refresh steps view
    vscode.commands.executeCommand("acp.stepsView.focus");

    // Show panel
    showTracePanel(currentTrace);

    vscode.window.showInformationMessage(
      `Loaded trace: ${currentTrace.traceId}`,
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load trace: ${error}`);
  }
}

/**
 * Show trace inspector panel
 */
async function showPanelCommand() {
  if (!currentTrace) {
    const result = await vscode.window.showWarningMessage(
      "No trace loaded. Would you like to open one?",
      "Open Trace",
    );

    if (result === "Open Trace") {
      await openTraceCommand();
    }
    return;
  }

  showTracePanel(currentTrace);
}

/**
 * Analyze current trace
 */
async function analyzeTraceCommand() {
  if (!currentTrace) {
    vscode.window.showWarningMessage("No trace loaded");
    return;
  }

  // Basic analysis
  const warnings: string[] = [];

  if (currentTrace.steps.length > 10) {
    warnings.push(`High step count: ${currentTrace.steps.length}`);
  }

  const toolCalls = currentTrace.steps.filter((s) => s.stepType === "tool");
  const toolCallsByName = new Map<string, number>();

  for (const step of toolCalls) {
    const input = step.input as { toolName: string };
    const count = toolCallsByName.get(input.toolName) || 0;
    toolCallsByName.set(input.toolName, count + 1);
  }

  for (const [tool, count] of toolCallsByName) {
    if (count >= 3) {
      warnings.push(`Repeated tool calls: ${tool} called ${count} times`);
    }
  }

  const errors = currentTrace.steps.filter((s) => s.stepType === "error");
  if (errors.length > 0) {
    warnings.push(`Errors: ${errors.length} error(s) detected`);
  }

  // Show results
  const message =
    warnings.length > 0
      ? `Analysis found ${warnings.length} issue(s):\n${warnings.join("\n")}`
      : "No issues found!";

  vscode.window.showInformationMessage(message);
}

/**
 * Run agent
 */
async function runDemoCommand() {
  const terminal = vscode.window.createTerminal("ACP Demo");
  terminal.show();
  terminal.sendText("npm run demo");
}

/**
 * Replay Controller Commands
 */

function initializeReplayState() {
  if (!currentTrace) {
    vscode.window.showWarningMessage("No trace loaded");
    return;
  }

  replayState = {
    state: "idle",
    currentStepIndex: 0,
    totalSteps: currentTrace.steps.length,
    canPlayForward: true,
    canPlayBackward: false,
    progress: 0,
  };
}

async function replayPlayCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState) return;

  replayState.state = "playing";
  updateReplayUI();

  autoPlayInterval = setInterval(() => {
    if (!replayState || !currentTrace) return;

    if (replayState.currentStepIndex < currentTrace.steps.length - 1) {
      replayState.currentStepIndex++;
      updateReplayState();
      updateReplayUI();
    } else {
      stopAutoPlay();
      replayState.state = "completed";
      updateReplayUI();
    }
  }, 1000);
}

async function replayPauseCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState) return;

  stopAutoPlay();
  replayState.state = "paused";
  updateReplayUI();
}

async function replayStopCommand() {
  stopAutoPlay();
  if (replayState) {
    replayState.state = "stopped";
    replayState.currentStepIndex = 0;
    updateReplayState();
    updateReplayUI();
  }
}

async function replayNextCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState || !currentTrace) return;

  stopAutoPlay();

  if (replayState.currentStepIndex < currentTrace.steps.length - 1) {
    replayState.currentStepIndex++;
    updateReplayState();
  }

  replayState.state = "paused";
  updateReplayUI();
}

async function replayPrevCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState) return;

  stopAutoPlay();

  if (replayState.currentStepIndex > 0) {
    replayState.currentStepIndex--;
    updateReplayState();
  }

  replayState.state = "paused";
  updateReplayUI();
}

async function replayStartCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState) return;

  stopAutoPlay();
  replayState.currentStepIndex = 0;
  updateReplayState();
  replayState.state = "paused";
  updateReplayUI();
}

async function replayEndCommand() {
  if (!replayState) initializeReplayState();
  if (!replayState || !currentTrace) return;

  stopAutoPlay();
  replayState.currentStepIndex = currentTrace.steps.length - 1;
  updateReplayState();
  replayState.state = "paused";
  updateReplayUI();
}

async function replayJumpCommand() {
  if (!replayState || !currentTrace) {
    vscode.window.showWarningMessage("No trace loaded");
    return;
  }

  const input = await vscode.window.showInputBox({
    prompt: `Enter step number (0-${currentTrace.steps.length - 1}):`,
    value: replayState.currentStepIndex.toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0 || num >= currentTrace!.steps.length) {
        return `Enter a number between 0 and ${currentTrace!.steps.length - 1}`;
      }
      return "";
    },
  });

  if (input !== undefined) {
    stopAutoPlay();
    replayState.currentStepIndex = parseInt(input);
    updateReplayState();
    replayState.state = "paused";
    updateReplayUI();
  }
}

async function replaySearchCommand() {
  if (!currentTrace) {
    vscode.window.showWarningMessage("No trace loaded");
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: "Search for text in steps:",
  });

  if (!query) return;

  const results = currentTrace.steps.filter((step) => {
    const inputStr = JSON.stringify(step.input).toLowerCase();
    const outputStr = JSON.stringify(step.output).toLowerCase();
    return (
      inputStr.includes(query.toLowerCase()) ||
      outputStr.includes(query.toLowerCase())
    );
  });

  if (results.length === 0) {
    vscode.window.showInformationMessage(
      "No steps found matching your search.",
    );
    return;
  }

  // Jump to first result
  if (replayState) {
    replayState.currentStepIndex = results[0].stepNumber - 1; // Convert 1-based to 0-based
    updateReplayState();
    updateReplayUI();
  }

  vscode.window.showInformationMessage(
    `Found ${results.length} step(s). Jumped to first result.`,
  );
}

function updateReplayState() {
  if (!replayState || !currentTrace || !inspector) return;

  replayState.canPlayForward =
    replayState.currentStepIndex < currentTrace.steps.length - 1;
  replayState.canPlayBackward = replayState.currentStepIndex > 0;
  replayState.progress = Math.round(
    (replayState.currentStepIndex / currentTrace.steps.length) * 100,
  );

  // Use StepInspector here
  const step = currentTrace.steps[replayState.currentStepIndex];
  const inspection = inspector.inspectStep(step.stepNumber);

  if (tracePanel) {
    tracePanel.webview.postMessage({
      type: "updateReplayState",
      state: replayState,
      inspection, // inspector output, not raw step
    });
  }
}

function updateReplayUI() {
  if (!replayState) return;

  // Update status bar
  const icon =
    replayState.state === "playing"
      ? "▶️"
      : replayState.state === "paused"
        ? "⏸️"
        : "⏹️";
  const statusText = `${icon} ${replayState.progress}% [${replayState.currentStepIndex}/${replayState.totalSteps}]`;

  // Refresh panel
  if (tracePanel) {
    tracePanel.webview.postMessage({
      type: "updateReplayUI",
      state: replayState,
    });
  }
}

function stopAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = undefined;
  }
}

/**
 * Show trace in webview panel
 */
function showTracePanel(trace: Trace) {
  if (tracePanel) {
    tracePanel.reveal();
  } else {
    tracePanel = vscode.window.createWebviewPanel(
      "acpTrace",
      `Trace: ${trace.traceId}`,
      vscode.ViewColumn.Two,
      { enableScripts: true },
    );

    tracePanel.onDidDispose(() => {
      tracePanel = undefined;
    });

    // Handle messages from webview
    tracePanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "replay.play":
          await replayPlayCommand();
          break;
        case "replay.pause":
          await replayPauseCommand();
          break;
        case "replay.stop":
          await replayStopCommand();
          break;
        case "replay.next":
          await replayNextCommand();
          break;
        case "replay.prev":
          await replayPrevCommand();
          break;
        case "replay.start":
          await replayStartCommand();
          break;
        case "replay.end":
          await replayEndCommand();
          break;
        case "replay.jump":
          await replayJumpCommand();
          break;
        case "replay.search":
          await replaySearchCommand();
          break;
        case "jumpToStep":
          if (replayState) {
            replayState.currentStepIndex = message.step - 1; // Convert 1-based to 0-based
            updateReplayState();
            updateReplayUI();
          }
          break;
      }
    });
  }

  tracePanel.webview.html = getWebviewContent(trace);
}

/**
 * Generate webview HTML with replay controls
 */
function getWebviewContent(trace: Trace): string {
  const currentStep = replayState
    ? trace.steps[replayState.currentStepIndex]
    : trace.steps[0];
  const progress = replayState ? replayState.progress : 0;

  const stepsHtml = trace.steps
    .map(
      (step) => `
    <div class="step ${step.stepType}" data-step="${step.stepNumber}" ${replayState?.currentStepIndex === step.stepNumber ? "selected" : ""}>
      <div class="step-header">
        <span class="step-num">${step.stepNumber}</span>
        <span class="step-type">${step.stepType.toUpperCase()}</span>
        <span class="step-time">${step.duration || 0}ms</span>
      </div>
      <div class="step-summary">${getStepSummary(step)}</div>
    </div>
  `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        .header {
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 18px;
        }
        .replay-controls {
          display: flex;
          gap: 8px;
          margin: 15px 0;
          padding: 12px;
          background: var(--vscode-editor-inactiveSelectionBackground);
          border-radius: 4px;
          align-items: center;
        }
        .replay-button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          font-family: var(--vscode-font-family);
        }
        .replay-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .replay-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .progress-bar {
          flex: 1;
          height: 6px;
          background: var(--vscode-panel-border);
          border-radius: 3px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--vscode-progressBar-background);
          width: ${progress}%;
          transition: width 0.2s;
        }
        .progress-text {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          min-width: 80px;
          text-align: right;
        }
        .meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }
        .meta-item {
          display: flex;
          flex-direction: column;
        }
        .meta-label {
          font-weight: bold;
          margin-bottom: 2px;
        }
        .steps-container {
          display: flex;
          gap: 20px;
        }
        .steps-list {
          flex: 1;
          max-width: 300px;
        }
        .step-detail {
          flex: 2;
          background: var(--vscode-editor-inactiveSelectionBackground);
          padding: 15px;
          border-radius: 4px;
          display: none;
        }
        .step-detail.active {
          display: block;
        }
        .step {
          padding: 10px;
          margin-bottom: 5px;
          border-radius: 4px;
          cursor: pointer;
          background: var(--vscode-list-hoverBackground);
        }
        .step:hover {
          background: var(--vscode-list-activeSelectionBackground);
        }
        .step.selected {
          background: var(--vscode-list-activeSelectionBackground);
          border-left: 3px solid var(--vscode-focusBorder);
        }
        .step-header {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 5px;
        }
        .step-num {
          font-weight: bold;
          color: var(--vscode-textLink-foreground);
        }
        .step-type {
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
        }
        .step.llm .step-type { background: #4CAF50; }
        .step.tool .step-type { background: #2196F3; }
        .step.error .step-type { background: #f44336; }
        .step.decision .step-type { background: #FF9800; }
        .step-time {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
        }
        .step-summary {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        pre {
          background: var(--vscode-textCodeBlock-background);
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          max-height: 300px;
        }
        code {
          font-family: var(--vscode-editor-font-family);
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${trace.traceId}</h1>
        <div class="meta">
          <div class="meta-item">
            <span class="meta-label">Status</span>
            <span>${trace.status}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Steps</span>
            <span>${trace.steps.length}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Duration</span>
            <span>${trace.endTime ? Math.round((new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime()) / 1000) : 0}s</span>
          </div>
        </div>
      </div>

      <div class="replay-controls">
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.start'})">⏮ Start</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.prev'})" ${replayState?.canPlayBackward ? "" : "disabled"}>◀ Prev</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.play'})">▶ Play</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.pause'})">⏸ Pause</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.next'})" ${replayState?.canPlayForward ? "" : "disabled"}>Next ▶</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.end'})">End ⏭</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.jump'})">🎯 Jump</button>
        <button class="replay-button" onclick="vscode.postMessage({command: 'replay.search'})">🔍 Search</button>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="progress-text">${replayState?.progress || 0}%</div>
      </div>

      <div class="steps-container">
        <div class="steps-list">
          <h3>Steps</h3>
          <div id="stepsList">
            ${stepsHtml}
          </div>
        </div>
        <div class="step-detail active" id="stepDetail">
        //   <h3>Current Step: <span id="stepNum">${currentStep.stepNumber}</span> (<span id="stepType">${currentStep.stepType.toUpperCase()}</span>)</h3>
        //   <h4>Input</h4>
        //   <pre><code id="stepInput">${JSON.stringify(currentStep.input, null, 2)}</code></pre>
        //   <h4>Output</h4>
        //   <pre><code id="stepOutput">${JSON.stringify(currentStep.output, null, 2)}</code></pre>

        <h3>
        Current Step:
        <span id="stepNum">–</span>
        (<span id="stepType">–</span>)
        </h3>

        <h4>Input</h4>
        <pre><code id="stepInput">Waiting for inspection…</code></pre>

        <h4>Output</h4>
        <pre><code id="stepOutput">Waiting for inspection…</code></pre>

          <h4>Timestamp</h4>
          <p id="stepTime">${currentStep.timestamp}</p>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const trace = ${JSON.stringify(trace)};
        
        // Attach click handlers to all steps
        function attachStepListeners() {
          const steps = document.querySelectorAll('.step');
          steps.forEach(stepEl => {
            stepEl.addEventListener('click', function() {
              const stepNum = parseInt(this.getAttribute('data-step'));
              vscode.postMessage({ command: 'jumpToStep', step: stepNum });
            });
          });
        }
        
        // Update step detail view
        // function updateStepDetail(stepNum) {
        //   const step = trace.steps.find(s => s.stepNumber === stepNum);
        //   if (!step) return;
          
        //   // Update selected class
        //   document.querySelectorAll('.step').forEach(el => el.classList.remove('selected'));
        //   const selected = document.querySelector('[data-step="' + stepNum + '"]');
        //   if (selected) selected.classList.add('selected');
          
        //   // Scroll into view
        //   if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          
        //   // Update detail panel
        //   document.getElementById('stepNum').textContent = step.stepNumber;
        //   document.getElementById('stepType').textContent = step.stepType.toUpperCase();
        //   document.getElementById('stepInput').textContent = JSON.stringify(step.input, null, 2);
        //   document.getElementById('stepOutput').textContent = JSON.stringify(step.output, null, 2);
        //   document.getElementById('stepTime').textContent = step.timestamp;
        // }

        function updateStepDetailFromInspection(inspection) {
    // Highlight selected step
    document.querySelectorAll('.step').forEach(el =>
        el.classList.remove('selected')
    );

    const selected = document.querySelector(
        '[data-step="' + inspection.stepNumber + '"]'
    );
    if (selected) selected.classList.add('selected');

    // Update header
    document.getElementById('stepNum').textContent =
        inspection.stepNumber;
    document.getElementById('stepType').textContent =
        inspection.stepType.toUpperCase();

    //  Inspector-powered data
    document.getElementById('stepInput').textContent =
        inspection.input.formatted;
    document.getElementById('stepOutput').textContent =
        inspection.output.formatted;
}
        
        // Listen for updates from extension
        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'updateReplayState' && message.inspection) {
            updateStepDetailFromInspection(message.inspection);
          } else if (message.type === 'updateReplayUI' && message.state) {
            const progress = Math.round((message.state.currentStepIndex / trace.steps.length) * 100);
            const progressFill = document.querySelector('.progress-fill');
            if (progressFill) {
              progressFill.style.width = progress + '%';
            }
            const progressText = document.querySelector('.progress-text');
            if (progressText) {
              progressText.textContent = progress + '%';
            }
          }
        });
        
        // Initialize
        attachStepListeners();
        // updateStepDetail(${currentStep.stepNumber});


        

      </script>
    </body>
    </html>
  `;
}

/**
 * Get step summary for display
 */
function getStepSummary(step: Step): string {
  switch (step.stepType) {
    case "llm":
      const llmOutput = step.output as { response: string };
      return llmOutput.response?.substring(0, 50) + "..." || "LLM response";
    case "tool":
      const toolInput = step.input as { toolName: string };
      const toolOutput = step.output as { success: boolean };
      return `${toolInput.toolName} ${toolOutput.success ? "✓" : "✗"}`;
    case "error":
      const errorOutput = step.output as { error: string };
      return errorOutput.error?.substring(0, 40) + "..." || "Error";
    case "start":
      return "Agent started";
    case "end":
      return "Agent ended";
    default:
      return step.stepType;
  }
}

/**
 * Tree data provider for traces
 */
class TracesTreeProvider implements vscode.TreeDataProvider<TraceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TraceItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TraceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TraceItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const tracesDir = path.join(workspaceFolders[0].uri.fsPath, "traces");

    if (!fs.existsSync(tracesDir)) {
      return [];
    }

    const files = fs
      .readdirSync(tracesDir)
      .filter((f) => f.endsWith(".json"))
      .slice(-10); // Show last 10 traces

    return files.map((file) => {
      const filePath = path.join(tracesDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const trace = JSON.parse(content) as Trace;
        return new TraceItem(
          trace.traceId,
          trace.status,
          filePath,
          vscode.TreeItemCollapsibleState.None,
        );
      } catch {
        return new TraceItem(
          file,
          "error",
          filePath,
          vscode.TreeItemCollapsibleState.None,
        );
      }
    });
  }
}

class TraceItem extends vscode.TreeItem {
  constructor(
    public readonly traceId: string,
    public readonly status: string,
    public readonly filePath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(traceId.replace("trace_", ""), collapsibleState);
    this.tooltip = `${traceId}\nStatus: ${status}`;
    this.description = status;
    this.iconPath =
      status === "completed"
        ? new vscode.ThemeIcon("pass")
        : new vscode.ThemeIcon("error");
    this.command = {
      command: "acp.openTrace",
      title: "Open Trace",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

/**
 * Tree data provider for steps
 */
class StepsTreeProvider implements vscode.TreeDataProvider<StepItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    StepItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StepItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StepItem[] {
    if (!currentTrace) {
      return [];
    }

    return currentTrace.steps.map((step) => new StepItem(step));
  }
}

class StepItem extends vscode.TreeItem {
  constructor(public readonly step: Step) {
    super(`Step ${step.stepNumber}`, vscode.TreeItemCollapsibleState.None);
    this.description = step.stepType.toUpperCase();
    this.tooltip = `${step.stepType}\n${step.timestamp}`;

    const icons: Record<string, string> = {
      llm: "comment",
      tool: "tools",
      error: "error",
      start: "debug-start",
      end: "debug-stop",
      decision: "git-compare",
      state: "database",
    };

    this.iconPath = new vscode.ThemeIcon(
      icons[step.stepType] || "circle-outline",
    );
  }
}
