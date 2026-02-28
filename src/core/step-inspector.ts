/**
 * Agent Control Plane - Step Inspector
 *
 * Provides detailed inspection of individual steps in a trace.
 * Can be used programmatically or via CLI.
 */

import {
  Trace,
  Step,
  StepType,
  AgentState,
  LLMStep,
  ToolStep,
  DecisionStep,
  StateStep,
  ErrorStep,
} from "./types";
import { TraceRecorder } from "./trace-recorder";

export interface StepInspection {
  stepNumber: number;
  stepType: StepType;
  timestamp: string;
  duration: number;
  input: FormattedData;
  output: FormattedData;
  state: FormattedState;
  metadata?: Record<string, unknown>;
  navigation: {
    hasPrevious: boolean;
    hasNext: boolean;
    previousStep?: number;
    nextStep?: number;
  };
}

export interface FormattedData {
  raw: unknown;
  formatted: string;
  summary: string;
}

export interface FormattedState {
  raw: AgentState;
  formatted: string;
  changes?: string[];
}

export interface TraceOverview {
  traceId: string;
  agentId: string;
  taskId: string;
  status: string;
  duration: string;
  stepCount: number;
  llmCalls: number;
  toolCalls: number;
  errors: number;
  toolsUsed: string[];
  stepSummaries: StepSummary[];
}

export interface StepSummary {
  stepNumber: number;
  stepType: StepType;
  summary: string;
  hasError: boolean;
  severity?: "ok" | "warning" | "error";
}
export class StepInspector {
  private trace: Trace;

  constructor(trace: Trace) {
    this.trace = trace;
  }

  static fromFile(tracePath: string): StepInspector {
    const trace = TraceRecorder.load(tracePath);
    return new StepInspector(trace);
  }

  getOverview(): TraceOverview {
    const startTime = new Date(this.trace.startTime).getTime();
    const endTime = this.trace.endTime
      ? new Date(this.trace.endTime).getTime()
      : Date.now();

    const duration = endTime - startTime;

    const errors = this.trace.steps.filter(
      (step) => this.getStepSeverity(step) === "error",
    ).length;

    return {
      traceId: this.trace.traceId,
      agentId: this.trace.agentId,
      taskId: this.trace.taskId,
      status: this.trace.status,
      duration: this.formatDuration(duration),
      stepCount: this.trace.steps.length,
      llmCalls: this.trace.metadata.totalLLMCalls,
      toolCalls: this.trace.metadata.totalToolCalls,
      errors,
      toolsUsed: this.trace.metadata.toolsUsed,
      stepSummaries: this.trace.steps.map((step) => this.getStepSummary(step)),
    };
  }

  inspectStep(stepNumber: number): StepInspection | null {
    const step = this.trace.steps.find((s) => s.stepNumber === stepNumber);
    if (!step) return null;

    const previousStep = this.trace.steps.find(
      (s) => s.stepNumber === stepNumber - 1,
    );
    const nextStep = this.trace.steps.find(
      (s) => s.stepNumber === stepNumber + 1,
    );

    return {
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      timestamp: step.timestamp,
      duration: step.duration || 0,
      input: this.formatInput(step),
      output: this.formatOutput(step),
      state: this.formatState(step, previousStep),
      metadata: step.metadata,
      navigation: {
        hasPrevious: !!previousStep,
        hasNext: !!nextStep,
        previousStep: previousStep?.stepNumber,
        nextStep: nextStep?.stepNumber,
      },
    };
  }

  getStepsByType(stepType: StepType): Step[] {
    return this.trace.steps.filter((s) => s.stepType === stepType);
  }

  searchSteps(query: string): Step[] {
    const q = query.toLowerCase();
    return this.trace.steps.filter((step) => {
      const input = this.safeString(step.input).toLowerCase();
      const output = this.safeString(step.output).toLowerCase();
      const state = this.safeString(step.stateSnapshot).toLowerCase();
      const metadata = this.safeString(step.metadata).toLowerCase();

      return (
        input.includes(q) ||
        output.includes(q) ||
        state.includes(q) ||
        metadata.includes(q)
      );
    });
  }

