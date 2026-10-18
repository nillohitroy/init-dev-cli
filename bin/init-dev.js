#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const { spawn, exec } = require('child_process');

const { parseUserIntent } = require('../lib/ai');
const { fetchProfessionalJobData, fetchProfessionalResources, fetchSimpleResources } = require('../lib/search');
const { generateStructuredRoadmap } = require('../lib/generator');
const { evaluateResume } = require('../lib/ats');
const { generateInterviewQuestion, evaluateInterviewAnswer } = require('../lib/interview');

const viewerPath = path.join(__dirname, '../roadmap-viewer');

async function checkInternet() {
    try { await dns.lookup('google.com'); return true; } 
    catch (err) { return false; }
}

async function renderRoadmap(roadmap, chalk) {
    console.log(chalk.bold.magenta(`\n🏆 Roadmap: ${roadmap.role} (Progress: ${roadmap.total_progress}%)`));
    
    roadmap.phases.forEach((phase, pIdx) => {
        console.log(chalk.bold.white(`\n[Phase ${pIdx + 1}] ${phase.phase_name}`));
        
        phase.modules.forEach((mod, mIdx) => {
            const statusColor = mod.status === 'completed' ? chalk.green : mod.status === 'in-progress' ? chalk.yellow : chalk.gray;
            console.log(statusColor(`  ├─ Module: ${mod.module_name} (${mod.estimated_hours}h) [${mod.status}]`));
            
            if (mod.submodules) {
                mod.submodules.forEach(sub => {
                    let typeColor = chalk.white;
                    if (sub.type === 'video') typeColor = chalk.red;
                    if (sub.type === 'book') typeColor = chalk.blue;
                    if (sub.type === 'lab') typeColor = chalk.greenBright;
                    if (sub.type === 'article') typeColor = chalk.yellowBright;

                    const icon = sub.status === 'completed' ? '✅' : '⏳';
                    console.log(`  │    └─ ${icon} ${typeColor(`[${sub.type.toUpperCase()}]`)} ${sub.title} - ${chalk.dim(sub.link)}`);
                });
            }
        });
    });
}

async function startServerAndWait(viewerDir, chalk) {
    return new Promise((resolve) => {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        
        const webProcess = spawn(npmCmd, ['run', 'start'], { 
            cwd: viewerDir, 
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: process.platform !== 'win32' 
        });

        let isShuttingDown = false;
        let serverError = '';

        webProcess.stderr.on('data', (data) => { serverError += data.toString(); });
        webProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            if (msg.toLowerCase().includes('error')) serverError += msg;
        });

        const onData = (data) => {
            const key = data.toString();
            if (key === 'q' || key === 'Q' || key === '\u0003') { 
                if (isShuttingDown) return;
                isShuttingDown = true;
                
                process.stdin.removeListener('data', onData);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                
                try {
                    if (process.platform === 'win32') {
                        exec(`taskkill /pid ${webProcess.pid} /T /F`);
                    } else {
                        process.kill(-webProcess.pid, 'SIGINT');
                    }
                } catch (e) {
                    webProcess.kill('SIGINT');
                }
                
                console.log(chalk.gray(`\nServer shut down cleanly.\n`));
                resolve();
            }
        };

        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onData);

        webProcess.on('close', (code) => {
            if (!isShuttingDown) {
                process.stdin.removeListener('data', onData);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                
                if (code !== 0 && code !== null) {
                    console.log(chalk.red.bold(`\n❌ Server crashed instantly.`));
                    console.log(chalk.yellow(`Error details:\n${serverError || 'Did you forget to run "npm run build" first?'}\n`));
                } else {
                    console.log(chalk.gray(`\nServer closed.\n`));
                }
                resolve();
            }
        });
    });
}

