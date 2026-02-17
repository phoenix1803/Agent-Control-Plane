



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
    QuickAnalysisReport,
    QucikAnalysisWarning,
    // AnalysisReport,
} from './types';
import { TraceRecorder } from './trace-recorder';

import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { PromptTemplate } from "@langchain/core/prompts"
import * as math from 'mathjs';

import { StringOutputParser } from "@langchain/core/output_parsers";



export interface Analyzerthresholds {
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
    llmCalls: number;
    toolCalls: number;
    agentType?: string;
    memoryPeakSize:string;
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
// const DEFAULT_thresholds: Analyzerthresholds = {
//     maxStepsWarning: 10,
//     maxStepsCritical: 20,
//     memoryGrowthThreshold: 5,
//     repeatedToolThreshold: 3,
//     longDurationThreshold: 5000,
// };




export class AgentAnalyzer {
    public llm: ChatGoogleGenerativeAI;
    public vectorStore: QdrantVectorStore;
    public trace:Trace;
    public thresholds:DynamicThresholds | null=null


    public constructor(trace:Trace, vectorStore:QdrantVectorStore, llm:ChatGoogleGenerativeAI){
        this.trace = trace;
        this.vectorStore = vectorStore;
        this.llm = llm

    }

    // Only for setup of all three trance vectorStore and llm
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

    // whole excecution is based on this public method
    public async mainAnalyzer(options?:{skipDeepAnalysis?:boolean}) : Promise<AnalysisReport>{

        this.thresholds = await this.calculateDynamicThresholds();
        
        const quickAnalyzer = new QuickTraceAnalyzer(this.trace,this.thresholds)


        const warning = quickAnalyzer.Quickanalyze()

        let deepAnalysisResult;
        if (!options?.skipDeepAnalysis){
            deepAnalysisResult = await this.runDeepAnalysis(warning.warnings)
        }

        return this.generateFinalReport(warning, deepAnalysisResult)
    }


public async runDeepAnalysis(currentWarnings: AnalysisWarning[]): Promise<any> {
    console.log("Starting Deep Analysis...");

    // 1. RETRIEVE: Get similar traces from Qdrant
    // We search for traces that are semantically similar to the current one
    const similarDocs = await this.vectorStore.similaritySearch(
        this.getTraceSummary(this.trace),
        3 
    );
    
    // 2. FORMAT: Prepare the context for the LLM
    // We convert the retrieved documents into a string the LLM can read
    const similarTracesContext = similarDocs.map((doc, i) => {
        const meta = doc.metadata;
        return `
        --- SIMILAR TRACE #${i + 1} ---
        ID: ${meta.traceId}
        Status: ${meta.status}
        Steps: ${meta.stepCount}
        Tools: ${meta.toolsUsed}
        Outcome: ${meta.outcomeSummary || 'Not available'}
        `;
    }).join("\n");

    // 3. PROMPT: Construct the "Mega-Prompt"
    const prompt = PromptTemplate.fromTemplate(`
      You are an Expert AI Agent Debugger. You are analyzing a specific execution trace.
      
      ### 1. THE CURRENT TRACE (What happened now)
      - Agent ID: {agentId}
      - Goal: {goal}
      - Status: {status}
      - Total Steps: {stepCount}
      - Tools Used: {toolsUsed}
      - Execution Duration: {duration}ms
      
      ### 2. THE RED FLAGS (Rule-based warnings)
      These issues were already detected by our quick-scan algorithms:
      {warnings}
      
      ### 3. THE KNOWLEDGE BASE (Similar Past Traces)
      Here is how similar agents have performed in the past:
      {similar_traces_context}
      
      ### YOUR TASK
      Analyze the "Current Trace" using the "Red Flags" and "Knowledge Base" as context.
      1. Explain WHY the warnings occurred (Root Cause).
      2. Compare this execution to the similar traces (e.g., "This took 10 steps, but similar successful traces only took 5").
      3. Provide actionable fixes.
      
      ### OUTPUT FORMAT (Strict JSON)
      Return ONLY valid JSON with this structure:
      {{
        "insights": ["insight 1", "insight 2"],
        "rootCauses": [
          {{ "issue": "Brief Name", "cause": "Detailed explanation", "severity": "high/medium/low" }}
        ],
        "recommendations": [
          {{ "title": "Fix Name", "description": "How to fix it", "priority": "high/medium/low" }}
        ],
        "similarTracesComparison": "A brief paragraph comparing this trace to the historical ones."
      }}
    `);

    // 4. EXECUTE: Call Gemini
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());

    try {
        const result = await chain.invoke({
            agentId: this.trace.agentId,
            goal: this.trace?.finalState?.goal || "Unknown",
            status: this.trace.status,
            stepCount: this.trace.steps.length.toString(),
            toolsUsed: this.trace.metadata.toolsUsed.join(", "),
            duration: this.getDuration().toString(),
            warnings: JSON.stringify(currentWarnings, null, 2),
            similar_traces_context: similarTracesContext || "No similar traces found."
        });

        // 5. PARSE: Clean and parse the JSON response
        const cleanJson = result.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error("Deep Analysis Failed:", error);
        // Return a safe empty object so the app doesn't crash
        return {
            insights: ["Deep analysis failed due to LLM error."],
            rootCauses: [],
            recommendations: [],
            similarTracesComparison: "Could not compare."
        };
    }
  }


