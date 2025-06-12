const { ethers } = require("hardhat");
require("dotenv").config();

const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
};

class GasEstimationTester {
  constructor() {
    this.provider = ethers.provider;
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
    };
    this.verbose = process.env.VERBOSE === "true";
    this.signers = [];
    this.gasEstimations = [];
    this.contracts = {};
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  async runTest(testName, testFunction) {
    this.results.total++;
    try {
      this.log(`\n${COLORS.CYAN}Testing: ${testName}${COLORS.RESET}`);
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;

      this.results.passed++;
      this.log(
        `${COLORS.GREEN}✓ PASSED: ${testName} (${duration}ms)${COLORS.RESET}`
      );

      if (this.verbose && result !== undefined) {
        this.log(
          `  Result: ${JSON.stringify(
            result,
            (key, value) =>
              typeof value === "bigint" ? value.toString() : value,
            2
          )}`
        );
      }

      return result;
    } catch (error) {
      this.results.failed++;
      this.log(`${COLORS.RED}✗ FAILED: ${testName}${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`, COLORS.RED);

      if (this.verbose) {
        console.error(error);
      }
      return null;
    }
  }

  async setupEnvironment() {
    this.log(`\n${COLORS.BRIGHT}=== ENVIRONMENT SETUP ===${COLORS.RESET}`);

    this.signers = await ethers.getSigners();
    if (this.signers.length === 0) {
      throw new Error("No signers available");
    }

    await this.runTest("Check network gas price", async () => {
      const gasPrice = (await this.provider.getFeeData()).gasPrice;
      const blockNumber = await this.provider.getBlockNumber();
      const block = await this.provider.getBlock(blockNumber);

      return {
        currentGasPrice: gasPrice.toString(),
        gasPriceInGwei: ethers.formatUnits(gasPrice, "gwei"),
        blockNumber,
        blockGasLimit: block.gasLimit.toString(),
        blockGasUsed: block.gasUsed.toString(),
        blockUtilization:
          ((block.gasUsed * 100n) / block.gasLimit).toString() + "%",
      };
    });

    // Deploy test contracts for gas estimation
    await this.deployTestContracts();
  }

  async deployTestContracts() {
    await this.runTest("Deploy test contracts", async () => {
      // Deploy TestContract
      const TestContract = await ethers.getContractFactory("TestContract");
      const deployTx = await TestContract.getDeployTransaction();

      // Estimate deployment gas
      const deployGasEstimate = await this.provider.estimateGas(deployTx);

      // Deploy the contract
      const testContract = await TestContract.deploy();
      await testContract.waitForDeployment();
      const contractAddress = await testContract.getAddress();

      // Get actual deployment transaction
      const actualDeployTx = testContract.deploymentTransaction();
      const actualDeployReceipt = await actualDeployTx.wait();

      this.contracts.testContract = testContract;

      return {
        contractAddress,
        estimatedDeployGas: deployGasEstimate.toString(),
        actualDeployGas: actualDeployReceipt.gasUsed.toString(),
        deployGasAccuracy: this.calculateAccuracy(
          deployGasEstimate,
          actualDeployReceipt.gasUsed
        ),
        codeSize: (await this.provider.getCode(contractAddress)).length,
      };
    });

    // Deploy ERC20 if possible
    try {
      await this.runTest("Deploy ERC20 test contract", async () => {
        const TestERC20 = await ethers.getContractFactory("TestERC20");
        const deployGasEstimate = await this.provider.estimateGas(
          await TestERC20.getDeployTransaction(
            "Test Token",
            "TEST",
            18,
            1000000
          )
        );

        const testERC20 = await TestERC20.deploy(
          "Test Token",
          "TEST",
          18,
          1000000
        );
        const deployReceipt = await testERC20.waitForDeployment();
        const contractAddress = await testERC20.getAddress();

        const actualDeployTx = testERC20.deploymentTransaction();
        const actualDeployReceipt = await actualDeployTx.wait();

        this.contracts.testERC20 = testERC20;

        return {
          contractAddress,
          estimatedDeployGas: deployGasEstimate.toString(),
          actualDeployGas: actualDeployReceipt.gasUsed.toString(),
          deployGasAccuracy: this.calculateAccuracy(
            deployGasEstimate,
            actualDeployReceipt.gasUsed
          ),
        };
      });
    } catch (error) {
      this.log(
        `${COLORS.YELLOW}ERC20 deployment failed: ${error.message}${COLORS.RESET}`
      );
    }
  }

