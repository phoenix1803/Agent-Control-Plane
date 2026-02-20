/**
 * Agent Control Plane - CLI Analyzer
 *
 * Analyzes traces for inefficiencies and issues.
 */

import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import {
  AgentAnalyzer,
  AnalyzeTrace,
  RootCause,
  SmartRecommendation,
} from "../core/analyzer";
import { AnalysisReport, AnalysisWarning } from "../core/analyzer";
import { TraceRecorder } from "../core/trace-recorder";

const DIVIDER = "─".repeat(60);

/**
 * Get color for severity
 */
function getSeverityColor(severity: AnalysisWarning["severity"]): chalk.Chalk {
  switch (severity) {
    case "critical":
      return chalk.red;
    case "warning":
      return chalk.yellow;
    case "info":
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: AnalysisWarning["severity"]): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "info":
      return "🔵";
    default:
      return "⚪";
  }
}

function getPriorityIcon(priority: SmartRecommendation["priority"]): string {
  switch (priority) {
    case "high":
      return "🔴";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "⚪";
  }
}

function getPriorityColur(
  priority: SmartRecommendation["priority"],
): chalk.Chalk {
  switch (priority) {
    case "high":
      return chalk.red;
    case "medium":
      return chalk.yellow;
    case "low":
      return chalk.blue;
    default:
      return chalk.white;
  }
}

function getServerityIcon(priority: RootCause["serverity"]): string {
  switch (priority) {
    case "high":
      return "🔴";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "⚪";
  }
}

function getServerityColur(priority: RootCause["serverity"]): chalk.Chalk {
  switch (priority) {
    case "high":
      return chalk.red;
    case "medium":
      return chalk.yellow;
    case "low":
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Display analysis report
 */
function displayReport(report: AnalysisReport): void {
  console.log(chalk.cyan.bold(`\n${DIVIDER}`));
  console.log(chalk.cyan.bold(` TRACE ANALYSIS REPORT`));
  console.log(chalk.cyan.bold(DIVIDER));

  // Summary
  console.log(chalk.yellow("\n▸ Summary"));
  console.log(`  Total Steps:    ${report.summary.totalSteps}`);
  console.log(`  Duration:       ${report.summary.totalDuration}ms`);
  console.log(`  LLM Calls:      ${report.summary.llmCalls}`);
  console.log(`  Tool Calls:     ${report.summary.toolCalls}`);
  console.log(`  Peak Memory:    ${report.summary.memoryPeakSize} keys`);

  // ------------------------
  // Recommendations
  // ------------------------
  if (report.recommendations?.length) {
    console.log(chalk.green("\n▸ Recommendations"));

    for (const recommendation of report.recommendations) {
      const icon = getPriorityIcon(recommendation.priority);
      const color = getPriorityColur(recommendation.priority);

      console.log();
      console.log(
        `  ${icon} ${color(recommendation.priority)}: ${recommendation.title} ${recommendation.description}`,
      );
    }
  }

  // ------------------------
  // Warnings
  // ------------------------
  if (report.warnings?.length) {
    console.log(chalk.yellow("\n▸ Warnings & Issues"));

    for (const warning of report.warnings) {
      const color = getSeverityColor(warning.severity);
      const icon = getSeverityIcon(warning.severity);

      console.log();
      console.log(
        `  ${icon} ${color(warning.severity)}: ${warning.message}`,
      );

      for (const [key, value] of Object.entries(warning.details ?? {})) {
        console.log(chalk.gray(`     ${key}: ${JSON.stringify(value)}`));
      }

      if (warning.stepNumbers?.length) {
        console.log(
          chalk.gray(`     Steps: ${warning.stepNumbers.join(", ")}`),
        );
      }
    }
  }

  // ------------------------
  // Root Causes
  // ------------------------
  if (report.rootCauses?.length) {
    console.log(chalk.magenta("\n▸ Root Causes"));

    for (const root of report.rootCauses) {
      const color = getServerityColur(root.serverity);
      const icon = getServerityIcon(root.serverity);

      console.log(`  • ${root}`);
      console.log(
        `  ${icon} ${color(root.serverity)}: ${root.issue} \n ${root.casue}`,
      );
    }
  }

  // ------------------------
  // Thresholds
  // ------------------------
  if (report.thresholds?.used) {
    console.log(chalk.blue("\n▸ Thresholds Used"));

    const { used, explanation } = report.thresholds;

    console.log(`  Source:           ${used.source}`);
    console.log(`  Confidence:       ${used.confidence}`);
    console.log(`  Based On Traces:  ${used.basedOnTraceCount}`);


    const thresholdObjects = [
      "memoryGrowth",
      "repeatedCalls",
      "errorRate",
      "steps",
      "duration",
    ] as const;

    for (const key of thresholdObjects) {
      if (used[key]) {
        console.log(chalk.gray(`\n  ${key}:`));
        for (const [k, v] of Object.entries(used[key])) {
          console.log(chalk.gray(`     ${k}: ${JSON.stringify(v)}`));
        }
      }
    }

    if (explanation) {
      console.log(chalk.gray(`\n  Explanation: ${explanation}`));
    }
  }

  if (
    !report.recommendations?.length &&
    !report.warnings?.length &&
    !report.rootCauses?.length
  ) {
    console.log(chalk.green("\n▸ No Additional Data Found!"));
  }

  // Recommendations
  // if (report.recommendations.length > 0) {
  //     console.log(chalk.yellow('\n▸ Recommendations'));
  //     for (const rec of report.recommendations) {
  //         console.log(`  • ${rec}`);
  //     }
  // }

  console.log(chalk.cyan.bold(`\n${DIVIDER}\n`));
}

/**
 * Analyze a trace file
 */
async function analyzeTrace(tracePath: string): Promise<void> {
  if (!fs.existsSync(tracePath)) {
    console.log(chalk.red(`Trace file not found: ${tracePath}`));
    return;
  }

  console.log(chalk.gray(`Analyzing: ${tracePath}`));

  const report = await AnalyzeTrace(tracePath);
  if (report) {
    displayReport(report);
    console.log(report);
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.cyan.bold("\nAgent Control Plane - Trace Analyzer"));
    console.log(chalk.gray("\nUsage:"));
    console.log(chalk.gray("  npm run analyze <trace-file>"));
    console.log();

    // Show available traces
    const traces = TraceRecorder.listTraces("./traces");
    if (traces.length > 0) {
      console.log(chalk.cyan("Available traces:"));
      for (const trace of traces.slice(0, 5)) {
        console.log(chalk.gray(`  ${path.basename(trace)}`));
      }
      if (traces.length > 5) {
        console.log(chalk.gray(`  ... and ${traces.length - 5} more`));
      }
    }
    return;
  }

  let tracePath = args[0];

  // Handle relative paths
  if (!fs.existsSync(tracePath)) {
    tracePath = path.join("./traces", tracePath);
    if (!tracePath.endsWith(".json")) {
      tracePath += ".json";
    }
  }

  await analyzeTrace(tracePath);
}

main().catch(console.error);
