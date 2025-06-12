#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

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
        this.network = 'localhost'; // Default network
        this.verbose = false;
        this.deploy = false;
        this.suite = 'all';
        this.results = {
            passed: 0,
            failed: 0,
            total: 0
        };
    }

    log(message, color = COLORS.RESET) {
        console.log(`${color}${message}${COLORS.RESET}`);
    }

    parseArgs() {
        const args = process.argv.slice(2);

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            switch (arg) {
                case '--network':
                    if (i + 1 < args.length) {
                        this.network = args[i + 1];
                        i++; // Skip next arg since we consumed it
                    } else {
                        this.log('Error: --network flag requires a network name', COLORS.RED);
                        process.exit(1);
                    }
                    break;

                case '--verbose':
                case '-v':
                    this.verbose = true;
                    break;

                case '--deploy':
                case '-d':
                    this.deploy = true;
                    break;

                case '--suite':
                case '-s':
                    if (i + 1 < args.length) {
                        this.suite = args[i + 1];
                        i++;
                    } else {
                        this.log('Error: --suite flag requires a suite name', COLORS.RED);
                        process.exit(1);
                    }
                    break;

                case '--help':
                case '-h':
                    this.showHelp();
                    process.exit(0);
                    break;

                default:
                    if (arg.startsWith('--')) {
                        this.log(`Unknown flag: ${arg}`, COLORS.YELLOW);
                    }
                    break;
            }
        }
    }

    showHelp() {
        console.log(`
${COLORS.BRIGHT}${COLORS.BLUE}EVM Chain Test Runner${COLORS.RESET}

${COLORS.BRIGHT}Usage:${COLORS.RESET}
  npm run test:all [options]
  node scripts/run-tests.js [options]

${COLORS.BRIGHT}Options:${COLORS.RESET}
  --network <name>     Network to run tests on (default: localhost)
  --suite <name>       Test suite to run: all|rpc|contracts|transfers|gas (default: all)
  --deploy, -d         Deploy contracts before running tests
  --verbose, -v        Enable verbose output
  --help, -h           Show this help message

${COLORS.BRIGHT}Available Networks:${COLORS.RESET}
  localhost            Local Hardhat node (default)
  hardhat              In-process Hardhat network
  testnet              Custom testnet (configure in .env)
  custom               Custom network (configure in .env)

${COLORS.BRIGHT}Available Test Suites:${COLORS.RESET}
  all                  Run all test suites (default)
  rpc                  RPC method testing only
  contracts            Contract deployment and testing only
  transfers            Native token transfer testing only
  gas                  Gas estimation testing only

${COLORS.BRIGHT}Examples:${COLORS.RESET}
  npm run test:all                           # Run all tests on localhost
  npm run test:all -- --network hardhat     # Run on Hardhat network
  npm run test:all -- --network testnet -v  # Run on testnet with verbose output
  npm run test:all -- --suite rpc           # Run only RPC tests
  npm run test:all -- --deploy --verbose    # Deploy contracts first, then test

${COLORS.BRIGHT}Environment Variables:${COLORS.RESET}
  Configure your .env file for custom networks:
  RPC_URL=http://localhost:8545
  CHAIN_ID=31337
  PRIVATE_KEY=0x...
        `);
    }

    async runCommand(command, args, description) {
        return new Promise((resolve, reject) => {
            this.log(`\n${COLORS.CYAN}${description}${COLORS.RESET}`);

            const child = spawn(command, args, {
                stdio: this.verbose ? 'inherit' : 'pipe',
                shell: true
            });

            let output = '';
            let errorOutput = '';

            if (!this.verbose) {
                child.stdout?.on('data', (data) => {
                    output += data.toString();
                });

                child.stderr?.on('data', (data) => {
                    errorOutput += data.toString();
                });
            }

            child.on('close', (code) => {
                if (code === 0) {
                    this.log(`${COLORS.GREEN}✓ ${description} completed successfully${COLORS.RESET}`);
                    this.results.passed++;
                    resolve({ success: true, output });
                } else {
                    this.log(`${COLORS.RED}✗ ${description} failed (exit code: ${code})${COLORS.RESET}`);
                    if (!this.verbose && errorOutput) {
                        this.log(`Error output: ${errorOutput}`, COLORS.RED);
                    }
                    this.results.failed++;
                    resolve({ success: false, output, errorOutput, code });
                }
                this.results.total++;
            });

            child.on('error', (error) => {
                this.log(`${COLORS.RED}✗ Failed to start ${description}: ${error.message}${COLORS.RESET}`);
                this.results.failed++;
                this.results.total++;
                reject(error);
            });
        });
    }

    async deployContracts() {
        if (!this.deploy) {
            return { success: true };
        }

        this.log(`\n${COLORS.BRIGHT}${COLORS.MAGENTA}=== DEPLOYING CONTRACTS ===${COLORS.RESET}`);

        const result = await this.runCommand(
            'npx',
            ['hardhat', 'run', 'scripts/deploy-test-contracts.js', '--network', this.network],
            'Deploy test contracts'
        );

        return result;
    }

    async runTestSuite(suiteName, scriptName) {
        const result = await this.runCommand(
            'npx',
            ['hardhat', 'run', `scripts/${scriptName}`, '--network', this.network],
            `Run ${suiteName} tests`
        );

        return result;
    }

    async runTests() {
        this.log(`\n${COLORS.BRIGHT}${COLORS.MAGENTA}=== RUNNING TESTS ===${COLORS.RESET}`);

        const testSuites = {
            rpc: 'test-rpc-calls.js',
            contracts: 'test-contracts.js',
            transfers: 'test-transfers.js',
            gas: 'test-gas-estimation.js'
        };

        if (this.suite === 'all') {
            // Run all test suites
            for (const [suiteName, scriptName] of Object.entries(testSuites)) {
                await this.runTestSuite(suiteName, scriptName);
            }
        } else if (testSuites[this.suite]) {
            // Run specific test suite
            await this.runTestSuite(this.suite, testSuites[this.suite]);
        } else {
            this.log(`Error: Unknown test suite '${this.suite}'. Available: ${Object.keys(testSuites).join(', ')}, all`, COLORS.RED);
            process.exit(1);
        }
    }

    printSummary() {
        this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== TEST EXECUTION SUMMARY ===${COLORS.RESET}`);
        this.log(`Network: ${this.network}`);
        this.log(`Test Suite: ${this.suite}`);
        this.log(`Deploy Contracts: ${this.deploy ? 'Yes' : 'No'}`);
        this.log(`Verbose Mode: ${this.verbose ? 'Yes' : 'No'}`);
        this.log(`\nResults:`);
        this.log(`${COLORS.GREEN}Passed: ${this.results.passed}${COLORS.RESET}`);
        this.log(`${COLORS.RED}Failed: ${this.results.failed}${COLORS.RESET}`);
        this.log(`${COLORS.CYAN}Total: ${this.results.total}${COLORS.RESET}`);

        const successRate = this.results.total > 0 ?
            ((this.results.passed / this.results.total) * 100).toFixed(1) : 0;
        this.log(`${COLORS.BRIGHT}Success Rate: ${successRate}%${COLORS.RESET}`);

        if (this.results.failed > 0) {
            this.log(`\n${COLORS.YELLOW}Some test suites failed. Check the output above for details.${COLORS.RESET}`);
            return false;
        } else {
            this.log(`\n${COLORS.GREEN}${COLORS.BRIGHT}🎉 All test suites completed successfully! 🎉${COLORS.RESET}`);
            return true;
        }
    }

    validateNetwork() {
        const validNetworks = ['localhost', 'hardhat', 'testnet', 'custom'];
        if (!validNetworks.includes(this.network)) {
            this.log(`\n${COLORS.YELLOW}Warning: Using custom network '${this.network}'${COLORS.RESET}`);
            this.log(`${COLORS.YELLOW}Make sure it's configured in hardhat.config.js${COLORS.RESET}`);
        }
    }

    async run() {
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}╔══════════════════════════════════════════════════════════════╗${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}║                  EVM CHAIN TEST RUNNER                       ║${COLORS.RESET}`);
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}╚══════════════════════════════════════════════════════════════╝${COLORS.RESET}`);

        // Parse command line arguments
        this.parseArgs();

        // Validate network
        this.validateNetwork();

        // Show configuration
        this.log(`\n${COLORS.BRIGHT}Configuration:${COLORS.RESET}`);
        this.log(`  Network: ${COLORS.YELLOW}${this.network}${COLORS.RESET}`);
        this.log(`  Test Suite: ${COLORS.YELLOW}${this.suite}${COLORS.RESET}`);
        this.log(`  Deploy Contracts: ${COLORS.YELLOW}${this.deploy ? 'Yes' : 'No'}${COLORS.RESET}`);
        this.log(`  Verbose Mode: ${COLORS.YELLOW}${this.verbose ? 'Yes' : 'No'}${COLORS.RESET}`);

        try {
            // Deploy contracts if requested
            const deployResult = await this.deployContracts();
            if (!deployResult.success && this.deploy) {
                this.log(`\n${COLORS.RED}Contract deployment failed. Aborting tests.${COLORS.RESET}`);
                process.exit(1);
            }

            // Run tests
            await this.runTests();

            // Print summary and exit
            const success = this.printSummary();
            process.exit(success ? 0 : 1);

        } catch (error) {
            this.log(`\n${COLORS.RED}Fatal error: ${error.message}${COLORS.RESET}`);
            if (this.verbose) {
                console.error(error);
            }
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new TestRunner();
    runner.run().catch((error) => {
        console.error(`${COLORS.RED}Fatal error:${COLORS.RESET}`, error);
        process.exit(1);
    });
}

module.exports = { TestRunner };
