/**
 * Agent Control Plane - Stateful Replay Controller
 * 
 * Provides time-travel control over agent execution replay.
 * 
 * Features:
 * - Play/Pause control
 * - Step forward/backward navigation
 * - Jump to specific step
 * - Current state inspection
 * - Replay state management
 */

import { Trace, Step, AgentState, createInitialState } from './types';
import { TraceRecorder } from './trace-recorder';

export type ReplayControllerState = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';

export interface ReplayControllerStatus {
    state: ReplayControllerState;
    currentStepIndex: number;
    totalSteps: number;
    canPlayForward: boolean;
    canPlayBackward: boolean;
    canJump: (stepNumber: number) => boolean;
    progress: number; // 0-100
}

export interface ReplaySnapshot {
    stepNumber: number;
    stepType: string;
    timestamp: string;
    input: unknown;
    output: unknown;
    agentState: AgentState;
    duration?: number;
}

export class StatefulReplayController {
    private trace: Trace;
    private currentStepIndex: number = 0;
    private replayState: ReplayControllerState = 'idle';
    private agentState: AgentState;
    private autoPlayInterval?: NodeJS.Timeout;
    private autoPlaySpeed: number = 1000; // milliseconds between steps
    private stepHistory: number[] = []; // Track navigation history for debugging

    constructor(trace: Trace) {
        this.trace = trace;
        // Initialize agent state from first step or create empty
        if (trace.steps.length > 0) {
            this.agentState = { ...trace.steps[0].stateSnapshot };
        } else {
            this.agentState = createInitialState(trace.taskId, '');
        }
    }

    /**
     * Load a replay controller from a trace file
     */
    static fromFile(tracePath: string): StatefulReplayController {
        const trace = TraceRecorder.load(tracePath);
        return new StatefulReplayController(trace);
    }

    /**
     * Get current status
     */
    getStatus(): ReplayControllerStatus {
        const totalSteps = this.trace.steps.length;
        const progress = totalSteps > 0 ? Math.round((this.currentStepIndex / totalSteps) * 100) : 0;

        return {
            state: this.replayState,
            currentStepIndex: this.currentStepIndex,
            totalSteps,
            canPlayForward: this.currentStepIndex < totalSteps - 1,
            canPlayBackward: this.currentStepIndex > 0,
            canJump: (stepNumber) => stepNumber >= 0 && stepNumber < totalSteps,
            progress,
        };
    }

    /**
     * Get current step snapshot
     */
    getCurrentStep(): ReplaySnapshot | null {
        if (this.currentStepIndex < 0 || this.currentStepIndex >= this.trace.steps.length) {
            return null;
        }

        const step = this.trace.steps[this.currentStepIndex];
        return {
            stepNumber: step.stepNumber,
            stepType: step.stepType,
            timestamp: step.timestamp,
            input: step.input,
            output: step.output,
            agentState: { ...step.stateSnapshot },
            duration: step.duration,
        };
    }

    /**
     * Get agent state at current step
     */
    getAgentState(): AgentState {
        return { ...this.agentState };
    }

    /**
     * Reset controller to the beginning
     */
    reset(): void {
        this.stop();
        this.currentStepIndex = 0;
        this.stepHistory = [];

        // Reset agent state to initial
        if (this.trace.steps.length > 0) {
            this.agentState = { ...this.trace.steps[0].stateSnapshot };
        }
    }