    public getTraceSummary(trace: Trace): string {
    return `Agent ${trace.agentId} attempt to ${trace?.finalState?.goal}. Used tools: ${trace.metadata.toolsUsed.join(', ')}. Outcome: ${trace.status}`;
  }
    
    public async getThresholdsFromHistory():Promise<DynamicThresholds | null>{

        try {
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
            source: 'learned_from_history',
            confidence: 0.9,
            basedOnTraceCount: results.length,
            memoryGrowth: { warning: 10, critical: 20 },
            repeatedCalls: { warning: 3, critical: 6 },
            errorRate: { warning: 0.1, critical: 0.2 },

        }

    }catch(err){
        console.error("LangChain Vector Search Error:", err);
        return null;

    }


} 
    private getDuration(): number {
    if (this.trace.startTime && this.trace.endTime) {
    return new Date(this.trace.endTime).getTime() - new Date(this.trace.startTime).getTime();
    }
    return 0;
    }

/**
   * Strategy B: Ask Gemini to classify the agent based on its behavior
   */
  private async getThresholdsFromClassification(): Promise<DynamicThresholds | null> {
    
    // 1. Prepare the Classification Prompt
    const classificationPrompt = `
      You are an expert at analyzing AI Agent behavior.
      
      ANALYZE THIS AGENT TRACE:
      - Goal: ${this.trace?.finalState?.goal || 'Unknown'}
      - Tools Used: ${this.trace.metadata.toolsUsed.join(', ')}
      - First 5 Steps: ${this.trace.steps.slice(0, 5).map(s => s.stepType).join(' -> ')}
      - Total Duration: ${this.getDuration()}ms
      
      CLASSIFY INTO ONE CATEGORY:
      1. SimpleQA (Quick, 1-3 steps, <2s)
      2. ToolOrchestrator (Medium, 5-15 steps, 5-10s)
      3. ResearchAgent (Long, 20-100 steps, 30s+)
      4. CodeGenerator (Medium, 10-50 steps, 10-60s)
      5. CreativeWriter (Short-Medium, 5-20 steps, 10s+)
      
      Return JSON only: { "type": "CategoryName", "confidence": 0.0-1.0 }
    `;

    try {
      // 2. Call the LLM (using the instance we created in static create())
      const response = await this.llm.invoke(classificationPrompt);
      
      // 3. Parse the JSON response
      // Cleaning up markdown code blocks if Gemini adds them
      const cleanText = response.content.toString().replace(/```json|```/g, '').trim();
      const classification = JSON.parse(cleanText);

      // 4. Validate Confidence
      if (classification.confidence < 0.6) {
        console.log(`Classification confidence too low (${classification.confidence}). Skipping.`);
        return null; 
      }

      // 5. Map the classification to concrete thresholds
      return this.getCategorythresholds(classification.type, classification.confidence);

    } catch (error) {
      console.error("Agent Classification Failed:", error);
      return null; // Fallback to next strategy
    }
  }

  /**
   * temp: Helper: Maps a string category to number thresholds
   * need a custom ml model to do that
   */
    private getCategorythresholds(type: string, conf: number): DynamicThresholds {
        const basethresholds: DynamicThresholds = {
        source: 'agent_classification',
        confidence: conf,
        basedOnTraceCount: 0,
        memoryGrowth: { warning: 5, critical: 10 },
        repeatedCalls: { warning: 3, critical: 6 },
        errorRate: { warning: 0.1, critical: 0.3 },
        steps: { warning: 10, critical: 20 },
        duration: { warning: 5000, critical: 10000 },
        };

        // Override based on specific type
        switch (type.toLowerCase()) {
        case 'researchagent':
            basethresholds.steps = { warning: 50, critical: 100 };
            basethresholds.duration = { warning: 60000, critical: 120000 };
            basethresholds.memoryGrowth = { warning: 20, critical: 50 };
            break;
            
        case 'simpleqa':
            basethresholds.steps = { warning: 3, critical: 6 };
            basethresholds.duration = { warning: 2000, critical: 5000 };
            break;

        case 'codegenerator':
            basethresholds.steps = { warning: 20, critical: 40 };
            basethresholds.duration = { warning: 15000, critical: 45000 };
            break;
        }
        
        return basethresholds;
    }

    private getConservativeDefaults(): DynamicThresholds {
    return {
      // Steps: Allow up to 50 steps before warning (most agents are <15)
      steps: { 
          warning: 50, 
          critical: 100 
      },

      // Duration: Allow 60s before warning (very generous for simple agents)
      duration: { 
          warning: 60000,   // 1 minute
          critical: 300000  // 5 minutes
      },

      // Memory: Allow significant context growth
      memoryGrowth: { 
          warning: 20, 
          critical: 50 
      },

      // Loops: Allow many repeated calls before flagging
      repeatedCalls: { 
          warning: 10, 
          critical: 20 
      },

      // Error Rate: Allow 30% failure rate
      errorRate: { 
          warning: 0.3, 
          critical: 0.6 
      },

      // Meta data
      source: 'conservative_default',
      confidence: 0.3, // Low confidence because it's a guess
      basedOnTraceCount: 0
    };
  }
    

    public async calculateDynamicThresholds(): Promise<DynamicThresholds> {
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

    public generateFinalReport(warning:QuickAnalysisReport,deepAnalysisResult:any): AnalysisReport {
        return {
            traceId: this.trace.traceId,
            timestamp: new Date().toISOString(),
            summary: {
                totalSteps: this.trace.steps.length,
                totalDuration: this.getDuration(),
                status: this.trace.status,
                llmCalls: this.trace.metadata.totalLLMCalls,
                toolCalls: this.trace.metadata.totalToolCalls,
                memoryPeakSize: '0',
            },
            thresholds: {
                used: this.thresholds!,
                explanation: `Thresholds determined from ${this.thresholds?.source}`,
            },
            warnings: warning.warnings as AnalysisWarning[],
            insights: deepAnalysisResult?.insights || [],
            rootCauses: deepAnalysisResult?.rootCauses || [],
            recommendations: deepAnalysisResult?.recommendations || [],
            similarTracesComparison: deepAnalysisResult?.similarTracesComparison,
        };
    }

}




