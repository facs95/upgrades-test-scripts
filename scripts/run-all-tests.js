const { ethers } = require("hardhat");
const { RPCTester } = require("./test-rpc-calls");
const { ContractTester } = require("./test-contracts");
const { TransferTester } = require("./test-transfers");
const { GasEstimationTester } = require("./test-gas-estimation");
const { ContractDeployer } = require("./deploy-test-contracts");
require("dotenv").config();

const COLORS = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    CYAN: '\x1b[36m',
    MAGENTA: '\x1b[35m'
};

class TestRunner {
    constructor() {
        this.provider = ethers.provider;
        this.results = {
            overall: {
                totalTests: 0,
                totalPassed: 0,
                totalFailed: 0,
                totalDuration: 0,
                successRate: 0
            },
            suites: {}
        };
        this.verbose = process.env.VERBOSE === 'true';
        this.deployFirst = process.env.DEPLOY_FIRST === 'true';
        this.skipSuites = (process.env.SKIP_SUITES || '').split(',').filter(s => s.trim());
        this.onlySuites = (process.env.ONLY_SUITES || '').split(',').filter(s => s.trim());
    }

    log(message, color = COLORS.RESET) {
        console.log(`${color}${message}${COLORS.RESET}`);
    }

    async runTestSuite(suiteName, testerClass, shouldRun = true) {
        if (!shouldRun) {
            this.log(`${COLORS.YELLOW}Skipping ${suiteName}${COLORS.RESET}`);
            return null;
        }

        this.log(`\n${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}RUNNING TEST SUITE: ${suiteName.toUpperCase()}${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`);

        const startTime = Date.now();

        try {
            const tester = new testerClass();
            const results = await tester.runAllTests();
            const duration = Date.now() - startTime;

            this.results.suites[suiteName] = {
                ...results,
                duration,
                status: 'completed',
                error: null
            };

            // Update overall statistics
            this.results.overall.totalTests += results.total;
            this.results.overall.totalPassed += results.passed;
            this.results.overall.totalFailed += results.failed;
            this.results.overall.totalDuration += duration;

            this.log(`\n${COLORS.GREEN}${COLORS.BRIGHT}${suiteName} completed successfully!${COLORS.RESET}`);
            this.log(`${COLORS.GREEN}Passed: ${results.passed}/${results.total} (${results.successRate}%)${COLORS.RESET}`);

            return results;

        } catch (error) {
            const duration = Date.now() - startTime;

            this.results.suites[suiteName] = {
                passed: 0,
                failed: 1,
                total: 1,
                successRate: 0,
                duration,
                status: 'failed',
                error: error.message
            };

            this.results.overall.totalTests += 1;
            this.results.overall.totalFailed += 1;
            this.results.overall.totalDuration += duration;

            this.log(`\n${COLORS.RED}${COLORS.BRIGHT}${suiteName} failed: ${error.message}${COLORS.RESET}`);

            if (this.verbose) {
                console.error(error);
            }

            return null;
        }
    }

    shouldRunSuite(suiteName) {
        // If ONLY_SUITES is specified, only run those suites
        if (this.onlySuites.length > 0 && this.onlySuites[0] !== '') {
            return this.onlySuites.includes(suiteName);
        }

        // If SKIP_SUITES is specified, skip those suites
        if (this.skipSuites.length > 0 && this.skipSuites[0] !== '') {
            return !this.skipSuites.includes(suiteName);
        }

        return true;
    }

