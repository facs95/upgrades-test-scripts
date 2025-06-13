const { ethers } = require("hardhat");
const { RPCTester } = require("./test-rpc-calls");
const { ContractTester } = require("./test-contracts");
const { TransferTester } = require("./test-transfers");
const { GasEstimationTester } = require("./test-gas-estimation");
const { ContractDeployer } = require("./deploy-test-contracts");
const { CosmosBankTester } = require("./test-cosmos-bank");
const axios = require("axios");
require("dotenv").config();

const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m",
  WHITE: "\x1b[37m",
};

class ComprehensiveTestRunner {
  constructor() {
    this.provider = ethers.provider;
    this.results = {
      overall: {
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalDuration: 0,
        successRate: 0,
      },
      evm: {
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        successRate: 0,
        suites: {},
      },
      cosmos: {
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        successRate: 0,
        suites: {},
      },
    };

    this.verbose = process.env.VERBOSE === "true";
    this.debug = process.env.DEBUG === "true";
    this.deployFirst = process.env.DEPLOY_FIRST === "true";

    // Test suite configuration
    this.skipSuites = (process.env.SKIP_SUITES || "")
      .split(",")
      .filter((s) => s.trim());
    this.onlySuites = (process.env.ONLY_SUITES || "")
      .split(",")
      .filter((s) => s.trim());

    // Chain type configuration
    this.runEvm = process.env.RUN_EVM !== "false"; // Default to true
    this.runCosmos = process.env.RUN_COSMOS !== "false"; // Default to true

    // If both are false, run EVM by default
    if (!this.runEvm && !this.runCosmos) {
      this.runEvm = true;
    }
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  async runEvmTestSuite(suiteName, testerClass, shouldRun = true) {
    if (!shouldRun) {
      this.log(`${COLORS.YELLOW}Skipping EVM ${suiteName}${COLORS.RESET}`);
      return null;
    }

    this.log(
      `\n${COLORS.BRIGHT}${COLORS.CYAN}================================================${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${
        COLORS.CYAN
      }RUNNING EVM TEST SUITE: ${suiteName.toUpperCase()}${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.CYAN}================================================${COLORS.RESET}`
    );

    const startTime = Date.now();
    let suiteResults = null;

    try {
      const tester = new testerClass();
      suiteResults = await tester.runAllTests();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Store results
      this.results.evm.suites[suiteName] = {
        ...suiteResults,
        duration: duration,
        status: "completed",
      };

      // Update EVM totals
      this.results.evm.totalTests += suiteResults.total || 0;
      this.results.evm.totalPassed += suiteResults.passed || 0;
      this.results.evm.totalFailed += suiteResults.failed || 0;

      this.log(
        `\n${COLORS.GREEN}✓ EVM ${suiteName} completed in ${duration}ms${COLORS.RESET}`
      );
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.evm.suites[suiteName] = {
        total: 0,
        passed: 0,
        failed: 1,
        duration: duration,
        status: "error",
        error: error.message,
      };

      this.results.evm.totalFailed += 1;
      this.results.evm.totalTests += 1;

      this.log(
        `\n${COLORS.RED}✗ EVM ${suiteName} failed: ${error.message}${COLORS.RESET}`
      );

      if (this.debug) {
        console.error(error);
      }
    }

    return suiteResults;
  }

  async runCosmosTestSuite(suiteName, testerClass, shouldRun = true) {
    if (!shouldRun) {
      this.log(`${COLORS.YELLOW}Skipping Cosmos ${suiteName}${COLORS.RESET}`);
      return null;
    }

    this.log(
      `\n${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${
        COLORS.MAGENTA
      }RUNNING COSMOS TEST SUITE: ${suiteName.toUpperCase()}${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.MAGENTA}================================================${COLORS.RESET}`
    );

    const startTime = Date.now();
    let suiteResults = null;

    try {
      const tester = new testerClass();
      suiteResults = await tester.runAllTests();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Store results
      this.results.cosmos.suites[suiteName] = {
        ...suiteResults.results,
        duration: duration,
        status: "completed",
        successRate: suiteResults.successRate,
        querySuccessRate: suiteResults.querySuccessRate,
        transactionSuccessRate: suiteResults.transactionSuccessRate,
      };

      // Update Cosmos totals
      this.results.cosmos.totalTests += suiteResults.results.total || 0;
      this.results.cosmos.totalPassed += suiteResults.results.passed || 0;
      this.results.cosmos.totalFailed += suiteResults.results.failed || 0;

      this.log(
        `\n${COLORS.GREEN}✓ Cosmos ${suiteName} completed in ${duration}ms${COLORS.RESET}`
      );
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.cosmos.suites[suiteName] = {
        total: 0,
        passed: 0,
        failed: 1,
        duration: duration,
        status: "error",
        error: error.message,
      };

      this.results.cosmos.totalFailed += 1;
      this.results.cosmos.totalTests += 1;

      this.log(
        `\n${COLORS.RED}✗ Cosmos ${suiteName} failed: ${error.message}${COLORS.RESET}`
      );

      if (this.debug) {
        console.error(error);
      }
    }

    return suiteResults;
  }

  shouldRunSuite(suiteName) {
    // If only specific suites are specified, run only those
    if (this.onlySuites.length > 0) {
      return this.onlySuites.some((suite) =>
        suiteName.toLowerCase().includes(suite.toLowerCase().trim())
      );
    }

    // If skip suites are specified, skip those
    if (this.skipSuites.length > 0) {
      return !this.skipSuites.some((suite) =>
        suiteName.toLowerCase().includes(suite.toLowerCase().trim())
      );
    }

    return true;
  }

  async checkEvmPrerequisites() {
    if (!this.runEvm) return true;

    this.log(
      `\n${COLORS.BRIGHT}=== CHECKING EVM PREREQUISITES ===${COLORS.RESET}`
    );

    try {
      // Check network connection
      const network = await this.provider.getNetwork();
      this.log(
        `${COLORS.GREEN}✓ Connected to EVM network: ${network.name} (Chain ID: ${network.chainId})${COLORS.RESET}`
      );

      // Check if we have accounts
      const accounts = await ethers.getSigners();
      if (accounts.length === 0) {
        throw new Error("No accounts available");
      }
      this.log(
        `${COLORS.GREEN}✓ Found ${accounts.length} account(s)${COLORS.RESET}`
      );

      // Check balance of first account
      const balance = await this.provider.getBalance(accounts[0].address);
      this.log(
        `${COLORS.GREEN}✓ Account balance: ${ethers.formatEther(balance)} ETH${
          COLORS.RESET
        }`
      );

      if (balance === 0n) {
        this.log(
          `${COLORS.YELLOW}⚠ Warning: Account has zero balance, some tests may fail${COLORS.RESET}`
        );
      }

      return true;
    } catch (error) {
      this.log(
        `${COLORS.RED}✗ EVM prerequisites check failed: ${error.message}${COLORS.RESET}`
      );
      return false;
    }
  }

  async checkCosmosPrerequisites() {
    if (!this.runCosmos) return true;

    this.log(
      `\n${COLORS.BRIGHT}=== CHECKING COSMOS PREREQUISITES ===${COLORS.RESET}`
    );

    try {
      const rpcUrl = process.env.COSMOS_RPC_URL || "http://localhost:26657";
      const restUrl = process.env.COSMOS_REST_URL || "http://localhost:1317";
      const chainId = process.env.COSMOS_CHAIN_ID || "cosmoshub-4";

      this.log(`${COLORS.GREEN}✓ Cosmos RPC URL: ${rpcUrl}${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}✓ Cosmos REST URL: ${restUrl}${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}✓ Cosmos Chain ID: ${chainId}${COLORS.RESET}`);

      // Basic connectivity test
      try {
        const response = await axios.get(`${rpcUrl}/status`, {
          timeout: 5000,
        });
        if (response.status === 200) {
          this.log(
            `${COLORS.GREEN}✓ Cosmos RPC endpoint is accessible${COLORS.RESET}`
          );
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        this.log(
          `${COLORS.YELLOW}⚠ Could not verify Cosmos RPC connectivity: ${error.message}${COLORS.RESET}`
        );
      }

      return true;
    } catch (error) {
      this.log(
        `${COLORS.RED}✗ Cosmos prerequisites check failed: ${error.message}${COLORS.RESET}`
      );
      return false;
    }
  }

  async deployContracts() {
    if (!this.runEvm || !this.deployFirst) return;

    this.log(
      `\n${COLORS.BRIGHT}=== DEPLOYING TEST CONTRACTS ===${COLORS.RESET}`
    );

    try {
      const deployer = new ContractDeployer();
      await deployer.deployAllContracts();
      this.log(
        `${COLORS.GREEN}✓ All contracts deployed successfully${COLORS.RESET}`
      );
    } catch (error) {
      this.log(
        `${COLORS.YELLOW}⚠ Contract deployment failed: ${error.message}${COLORS.RESET}`
      );
      this.log(
        `${COLORS.YELLOW}  Continuing with tests anyway...${COLORS.RESET}`
      );
    }
  }

  calculateOverallSuccessRate() {
    const totalTests = this.results.overall.totalTests;
    const totalPassed = this.results.overall.totalPassed;

    if (totalTests === 0) return 0;
    return (totalPassed / totalTests) * 100;
  }

  calculateEvmSuccessRate() {
    const totalTests = this.results.evm.totalTests;
    const totalPassed = this.results.evm.totalPassed;

    if (totalTests === 0) return 0;
    return (totalPassed / totalTests) * 100;
  }

  calculateCosmosSuccessRate() {
    const totalTests = this.results.cosmos.totalTests;
    const totalPassed = this.results.cosmos.totalPassed;

    if (totalTests === 0) return 0;
    return (totalPassed / totalTests) * 100;
  }

  printDetailedResults() {
    this.log(`\n${COLORS.BRIGHT}=== DETAILED TEST RESULTS ===${COLORS.RESET}`);

    if (this.runEvm && this.results.evm.totalTests > 0) {
      this.log(
        `\n${COLORS.BRIGHT}${COLORS.CYAN}EVM Test Suites:${COLORS.RESET}`
      );

      Object.entries(this.results.evm.suites).forEach(
        ([suiteName, results]) => {
          const successRate =
            results.total > 0
              ? ((results.passed / results.total) * 100).toFixed(2)
              : 0;
          const statusColor =
            results.status === "completed"
              ? successRate >= 90
                ? COLORS.GREEN
                : successRate >= 70
                ? COLORS.YELLOW
                : COLORS.RED
              : COLORS.RED;

          this.log(`  ${statusColor}${suiteName}:${COLORS.RESET}`);
          this.log(
            `    Status: ${statusColor}${results.status}${COLORS.RESET}`
          );
          this.log(
            `    Tests: ${results.total || 0} | Passed: ${
              results.passed || 0
            } | Failed: ${results.failed || 0}`
          );
          this.log(
            `    Success Rate: ${statusColor}${successRate}%${COLORS.RESET}`
          );
          this.log(`    Duration: ${results.duration}ms`);

          if (results.error) {
            this.log(`    Error: ${COLORS.RED}${results.error}${COLORS.RESET}`);
          }
        }
      );
    }

    if (this.runCosmos && this.results.cosmos.totalTests > 0) {
      this.log(
        `\n${COLORS.BRIGHT}${COLORS.MAGENTA}Cosmos Test Suites:${COLORS.RESET}`
      );

      Object.entries(this.results.cosmos.suites).forEach(
        ([suiteName, results]) => {
          const successRate = results.successRate || 0;
          const statusColor =
            results.status === "completed"
              ? successRate >= 90
                ? COLORS.GREEN
                : successRate >= 70
                ? COLORS.YELLOW
                : COLORS.RED
              : COLORS.RED;

          this.log(`  ${statusColor}${suiteName}:${COLORS.RESET}`);
          this.log(
            `    Status: ${statusColor}${results.status}${COLORS.RESET}`
          );
          this.log(
            `    Tests: ${results.total || 0} | Passed: ${
              results.passed || 0
            } | Failed: ${results.failed || 0}`
          );
          this.log(
            `    Success Rate: ${statusColor}${successRate.toFixed(2)}%${
              COLORS.RESET
            }`
          );
          this.log(`    Duration: ${results.duration}ms`);

          if (results.queries) {
            this.log(
              `    Query Tests: ${results.queries.total || 0} | Passed: ${
                results.queries.passed || 0
              } | Failed: ${results.queries.failed || 0}`
            );
          }

          if (results.transactions) {
            this.log(
              `    Transaction Tests: ${
                results.transactions.total || 0
              } | Passed: ${results.transactions.passed || 0} | Failed: ${
                results.transactions.failed || 0
              }`
            );
          }

          if (results.error) {
            this.log(`    Error: ${COLORS.RED}${results.error}${COLORS.RESET}`);
          }
        }
      );
    }
  }

  printSummary() {
    // Update overall totals
    this.results.overall.totalTests =
      this.results.evm.totalTests + this.results.cosmos.totalTests;
    this.results.overall.totalPassed =
      this.results.evm.totalPassed + this.results.cosmos.totalPassed;
    this.results.overall.totalFailed =
      this.results.evm.totalFailed + this.results.cosmos.totalFailed;

    // Calculate success rates
    this.results.evm.successRate = this.calculateEvmSuccessRate();
    this.results.cosmos.successRate = this.calculateCosmosSuccessRate();
    this.results.overall.successRate = this.calculateOverallSuccessRate();

    this.log(
      `\n${COLORS.BRIGHT}${COLORS.WHITE}================================================================${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.WHITE}                    COMPREHENSIVE TEST SUMMARY                   ${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.WHITE}================================================================${COLORS.RESET}`
    );

    // Overall summary
    const overallColor =
      this.results.overall.successRate >= 90
        ? COLORS.GREEN
        : this.results.overall.successRate >= 70
        ? COLORS.YELLOW
        : COLORS.RED;

    this.log(`\n${COLORS.BRIGHT}Overall Results:${COLORS.RESET}`);
    this.log(`  Total Tests: ${this.results.overall.totalTests}`);
    this.log(
      `  Passed: ${COLORS.GREEN}${this.results.overall.totalPassed}${COLORS.RESET}`
    );
    this.log(
      `  Failed: ${COLORS.RED}${this.results.overall.totalFailed}${COLORS.RESET}`
    );
    this.log(
      `  Success Rate: ${overallColor}${this.results.overall.successRate.toFixed(
        2
      )}%${COLORS.RESET}`
    );
    this.log(`  Duration: ${this.results.overall.totalDuration}ms`);

    // EVM summary
    if (this.runEvm) {
      const evmColor =
        this.results.evm.successRate >= 90
          ? COLORS.GREEN
          : this.results.evm.successRate >= 70
          ? COLORS.YELLOW
          : COLORS.RED;

      this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}EVM Results:${COLORS.RESET}`);
      this.log(`  Total Tests: ${this.results.evm.totalTests}`);
      this.log(
        `  Passed: ${COLORS.GREEN}${this.results.evm.totalPassed}${COLORS.RESET}`
      );
      this.log(
        `  Failed: ${COLORS.RED}${this.results.evm.totalFailed}${COLORS.RESET}`
      );
      this.log(
        `  Success Rate: ${evmColor}${this.results.evm.successRate.toFixed(
          2
        )}%${COLORS.RESET}`
      );
      this.log(`  Test Suites: ${Object.keys(this.results.evm.suites).length}`);
    }

    // Cosmos summary
    if (this.runCosmos) {
      const cosmosColor =
        this.results.cosmos.successRate >= 90
          ? COLORS.GREEN
          : this.results.cosmos.successRate >= 70
          ? COLORS.YELLOW
          : COLORS.RED;

      this.log(
        `\n${COLORS.BRIGHT}${COLORS.MAGENTA}Cosmos Results:${COLORS.RESET}`
      );
      this.log(`  Total Tests: ${this.results.cosmos.totalTests}`);
      this.log(
        `  Passed: ${COLORS.GREEN}${this.results.cosmos.totalPassed}${COLORS.RESET}`
      );
      this.log(
        `  Failed: ${COLORS.RED}${this.results.cosmos.totalFailed}${COLORS.RESET}`
      );
      this.log(
        `  Success Rate: ${cosmosColor}${this.results.cosmos.successRate.toFixed(
          2
        )}%${COLORS.RESET}`
      );
      this.log(
        `  Test Suites: ${Object.keys(this.results.cosmos.suites).length}`
      );
    }

    // Recommendations
    this.log(`\n${COLORS.BRIGHT}Recommendations:${COLORS.RESET}`);
    if (this.results.overall.successRate >= 95) {
      this.log(
        `  ${COLORS.GREEN}🎉 Excellent! Your chain is performing exceptionally well.${COLORS.RESET}`
      );
    } else if (this.results.overall.successRate >= 90) {
      this.log(
        `  ${COLORS.GREEN}✅ Great! Your chain is working well with minor issues.${COLORS.RESET}`
      );
    } else if (this.results.overall.successRate >= 70) {
      this.log(
        `  ${COLORS.YELLOW}⚠️  Your chain has some issues that should be investigated.${COLORS.RESET}`
      );
    } else {
      this.log(
        `  ${COLORS.RED}❌ Your chain has significant issues that need immediate attention.${COLORS.RESET}`
      );
    }
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsData = {
      timestamp: new Date().toISOString(),
      configuration: {
        runEvm: this.runEvm,
        runCosmos: this.runCosmos,
        deployFirst: this.deployFirst,
        verbose: this.verbose,
        debug: this.debug,
        skipSuites: this.skipSuites,
        onlySuites: this.onlySuites,
      },
      results: this.results,
    };

    try {
      const fs = require("fs");
      const path = require("path");

      // Ensure test-results directory exists
      const resultsDir = path.join(__dirname, "..", "test-results");
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      // Save detailed results
      const resultFile = path.join(
        resultsDir,
        `comprehensive-results-${timestamp}.json`
      );
      fs.writeFileSync(resultFile, JSON.stringify(resultsData, null, 2));

      // Save latest results
      const latestFile = path.join(resultsDir, "comprehensive-latest.json");
      fs.writeFileSync(latestFile, JSON.stringify(resultsData, null, 2));

      this.log(`\n${COLORS.GREEN}✓ Results saved to:${COLORS.RESET}`);
      this.log(`  ${resultFile}`);
      this.log(`  ${latestFile}`);
    } catch (error) {
      this.log(
        `${COLORS.YELLOW}⚠ Could not save results to file: ${error.message}${COLORS.RESET}`
      );
    }
  }

  async run() {
    const startTime = Date.now();

    this.log(
      `${COLORS.BRIGHT}${COLORS.WHITE}================================================================${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.WHITE}            🚀 COMPREHENSIVE BLOCKCHAIN TESTING 🚀             ${COLORS.RESET}`
    );
    this.log(
      `${COLORS.BRIGHT}${COLORS.WHITE}================================================================${COLORS.RESET}`
    );

    this.log(`\n${COLORS.BRIGHT}Configuration:${COLORS.RESET}`);
    this.log(
      `  EVM Tests: ${
        this.runEvm ? COLORS.GREEN + "ENABLED" : COLORS.RED + "DISABLED"
      }${COLORS.RESET}`
    );
    this.log(
      `  Cosmos Tests: ${
        this.runCosmos ? COLORS.GREEN + "ENABLED" : COLORS.RED + "DISABLED"
      }${COLORS.RESET}`
    );
    this.log(`  Deploy Contracts First: ${this.deployFirst ? "Yes" : "No"}`);
    this.log(`  Verbose Mode: ${this.verbose ? "Yes" : "No"}`);
    this.log(`  Debug Mode: ${this.debug ? "Yes" : "No"}`);

    if (this.skipSuites.length > 0) {
      this.log(`  Skip Suites: ${this.skipSuites.join(", ")}`);
    }
    if (this.onlySuites.length > 0) {
      this.log(`  Only Suites: ${this.onlySuites.join(", ")}`);
    }

    try {
      // Check prerequisites
      const evmReady = await this.checkEvmPrerequisites();
      const cosmosReady = await this.checkCosmosPrerequisites();

      if (this.runEvm && !evmReady) {
        this.log(
          `${COLORS.RED}✗ EVM prerequisites not met, skipping EVM tests${COLORS.RESET}`
        );
        this.runEvm = false;
      }

      if (this.runCosmos && !cosmosReady) {
        this.log(
          `${COLORS.RED}✗ Cosmos prerequisites not met, skipping Cosmos tests${COLORS.RESET}`
        );
        this.runCosmos = false;
      }

      if (!this.runEvm && !this.runCosmos) {
        throw new Error(
          "No test suites can be run due to prerequisite failures"
        );
      }

      // Deploy contracts if needed
      await this.deployContracts();

      // Run EVM test suites
      if (this.runEvm) {
        await this.runEvmTestSuite(
          "RPC Calls",
          RPCTester,
          this.shouldRunSuite("RPC Calls")
        );
        await this.runEvmTestSuite(
          "Contracts",
          ContractTester,
          this.shouldRunSuite("Contracts")
        );
        await this.runEvmTestSuite(
          "Transfers",
          TransferTester,
          this.shouldRunSuite("Transfers")
        );
        await this.runEvmTestSuite(
          "Gas Estimation",
          GasEstimationTester,
          this.shouldRunSuite("Gas Estimation")
        );
      }

      // Run Cosmos test suites
      if (this.runCosmos) {
        await this.runCosmosTestSuite(
          "Bank Module",
          CosmosBankTester,
          this.shouldRunSuite("Bank Module")
        );
      }

      const endTime = Date.now();
      this.results.overall.totalDuration = endTime - startTime;

      // Print results
      this.printDetailedResults();
      this.printSummary();

      // Save results
      await this.saveResults();

      return this.results;
    } catch (error) {
      this.log(
        `\n${COLORS.RED}${COLORS.BRIGHT}💥 Critical error during testing: ${error.message} 💥${COLORS.RESET}`
      );

      if (this.debug) {
        console.error(error);
      }

      throw error;
    }
  }
}

async function main() {
  const runner = new ComprehensiveTestRunner();

  try {
    const results = await runner.run();

    // Determine exit code based on results
    if (results.overall.successRate >= 90) {
      console.log(
        `\n${COLORS.GREEN}${COLORS.BRIGHT}🎉 All tests completed successfully! 🎉${COLORS.RESET}`
      );
      process.exit(0);
    } else if (results.overall.successRate >= 70) {
      console.log(
        `\n${COLORS.YELLOW}${COLORS.BRIGHT}⚠️  Tests completed with some issues ⚠️${COLORS.RESET}`
      );
      process.exit(1);
    } else {
      console.log(
        `\n${COLORS.RED}${COLORS.BRIGHT}❌ Tests completed with significant failures ❌${COLORS.RESET}`
      );
      process.exit(2);
    }
  } catch (error) {
    console.error(
      `${COLORS.RED}${COLORS.BRIGHT}💥 Testing suite failed to complete: ${error.message} 💥${COLORS.RESET}`
    );
    process.exit(3);
  }
}

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
${COLORS.BRIGHT}Comprehensive Blockchain Testing Suite${COLORS.RESET}

${COLORS.BRIGHT}Usage:${COLORS.RESET}
  node run-comprehensive-tests.js [options]
  npm run test:comprehensive [-- options]

${COLORS.BRIGHT}Options:${COLORS.RESET}
  --help, -h          Show this help message
  --verbose           Enable verbose output
  --debug             Enable debug mode
  --deploy            Deploy contracts before testing
  --evm-only          Run only EVM tests
  --cosmos-only       Run only Cosmos tests

${COLORS.BRIGHT}Environment Variables:${COLORS.RESET}
  RUN_EVM             Enable/disable EVM tests (default: true)
  RUN_COSMOS          Enable/disable Cosmos tests (default: false)
  DEPLOY_FIRST        Deploy contracts before testing (default: false)
  VERBOSE             Enable verbose output (default: false)
  DEBUG               Enable debug mode (default: false)
  SKIP_SUITES         Comma-separated list of suites to skip
  ONLY_SUITES         Comma-separated list of suites to run exclusively

${COLORS.BRIGHT}Examples:${COLORS.RESET}
  # Run all tests with verbose output
  VERBOSE=true node run-comprehensive-tests.js

  # Run only EVM tests
  RUN_EVM=true RUN_COSMOS=false node run-comprehensive-tests.js

  # Run only Cosmos tests
  RUN_EVM=false RUN_COSMOS=true node run-comprehensive-tests.js

  # Run both EVM and Cosmos tests
  RUN_EVM=true RUN_COSMOS=true node run-comprehensive-tests.js

  # Skip specific test suites
  SKIP_SUITES="Gas Estimation,Contracts" node run-comprehensive-tests.js

  # Run only specific test suites
  ONLY_SUITES="RPC Calls,Bank Module" node run-comprehensive-tests.js
`);
  process.exit(0);
}

// Handle command line flags
if (process.argv.includes("--verbose")) {
  process.env.VERBOSE = "true";
}

if (process.argv.includes("--debug")) {
  process.env.DEBUG = "true";
}

if (process.argv.includes("--deploy")) {
  process.env.DEPLOY_FIRST = "true";
}

if (process.argv.includes("--evm-only")) {
  process.env.RUN_EVM = "true";
  process.env.RUN_COSMOS = "false";
}

if (process.argv.includes("--cosmos-only")) {
  process.env.RUN_EVM = "false";
  process.env.RUN_COSMOS = "true";
}

// Run the tests if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ComprehensiveTestRunner };
