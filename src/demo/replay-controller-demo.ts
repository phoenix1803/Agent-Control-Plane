/**
 * Agent Control Plane - Replay Controller Demo
 * 
 * Demonstrates the time-travel capabilities of the replay controller
 */

import chalk from 'chalk';
import { StatefulReplayController } from '../core/replay-controller';

async function replayControllerDemo(tracePath: string): Promise<void> {
    console.log(chalk.cyan.bold('\n' + '─'.repeat(60)));
    console.log(chalk.cyan.bold(' STATEFUL REPLAY CONTROLLER DEMO'));
    console.log(chalk.cyan.bold('─'.repeat(60)));
    console.log();

    // Load the controller
    const controller = StatefulReplayController.fromFile(tracePath);

    // Get trace overview
    const overview = controller.getTraceOverview();
    console.log(chalk.yellow('📊 Trace Overview:'));
    console.log(`   Trace ID: ${overview.traceId}`);
    console.log(`   Total Steps: ${overview.totalSteps}`);
    console.log(`   LLM Calls: ${overview.llmCalls}`);
    console.log(`   Tool Calls: ${overview.toolCalls}`);
    console.log(`   Tools Used: ${overview.toolsUsed.join(', ')}`);
    console.log();

    // Show status
    let status = controller.getStatus();
    console.log(chalk.yellow('🎮 Initial Status:'));
    console.log(`   State: ${status.state}`);
    console.log(`   Current Step: ${status.currentStepIndex}/${status.totalSteps}`);
    console.log(`   Progress: ${status.progress}%`);
    console.log();

    // Demo 1: Step Forward
    console.log(chalk.green('▶️  Demo 1: Step Forward'));
    for (let i = 0; i < 3; i++) {
        controller.stepForward();
        const step = controller.getCurrentStep();
        if (step) {
            console.log(`   Step ${step.stepNumber} (${step.stepType}): ${JSON.stringify(step.input).substring(0, 50)}...`);
        }
    }
    console.log();

    // Demo 2: Step Backward
    console.log(chalk.green('⏮️  Demo 2: Step Backward'));
    controller.stepBackward();
    const prevStep = controller.getCurrentStep();
    if (prevStep) {
        console.log(`   Moved back to Step ${prevStep.stepNumber} (${prevStep.stepType})`);
    }
    console.log();

    // Demo 3: Jump to Middle
    console.log(chalk.green('⏭️  Demo 3: Jump to Middle'));
    const midPoint = Math.floor(overview.totalSteps / 2);
    controller.jumpToStep(midPoint);
    status = controller.getStatus();
    const midStep = controller.getCurrentStep();
    if (midStep) {
        console.log(`   Jumped to Step ${midStep.stepNumber} (${midStep.stepType})`);
        console.log(`   Progress: ${status.progress}%`);
    }
    console.log();

    // Demo 4: Get steps by type
    console.log(chalk.green('🔍 Demo 4: Filter by Step Type'));
    const toolSteps = controller.getStepsByType('tool');
    console.log(`   Tool Steps: ${toolSteps.length}`);
    if (toolSteps.length > 0) {
        console.log(`   First tool: ${JSON.stringify(toolSteps[0].input).substring(0, 60)}...`);
    }
    console.log();

    // Demo 5: Compare two steps
    console.log(chalk.green('⚖️  Demo 5: Compare Steps'));
    const comparison = controller.compareSteps(0, midPoint);
    console.log(`   Comparing Step 0 vs Step ${midPoint}:`);
    if (comparison.stateDifferences.length > 0) {
        comparison.stateDifferences.forEach(diff => {
            console.log(`     • ${diff}`);
        });
    } else {
        console.log('     • No differences detected');
    }
    console.log();

    // Demo 6: Auto-play
    console.log(chalk.green('▶️  Demo 6: Auto-Play Mode'));
    controller.jumpToStart();
    console.log(`   Starting auto-play from beginning...`);
    console.log(`   Speed: 500ms per step`);
    
    controller.play(500);
    
    // Wait for playback to complete or timeout
    await new Promise(resolve => {
        const interval = setInterval(() => {
            const currentStatus = controller.getStatus();
            if (currentStatus.state === 'completed') {
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
        
        // Timeout after 30 seconds
        setTimeout(() => {
            clearInterval(interval);
            controller.stop();
            resolve(null);
        }, 30000);
    });

    status = controller.getStatus();
    console.log(`   ✓ Auto-play completed`);
    console.log(`   Final Progress: ${status.progress}%`);
    console.log(`   Final State: ${status.state}`);
    console.log();

    // Demo 7: Navigation History
    console.log(chalk.green('📝 Demo 7: Navigation History'));
    const history = controller.getNavigationHistory();
    console.log(`   Steps visited: ${history.length}`);
    console.log(`   History: [${history.slice(0, 10).join(', ')}${history.length > 10 ? ', ...' : ''}]`);
    console.log();

    console.log(chalk.cyan.bold('─'.repeat(60)));
    console.log(chalk.cyan.bold(' ✅ REPLAY CONTROLLER DEMO COMPLETE'));
    console.log(chalk.cyan.bold('─'.repeat(60)));
    console.log();
}

// Run demo with first argument as trace path
const tracePath = process.argv[2];
if (!tracePath) {
    console.error(chalk.red('Error: Please provide a trace file path'));
    console.error(chalk.gray('Usage: ts-node src/demo/replay-controller-demo.ts <trace-file>'));
    process.exit(1);
}

replayControllerDemo(tracePath).catch(err => {
    console.error(chalk.red('Demo error:'), err.message);
    process.exit(1);
});