export class QuickTraceAnalyzer {
    public trace: Trace;
    public thresholds: DynamicThresholds;

    constructor(trace: Trace, thresholds: DynamicThresholds) {
        this.trace = trace;
        this.thresholds = thresholds
    }

    /**
     * Run full analysis
     */
    Quickanalyze(): QuickAnalysisReport {
        const warnings: QucikAnalysisWarning[] = [];

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
    private QuickcheckStepCount(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];
        const stepCount = this.trace.steps.length;

        if (stepCount >= this.thresholds.steps.critical) {
            warnings.push({
                type: 'high_step_count',
                severity: 'critical',
                message: `Step count (${stepCount}) is critically high`,
                details: {
                    stepCount,
                    threshold: this.thresholds.steps.critical,
                },
            });
        } else if (stepCount >= this.thresholds.steps.warning) {
            warnings.push({
                type: 'high_step_count',
                severity: 'warning',
                message: `Step count (${stepCount}) is unusually high`,
                details: {
                    stepCount,
                    threshold: this.thresholds.steps.warning,
                },
            });
        }

        return warnings;
    }

    /**
     * Check for memory growth without usage
     */
    private QuickcheckMemoryGrowth(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];
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

        if (growthCount >= this.thresholds.memoryGrowth.warning) {
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
    private QuickcheckRepeatedToolCalls(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];
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
            if (steps.length >= this.thresholds.repeatedCalls.warning) {
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
    private QuickcheckUnusedMemory(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];

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
    private QuickcheckLongDurations(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];
        const slowSteps: number[] = [];

        for (const step of this.trace.steps) {
            if ((step.duration || 0) > this.thresholds.duration.warning) {
                slowSteps.push(step.stepNumber);
            }
        }

        if (slowSteps.length > 0) {
            warnings.push({
                type: 'long_duration',
                severity: 'info',
                message: `${slowSteps.length} step(s) took longer than ${this.thresholds.duration.warning}ms`,
                details: {
                    threshold: this.thresholds.duration.warning,
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
    private QuickcheckErrorRate(): QucikAnalysisWarning[] {
        const warnings: QucikAnalysisWarning[] = [];
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
    private QuickgenerateSummary(): QuickAnalysisReport['summary'] {
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
            status: this.trace.status,
            memoryPeakSize: peakMemorySize,
        };
    }

    /**
     * Generate recommendations based on warnings
     */
    private QuickgenerateRecommendations(warnings: QucikAnalysisWarning[]): string[] {
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
    static fromFile(tracePath: string, thresholds?: DynamicThresholds): QuickTraceAnalyzer {
        const trace = TraceRecorder.load(tracePath);
        const defaultThresholds = thresholds || {
            steps: { warning: 50, critical: 100 },
            duration: { warning: 60000, critical: 300000 },
            memoryGrowth: { warning: 20, critical: 50 },
            repeatedCalls: { warning: 10, critical: 20 },
            errorRate: { warning: 0.3, critical: 0.6 },
            source: 'conservative_default',
            confidence: 0.3,
            basedOnTraceCount: 0
        };
        return new QuickTraceAnalyzer(trace, defaultThresholds);
    }
}

/**
 * Quick analysis function
 */
export function analyzeTrace(tracePath: string): QuickAnalysisReport {
    const analyzer = QuickTraceAnalyzer.fromFile(tracePath);
    return analyzer.Quickanalyze();
}