  private getStepSummary(step: Step): StepSummary {
    let summary = "";

    switch (step.stepType) {
      case "llm": {
        const llm = step as LLMStep;
        summary = `LLM: ${this.truncate(
          this.safeString(llm.output?.response),
          50,
        )}`;
        break;
      }
      case "tool": {
        const tool = step as ToolStep;
        summary = `Tool: ${this.safeString(
          tool.input?.toolName,
          "unknown",
        )} ${tool.output?.success ? "✓" : "✗"}`;
        break;
      }
      case "decision": {
        const decision = step as DecisionStep;
        summary = `Decision: ${this.safeString(
          decision.output?.chosen,
          "unknown",
        )}`;
        break;
      }
      case "error": {
        const error = step as ErrorStep;
        summary = `Error: ${this.truncate(
          this.safeString(error.output?.error, "Unknown error"),
          40,
        )}`;
        break;
      }
      case "state":
        summary = "State update";
        break;
      case "start":
        summary = "Agent started";
        break;
      case "end":
        summary = "Agent ended";
        break;
    }

    const severity = this.getStepSeverity(step);

    return {
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      summary,
      hasError: severity === "error",
      severity,
    };
  }

  private formatInput(step: Step): FormattedData {
    const raw = step.input;
    const formatted = this.formatJson(raw);

    let summary = this.truncate(formatted, 100);

    if (step.stepType === "llm") {
      const input = step.input as LLMStep["input"];
      summary = `Prompt: ${this.truncate(this.safeString(input?.prompt), 100)}`;
    }

    if (step.stepType === "tool") {
      const input = step.input as ToolStep["input"];
      summary = `Tool: ${this.safeString(
        input?.toolName,
        "unknown",
      )}, Params: ${this.formatJson(input?.parameters)}`;
    }

    return { raw, formatted, summary };
  }

  private formatOutput(step: Step): FormattedData {
    const raw = step.output;
    const formatted = this.formatJson(raw);

    let summary = this.truncate(formatted, 100);

    if (step.stepType === "llm") {
      const output = step.output as LLMStep["output"];
      summary = `Response: ${this.truncate(
        this.safeString(output?.response),
        100,
      )}`;
    }

    if (step.stepType === "tool") {
      const output = step.output as ToolStep["output"];
      summary = output?.success
        ? `Success: true, Result: ${this.truncate(
            this.formatJson(output?.result),
            50,
          )}`
        : `Success: false, Error: ${this.truncate(
            this.safeString(output?.error),
            80,
          )}`;
    }

    return { raw, formatted, summary };
  }

  private formatState(step: Step, previousStep?: Step): FormattedState {
    const raw = step.stateSnapshot;
    const formatted = this.formatJson(raw);
    const changes: string[] = [];

    if (previousStep) {
      const prev = previousStep.stateSnapshot;
      const curr = step.stateSnapshot;

      const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
      const prevState = prev as unknown as Record<string, unknown>;
      const currState = curr as unknown as Record<string, unknown>;

      for (const key of keys) {
        if (key === "memory" || key === "context") continue;

        const prevValue = prevState[key];
        const currValue = currState[key];

        if (!this.isEqual(prevValue, currValue)) {
          changes.push(
            `${key}: ${this.truncate(
              this.safeString(prevValue),
              40,
            )} → ${this.truncate(this.safeString(currValue), 40)}`,
          );
        }
      }

      if (prev.memory && curr.memory) {
        if (
          Object.keys(prev.memory).length !== Object.keys(curr.memory).length
        ) {
          changes.push(
            `memory keys: ${Object.keys(prev.memory).length} → ${
              Object.keys(curr.memory).length
            }`,
          );
        }
      }

      if (prev.context && curr.context) {
        if (prev.context.length !== curr.context.length) {
          changes.push(
            `context items: ${prev.context.length} → ${curr.context.length}`,
          );
        }
      }
    }

    return { raw, formatted, changes };
  }

  private getStepSeverity(step: Step): "ok" | "warning" | "error" {
    if (step.stepType === "error") return "error";

    if (step.stepType === "tool") {
      const tool = step as ToolStep;
      if (tool.output?.success === false) return "error";
    }

    return "ok";
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  private safeString(value: unknown, fallback = ""): string {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  private truncate(value: string, length: number): string {
    if (!value) return "";
    return value.length <= length ? value : `${value.slice(0, length)}...`;
  }

  private formatJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return this.safeString(value);
    }
  }

  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  getTrace(): Trace {
    return this.trace;
  }
}