    async checkPrerequisites() {
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Checking prerequisites...${COLORS.RESET}`);

        try {
            // Check provider connection
            const network = await this.provider.getNetwork();
            this.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

            // Check accounts
            const signers = await ethers.getSigners();
            if (signers.length === 0) {
                throw new Error("No signers available");
            }
            this.log(`Available accounts: ${signers.length}`);

            // Check first account balance
            const balance = await this.provider.getBalance(signers[0].address);
            this.log(`Primary account balance: ${ethers.formatEther(balance)} ETH`);

            if (balance < ethers.parseEther("0.01")) {
                this.log(`${COLORS.YELLOW}Warning: Low balance on primary account${COLORS.RESET}`);
            }

            // Check block number and gas price
            const blockNumber = await this.provider.getBlockNumber();
            const gasPrice = await this.provider.getGasPrice();
            this.log(`Current block: ${blockNumber}`);
            this.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

            this.log(`${COLORS.GREEN}✓ Prerequisites check passed${COLORS.RESET}`);
            return true;

        } catch (error) {
            this.log(`${COLORS.RED}✗ Prerequisites check failed: ${error.message}${COLORS.RESET}`);
            throw error;
        }
    }

    async deployContracts() {
        if (!this.deployFirst) {
            this.log(`${COLORS.YELLOW}Skipping contract deployment (DEPLOY_FIRST not set)${COLORS.RESET}`);
            return;
        }

        this.log(`\n${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}DEPLOYING TEST CONTRACTS${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`);

        try {
            const deployer = new ContractDeployer();
            await deployer.deploy();
            this.log(`${COLORS.GREEN}✓ Contract deployment completed${COLORS.RESET}`);
        } catch (error) {
            this.log(`${COLORS.RED}✗ Contract deployment failed: ${error.message}${COLORS.RESET}`);
            throw error;
        }
    }

    calculateOverallSuccessRate() {
        if (this.results.overall.totalTests === 0) {
            return 0;
        }
        return ((this.results.overall.totalPassed / this.results.overall.totalTests) * 100);
    }

    printDetailedResults() {
        this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== DETAILED TEST RESULTS ===${COLORS.RESET}`);

        for (const [suiteName, results] of Object.entries(this.results.suites)) {
            const statusColor = results.status === 'completed' ? COLORS.GREEN : COLORS.RED;
            const statusSymbol = results.status === 'completed' ? '✓' : '✗';

            this.log(`\n${statusColor}${statusSymbol} ${suiteName.toUpperCase()}${COLORS.RESET}`);
            this.log(`  Status: ${results.status}`);
            this.log(`  Tests: ${results.passed}/${results.total} passed`);
            this.log(`  Success Rate: ${results.successRate}%`);
            this.log(`  Duration: ${results.duration}ms`);

            if (results.error) {
                this.log(`  Error: ${results.error}`, COLORS.RED);
            }

            // Additional suite-specific information
            if (results.gasReport && Object.keys(results.gasReport).length > 0) {
                this.log(`  Gas Estimations: ${results.gasReport.totalEstimations || 'N/A'}`);
                this.log(`  Gas Accuracy: ${results.gasReport.accuracyRate || 'N/A'}`);
            }

            if (results.contracts && Object.keys(results.contracts).length > 0) {
                this.log(`  Contracts Deployed:`);
                for (const [name, address] of Object.entries(results.contracts)) {
                    if (address) {
                        this.log(`    ${name}: ${address}`);
                    }
                }
            }

            if (results.report && results.report.totalTransfers) {
                this.log(`  Total Transfers: ${results.report.totalTransfers}`);
                this.log(`  Average Gas per Transfer: ${results.report.averageGasPerTransfer}`);
            }
        }
    }

    printSummary() {
        this.results.overall.successRate = this.calculateOverallSuccessRate();

        this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== COMPREHENSIVE TEST SUMMARY ===${COLORS.RESET}`);

        // Overall statistics
        this.log(`\n${COLORS.BRIGHT}OVERALL RESULTS:${COLORS.RESET}`);
        this.log(`Total Test Suites: ${Object.keys(this.results.suites).length}`);
        this.log(`Total Tests: ${this.results.overall.totalTests}`);
        this.log(`Passed: ${this.results.overall.totalPassed}`);
        this.log(`Failed: ${this.results.overall.totalFailed}`);
        this.log(`Success Rate: ${this.results.overall.successRate.toFixed(2)}%`);
        this.log(`Total Duration: ${this.results.overall.totalDuration}ms (${(this.results.overall.totalDuration / 1000).toFixed(2)}s)`);

        // Suite summary
        this.log(`\n${COLORS.BRIGHT}SUITE SUMMARY:${COLORS.RESET}`);
        for (const [suiteName, results] of Object.entries(this.results.suites)) {
            const statusColor = results.status === 'completed' ? COLORS.GREEN : COLORS.RED;
            const statusSymbol = results.status === 'completed' ? '✓' : '✗';
            this.log(`  ${statusColor}${statusSymbol} ${suiteName}: ${results.passed}/${results.total} (${results.successRate}%)${COLORS.RESET}`);
        }

        // Final assessment
        const overallSuccess = this.results.overall.successRate >= 80;
        const assessmentColor = overallSuccess ? COLORS.GREEN : COLORS.RED;
        const assessmentText = overallSuccess ? "EXCELLENT" : "NEEDS ATTENTION";

        this.log(`\n${COLORS.BRIGHT}${assessmentColor}OVERALL ASSESSMENT: ${assessmentText}${COLORS.RESET}`);

        if (!overallSuccess) {
            this.log(`${COLORS.YELLOW}Some tests failed. Please review the detailed results above.${COLORS.RESET}`);
        }

        // Network information
        this.log(`\n${COLORS.BRIGHT}NETWORK INFORMATION:${COLORS.RESET}`);
        this.log(`Provider: ${this.provider.connection?.url || 'Unknown'}`);

        // Environment settings
        this.log(`\n${COLORS.BRIGHT}ENVIRONMENT SETTINGS:${COLORS.RESET}`);
        this.log(`Verbose Mode: ${this.verbose ? 'Enabled' : 'Disabled'}`);
        this.log(`Deploy First: ${this.deployFirst ? 'Enabled' : 'Disabled'}`);
        if (this.skipSuites.length > 0 && this.skipSuites[0] !== '') {
            this.log(`Skipped Suites: ${this.skipSuites.join(', ')}`);
        }
        if (this.onlySuites.length > 0 && this.onlySuites[0] !== '') {
            this.log(`Only Suites: ${this.onlySuites.join(', ')}`);
        }
    }

    async saveResults() {
        try {
            const fs = require('fs');
            const path = require('path');

            // Create results directory if it doesn't exist
            const resultsDir = path.join(__dirname, '../test-results');
            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true });
            }

            // Save detailed results
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `test-results-${timestamp}.json`;
            const filepath = path.join(resultsDir, filename);

            const resultData = {
                timestamp: new Date().toISOString(),
                environment: {
                    verbose: this.verbose,
                    deployFirst: this.deployFirst,
                    skipSuites: this.skipSuites,
                    onlySuites: this.onlySuites,
                    provider: this.provider.connection?.url || 'Unknown'
                },
                results: this.results
            };

            fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
            this.log(`\n${COLORS.GREEN}Results saved to: ${filepath}${COLORS.RESET}`);

            // Save latest results
            const latestPath = path.join(resultsDir, 'latest.json');
            fs.writeFileSync(latestPath, JSON.stringify(resultData, null, 2));

        } catch (error) {
            this.log(`${COLORS.RED}Failed to save results: ${error.message}${COLORS.RESET}`);
        }
    }

    async run() {
        const overallStartTime = Date.now();

        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}╔══════════════════════════════════════════════════════════════╗${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}║                  EVM CHAIN COMPREHENSIVE TESTING            ║${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}╚══════════════════════════════════════════════════════════════╝${COLORS.RESET}`);

