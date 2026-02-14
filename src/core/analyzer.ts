



/**
 * Agent Control Plane - Memory & Step Analyzer
 * 
 * Provides basic analysis over traces to identify:
 * - High step counts
 * - Memory growth issues
 * - Repeated tool calls
 * - Inefficiencies
 */

import {
    Trace,
    Step,
    ToolStep,
    // AnalysisWarning,
    // AnalysisReport,
} from './types';
import { TraceRecorder } from './trace-recorder';

import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { PromptTemplate } from "@langchain/core/prompts"
import * as math from 'mathjs';




export interface AnalyzerConfig {
    maxStepsWarning: number;
    maxStepsCritical: number;
    memoryGrowthThreshold: number;
    repeatedToolThreshold: number;
    longDurationThreshold: number;
}



export interface AnalysisWarning {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: any;
  stepNumbers?: number[];
  llmAdjusted?: boolean; // True if Gemini modified this
}

export interface SmartRecommendation {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  codeExample?: string;
  learnedFromTraceId?: string;
}



export interface RootCause{
    issue:string;
    casue:string;
    evidence:string[];
    serverity:"low"|"medium"|"high"|"critical";

}


export interface DynamicThresholds {
    steps:{warning:number,critical:number}
    duration:{warning:number;critical:number}
    memoryGrowth:{warning:number;critical:number}
    repeatedCalls:{warning:number;critical:number}
    errorRate:{warning:number;critical:number}


    source:'learned_from_history' | 'agent_classification' | 'statistical_baseline' | 'conservative_default';
    confidence: number;
    basedOnTraceCount: number;
}


export interface AnalysisReport {
  traceId: string;
  timestamp: string;
  summary: {
    totalSteps: number;
    totalDuration: number;
    status: string;
    agentType?: string;
  };
  thresholds: {
    used: DynamicThresholds;
    explanation: string;
  };
  // Layer 1: Rule-based
  warnings: AnalysisWarning[];
  // Layer 2: LLM-based
  insights?: string[];
  rootCauses?: RootCause[];
  recommendations?: SmartRecommendation[];
  similarTracesComparison?: string;
}


// hardcoded analyzer but we need a dynamic analyzer for jget the effiecent analysis
// const DEFAULT_CONFIG: AnalyzerConfig = {
//     maxStepsWarning: 10,
//     maxStepsCritical: 20,
//     memoryGrowthThreshold: 5,
//     repeatedToolThreshold: 3,
//     longDurationThreshold: 5000,
// };




export class AgentAnalyzer {
    private llm: ChatGoogleGenerativeAI;
    private vectorStore: QdrantVectorStore;
    private trace:Trace;
    private thresholds:DynamicThresholds | null=null


    public constructor(trace:Trace, vectorStore:QdrantVectorStore, llm:ChatGoogleGenerativeAI){
        this.trace = trace;
        this.vectorStore = vectorStore;
        this.llm = llm

    }


