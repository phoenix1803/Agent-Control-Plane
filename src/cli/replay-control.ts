/**
 * CLI Command to interactively control replay with time-travel
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { StatefulReplayController, ReplaySnapshot } from '../core/replay-controller';

async function interactiveReplayController(tracePath: string): Promise<void> {
    // Load trace
    if (!fs.existsSync(tracePath)) {
        console.error(chalk.red(`Error: Trace file not found: ${tracePath}`));
        process.exit(1);
    }

    const controller = StatefulReplayController.fromFile(tracePath);
    const overview = controller.getTraceOverview();

    console.log(chalk.cyan.bold('\n' + '─'.repeat(60)));
    console.log(chalk.cyan.bold(' INTERACTIVE REPLAY CONTROLLER'));
    console.log(chalk.cyan.bold('─'.repeat(60)));
    console.log();
    console.log(chalk.gray(`Trace: ${path.basename(tracePath)}`));
    console.log(chalk.gray(`Agent: ${overview.agentId}`));
    console.log(chalk.gray(`Steps: ${overview.totalSteps} | LLM Calls: ${overview.llmCalls} | Tool Calls: ${overview.toolCalls}`));
    console.log();

    let running = true;

    while (running) {
        const status = controller.getStatus();
        const currentStep = controller.getCurrentStep();

        // Display current position
        console.log();
        console.log(chalk.cyan(`Current Position: Step ${status.currentStepIndex + 1}/${status.totalSteps} (${status.progress}%)`));
        if (currentStep) {
            console.log(chalk.yellow(`Type: ${currentStep.stepType}`));
            console.log(chalk.yellow(`Input: ${JSON.stringify(currentStep.input).substring(0, 80)}`));
        }
        console.log();

        // Menu
        const choices = [
            { name: '⏮️  Jump to Start', value: 'start' },
            { name: '◀️  Step Backward', value: 'prev', disabled: !status.canPlayBackward },
            { name: '▶️  Step Forward', value: 'next', disabled: !status.canPlayForward },
            { name: '⏭️  Jump to End', value: 'end' },
            { name: '🎯 Jump to Step...', value: 'jump' },
            { name: '🔍 Search Steps...', value: 'search' },
            { name: '⚖️  Compare Two Steps...', value: 'compare' },
            { name: '▶️  Auto-Play...', value: 'play' },
            { name: '📊 Show Overview', value: 'overview' },
            { name: '❌ Exit', value: 'exit' },
        ];

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices,
            },
        ]);

        switch (action) {
            case 'start':
                controller.jumpToStart();
                console.log(chalk.green('✓ Jumped to start'));
                break;

            case 'prev':
                if (controller.stepBackward()) {
                    console.log(chalk.green('✓ Moved backward'));
                }
                break;

            case 'next':
                if (controller.stepForward()) {
                    console.log(chalk.green('✓ Moved forward'));
                }
                break;

            case 'end':
                controller.jumpToEnd();
                console.log(chalk.green('✓ Jumped to end'));
                break;

            case 'jump':
                const { targetStep } = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'targetStep',
                        message: `Enter step number (0-${overview.totalSteps - 1}):`,
                        default: status.currentStepIndex,
                    },
                ]);
                if (controller.jumpToStep(targetStep)) {
                    console.log(chalk.green(`✓ Jumped to step ${targetStep}`));
                } else {
                    console.log(chalk.red(`✗ Invalid step number`));
                }
                break;

            case 'search':
                const { query } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'query',
                        message: 'Search for text in steps:',
                    },
                ]);
                const results = controller.searchSteps(query);
                console.log(chalk.green(`Found ${results.length} matching steps:`));
                results.slice(0, 5).forEach((step: ReplaySnapshot) => {
                    console.log(`  Step ${step.stepNumber}: ${step.stepType}`);
                });
                if (results.length > 5) {
                    console.log(`  ... and ${results.length - 5} more`);
                }
                break;

            case 'compare':
                const { step1, step2 } = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'step1',
                        message: 'First step number:',
                        default: 0,
                    },
                    {
                        type: 'number',
                        name: 'step2',
                        message: 'Second step number:',
                        default: Math.min(5, overview.totalSteps - 1),
                    },
                ]);

                const comparison = controller.compareSteps(step1, step2);
                console.log(chalk.green(`Comparing steps ${step1} and ${step2}:`));
                if (comparison.stateDifferences.length > 0) {
                    comparison.stateDifferences.forEach(diff => {
                        console.log(`  • ${diff}`);
                    });
                } else {
                    console.log('  • No differences');
                }
                break;

            case 'play':
                const { speed } = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'speed',
                        message: 'Milliseconds per step (default 1000):',
                        default: 1000,
                    },
                ]);
                controller.jumpToStart();
                console.log(chalk.cyan('Playing...'));
                controller.play(speed);

                // Wait for completion
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        const playStatus = controller.getStatus();
                        if (playStatus.state === 'completed') {
                            clearInterval(checkInterval);
                            resolve(null);
                        }
                    }, 100);
                });
                console.log(chalk.green('✓ Playback complete'));
                break;

            case 'overview':
                console.log();
                console.log(chalk.cyan.bold('TRACE OVERVIEW'));
                console.log(chalk.gray(`  Trace ID: ${overview.traceId}`));
                console.log(chalk.gray(`  Agent ID: ${overview.agentId}`));
                console.log(chalk.gray(`  Task ID: ${overview.taskId}`));
                console.log(chalk.gray(`  Status: ${overview.status}`));
                console.log(chalk.gray(`  Total Steps: ${overview.totalSteps}`));
                console.log(chalk.gray(`  LLM Calls: ${overview.llmCalls}`));
                console.log(chalk.gray(`  Tool Calls: ${overview.toolCalls}`));
                console.log(chalk.gray(`  Tools: ${overview.toolsUsed.join(', ')}`));
                console.log();
                break;

            case 'exit':
                running = false;
                console.log(chalk.cyan.bold('\nGoodbye!'));
                break;
        }
    }
}

const tracePath = process.argv[2];
if (!tracePath) {
    console.error(chalk.red('Error: Please provide a trace file path'));
    console.error(chalk.gray('Usage: ts-node src/cli/replay-control.ts <trace-file>'));
    process.exit(1);
}

interactiveReplayController(tracePath).catch(err => {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
});