        try {
            // Check prerequisites
            await this.checkPrerequisites();

            // Deploy contracts if requested
            await this.deployContracts();

            // Define test suites
            const testSuites = [
                { name: 'RPC Calls', class: RPCTester },
                { name: 'Contracts', class: ContractTester },
                { name: 'Transfers', class: TransferTester },
                { name: 'Gas Estimation', class: GasEstimationTester }
            ];

            // Run test suites
            for (const suite of testSuites) {
                const shouldRun = this.shouldRunSuite(suite.name);
                await this.runTestSuite(suite.name, suite.class, shouldRun);
            }

            // Calculate final statistics
            this.results.overall.totalDuration = Date.now() - overallStartTime;
            this.results.overall.successRate = this.calculateOverallSuccessRate();

            // Print results
            this.printDetailedResults();
            this.printSummary();

            // Save results
            await this.saveResults();

            // Determine exit code
            const success = this.results.overall.successRate >= 80;
            if (success) {
                this.log(`\n${COLORS.GREEN}${COLORS.BRIGHT}🎉 ALL TESTS COMPLETED SUCCESSFULLY! 🎉${COLORS.RESET}`);
                process.exit(0);
            } else {
                this.log(`\n${COLORS.RED}${COLORS.BRIGHT}❌ SOME TESTS FAILED - PLEASE REVIEW RESULTS ❌${COLORS.RESET}`);
                process.exit(1);
            }

        } catch (error) {
            this.log(`\n${COLORS.RED}${COLORS.BRIGHT}Fatal error during test execution: ${error.message}${COLORS.RESET}`);

            if (this.verbose) {
                console.error(error);
            }

            await this.saveResults();
            process.exit(1);
        }
    }
}

async function main() {
    // Handle command line arguments
    const args = process.argv.slice(2);

    // Set environment variables based on arguments
    if (args.includes('--verbose') || args.includes('-v')) {
        process.env.VERBOSE = 'true';
    }

    if (args.includes('--deploy') || args.includes('-d')) {
        process.env.DEPLOY_FIRST = 'true';
    }

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
${COLORS.BRIGHT}EVM Chain Comprehensive Testing${COLORS.RESET}

Usage: node run-all-tests.js [options]

Options:
  -v, --verbose          Enable verbose output
  -d, --deploy          Deploy contracts first
  -h, --help            Show this help message

Environment Variables:
  VERBOSE=true           Enable verbose output
  DEPLOY_FIRST=true      Deploy contracts before testing
  SKIP_SUITES=suite1,suite2  Skip specific test suites
  ONLY_SUITES=suite1,suite2  Only run specific test suites

Available Test Suites:
  - RPC Calls
  - Contracts
  - Transfers
  - Gas Estimation

Examples:
  npm run test:all
  npm run test:all -- --verbose --deploy
  SKIP_SUITES=Contracts npm run test:all
  ONLY_SUITES="RPC Calls,Transfers" npm run test:all
        `);
        process.exit(0);
    }

    const runner = new TestRunner();
    await runner.run();
}

// Export for use as module
module.exports = { TestRunner };

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(`${COLORS.RED}Fatal error:${COLORS.RESET}`, error);
        process.exit(1);
    });
}