    static async create(trace:Trace){
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash",
            temperature: 0.1,
            apiKey: process.env.GEMINI_API_KEY
        })

        const embedding = new GoogleGenerativeAIEmbeddings({model:"text-embedding-004",
            apiKey:process.env.GEMINI_API_KEY
        })

        const vectorStore  = await QdrantVectorStore.fromExistingCollection(embedding,{
            url:"http://localhost:6333",
            collectionName:"agent-trace"
        })

        return new AgentAnalyzer(trace, vectorStore, llm);
    }


    public async mainAnalyzer(options?:{skipDeepAnalysis?:boolean}) : Promise<AnalysisReport>{

        this.thresholds = await this.calcualteDynamicThreshold();
        
        const quickAnalyzer = new QuickTraceAnalyzer(this.trace,this.thresholds)


        const warning = quickAnalyzer.Quickanalyze()

        let deepAnalysisResult = null;
        if (!options?.skipDeepAnalysis){
            deepAnalysisResult = await this.RunDeepAnalysis(warning)
        }


        return this.generateFinalReport(warning, deepAnalysisResult)
    }


    public RunDeepAnalysis(warning:AnalysisReport){
        return {
        }
    }

    private getTraceSummary(trace: Trace): string {
    return `Agent ${trace.agentId} attempt to ${trace.goal}. Used tools: ${trace.metadata.toolsUsed.join(', ')}. Outcome: ${trace.status}`;
  }
    
    public getThresholdsFromHistory():Promise<DynamicThresholds>{
        try{
            const results = await this.vectorStore.similaritySearch(this.getTraceSummary(this.trace),50, // k
        {
            must: [
                { key: "metadata.agentId", match: { value: this.trace.agentId } },
                { key: "metadata.status", match: { value: "completed" } }
            ]
        });

        if (results.length < 10) return null;
        const steps = results.map(doc => doc.metadata.stepCount);
        const durations = results.map(doc => doc.metadata.duration);

        return {
        steps: {
          warning: math.quantileSeq(steps, 0.75) as number,
          critical: math.quantileSeq(steps, 0.95) as number
        },
        duration: {
          warning: math.quantileSeq(durations, 0.75) as number,
          critical: math.quantileSeq(durations, 0.95) as number
        },







    

    }

    public getThresholdsFromClassification(){

    }

    public getConservativeDefaults(){

    }
    

    private async calculateDynamicThresholds(): Promise<DynamicThresholds> {
        // Strategy A: RAG - Learn from similar successful traces
        const ragThresholds = await this.getThresholdsFromHistory();
        if (ragThresholds && ragThresholds.confidence > 0.7) {
        return ragThresholds;
        }

        // Strategy B: Classification - Ask Gemini what kind of agent this is
        const classThresholds = await this.getThresholdsFromClassification();
        if (classThresholds) {
        return classThresholds;
        }

        // Strategy C: Statistical - Look at this specific agent's raw history (if available)
        // (Skipped implementation for brevity, logic similar to A)

        // Strategy D: Fallback
        return this.getConservativeDefaults();
    }

    public generateFinalReport(warning:AnalysisReport,deepAnalysisResult:AnalysisReport){
        return {}
    }

}





export class QuickTraceAnalyzer {
    private trace: Trace;
    private config: DynamicThresholds;

    constructor(trace: Trace, {config: DynamicThresholds} = {}) {
        this.trace = trace;
        this.config = config;
    }





    /**
     * Run full analysis
     */
    Quickanalyze(): AnalysisReport {
        const warnings: AnalysisWarning[] = [];

        // Check step count
        warnings.push(...this.QuickcheckStepCount());

        // Check memory growth
        warnings.push(...this.QuickcheckMemoryGrowth());

        // Check repeated tool calls
        warnings.push(...this.QuickcheckRepeatedToolCalls());

        // Check for unused memory
        warnings.push(...this.QuickcheckUnusedMemory());

        // Check for long durations
        warnings.push(...this.QuickcheckLongDurations());

        // Check error rate
        warnings.push(...this.QuickcheckErrorRate());

        // Generate summary
        const summary = this.QuickgenerateSummary();

        // Generate recommendations
        const recommendations = this.QuickgenerateRecommendations(warnings);

        return {
            traceId: this.trace.traceId,
            summary,
            warnings,
            recommendations,
        };
    }

    /**
     * Check if step count is high
     */
    private QuickcheckStepCount(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];
        const stepCount = this.trace.steps.length;

        if (stepCount >= this.config.maxStepsCritical) {
            warnings.push({
                type: 'high_step_count',
                severity: 'critical',
                message: `Step count (${stepCount}) is critically high`,
                details: {
                    stepCount,
                    threshold: this.config.maxStepsCritical,
                },
            });
        } else if (stepCount >= this.config.maxStepsWarning) {
            warnings.push({
                type: 'high_step_count',
                severity: 'warning',
                message: `Step count (${stepCount}) is unusually high`,
                details: {
                    stepCount,
                    threshold: this.config.maxStepsWarning,
                },
            });
        }

        return warnings;
    }

    /**
     * Check for memory growth without usage
     */
    private QuickcheckMemoryGrowth(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];
        const memorySizes: { step: number; size: number }[] = [];

        for (const step of this.trace.steps) {
            const memorySize = Object.keys(step.stateSnapshot.memory).length;
            memorySizes.push({ step: step.stepNumber, size: memorySize });
        }

        // Check if memory is constantly growing
        let growthCount = 0;
        for (let i = 1; i < memorySizes.length; i++) {
            if (memorySizes[i].size > memorySizes[i - 1].size) {
                growthCount++;
            }
        }

        if (growthCount >= this.config.memoryGrowthThreshold) {
            warnings.push({
                type: 'memory_growth',
                severity: 'warning',
                message: 'Memory growing continuously without apparent use',
                details: {
                    initialSize: memorySizes[0]?.size || 0,
                    finalSize: memorySizes[memorySizes.length - 1]?.size || 0,
                    growthEvents: growthCount,
                },
            });
        }

        return warnings;
    }

    /**
     * Check for repeated tool calls (same tool, same parameters)
     */
    private QuickcheckRepeatedToolCalls(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];
        const toolCalls: Map<string, number[]> = new Map();

        for (const step of this.trace.steps) {
            if (step.stepType === 'tool') {
                const toolStep = step as ToolStep;
                const key = `${toolStep.input.toolName}:${JSON.stringify(toolStep.input.parameters)}`;

                if (!toolCalls.has(key)) {
                    toolCalls.set(key, []);
                }
                toolCalls.get(key)!.push(step.stepNumber);
            }
        }

        for (const [key, steps] of toolCalls) {
            if (steps.length >= this.config.repeatedToolThreshold) {
                const [toolName] = key.split(':');
                warnings.push({
                    type: 'repeated_tool_calls',
                    severity: 'warning',
                    message: `Tool '${toolName}' called ${steps.length} times with same parameters`,
                    details: {
                        toolName,
                        callCount: steps.length,
                    },
                    stepNumbers: steps,
                });
            }
        }

        return warnings;
    }

    /**
     * Check for memory that was written but never read
     */
    private QuickcheckUnusedMemory(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];

        // Get final memory keys
        const finalState = this.trace.finalState || this.trace.steps[this.trace.steps.length - 1]?.stateSnapshot;
        if (!finalState) return warnings;

        const memoryKeys = Object.keys(finalState.memory);

        // Check if any memory keys were added but never referenced in subsequent steps
        const unusedKeys: string[] = [];
        for (const key of memoryKeys) {
            let wasUsed = false;

            // Simple heuristic: check if the key appears in any LLM context
            for (const step of this.trace.steps) {
                if (step.stepType === 'llm') {
                    const inputStr = JSON.stringify(step.input);
                    if (inputStr.includes(key)) {
                        wasUsed = true;
                        break;
                    }
                }
            }

            if (!wasUsed) {
                unusedKeys.push(key);
            }
        }

        if (unusedKeys.length > 0) {
            warnings.push({
                type: 'unused_memory',
                severity: 'info',
                message: `${unusedKeys.length} memory key(s) may be unused`,
                details: {
                    unusedKeys,
                    totalKeys: memoryKeys.length,
                },
            });
        }

        return warnings;
    }

    /**
     * Check for steps with long duration
     */
    private QuickcheckLongDurations(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];
        const slowSteps: number[] = [];

        for (const step of this.trace.steps) {
            if ((step.duration || 0) > this.config.longDurationThreshold) {
                slowSteps.push(step.stepNumber);
            }
        }

        if (slowSteps.length > 0) {
            warnings.push({
                type: 'long_duration',
                severity: 'info',
                message: `${slowSteps.length} step(s) took longer than ${this.config.longDurationThreshold}ms`,
                details: {
                    threshold: this.config.longDurationThreshold,
                    slowStepCount: slowSteps.length,
                },
                stepNumbers: slowSteps,
            });
        }

        return warnings;
    }

    /**
     * Check error rate
     */
    private QuickcheckErrorRate(): AnalysisWarning[] {
        const warnings: AnalysisWarning[] = [];
        const errorSteps = this.trace.steps.filter(s => s.stepType === 'error');
        const errorRate = errorSteps.length / this.trace.steps.length;

        if (errorRate > 0.2) {
            warnings.push({
                type: 'error_rate',
                severity: 'critical',
                message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
                details: {
                    errorCount: errorSteps.length,
                    totalSteps: this.trace.steps.length,
                    errorRate,
                },
                stepNumbers: errorSteps.map(s => s.stepNumber),
            });
        } else if (errorRate > 0.1) {
            warnings.push({
                type: 'error_rate',
                severity: 'warning',
                message: `Moderate error rate: ${(errorRate * 100).toFixed(1)}%`,
                details: {
                    errorCount: errorSteps.length,
                    totalSteps: this.trace.steps.length,
                    errorRate,
                },
                stepNumbers: errorSteps.map(s => s.stepNumber),
            });
        }

        return warnings;
    }

    /**
     * Generate summary statistics
     */
    private QuickgenerateSummary(): AnalysisReport['summary'] {
        const startTime = new Date(this.trace.startTime).getTime();
        const endTime = this.trace.endTime ? new Date(this.trace.endTime).getTime() : Date.now();

        // Find peak memory size
        let peakMemorySize = 0;
        for (const step of this.trace.steps) {
            const size = Object.keys(step.stateSnapshot.memory).length;
            if (size > peakMemorySize) {
                peakMemorySize = size;
            }
        }

        return {
            totalSteps: this.trace.steps.length,
            totalDuration: endTime - startTime,
            llmCalls: this.trace.metadata.totalLLMCalls,
            toolCalls: this.trace.metadata.totalToolCalls,
            errors: this.trace.steps.filter(s => s.stepType === 'error').length,
            memoryPeakSize: peakMemorySize,
        };
    }

    /**
     * Generate recommendations based on warnings
     */
    private QuickgenerateRecommendations(warnings: AnalysisWarning[]): string[] {
        const recommendations: string[] = [];

        for (const warning of warnings) {
            switch (warning.type) {
                case 'high_step_count':
                    recommendations.push('Consider breaking down the task into smaller sub-tasks');
                    recommendations.push('Review if the agent is getting stuck in loops');
                    break;
                case 'memory_growth':
                    recommendations.push('Implement memory cleanup or summarization');
                    recommendations.push('Check if all stored information is necessary');
                    break;
                case 'repeated_tool_calls':
                    recommendations.push('Cache tool results to avoid redundant calls');
                    recommendations.push('Review agent logic for unnecessary repetition');
                    break;
                case 'unused_memory':
                    recommendations.push('Remove unused memory storage to reduce overhead');
                    break;
                case 'long_duration':
                    recommendations.push('Consider caching slow operations');
                    recommendations.push('Review LLM prompts for efficiency');
                    break;
                case 'error_rate':
                    recommendations.push('Implement better error handling and recovery');
                    recommendations.push('Review tool implementations for reliability');
                    break;
            }
        }

        

        // Deduplicate
        return [...new Set(recommendations)];
    }

    /**
     * Load analyzer from trace file
     */
    static fromFile(tracePath: string, config?: Partial<AnalyzerConfig>): QuickTraceAnalyzer {
        const trace = TraceRecorder.load(tracePath);
        return new QuickTraceAnalyzer(trace, config);
    }
}

/**
 * Quick analysis function
 */
export function analyzeTrace(tracePath: string): AnalysisReport {
    const analyzer = QuickTraceAnalyzer.fromFile(tracePath);
    return analyzer.Quickanalyze();
}


