    /**
     * Start playing through steps automatically
     */
    play(speed: number = 1000): void {
        if (this.replayState === 'completed') {
            this.reset();
        }

        if (this.replayState === 'playing') {
            return; // Already playing
        }

        this.replayState = 'playing';
        this.autoPlaySpeed = speed;

        this.autoPlayInterval = setInterval(() => {
            if (this.canPlayForward()) {
                this.stepForward();
            } else {
                this.stop();
                this.replayState = 'completed';
            }
        }, this.autoPlaySpeed);
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = undefined;
        }
        this.replayState = 'paused';
    }

    /**
     * Stop playback and reset
     */
    stop(): void {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = undefined;
        }
        this.replayState = 'stopped';
    }

    /**
     * Move to next step
     */
    stepForward(): boolean {
        if (!this.canPlayForward()) {
            return false;
        }

        this.currentStepIndex++;
        this.updateAgentState();
        this.stepHistory.push(this.currentStepIndex);
        return true;
    }

    /**
     * Move to previous step
     */
    stepBackward(): boolean {
        if (!this.canPlayBackward()) {
            return false;
        }

        this.currentStepIndex--;
        this.updateAgentState();
        this.stepHistory.push(this.currentStepIndex);
        return true;
    }

    /**
     * Jump to a specific step
     */
    jumpToStep(stepNumber: number): boolean {
        const totalSteps = this.trace.steps.length;

        if (stepNumber < 0 || stepNumber >= totalSteps) {
            return false;
        }

        this.currentStepIndex = stepNumber;
        this.updateAgentState();
        this.stepHistory.push(this.currentStepIndex);
        return true;
    }

    /**
     * Jump to beginning
     */
    jumpToStart(): void {
        this.currentStepIndex = 0;
        this.updateAgentState();
    }

    /**
     * Jump to end
     */
    jumpToEnd(): void {
        this.currentStepIndex = Math.max(0, this.trace.steps.length - 1);
        this.updateAgentState();
    }

    /**
     * Get all steps of a specific type
     */
    getStepsByType(stepType: string): ReplaySnapshot[] {
        return this.trace.steps
            .filter(step => step.stepType === stepType)
            .map((step, idx) => ({
                stepNumber: step.stepNumber,
                stepType: step.stepType,
                timestamp: step.timestamp,
                input: step.input,
                output: step.output,
                agentState: { ...step.stateSnapshot },
                duration: step.duration,
            }));
    }

    /**
     * Search for steps matching a query
     */
    searchSteps(query: string): ReplaySnapshot[] {
        const lowerQuery = query.toLowerCase();
        return this.trace.steps
            .filter(step => {
                const input = JSON.stringify(step.input).toLowerCase();
                const output = JSON.stringify(step.output).toLowerCase();
                return input.includes(lowerQuery) || output.includes(lowerQuery);
            })
            .map(step => ({
                stepNumber: step.stepNumber,
                stepType: step.stepType,
                timestamp: step.timestamp,
                input: step.input,
                output: step.output,
                agentState: { ...step.stateSnapshot },
                duration: step.duration,
            }));
    }

    /**
     * Get navigation history
     */
    getNavigationHistory(): number[] {
        return [...this.stepHistory];
    }

    /**
     * Get range of steps
     */
    getStepRange(startStep: number, endStep: number): ReplaySnapshot[] {
        return this.trace.steps
            .slice(startStep, endStep + 1)
            .map(step => ({
                stepNumber: step.stepNumber,
                stepType: step.stepType,
                timestamp: step.timestamp,
                input: step.input,
                output: step.output,
                agentState: { ...step.stateSnapshot },
                duration: step.duration,
            }));
    }

    /**
     * Get comparison between two steps
     */
    compareSteps(stepNumber1: number, stepNumber2: number): {
        step1: ReplaySnapshot | null;
        step2: ReplaySnapshot | null;
        stateDifferences: string[];
    } {
        const step1 = this.trace.steps[stepNumber1];
        const step2 = this.trace.steps[stepNumber2];

        const snapshot1 = step1
            ? {
                stepNumber: step1.stepNumber,
                stepType: step1.stepType,
                timestamp: step1.timestamp,
                input: step1.input,
                output: step1.output,
                agentState: { ...step1.stateSnapshot },
                duration: step1.duration,
            }
            : null;

        const snapshot2 = step2
            ? {
                stepNumber: step2.stepNumber,
                stepType: step2.stepType,
                timestamp: step2.timestamp,
                input: step2.input,
                output: step2.output,
                agentState: { ...step2.stateSnapshot },
                duration: step2.duration,
            }
            : null;

        const differences: string[] = [];

        if (step1 && step2) {
            const state1 = step1.stateSnapshot;
            const state2 = step2.stateSnapshot;

            if (state1.status !== state2.status) {
                differences.push(`status: ${state1.status} → ${state2.status}`);
            }
            if (state1.currentStep !== state2.currentStep) {
                differences.push(`currentStep: ${state1.currentStep} → ${state2.currentStep}`);
            }
            if (Object.keys(state1.memory).length !== Object.keys(state2.memory).length) {
                differences.push(
                    `memory size: ${Object.keys(state1.memory).length} → ${Object.keys(state2.memory).length}`
                );
            }
            if (state1.context.length !== state2.context.length) {
                differences.push(`context items: ${state1.context.length} → ${state2.context.length}`);
            }
        }

        return { step1: snapshot1, step2: snapshot2, stateDifferences: differences };
    }

    /**
     * Check if can play forward
     */
    private canPlayForward(): boolean {
        return this.currentStepIndex < this.trace.steps.length - 1;
    }

    /**
     * Check if can play backward
     */
    private canPlayBackward(): boolean {
        return this.currentStepIndex > 0;
    }

    /**
     * Update agent state from current step
     */
    private updateAgentState(): void {
        if (this.currentStepIndex < this.trace.steps.length) {
            this.agentState = { ...this.trace.steps[this.currentStepIndex].stateSnapshot };
        }
    }

    /**
     * Get full trace
     */
    getTrace(): Trace {
        return this.trace;
    }

    /**
     * Get trace overview
     */
    getTraceOverview() {
        const startTime = new Date(this.trace.startTime).getTime();
        const endTime = this.trace.endTime ? new Date(this.trace.endTime).getTime() : Date.now();
        const duration = endTime - startTime;

        return {
            traceId: this.trace.traceId,
            agentId: this.trace.agentId,
            taskId: this.trace.taskId,
            status: this.trace.status,
            duration,
            totalSteps: this.trace.steps.length,
            llmCalls: this.trace.metadata.totalLLMCalls,
            toolCalls: this.trace.metadata.totalToolCalls,
            toolsUsed: this.trace.metadata.toolsUsed,
        };
    }
}
