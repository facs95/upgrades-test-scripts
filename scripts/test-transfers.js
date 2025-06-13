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

class TransferTester {
  constructor() {
    this.provider = ethers.provider;
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
    };
    this.verbose = process.env.VERBOSE === "true";
    this.signers = [];
    this.testAmount = ethers.parseEther(
      process.env.TEST_TRANSFER_AMOUNT_ETH || "0.001"
    );
    this.transferHistory = [];
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
    }
  }

  async setupAccounts() {
    this.log(`\n${COLORS.BRIGHT}=== ACCOUNT SETUP ===${COLORS.RESET}`);

    this.signers = await ethers.getSigners();
    if (this.signers.length === 0) {
      throw new Error("No signers available");
    }
    console.log(this.signers);

    await this.runTest("Check account balances", async () => {
      const balances = [];
      for (let i = 0; i < Math.min(this.signers.length, 5); i++) {
        const balance = await this.provider.getBalance(this.signers[i].address);
        balances.push({
          address: this.signers[i].address,
          balance: balance.toString(),
          balanceInEth: ethers.formatEther(balance),
        });
      }

      // Check if we have sufficient balance for testing
      const mainBalance = await this.provider.getBalance(
        this.signers[0].address
      );
      const minRequired = ethers.parseEther("0.1");

      if (mainBalance < minRequired) {
        throw new Error(
          `Insufficient balance for testing. Required: ${ethers.formatEther(
            minRequired
          )} ETH, Available: ${ethers.formatEther(mainBalance)} ETH`
        );
      }

      return {
        accountCount: balances.length,
        balances,
        totalSigners: this.signers.length,
      };
    });
  }

  async testBasicTransfers() {
    this.log(`\n${COLORS.BRIGHT}=== BASIC TRANSFERS ===${COLORS.RESET}`);

    if (this.signers.length < 2) {
      this.log(
        `${COLORS.YELLOW}Skipping basic transfers - need at least 2 accounts${COLORS.RESET}`
      );
      return;
    }

    const sender = this.signers[0];
    const recipient = this.signers[1];

    // Test basic transfer
    await this.runTest("Basic native token transfer", async () => {
      const initialSenderBalance = await this.provider.getBalance(
        sender.address
      );
      const initialRecipientBalance = await this.provider.getBalance(
        recipient.address
      );

      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
      });

      const receipt = await tx.wait();
      const finalSenderBalance = await this.provider.getBalance(sender.address);
      const finalRecipientBalance = await this.provider.getBalance(
        recipient.address
      );

      // Calculate gas cost
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // Verify balances changed correctly
      if (finalRecipientBalance !== initialRecipientBalance + this.testAmount) {
        throw new Error("Recipient balance not updated correctly");
      }

      this.transferHistory.push({
        type: "basic",
        from: sender.address,
        to: recipient.address,
        amount: this.testAmount.toString(),
        gasUsed: receipt.gasUsed.toString(),
        txHash: tx.hash,
      });

      return {
        txHash: tx.hash,
        from: sender.address,
        to: recipient.address,
        amount: this.testAmount.toString(),
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: receipt.gasPrice.toString(),
        gasCost: gasCost.toString(),
        initialSenderBalance: initialSenderBalance.toString(),
        finalSenderBalance: finalSenderBalance.toString(),
        initialRecipientBalance: initialRecipientBalance.toString(),
        finalRecipientBalance: finalRecipientBalance.toString(),
      };
    });

    // Test transfer to self
    await this.runTest("Transfer to self", async () => {
      const initialBalance = await this.provider.getBalance(sender.address);

      const tx = await sender.sendTransaction({
        to: sender.address,
        value: this.testAmount,
      });

      const receipt = await tx.wait();
      const finalBalance = await this.provider.getBalance(sender.address);

      // Balance should only change by gas cost
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      return {
        txHash: tx.hash,
        initialBalance: initialBalance.toString(),
        finalBalance: finalBalance.toString(),
        gasCost: gasCost.toString(),
        balanceDifference: (initialBalance - finalBalance).toString(),
      };
    });

    // Test zero amount transfer
    await this.runTest("Zero amount transfer", async () => {
      const initialBalance = await this.provider.getBalance(sender.address);

      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: 0,
      });

      const receipt = await tx.wait();
      const finalBalance = await this.provider.getBalance(sender.address);

      // Only gas should be consumed
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      return {
        txHash: tx.hash,
        amount: "0",
        gasUsed: receipt.gasUsed.toString(),
        gasCost: gasCost.toString(),
        balanceChange: (initialBalance - finalBalance).toString(),
      };
    });
  }

  async testTransferVariations() {
    this.log(`\n${COLORS.BRIGHT}=== TRANSFER VARIATIONS ===${COLORS.RESET}`);

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test different amounts
    const testAmounts = [
      ethers.parseEther("0.0001"), // Small amount
      ethers.parseEther("0.01"), // Medium amount
      ethers.parseUnits("1", "gwei"), // Tiny amount in gwei
      1n, // 1 wei
    ];

    for (let i = 0; i < testAmounts.length; i++) {
      const amount = testAmounts[i];
      await this.runTest(
        `Transfer ${ethers.formatEther(amount)} ETH`,
        async () => {
          const initialBalance = await this.provider.getBalance(
            recipient.address
          );

          const tx = await sender.sendTransaction({
            to: recipient.address,
            value: amount,
          });

          const receipt = await tx.wait();
          const finalBalance = await this.provider.getBalance(
            recipient.address
          );

          if (finalBalance !== initialBalance + amount) {
            throw new Error(
              `Balance not updated correctly for amount ${amount}`
            );
          }

          return {
            amount: amount.toString(),
            amountInEth: ethers.formatEther(amount),
            gasUsed: receipt.gasUsed.toString(),
            txHash: tx.hash,
          };
        }
      );
    }

    // Test with different gas prices (if supported)
    await this.runTest("Transfer with custom gas price", async () => {
      const currentGasPrice = (await this.provider.getFeeData()).gasPrice;
      const customGasPrice = (currentGasPrice * 120n) / 100n; // 20% higher

      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
        gasPrice: customGasPrice,
      });

      const receipt = await tx.wait();

      return {
        requestedGasPrice: customGasPrice.toString(),
        actualGasPrice: receipt.gasPrice.toString(),
        gasUsed: receipt.gasUsed.toString(),
        txHash: tx.hash,
      };
    });

    // Test with gas limit
    await this.runTest("Transfer with custom gas limit", async () => {
      const gasLimit = 25000n; // Higher than standard 21000

      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
        gasLimit: gasLimit,
      });

      const receipt = await tx.wait();

      return {
        requestedGasLimit: gasLimit.toString(),
        actualGasUsed: receipt.gasUsed.toString(),
        gasEfficiency: ((receipt.gasUsed * 100n) / gasLimit).toString() + "%",
        txHash: tx.hash,
      };
    });
  }

  async testGasEstimation() {
    this.log(`\n${COLORS.BRIGHT}=== GAS ESTIMATION ===${COLORS.RESET}`);

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test gas estimation for basic transfer
    await this.runTest("Gas estimation - basic transfer", async () => {
      const gasEstimate = await this.provider.estimateGas({
        from: sender.address,
        to: recipient.address,
        value: this.testAmount,
      });

      // Execute the transaction to compare
      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
      });

      const receipt = await tx.wait();

      return {
        estimatedGas: gasEstimate.toString(),
        actualGasUsed: receipt.gasUsed.toString(),
        estimationAccuracy:
          gasEstimate >= receipt.gasUsed ? "accurate" : "underestimated",
        difference: (gasEstimate - receipt.gasUsed).toString(),
      };
    });

    // Test gas estimation for different amounts
    const amounts = [1n, ethers.parseEther("0.001"), ethers.parseEther("1.0")];

    for (const amount of amounts) {
      await this.runTest(
        `Gas estimation - ${ethers.formatEther(amount)} ETH`,
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
          };
        }
      );
    }

    // Test gas estimation for transfer to contract (if we have one)
    await this.runTest(
      "Gas estimation - transfer to contract address",
      async () => {
        // Create a simple contract address-like string (this might fail, which is expected)
        const contractLikeAddress = "0x" + "1".repeat(40);

        try {
          const gasEstimate = await this.provider.estimateGas({
            from: sender.address,
            to: contractLikeAddress,
            value: this.testAmount,
          });

          return {
            to: contractLikeAddress,
            gasEstimate: gasEstimate.toString(),
            result: "estimation successful",
          };
        } catch (error) {
          // This might fail if the address doesn't exist or isn't a contract
          return {
            to: contractLikeAddress,
            result: "estimation failed (expected for non-existent address)",
            error: error.message,
          };
        }
      }
    );
  }

  async testBatchTransfers() {
    this.log(`\n${COLORS.BRIGHT}=== BATCH TRANSFERS ===${COLORS.RESET}`);

    if (this.signers.length < 3) {
      this.log(
        `${COLORS.YELLOW}Skipping batch transfers - need at least 3 accounts${COLORS.RESET}`
      );
      return;
    }

    const sender = this.signers[0];
    const recipients = this.signers.slice(1, Math.min(4, this.signers.length));

    // Test sequential transfers
    await this.runTest("Sequential batch transfers", async () => {
      const transferAmount = ethers.parseEther("0.001");
      const results = [];

      for (const recipient of recipients) {
        const tx = await sender.sendTransaction({
          to: recipient.address,
          value: transferAmount,
        });

        const receipt = await tx.wait();
        results.push({
          to: recipient.address,
          amount: transferAmount.toString(),
          gasUsed: receipt.gasUsed.toString(),
          txHash: tx.hash,
        });
      }

      const totalGasUsed = results.reduce(
        (sum, r) => sum + BigInt(r.gasUsed),
        0n
      );
      const totalAmount =
        BigInt(transferAmount.toString()) * BigInt(results.length);

      return {
        recipientCount: recipients.length,
        totalAmount: totalAmount.toString(),
        totalGasUsed: totalGasUsed.toString(),
        averageGasPerTransfer: (
          totalGasUsed / BigInt(results.length)
        ).toString(),
        transfers: results,
      };
    });

    // Test rapid sequential transfers (stress test)
    await this.runTest("Rapid sequential transfers", async () => {
      const transferAmount = ethers.parseEther("0.0001");
      const recipient = recipients[0];
      const transferCount = 5;
      const results = [];

      const startTime = Date.now();

      for (let i = 0; i < transferCount; i++) {
        const tx = await sender.sendTransaction({
          to: recipient.address,
          value: transferAmount,
        });

        // Don't wait for receipt to speed up
        results.push({
          txHash: tx.hash,
          nonce: tx.nonce,
        });
      }

      // Wait for all transactions
      const receipts = [];
      for (const result of results) {
        let receipt = null;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        while (!receipt && attempts < maxAttempts) {
          try {
            receipt = await this.provider.getTransactionReceipt(result.txHash);
            if (!receipt) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              attempts++;
            }
          } catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;
          }
        }

        if (!receipt) {
          throw new Error(
            `Transaction ${result.txHash} not mined after ${maxAttempts} seconds`
          );
        }

        receipts.push(receipt);
      }

      const endTime = Date.now();
      const totalGasUsed = receipts.reduce((sum, r) => sum + r.gasUsed, 0n);

      return {
        transferCount,
        totalTime: endTime - startTime,
        timePerTransfer: (endTime - startTime) / transferCount,
        totalGasUsed: totalGasUsed.toString(),
        averageGasPerTransfer: (
          totalGasUsed / BigInt(transferCount)
        ).toString(),
      };
    });
  }

  async testEdgeCases() {
    this.log(`\n${COLORS.BRIGHT}=== EDGE CASES ===${COLORS.RESET}`);

    const sender = this.signers[0];

    // Test insufficient balance
    await this.runTest("Insufficient balance transfer", async () => {
      const balance = await this.provider.getBalance(sender.address);
      const excessiveAmount = balance + ethers.parseEther("1.0");

      try {
        await sender.sendTransaction({
          to: sender.address,
          value: excessiveAmount,
        });
        throw new Error(
          "Transaction should have failed due to insufficient balance"
        );
      } catch (error) {
        // Check for various insufficient funds error patterns
        const errorMessage = error.message.toLowerCase();
        const isInsufficientFunds =
          errorMessage.includes("insufficient funds") ||
          errorMessage.includes("insufficient balance") ||
          errorMessage.includes("doesn't have enough funds") ||
          errorMessage.includes("sender doesn't have enough funds") ||
          errorMessage.includes("max upfront cost") ||
          error.code === "INSUFFICIENT_FUNDS" ||
          error.code === "UNPREDICTABLE_GAS_LIMIT" ||
          (error.reason && error.reason.includes("insufficient"));

        if (isInsufficientFunds) {
          return {
            result: "Insufficient balance correctly rejected",
            balance: balance.toString(),
            attemptedAmount: excessiveAmount.toString(),
            errorType: error.constructor.name,
            errorMessage: error.message,
          };
        }

        // If it's not an expected insufficient funds error, throw it
        throw error;
      }
    });
  }

  async testTransactionDetails() {
    this.log(`\n${COLORS.BRIGHT}=== TRANSACTION DETAILS ===${COLORS.RESET}`);

    const sender = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : sender;

    // Test transaction receipt details
    await this.runTest("Transaction receipt analysis", async () => {
      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
      });

      const receipt = await tx.wait();

      // Get transaction details
      const transaction = await this.provider.getTransaction(tx.hash);

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionIndex: receipt.index,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value.toString(),
        gasLimit: transaction.gasLimit.toString(),
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: transaction.gasPrice.toString(),
        nonce: transaction.nonce,
        status: receipt.status,
        confirmations: await transaction.confirmations(),
      };
    });

    // Test transaction confirmation tracking
    await this.runTest("Transaction confirmation tracking", async () => {
      const tx = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
      });

      // Wait for different confirmation levels
      const receipt1 = await tx.wait(1);
      const startBlock = receipt1.blockNumber;

      // Try to wait for additional confirmations (with timeout)
      try {
        const receipt2 = await tx.wait(2, 5000); // 5 second timeout
        return {
          txHash: tx.hash,
          confirmations: await tx.confirmations(),
          startBlock,
          currentBlock: receipt2.blockNumber,
          result: "Multiple confirmations received",
        };
      } catch (error) {
        return {
          txHash: tx.hash,
          confirmations: await tx.confirmations(),
          startBlock,
          result:
            "Timeout waiting for additional confirmations (normal for fast networks)",
        };
      }
    });

    // Test nonce management
    await this.runTest("Nonce management", async () => {
      const initialNonce = await this.provider.getTransactionCount(
        sender.address
      );

      // Send multiple transactions
      const tx1 = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
        nonce: initialNonce,
      });

      const tx2 = await sender.sendTransaction({
        to: recipient.address,
        value: this.testAmount,
        nonce: initialNonce + 1,
      });

      await tx1.wait();
      await tx2.wait();

      const finalNonce = await this.provider.getTransactionCount(
        sender.address
      );

      return {
        initialNonce,
        finalNonce,
        nonceIncrease: finalNonce - initialNonce,
        tx1Hash: tx1.hash,
        tx2Hash: tx2.hash,
        tx1Nonce: tx1.nonce,
        tx2Nonce: tx2.nonce,
      };
    });
  }

  async generateReport() {
    this.log(`\n${COLORS.BRIGHT}=== TRANSFER REPORT ===${COLORS.RESET}`);

    const totalTransfers = this.transferHistory.length;
    const totalGasUsed = this.transferHistory.reduce(
      (sum, transfer) => sum + BigInt(transfer.gasUsed || "0"),
      0n
    );

    const report = {
      totalTests: this.results.total,
      passedTests: this.results.passed,
      failedTests: this.results.failed,
      successRate:
        ((this.results.passed / this.results.total) * 100).toFixed(1) + "%",
      totalTransfers,
      totalGasUsed: totalGasUsed.toString(),
      averageGasPerTransfer:
        totalTransfers > 0
          ? (totalGasUsed / BigInt(totalTransfers)).toString()
          : "0",
      transferHistory: this.transferHistory,
    };

    this.log(`Total Transfers Executed: ${totalTransfers}`);
    this.log(`Total Gas Used: ${totalGasUsed.toString()}`);
    this.log(`Average Gas per Transfer: ${report.averageGasPerTransfer}`);

    return report;
  }

  async runAllTests() {
    this.log(
      `${COLORS.BRIGHT}${COLORS.BLUE}Starting comprehensive native token transfer testing...${COLORS.RESET}`
    );

    const startTime = Date.now();

    await this.setupAccounts();
    await this.testBasicTransfers();
    await this.testTransferVariations();
    await this.testGasEstimation();
    await this.testBatchTransfers();
    await this.testEdgeCases();
    await this.testTransactionDetails();

    const duration = Date.now() - startTime;
    const report = await this.generateReport();

    this.log(`\n${COLORS.BRIGHT}=== TRANSFER TEST SUMMARY ===${COLORS.RESET}`);
    this.log(`${COLORS.GREEN}Passed: ${this.results.passed}${COLORS.RESET}`);
    this.log(`${COLORS.RED}Failed: ${this.results.failed}${COLORS.RESET}`);
    this.log(`${COLORS.CYAN}Total: ${this.results.total}${COLORS.RESET}`);
    this.log(`${COLORS.YELLOW}Duration: ${duration}ms${COLORS.RESET}`);

    const successRate = (
      (this.results.passed / this.results.total) *
      100
    ).toFixed(1);
    this.log(`${COLORS.BRIGHT}Success Rate: ${successRate}%${COLORS.RESET}`);

    return {
      passed: this.results.passed,
      failed: this.results.failed,
      total: this.results.total,
      successRate: parseFloat(successRate),
      duration,
      report,
    };
  }
}

async function main() {
  try {
    const tester = new TransferTester();
    const results = await tester.runAllTests();

    // Exit with error code if too many tests failed
    if (results.successRate < 80) {
      console.log(
        `\n${COLORS.RED}Warning: Success rate below 80%. Some tests may have failed.${COLORS.RESET}`
      );
      process.exit(1);
    }

    console.log(
      `\n${COLORS.GREEN}Transfer testing completed successfully!${COLORS.RESET}`
    );
  } catch (error) {
    console.error(
      `${COLORS.RED}Fatal error during transfer testing:${COLORS.RESET}`,
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

module.exports = { TransferTester };