async function main() {
    const chalk = (await import('chalk')).default;
    const ora = (await import('ora')).default;
    const inquirer = (await import('inquirer')).default;

    const sessionsDir = path.join(__dirname, '../sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

    console.log(chalk.blue.bold('\nWelcome to init.dev - Your Agentic Career Copilot'));
    
    let isRunning = true;

    while (isRunning) {
        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: '\nWhat would you like to do?',
                choices: [
                    '1. Generate a New Learning Roadmap', 
                    '2. Score Resume against ATS (TabPFN)', 
                    '3. View Chat & Roadmap History',
                    '4. Conduct Mock Interview (Local AI)',
                    '5. View Roadmap in Web Browser (Graph)',
                    '6. Open Web Chat Interface (Claude-style)',
                    '7. Exit'
                ]
            }
        ]);

        if (action.includes('7')) {
            console.log(chalk.yellow('\nExiting init.dev. Have a great day!\n'));
            isRunning = false;
            break;
        }

        if (action.includes('1')) {
            const { userInput } = await inquirer.prompt([{ type: 'input', name: 'userInput', message: 'Tell me your career goals and current skills:' }]);
            
            const { searchMethod } = await inquirer.prompt([{
                type: 'select',
                name: 'searchMethod',
                message: 'Choose your research engine:',
                choices: [
                    'Simple Search (Free APIs: GitHub, OpenLibrary, Dynamic Links)',
                    'Professional Search (Requires SerpAPI Key)'
                ]
            }]);

            const isOnline = await checkInternet();
            const spinner = ora('Agentic Engine Initializing...').start();
            
            spinner.text = 'Parsing intent locally (Gemma)...';
            const profile = await parseUserIntent(userInput);
            
            let marketData = "", resources = {};
            if (isOnline) {
                spinner.text = `Scraping dynamic resources using ${searchMethod.includes('Simple') ? 'Simple' : 'Professional'} Search...`;
                
                if (searchMethod.includes('Professional')) {
                    [marketData, resources] = await Promise.all([
                        fetchProfessionalJobData(profile.target_role),
                        fetchProfessionalResources(profile.target_role)
                    ]);
                } else {
                    resources = await fetchSimpleResources(profile.target_role);
                }
            }

            spinner.text = 'Structuring professional roadmap locally (Gemma)...';
            const roadmap = await generateStructuredRoadmap(profile.target_role, profile.current_skills, marketData, resources);
            
            const safeRoleName = profile.target_role.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${safeRoleName}_${timestamp}.json`;
            
            // Format session structure
            const sessionData = {
                roleName: profile.target_role,
                timestamp: new Date().toISOString(),
                roadmap: roadmap,
                chatHistory: [{ role: 'assistant', content: `Hello! I generated your ${profile.target_role} roadmap. How can I help you study?` }]
            };

            // Save to filesystem
            fs.writeFileSync(path.join(sessionsDir, filename), JSON.stringify(sessionData, null, 2));
            fs.writeFileSync('init-dev-roadmap.json', JSON.stringify(sessionData, null, 2));
            
            spinner.succeed('Roadmap Generated and Saved!\n');
            await renderRoadmap(roadmap, chalk);
        }

        if (action.includes('2')) {
            const { pdfPath, targetRole } = await inquirer.prompt([
                { type: 'input', name: 'pdfPath', message: 'Enter the absolute or relative path to your resume (.pdf):' },
                { type: 'input', name: 'targetRole', message: 'What role are you applying for?' }
            ]);

            const spinner = ora('Analyzing resume data...').start();
            try {
                const resolvedPath = path.resolve(process.cwd(), pdfPath);
                if (!fs.existsSync(resolvedPath)) throw new Error(`File not found at: ${resolvedPath}`);

                spinner.text = 'Attempting TabPFN, with Gemma fallback...';
                const { score, engine, feedback } = await evaluateResume(resolvedPath, targetRole);
                
                spinner.succeed(`ATS Analysis Complete (Powered by ${engine})`);
                console.log(chalk.cyan(`\nFeedback: ${feedback}`));
                
                const scoreColor = score > 75 ? chalk.green.bold : score > 50 ? chalk.yellow.bold : chalk.red.bold;
                console.log(`\n🎯 ATS Pass Probability: ${scoreColor(score.toFixed(2) + '%')}\n`);
            } catch (e) {
                spinner.fail(`Failed to process ATS check: ${e.message}`);
            }
        }

        if (action.includes('3')) {
            const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
            if (files.length === 0) {
                console.log(chalk.yellow('\nNo history found. Generate a roadmap first!'));
                continue; 
            }

            const { selectedFile } = await inquirer.prompt([{
                type: 'select',
                name: 'selectedFile',
                message: 'Select a past session:',
                choices: [...files, 'Cancel']
            }]);

            if (selectedFile === 'Cancel') continue;

            const { sessionAction } = await inquirer.prompt([{
                type: 'select',
                name: 'sessionAction',
                message: `What would you like to do with this session?`,
                choices: ['Load as active roadmap', 'Delete session', 'Cancel']
            }]);

            if (sessionAction === 'Delete session') {
                fs.unlinkSync(path.join(sessionsDir, selectedFile));
                console.log(chalk.red(`\nDeleted ${selectedFile} successfully.`));
            } else if (sessionAction === 'Load as active roadmap') {
                const historyData = JSON.parse(fs.readFileSync(path.join(sessionsDir, selectedFile)));
                
                fs.writeFileSync('init-dev-roadmap.json', JSON.stringify(historyData, null, 2));
                if (fs.existsSync(viewerPath)) {
                    fs.writeFileSync(path.join(viewerPath, 'public/current-roadmap.json'), JSON.stringify(historyData, null, 2));
                }

                console.log(chalk.green(`\nSession loaded as active roadmap!`));
                await renderRoadmap(historyData.roadmap || historyData, chalk);
            }
        }

        if (action.includes('4')) {
            // Check active session to default the role
            let activeRole = "Software Engineer";
            if (fs.existsSync('init-dev-roadmap.json')) {
                const activeSession = JSON.parse(fs.readFileSync('init-dev-roadmap.json'));
                activeRole = activeSession.roleName || activeSession.role || "Software Engineer";
            }

            const { confirmRole } = await inquirer.prompt([{
                type: 'input',
                name: 'confirmRole',
                message: 'What role are you interviewing for?',
                default: activeRole
            }]);

            console.log(chalk.cyan(`\nStarting Mock Interview for: ${confirmRole}...`));
            const spinner = ora('Generating a technical question (Gemma)...').start();

            try {
                const qData = await generateInterviewQuestion(confirmRole);
                spinner.succeed(`Question generated: [${qData.type}]`);
                console.log(chalk.bold.yellow(`\nQ: ${qData.question}\n`));

                const { userAnswer } = await inquirer.prompt([{
                    type: 'input',
                    name: 'userAnswer',
                    message: 'Your Answer (type briefly or paste pseudo-code):'
                }]);

                spinner.start('Evaluating your response...');
                const evalData = await evaluateInterviewAnswer(confirmRole, qData.question, userAnswer);
                spinner.succeed('Evaluation complete!');

                console.log(chalk.bold.magenta(`\nFeedback:`));
                console.log(evalData.feedback);
                console.log(chalk.bold.green(`\nDetailed Solution:`));
                console.log(evalData.detailed_solution + '\n');

            } catch (e) {
                spinner.fail(`Interview engine failed: ${e.message}`);
            }
        }

        if (action.includes('5')) {
            ora('Spinning up local Next.js Graph Viewer...').succeed('Server prepared.');
            if (!fs.existsSync(viewerPath)) {
                console.log(chalk.red.bold(`\nERROR: Could not find Next.js folder at ${viewerPath}`));
                continue;
            }

            const sourcePath = path.join(__dirname, '../init-dev-roadmap.json');
            const destPath = path.join(viewerPath, 'public/current-roadmap.json');
            
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
            } else {
                console.log(chalk.yellow('Warning: No active roadmap found. Please generate one first!'));
            }
            
            console.log(chalk.green('\n✅ Server is live!'));
            console.log(chalk.cyan('👉 Ctrl+Click to open: http://localhost:3000'));
            console.log(chalk.yellow('\n[ Press "q" to stop the server and return to the main menu ]\n'));
            
            await startServerAndWait(viewerPath, chalk);
        }

        if (action.includes('6')) {
            ora('Spinning up Claude-style Web Chat...').succeed('Server prepared.');
            if (!fs.existsSync(viewerPath)) {
                console.log(chalk.red.bold(`\nERROR: Could not find Next.js folder at ${viewerPath}`));
                continue;
            }
            
            console.log(chalk.green('\n✅ Server is live!'));
            console.log(chalk.cyan('👉 Ctrl+Click to open: http://localhost:3000/chat'));
            console.log(chalk.yellow('\n[ Press "q" to stop the server and return to the main menu ]\n'));
            
            await startServerAndWait(viewerPath, chalk);
        }
    }
}

main();