  calculateAccuracy(estimated, actual) {
    const diff = estimated > actual ? estimated - actual : actual - estimated;
    const percentage = (diff * 100n) / actual;
    const overEstimated = estimated > actual;

    return {
      accurate: diff <= (actual * 5n) / 100n, // Within 5%
      overEstimated,
      underEstimated: !overEstimated,
      differenceWei: diff.toString(),
      differencePercentage: percentage.toString() + "%",
    };
  }

  async testBasicTransferGasEstimation() {
    this.log(
      `\n${COLORS.BRIGHT}=== BASIC TRANSFER GAS ESTIMATION ===${COLORS.RESET}`
    );

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test basic EOA to EOA transfer
    await this.runTest("EOA to EOA transfer gas estimation", async () => {
      const transferAmount = ethers.parseEther("0.001");

      const gasEstimate = await this.provider.estimateGas({
        from: sender.address,
        to: recipient.address,
        value: transferAmount,
      });

      // Execute the transaction to compare
      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: transferAmount,
      });
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      this.gasEstimations.push({
        type: "eoa_transfer",
        estimated: gasEstimate.toString(),
        actual: receipt.gasUsed.toString(),
        accuracy,
      });

      return {
        transferAmount: transferAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
        standardTransferGas: "21000",
        isStandardGas: receipt.gasUsed.toString() === "21000",
      };
    });

    // Test different transfer amounts
    const amounts = [
      1n, // 1 wei
      ethers.parseUnits("1", "gwei"), // 1 gwei
      ethers.parseEther("0.1"), // 0.1 ETH
      ethers.parseEther("10"), // 10 ETH
    ];

    for (const amount of amounts) {
      await this.runTest(
        `Gas estimation for ${ethers.formatEther(amount)} ETH transfer`,
        async () => {
          const gasEstimate = await this.provider.estimateGas({
            from: sender.address,
            to: recipient.address,
            value: amount,
          });

          return {
            amount: amount.toString(),
            amountInEth: ethers.formatEther(amount),
            gasEstimate: gasEstimate.toString(),
            shouldBeStandard: gasEstimate.toString() === "21000",
          };
        }
      );
    }

    // Test gas estimation with different gas prices
    await this.runTest("Gas estimation with different gas prices", async () => {
      const currentGasPrice = (await this.provider.getFeeData()).gasPrice;
      const gasPrices = [
        currentGasPrice / 2n,
        currentGasPrice,
        currentGasPrice * 2n,
      ];

      const results = [];
      for (const gasPrice of gasPrices) {
        const gasEstimate = await this.provider.estimateGas({
          from: sender.address,
          to: recipient.address,
          value: ethers.parseEther("0.001"),
          gasPrice: gasPrice,
        });

        results.push({
          gasPrice: gasPrice.toString(),
          gasPriceInGwei: ethers.formatUnits(gasPrice, "gwei"),
          gasEstimate: gasEstimate.toString(),
        });
      }

      return {
        results,
        gasPriceAffectsEstimation:
          new Set(results.map((r) => r.gasEstimate)).size > 1,
      };
    });
  }

  async testContractCallGasEstimation() {
    this.log(
      `\n${COLORS.BRIGHT}=== CONTRACT CALL GAS ESTIMATION ===${COLORS.RESET}`
    );

    if (!this.contracts.testContract) {
      this.log(
        `${COLORS.YELLOW}Skipping contract call tests - TestContract not available${COLORS.RESET}`
      );
      return;
    }

    const contract = this.contracts.testContract;
    const sender = this.signers[0];

    // Test view function gas estimation
    await this.runTest("View function gas estimation", async () => {
      try {
        const gasEstimate = await contract.getCounter.estimateGas();
        return {
          function: "getCounter",
          type: "view",
          gasEstimate: gasEstimate.toString(),
          note: "View functions usually don't consume gas when called",
        };
      } catch (error) {
        return {
          function: "getCounter",
          type: "view",
          result: "Gas estimation not available for view functions",
          error: error.message,
        };
      }
    });

    // Test pure function gas estimation
    await this.runTest("Pure function gas estimation", async () => {
      try {
        const gasEstimate = await contract.add.estimateGas(123, 456);
        return {
          function: "add",
          type: "pure",
          gasEstimate: gasEstimate.toString(),
          note: "Pure functions usually don't consume gas when called",
        };
      } catch (error) {
        return {
          function: "add",
          type: "pure",
          result: "Gas estimation not available for pure functions",
          error: error.message,
        };
      }
    });

    // Test state-changing functions
    const stateChangingTests = [
      { func: "incrementCounter", args: [], description: "increment counter" },
      {
        func: "incrementCounterBy",
        args: [10],
        description: "increment counter by 10",
      },
      {
        func: "setMessage",
        args: ["Test message"],
        description: "set message",
      },
      { func: "addToArray", args: [42], description: "add to array" },
    ];

    for (const test of stateChangingTests) {
      await this.runTest(
        `State-changing function: ${test.description}`,
        async () => {
          const gasEstimate = await contract[test.func].estimateGas(
            ...test.args
          );

          // Execute the transaction to compare
          const tx = await contract[test.func](...test.args);
          const receipt = await tx.wait();

          const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

          this.gasEstimations.push({
            type: "contract_call",
            function: test.func,
            estimated: gasEstimate.toString(),
            actual: receipt.gasUsed.toString(),
            accuracy,
          });

          return {
            function: test.func,
            description: test.description,
            estimatedGas: gasEstimate.toString(),
            actualGas: receipt.gasUsed.toString(),
            accuracy,
          };
        }
      );
    }

    // Test payable function gas estimation
    await this.runTest("Payable function gas estimation", async () => {
      const depositAmount = ethers.parseEther("0.01");
      const gasEstimate = await contract.deposit.estimateGas({
        value: depositAmount,
      });

      const tx = await contract.deposit({ value: depositAmount });
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      return {
        function: "deposit",
        type: "payable",
        value: depositAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
      };
    });

    // Test complex function gas estimation
    await this.runTest("Complex function gas estimation", async () => {
      const iterations = 50;
      const gasEstimate = await contract.gasIntensiveLoop.estimateGas(
        iterations
      );

      const tx = await contract.gasIntensiveLoop(iterations);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      return {
        function: "gasIntensiveLoop",
        iterations,
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        gasPerIteration: (receipt.gasUsed / BigInt(iterations)).toString(),
        accuracy,
      };
    });
  }

  async testERC20GasEstimation() {
    this.log(`\n${COLORS.BRIGHT}=== ERC20 GAS ESTIMATION ===${COLORS.RESET}`);

    if (!this.contracts.testERC20) {
      this.log(
        `${COLORS.YELLOW}Skipping ERC20 tests - TestERC20 not available${COLORS.RESET}`
      );
      return;
    }

    const token = this.contracts.testERC20;
    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test ERC20 transfer gas estimation
    await this.runTest("ERC20 transfer gas estimation", async () => {
      const transferAmount = ethers.parseUnits("100", 18);
      const gasEstimate = await token.transfer.estimateGas(
        recipient.address,
        transferAmount
      );

      const tx = await token.transfer(recipient.address, transferAmount);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      this.gasEstimations.push({
        type: "erc20_transfer",
        estimated: gasEstimate.toString(),
        actual: receipt.gasUsed.toString(),
        accuracy,
      });

      return {
        function: "transfer",
        amount: transferAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
      };
    });

    // Test ERC20 approve gas estimation
    await this.runTest("ERC20 approve gas estimation", async () => {
      const approveAmount = ethers.parseUnits("1000", 18);
      const gasEstimate = await token.approve.estimateGas(
        recipient.address,
        approveAmount
      );

      const tx = await token.approve(recipient.address, approveAmount);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      return {
        function: "approve",
        amount: approveAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
      };
    });

    // Test ERC20 transferFrom gas estimation
    if (this.signers.length > 1) {
      await this.runTest("ERC20 transferFrom gas estimation", async () => {
        const transferAmount = ethers.parseUnits("50", 18);
        const tokenAsRecipient = token.connect(this.signers[1]);

        const gasEstimate = await tokenAsRecipient.transferFrom.estimateGas(
          sender.address,
          this.signers[1].address,
          transferAmount
        );

        const tx = await tokenAsRecipient.transferFrom(
          sender.address,
          this.signers[1].address,
          transferAmount
        );
        const receipt = await tx.wait();

        const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

        return {
          function: "transferFrom",
          amount: transferAmount.toString(),
          estimatedGas: gasEstimate.toString(),
          actualGas: receipt.gasUsed.toString(),
          accuracy,
        };
      });
    }

    // Test ERC20 mint gas estimation
    await this.runTest("ERC20 mint gas estimation", async () => {
      const mintAmount = ethers.parseUnits("1000", 18);
      const gasEstimate = await token.mint.estimateGas(
        sender.address,
        mintAmount
      );

      const tx = await token.mint(sender.address, mintAmount);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      return {
        function: "mint",
        amount: mintAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
      };
    });

    // Test ERC20 burn gas estimation
    await this.runTest("ERC20 burn gas estimation", async () => {
      const burnAmount = ethers.parseUnits("100", 18);
      const gasEstimate = await token.burn.estimateGas(burnAmount);

      const tx = await token.burn(burnAmount);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);

      return {
        function: "burn",
        amount: burnAmount.toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        accuracy,
      };
    });
  }

  async testBatchOperationGasEstimation() {
    this.log(
      `\n${COLORS.BRIGHT}=== BATCH OPERATION GAS ESTIMATION ===${COLORS.RESET}`
    );

    if (!this.contracts.testERC20 || this.signers.length < 3) {
      this.log(
        `${COLORS.YELLOW}Skipping batch tests - need ERC20 contract and multiple signers${COLORS.RESET}`
      );
      return;
    }

    const token = this.contracts.testERC20;
    const recipients = this.signers.slice(1, 4).map((s) => s.address);
    const amounts = recipients.map(() => ethers.parseUnits("10", 18));

    // Test batch transfer gas estimation
    await this.runTest("Batch transfer gas estimation", async () => {
      const gasEstimate = await token.batchTransfer.estimateGas(
        recipients,
        amounts
      );

      const tx = await token.batchTransfer(recipients, amounts);
      const receipt = await tx.wait();

      const accuracy = this.calculateAccuracy(gasEstimate, receipt.gasUsed);
      const gasPerTransfer = receipt.gasUsed / BigInt(recipients.length);

      return {
        function: "batchTransfer",
        recipientCount: recipients.length,
        totalAmount: amounts.reduce((a, b) => a + b, 0n).toString(),
        estimatedGas: gasEstimate.toString(),
        actualGas: receipt.gasUsed.toString(),
        gasPerTransfer: gasPerTransfer.toString(),
        accuracy,
      };
    });

    // Compare with individual transfers
    await this.runTest(
      "Individual vs batch transfer gas comparison",
      async () => {
        const individualGasEstimates = [];

        for (let i = 0; i < recipients.length; i++) {
          const gasEstimate = await token.transfer.estimateGas(
            recipients[i],
            amounts[i]
          );
          individualGasEstimates.push(gasEstimate);
        }

        const totalIndividualGas = individualGasEstimates.reduce(
          (a, b) => a + b,
          0n
        );
        const batchGasEstimate = await token.batchTransfer.estimateGas(
          recipients,
          amounts
        );

        const savings = totalIndividualGas - batchGasEstimate;
        const savingsPercentage = (savings * 100n) / totalIndividualGas;

        return {
          individualTransfers: recipients.length,
          totalIndividualGas: totalIndividualGas.toString(),
          batchGas: batchGasEstimate.toString(),
          gasSavings: savings.toString(),
          savingsPercentage: savingsPercentage.toString() + "%",
          efficiency:
            savings > 0n ? "batch more efficient" : "individual more efficient",
        };
      }
    );
  }

  async testEdgeCaseGasEstimation() {
    this.log(
      `\n${COLORS.BRIGHT}=== EDGE CASE GAS ESTIMATION ===${COLORS.RESET}`
    );

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test gas estimation for failing transactions
    await this.runTest("Gas estimation for failing transaction", async () => {
      try {
        // Try to estimate gas for a transaction that would fail
        const balance = await this.provider.getBalance(sender.address);
        const excessiveAmount = balance + ethers.parseEther("1000");

        const gasEstimate = await this.provider.estimateGas({
          from: sender.address,
          to: recipient.address,
          value: excessiveAmount,
        });

        return {
          result: "Gas estimation succeeded for failing tx",
          gasEstimate: gasEstimate.toString(),
          note: "Some networks may allow gas estimation even for failing transactions",
        };
      } catch (error) {
        return {
          result: "Gas estimation correctly failed",
          error: error.message,
          note: "Expected behavior for insufficient balance",
        };
      }
    });

    // Test gas estimation with very high gas price
    await this.runTest("Gas estimation with very high gas price", async () => {
      const highGasPrice = ethers.parseUnits("1000", "gwei"); // 1000 gwei

      try {
        const gasEstimate = await this.provider.estimateGas({
          from: sender.address,
          to: recipient.address,
          value: ethers.parseEther("0.001"),
          gasPrice: highGasPrice,
        });

        return {
          gasPrice: highGasPrice.toString(),
          gasPriceInGwei: ethers.formatUnits(highGasPrice, "gwei"),
          gasEstimate: gasEstimate.toString(),
          result: "High gas price accepted",
        };
      } catch (error) {
        return {
          gasPrice: highGasPrice.toString(),
          result: "High gas price rejected",
          error: error.message,
        };
      }
    });

    // Test gas estimation with very low gas price
    await this.runTest("Gas estimation with very low gas price", async () => {
      const lowGasPrice = 1n; // 1 wei

      try {
        const gasEstimate = await this.provider.estimateGas({
          from: sender.address,
          to: recipient.address,
          value: ethers.parseEther("0.001"),
          gasPrice: lowGasPrice,
        });

        return {
          gasPrice: lowGasPrice.toString(),
          gasEstimate: gasEstimate.toString(),
          result: "Low gas price accepted",
        };
      } catch (error) {
        return {
          gasPrice: lowGasPrice.toString(),
          result: "Low gas price rejected",
          error: error.message,
        };
      }
    });

    // Test gas estimation to non-existent address
    await this.runTest("Gas estimation to non-existent address", async () => {
      const nonExistentAddress = "0x" + "1".repeat(40);

      const gasEstimate = await this.provider.estimateGas({
        from: sender.address,
        to: nonExistentAddress,
        value: ethers.parseEther("0.001"),
      });

      return {
        to: nonExistentAddress,
        gasEstimate: gasEstimate.toString(),
        shouldBeStandard: gasEstimate.toString() === "21000",
      };
    });
  }

  async testEIP1559GasEstimation() {
    this.log(
      `\n${COLORS.BRIGHT}=== EIP-1559 GAS ESTIMATION ===${COLORS.RESET}`
    );

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test fee history
    await this.runTest("Fee history analysis", async () => {
      try {
        const feeHistory = await this.provider.send("eth_feeHistory", [
          "0x4", // 4 blocks
          "latest",
          [25, 50, 75], // percentiles
        ]);

        const hasBaseFee = !!feeHistory.baseFeePerGas;
        const hasReward = !!feeHistory.reward;

        return {
          supportsEIP1559: hasBaseFee,
          blockCount: feeHistory.baseFeePerGas?.length || 0,
          baseFeePerGas:
            feeHistory.baseFeePerGas?.map((fee) => fee.toString()) || [],
          reward: feeHistory.reward || [],
          gasUsedRatio: feeHistory.gasUsedRatio || [],
        };
      } catch (error) {
        return {
          supportsEIP1559: false,
          result: "EIP-1559 not supported",
          error: error.message,
        };
      }
    });

    // Test max priority fee per gas
    await this.runTest("Max priority fee per gas", async () => {
      try {
        const maxPriorityFee = await this.provider.send(
          "eth_maxPriorityFeePerGas",
          []
        );
        return {
          maxPriorityFeePerGas: maxPriorityFee,
          maxPriorityFeeInGwei: ethers.formatUnits(maxPriorityFee, "gwei"),
        };
      } catch (error) {
        return {
          result: "Max priority fee not supported",
          error: error.message,
        };
      }
    });

    // Test EIP-1559 transaction gas estimation
    await this.runTest("EIP-1559 transaction gas estimation", async () => {
      try {
        const gasEstimate = await this.provider.estimateGas({
          from: sender.address,
          to: recipient.address,
          value: ethers.parseEther("0.001"),
          type: 2, // EIP-1559 transaction type
        });

        // Try to get current base fee
        const block = await this.provider.getBlock("latest");
        const baseFeePerGas = block.baseFeePerGas;

        return {
          gasEstimate: gasEstimate.toString(),
          transactionType: "EIP-1559",
          baseFeePerGas: baseFeePerGas?.toString() || "not available",
          baseFeeInGwei: baseFeePerGas
            ? ethers.formatUnits(baseFeePerGas, "gwei")
            : "not available",
        };
      } catch (error) {
        return {
          result: "EIP-1559 gas estimation failed",
          error: error.message,
          note: "Network may not support EIP-1559",
        };
      }
    });
  }

  async testGasEstimationAccuracy() {
    this.log(
      `\n${COLORS.BRIGHT}=== GAS ESTIMATION ACCURACY ANALYSIS ===${COLORS.RESET}`
    );

    const accurateEstimations = this.gasEstimations.filter(
      (e) => e.accuracy.accurate
    );
    const overEstimations = this.gasEstimations.filter(
      (e) => e.accuracy.overEstimated
    );
    const underEstimations = this.gasEstimations.filter(
      (e) => e.accuracy.underEstimated
    );

    await this.runTest("Gas estimation accuracy summary", async () => {
      const totalEstimations = this.gasEstimations.length;
      const accuracyRate =
        totalEstimations > 0
          ? (accurateEstimations.length / totalEstimations) * 100
          : 0;

      // Calculate average difference
      const totalDifference = this.gasEstimations.reduce((sum, est) => {
        const diff =
          BigInt(est.estimated) > BigInt(est.actual)
            ? BigInt(est.estimated) - BigInt(est.actual)
            : BigInt(est.actual) - BigInt(est.estimated);
        return sum + diff;
      }, 0n);

      const averageDifference =
        totalEstimations > 0 ? totalDifference / BigInt(totalEstimations) : 0n;

      return {
        totalEstimations,
        accurateEstimations: accurateEstimations.length,
        overEstimations: overEstimations.length,
        underEstimations: underEstimations.length,
        accuracyRate: accuracyRate.toFixed(2) + "%",
        averageDifference: averageDifference.toString(),
        estimationTypes: this.gasEstimations.reduce((types, est) => {
          types[est.type] = (types[est.type] || 0) + 1;
          return types;
        }, {}),
      };
    });

    // Analyze by transaction type
    const typeAnalysis = {};
    for (const estimation of this.gasEstimations) {
      if (!typeAnalysis[estimation.type]) {
        typeAnalysis[estimation.type] = {
          total: 0,
          accurate: 0,
          overEstimated: 0,
          underEstimated: 0,
        };
      }

      typeAnalysis[estimation.type].total++;
      if (estimation.accuracy.accurate)
        typeAnalysis[estimation.type].accurate++;
      if (estimation.accuracy.overEstimated)
        typeAnalysis[estimation.type].overEstimated++;
      if (estimation.accuracy.underEstimated)
        typeAnalysis[estimation.type].underEstimated++;
    }

    await this.runTest("Gas estimation by transaction type", async () => {
      const results = {};
      for (const [type, data] of Object.entries(typeAnalysis)) {
        results[type] = {
          total: data.total,
          accuracyRate:
            data.total > 0
              ? ((data.accurate / data.total) * 100).toFixed(2) + "%"
              : "0%",
          overEstimatedRate:
            data.total > 0
              ? ((data.overEstimated / data.total) * 100).toFixed(2) + "%"
              : "0%",
          underEstimatedRate:
            data.total > 0
              ? ((data.underEstimated / data.total) * 100).toFixed(2) + "%"
              : "0%",
        };
      }
      return results;
    });
  }

  async generateGasReport() {
    this.log(`\n${COLORS.BRIGHT}=== GAS ESTIMATION REPORT ===${COLORS.RESET}`);

    const totalEstimations = this.gasEstimations.length;
    if (totalEstimations === 0) {
      this.log(`${COLORS.YELLOW}No gas estimations recorded${COLORS.RESET}`);
      return {};
    }

    const accurateEstimations = this.gasEstimations.filter(
      (e) => e.accuracy.accurate
    );
    const overEstimations = this.gasEstimations.filter(
      (e) => e.accuracy.overEstimated
    );

    // Calculate statistics
    const totalEstimatedGas = this.gasEstimations.reduce(
      (sum, est) => sum + BigInt(est.estimated),
      0n
    );
    const totalActualGas = this.gasEstimations.reduce(
      (sum, est) => sum + BigInt(est.actual),
      0n
    );

    const report = {
      totalEstimations,
      accurateEstimations: accurateEstimations.length,
      overEstimations: overEstimations.length,
      underEstimations: this.gasEstimations.length - overEstimations.length,
      accuracyRate:
        ((accurateEstimations.length / totalEstimations) * 100).toFixed(2) +
        "%",
      totalEstimatedGas: totalEstimatedGas.toString(),
      totalActualGas: totalActualGas.toString(),
      estimationEfficiency:
        totalEstimatedGas > totalActualGas
          ? "Over-estimated"
          : totalEstimatedGas < totalActualGas
          ? "Under-estimated"
          : "Perfect",
      averageEstimated: (
        totalEstimatedGas / BigInt(totalEstimations)
      ).toString(),
      averageActual: (totalActualGas / BigInt(totalEstimations)).toString(),
    };

    this.log(`Total Gas Estimations: ${totalEstimations}`);
    this.log(
      `Accurate Estimations: ${accurateEstimations.length} (${report.accuracyRate})`
    );
    this.log(`Over-estimations: ${overEstimations.length}`);
    this.log(`Under-estimations: ${report.underEstimations}`);
    this.log(`Total Estimated Gas: ${totalEstimatedGas.toString()}`);
    this.log(`Total Actual Gas: ${totalActualGas.toString()}`);

    return report;
  }

  async runAllTests() {
    this.log(
      `${COLORS.BRIGHT}${COLORS.BLUE}Starting comprehensive gas estimation testing...${COLORS.RESET}`
    );

    const startTime = Date.now();

    await this.setupEnvironment();
    await this.testBasicTransferGasEstimation();
    await this.testContractCallGasEstimation();
    await this.testERC20GasEstimation();
    await this.testBatchOperationGasEstimation();
    await this.testEdgeCaseGasEstimation();
    await this.testEIP1559GasEstimation();
    await this.testGasEstimationAccuracy();

    const duration = Date.now() - startTime;
    const report = await this.generateGasReport();

    this.log(
      `\n${COLORS.BRIGHT}=== GAS ESTIMATION TEST SUMMARY ===${COLORS.RESET}`
    );
    this.log(`${COLORS.GREEN}Passed: ${this.results.passed}${COLORS.RESET}`);
    this.log(`${COLORS.RED}Failed: ${this.results.failed}${COLORS.RESET}`);
    this.log(`${COLORS.CYAN}Total: ${this.results.total}${COLORS.RESET}`);
    this.log(`${COLORS.YELLOW}Duration: ${duration}ms${COLORS.RESET}`);

    const successRate = (
      (this.results.passed / this.results.total) *
      100
    ).toFixed(1);
    this.log(`${COLORS.BRIGHT}Success Rate: ${successRate}%${COLORS.RESET}`);

    // Log deployed contract addresses
    if (Object.keys(this.contracts).length > 0) {
      this.log(`\n${COLORS.CYAN}Deployed Contracts:${COLORS.RESET}`);
      for (const [name, contract] of Object.entries(this.contracts)) {
        if (contract) {
          this.log(`${name}: ${await contract.getAddress()}`);
        }
      }
    }

    return {
      passed: this.results.passed,
      failed: this.results.failed,
      total: this.results.total,
      successRate: parseFloat(successRate),
      duration,
      gasReport: report,
      contracts: {},
    };
  }
}

async function main() {
  try {
    const tester = new GasEstimationTester();
    const results = await tester.runAllTests();

    // Exit with error code if too many tests failed
    if (results.successRate < 70) {
      console.log(
        `\n${COLORS.RED}Warning: Success rate below 70%. Some tests may have failed.${COLORS.RESET}`
      );
      process.exit(1);
    }

    console.log(
      `\n${COLORS.GREEN}Gas estimation testing completed successfully!${COLORS.RESET}`
    );
  } catch (error) {
    console.error(
      `${COLORS.RED}Fatal error during gas estimation testing:${COLORS.RESET}`,
      error
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { GasEstimationTester };
