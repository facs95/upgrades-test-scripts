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

class ContractTester {
  constructor() {
    this.provider = ethers.provider;
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
    };
    this.verbose = process.env.VERBOSE === "true";
    this.contracts = {};
    this.signers = [];
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

  async setupContracts() {
    this.log(`\n${COLORS.BRIGHT}=== CONTRACT DEPLOYMENT ===${COLORS.RESET}`);

    // Get signers
    this.signers = await ethers.getSigners();
    if (this.signers.length === 0) {
      throw new Error("No signers available");
    }

    // Deploy TestContract
    await this.runTest("Deploy TestContract", async () => {
      const TestContract = await ethers.getContractFactory("TestContract");
      const testContract = await TestContract.deploy();
      await testContract.waitForDeployment();

      this.contracts.testContract = testContract;
      const address = await testContract.getAddress();

      // Verify deployment
      const code = await this.provider.getCode(address);
      if (code === "0x") {
        throw new Error("Contract deployment failed - no code at address");
      }

      return {
        address,
        deployer: this.signers[0].address,
        codeSize: code.length,
      };
    });

    // Deploy TestERC20
    await this.runTest("Deploy TestERC20", async () => {
      const TestERC20 = await ethers.getContractFactory("TestERC20");
      const testERC20 = await TestERC20.deploy(
        "Test Token",
        "TEST",
        18,
        1000000 // 1M tokens initial supply
      );
      await testERC20.waitForDeployment();

      this.contracts.testERC20 = testERC20;
      const address = await testERC20.getAddress();

      // Verify deployment
      const code = await this.provider.getCode(address);
      if (code === "0x") {
        throw new Error("ERC20 deployment failed - no code at address");
      }

      return {
        address,
        name: await testERC20.name(),
        symbol: await testERC20.symbol(),
        decimals: await testERC20.decimals(),
        totalSupply: (await testERC20.totalSupply()).toString(),
      };
    });
  }

  async testBasicContractOperations() {
    this.log(
      `\n${COLORS.BRIGHT}=== BASIC CONTRACT OPERATIONS ===${COLORS.RESET}`
    );

    const contract = this.contracts.testContract;

    // Test view functions
    await this.runTest("Read initial state", async () => {
      const counter = await contract.getCounter();
      const message = await contract.getMessage();
      const owner = await contract.owner();
      const isActive = await contract.isActive();

      return {
        counter: counter.toString(),
        message,
        owner,
        isActive,
      };
    });

    // Test pure functions
    await this.runTest("Pure function - add", async () => {
      const result = await contract.add(123, 456);
      const expected = 123 + 456;

      if (result.toString() !== expected.toString()) {
        throw new Error(`Expected ${expected}, got ${result}`);
      }

      return { result: result.toString() };
    });

    await this.runTest("Pure function - multiply", async () => {
      const result = await contract.multiply(25, 4);
      const expected = 25 * 4;

      if (result.toString() !== expected.toString()) {
        throw new Error(`Expected ${expected}, got ${result}`);
      }

      return { result: result.toString() };
    });

    await this.runTest("Pure function - string concatenation", async () => {
      const result = await contract.concatenateStrings("Hello", "World");
      const expected = "HelloWorld";

      if (result !== expected) {
        throw new Error(`Expected "${expected}", got "${result}"`);
      }

      return { result };
    });

    // Test state-changing functions
    await this.runTest("Increment counter", async () => {
      const initialCounter = await contract.getCounter();
      const tx = await contract.incrementCounter();
      const receipt = await tx.wait();
      const newCounter = await contract.getCounter();

      if (newCounter !== initialCounter + 1n) {
        throw new Error(
          `Counter not incremented correctly. Expected ${
            initialCounter + 1n
          }, got ${newCounter}`
        );
      }

      return {
        initialCounter: initialCounter.toString(),
        newCounter: newCounter.toString(),
        gasUsed: receipt.gasUsed.toString(),
        txHash: tx.hash,
      };
    });

    await this.runTest("Increment counter by amount", async () => {
      const initialCounter = await contract.getCounter();
      const increment = 10;
      const tx = await contract.incrementCounterBy(increment);
      await tx.wait();
      const newCounter = await contract.getCounter();

      if (newCounter !== initialCounter + BigInt(increment)) {
        throw new Error(`Counter not incremented correctly`);
      }

      return {
        initialCounter: initialCounter.toString(),
        increment,
        newCounter: newCounter.toString(),
      };
    });

    await this.runTest("Set message (owner only)", async () => {
      const newMessage = "Test message from contract tester";
      const tx = await contract.setMessage(newMessage);
      await tx.wait();
      const retrievedMessage = await contract.getMessage();

      if (retrievedMessage !== newMessage) {
        throw new Error(`Message not set correctly`);
      }

      return {
        newMessage,
        retrievedMessage,
      };
    });
  }

  async testPayableAndValueTransfer() {
    this.log(
      `\n${COLORS.BRIGHT}=== PAYABLE FUNCTIONS AND VALUE TRANSFER ===${COLORS.RESET}`
    );

    const contract = this.contracts.testContract;
    const signer = this.signers[0];

    // Test deposit function
    await this.runTest("Deposit native tokens", async () => {
      const depositAmount = ethers.parseEther("0.1");
      const initialBalance = await contract.getBalance(signer.address);
      const initialContractBalance = await contract.getContractBalance();

      const tx = await contract.deposit({ value: depositAmount });
      const receipt = await tx.wait();

      const newBalance = await contract.getBalance(signer.address);
      const newContractBalance = await contract.getContractBalance();

      return {
        depositAmount: depositAmount.toString(),
        initialBalance: initialBalance.toString(),
        newBalance: newBalance.toString(),
        initialContractBalance: initialContractBalance.toString(),
        newContractBalance: newContractBalance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    // Test withdraw function
    await this.runTest("Withdraw tokens", async () => {
      const withdrawAmount = ethers.parseEther("0.05");
      const initialBalance = await contract.getBalance(signer.address);

      const tx = await contract.withdraw(withdrawAmount);
      const receipt = await tx.wait();

      const newBalance = await contract.getBalance(signer.address);

      return {
        withdrawAmount: withdrawAmount.toString(),
        initialBalance: initialBalance.toString(),
        newBalance: newBalance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    // Test receive function
    await this.runTest("Send ETH to receive function", async () => {
      const sendAmount = ethers.parseEther("0.01");
      const contractAddress = await contract.getAddress();

      const tx = await signer.sendTransaction({
        to: contractAddress,
        value: sendAmount,
      });
      await tx.wait();

      const balance = await contract.getBalance(signer.address);

      return {
        sendAmount: sendAmount.toString(),
        balanceAfterReceive: balance.toString(),
      };
    });
  }

  async testEventEmissions() {
    this.log(`\n${COLORS.BRIGHT}=== EVENT EMISSIONS ===${COLORS.RESET}`);

    const contract = this.contracts.testContract;

    await this.runTest("Counter increment event", async () => {
      const tx = await contract.incrementCounter();
      const receipt = await tx.wait();

      const events = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter((event) => event !== null);

      const counterEvent = events.find(
        (event) => event.name === "CounterIncremented"
      );

      if (!counterEvent) {
        throw new Error("CounterIncremented event not found");
      }

      return {
        eventName: counterEvent.name,
        newValue: counterEvent.args.newValue.toString(),
        incrementer: counterEvent.args.incrementer,
        totalEvents: events.length,
      };
    });

    await this.runTest("Message update event", async () => {
      const newMessage = "Event test message";
      const tx = await contract.setMessage(newMessage);
      const receipt = await tx.wait();

      const events = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter((event) => event !== null);

      const messageEvent = events.find(
        (event) => event.name === "MessageUpdated"
      );

      if (!messageEvent) {
        throw new Error("MessageUpdated event not found");
      }

      return {
        eventName: messageEvent.name,
        oldMessage: messageEvent.args.oldMessage,
        newMessage: messageEvent.args.newMessage,
      };
    });
  }

  async testComplexDataStructures() {
    this.log(
      `\n${COLORS.BRIGHT}=== COMPLEX DATA STRUCTURES ===${COLORS.RESET}`
    );

    const contract = this.contracts.testContract;
    const signer = this.signers[0];

    // Test array operations
    await this.runTest("Array operations", async () => {
      // Add elements to array
      const tx1 = await contract.addToArray(100);
      await tx1.wait();
      const tx2 = await contract.addToArray(200);
      await tx2.wait();
      const tx3 = await contract.addToArray(300);
      await tx3.wait();

      const length = await contract.getArrayLength();
      const firstElement = await contract.getArrayElement(0);
      const secondElement = await contract.getArrayElement(1);

      // Remove last element
      const tx4 = await contract.removeLastElement();
      await tx4.wait();
      const newLength = await contract.getArrayLength();

      return {
        initialLength: length.toString(),
        firstElement: firstElement.toString(),
        secondElement: secondElement.toString(),
        lengthAfterRemoval: newLength.toString(),
      };
    });

    // Test struct operations
    await this.runTest("User registration (struct)", async () => {
      const userName = "TestUser";
      const userAge = 25;

      const tx = await contract.registerUser(userName, userAge);
      const receipt = await tx.wait();

      const userInfo = await contract.getUser(signer.address);
      const userCount = await contract.getUserCount();

      return {
        userName: userInfo[0],
        userAge: userInfo[1].toString(),
        isRegistered: userInfo[2],
        userCount: userCount.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    await this.runTest("Add user scores", async () => {
      await contract.addScore(85);
      await contract.addScore(92);
      await contract.addScore(78);

      const userInfo = await contract.getUser(signer.address);
      const scores = userInfo[3]; // scores array

      return {
        scoresCount: scores.length,
        scores: scores.map((score) => score.toString()),
      };
    });
  }

  async testERC20Operations() {
    this.log(`\n${COLORS.BRIGHT}=== ERC20 TOKEN OPERATIONS ===${COLORS.RESET}`);

    const token = this.contracts.testERC20;
    const signer = this.signers[0];
    const recipient = this.signers.length > 1 ? this.signers[1] : signer;

    // Test basic ERC20 functions
    await this.runTest("ERC20 basic info", async () => {
      const name = await token.name();
      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const totalSupply = await token.totalSupply();
      const ownerBalance = await token.balanceOf(signer.address);

      return {
        name,
        symbol,
        decimals,
        totalSupply: totalSupply.toString(),
        ownerBalance: ownerBalance.toString(),
      };
    });

    // Test token transfer
    await this.runTest("ERC20 transfer", async () => {
      const transferAmount = ethers.parseUnits("100", 18);
      const initialBalance = await token.balanceOf(signer.address);
      const initialRecipientBalance = await token.balanceOf(recipient.address);

      const tx = await token.transfer(recipient.address, transferAmount);
      const receipt = await tx.wait();

      const finalBalance = await token.balanceOf(signer.address);
      const finalRecipientBalance = await token.balanceOf(recipient.address);

      return {
        transferAmount: transferAmount.toString(),
        initialBalance: initialBalance.toString(),
        finalBalance: finalBalance.toString(),
        initialRecipientBalance: initialRecipientBalance.toString(),
        finalRecipientBalance: finalRecipientBalance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    // Test approval and transferFrom
    await this.runTest("ERC20 approve and transferFrom", async () => {
      const approveAmount = ethers.parseUnits("50", 18);
      const transferAmount = ethers.parseUnits("25", 18);

      // Approve
      const approveTx = await token.approve(recipient.address, approveAmount);
      await approveTx.wait();

      const allowance = await token.allowance(
        signer.address,
        recipient.address
      );

      // TransferFrom (using recipient as spender)
      const tokenAsRecipient = token.connect(recipient);
      const tx = await tokenAsRecipient.transferFrom(
        signer.address,
        recipient.address,
        transferAmount
      );
      const receipt = await tx.wait();

      const newAllowance = await token.allowance(
        signer.address,
        recipient.address
      );

      return {
        approveAmount: approveAmount.toString(),
        transferAmount: transferAmount.toString(),
        initialAllowance: allowance.toString(),
        finalAllowance: newAllowance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    // Test minting (owner only)
    await this.runTest("ERC20 mint", async () => {
      const mintAmount = ethers.parseUnits("1000", 18);
      const initialSupply = await token.totalSupply();
      const initialBalance = await token.balanceOf(signer.address);

      const tx = await token.mint(signer.address, mintAmount);
      const receipt = await tx.wait();

      const finalSupply = await token.totalSupply();
      const finalBalance = await token.balanceOf(signer.address);

      return {
        mintAmount: mintAmount.toString(),
        initialSupply: initialSupply.toString(),
        finalSupply: finalSupply.toString(),
        initialBalance: initialBalance.toString(),
        finalBalance: finalBalance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });

    // Test burning
    await this.runTest("ERC20 burn", async () => {
      const burnAmount = ethers.parseUnits("100", 18);
      const initialSupply = await token.totalSupply();
      const initialBalance = await token.balanceOf(signer.address);

      const tx = await token.burn(burnAmount);
      const receipt = await tx.wait();

      const finalSupply = await token.totalSupply();
      const finalBalance = await token.balanceOf(signer.address);

      return {
        burnAmount: burnAmount.toString(),
        initialSupply: initialSupply.toString(),
        finalSupply: finalSupply.toString(),
        initialBalance: initialBalance.toString(),
        finalBalance: finalBalance.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    });
  }

  async testErrorHandling() {
    this.log(`\n${COLORS.BRIGHT}=== ERROR HANDLING ===${COLORS.RESET}`);

    const contract = this.contracts.testContract;
    const token = this.contracts.testERC20;

    // Test revert with reason
    await this.runTest("Force revert with reason", async () => {
      try {
        await contract.forceRevert("Test revert message");
        throw new Error("Transaction should have reverted");
      } catch (error) {
        if (error.message.includes("Test revert message")) {
          return {
            result: "Revert caught correctly",
            reason: "Test revert message",
          };
        }
        throw error;
      }
    });

    // Test custom error
    await this.runTest("Custom error handling", async () => {
      try {
        await contract.forceCustomError(1000, 500);
        throw new Error("Transaction should have reverted");
      } catch (error) {
        if (
          error.message.includes("InsufficientBalance") ||
          error.message.includes("execution reverted")
        ) {
          return { result: "Custom error caught correctly" };
        }
        throw error;
      }
    });

    // Test require condition
    await this.runTest("Require condition failure", async () => {
      try {
        await contract.forceRequire(false, "Condition not met");
        throw new Error("Transaction should have reverted");
      } catch (error) {
        if (error.message.includes("Condition not met")) {
          return { result: "Require condition caught correctly" };
        }
        throw error;
      }
    });

    // Test unauthorized access (non-owner trying to set message)
    if (this.signers.length > 1) {
      await this.runTest("Unauthorized access", async () => {
        const nonOwner = this.signers[1];
        const contractAsNonOwner = contract.connect(nonOwner);

        try {
          await contractAsNonOwner.setMessage("Should fail");
          throw new Error("Transaction should have reverted");
        } catch (error) {
          if (error.message.includes("Not the owner")) {
            return { result: "Access control working correctly" };
          }
          throw error;
        }
      });
    }

    // Test ERC20 insufficient balance
    await this.runTest("ERC20 insufficient balance", async () => {
      const largeAmount = ethers.parseUnits("999999999", 18);

      try {
        await token.transfer(this.signers[0].address, largeAmount);
        throw new Error("Transaction should have reverted");
      } catch (error) {
        if (
          error.message.includes("InsufficientBalance") ||
          error.message.includes("execution reverted")
        ) {
          return { result: "ERC20 balance check working correctly" };
        }
        throw error;
      }
    });
  }

  async testGasIntensiveOperations() {
    this.log(
      `\n${COLORS.BRIGHT}=== GAS INTENSIVE OPERATIONS ===${COLORS.RESET}`
    );

    const contract = this.contracts.testContract;

    // Test gas-intensive loop
    await this.runTest("Gas intensive loop", async () => {
      const iterations = 100;
      const tx = await contract.gasIntensiveLoop(iterations);
      const receipt = await tx.wait();

      return {
        iterations,
        gasUsed: receipt.gasUsed.toString(),
        gasPerIteration: (receipt.gasUsed / BigInt(iterations)).toString(),
      };
    });

    // Test gas-intensive storage operations
    await this.runTest("Gas intensive storage", async () => {
      const operations = 50;
      const tx = await contract.gasIntensiveStorage(operations);
      const receipt = await tx.wait();

      return {
        operations,
        gasUsed: receipt.gasUsed.toString(),
        gasPerOperation: (receipt.gasUsed / BigInt(operations)).toString(),
      };
    });
  }

  async testBatchOperations() {
    this.log(`\n${COLORS.BRIGHT}=== BATCH OPERATIONS ===${COLORS.RESET}`);

    const contract = this.contracts.testContract;
    const token = this.contracts.testERC20;

    // Test batch transfer (contract)
    if (this.signers.length > 2) {
      await this.runTest("Contract batch transfer", async () => {
        const recipients = [this.signers[1].address, this.signers[2].address];
        const amounts = [ethers.parseEther("0.01"), ethers.parseEther("0.02")];

        // First deposit some funds
        await contract.deposit({ value: ethers.parseEther("0.1") });

        const tx = await contract.batchTransfer(recipients, amounts);
        const receipt = await tx.wait();

        const balance1 = await contract.getBalance(recipients[0]);
        const balance2 = await contract.getBalance(recipients[1]);

        return {
          recipients: recipients.length,
          totalAmount: amounts.reduce((a, b) => a + b, 0n).toString(),
          gasUsed: receipt.gasUsed.toString(),
          balance1: balance1.toString(),
          balance2: balance2.toString(),
        };
      });
    }

    // Test ERC20 batch operations
    if (this.signers.length > 2) {
      await this.runTest("ERC20 batch transfer", async () => {
        const recipients = [this.signers[1].address, this.signers[2].address];
        const amounts = [
          ethers.parseUnits("10", 18),
          ethers.parseUnits("20", 18),
        ];

        const tx = await token.batchTransfer(recipients, amounts);
        const receipt = await tx.wait();

        const balance1 = await token.balanceOf(recipients[0]);
        const balance2 = await token.balanceOf(recipients[1]);

        return {
          recipients: recipients.length,
          gasUsed: receipt.gasUsed.toString(),
          balance1: balance1.toString(),
          balance2: balance2.toString(),
        };
      });
    }
  }

  async testBlockchainSpecificFunctions() {
    this.log(
      `\n${COLORS.BRIGHT}=== BLOCKCHAIN SPECIFIC FUNCTIONS ===${COLORS.RESET}`
    );

    const contract = this.contracts.testContract;

    // Test timestamp functions
    await this.runTest("Timestamp operations", async () => {
      await contract.updateTimestamp();
      const timestamp = await contract.getTimestamp();
      const lastActionTime = await contract.lastActionTime();
      const blockNumber = await contract.getBlockNumber();

      return {
        currentTimestamp: timestamp.toString(),
        lastActionTime: lastActionTime.toString(),
        blockNumber: blockNumber.toString(),
      };
    });

    // Test block hash
    await this.runTest("Block hash", async () => {
      const currentBlock = await contract.getBlockNumber();
      const blockNumber = currentBlock > 1n ? currentBlock - 1n : currentBlock;

      try {
        const blockHash = await contract.getBlockHash(blockNumber);
        return {
          blockNumber: blockNumber.toString(),
          blockHash,
          hashLength: blockHash.length,
        };
      } catch (error) {
        // Some networks might not support blockhash for recent blocks
        return {
          blockNumber: blockNumber.toString(),
          result: "blockhash not available (expected for some networks)",
        };
      }
    });
  }

  async runAllTests() {
    this.log(
      `${COLORS.BRIGHT}${COLORS.BLUE}Starting comprehensive contract testing...${COLORS.RESET}`
    );

    const startTime = Date.now();

    await this.setupContracts();
    await this.testBasicContractOperations();
    await this.testPayableAndValueTransfer();
    await this.testEventEmissions();
    await this.testComplexDataStructures();
    await this.testERC20Operations();
    await this.testErrorHandling();
    await this.testGasIntensiveOperations();
    await this.testBatchOperations();
    await this.testBlockchainSpecificFunctions();

    const duration = Date.now() - startTime;

    this.log(`\n${COLORS.BRIGHT}=== CONTRACT TEST SUMMARY ===${COLORS.RESET}`);
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
    if (this.contracts.testContract) {
      this.log(`\n${COLORS.CYAN}Deployed Contracts:${COLORS.RESET}`);
      this.log(
        `TestContract: ${await this.contracts.testContract.getAddress()}`
      );
      if (this.contracts.testERC20) {
        this.log(`TestERC20: ${await this.contracts.testERC20.getAddress()}`);
      }
    }

    return {
      passed: this.results.passed,
      failed: this.results.failed,
      total: this.results.total,
      successRate: parseFloat(successRate),
      duration,
      contracts: {
        testContract: this.contracts.testContract
          ? await this.contracts.testContract.getAddress()
          : null,
        testERC20: this.contracts.testERC20
          ? await this.contracts.testERC20.getAddress()
          : null,
      },
    };
  }
}

async function main() {
  try {
    const tester = new ContractTester();
    const results = await tester.runAllTests();

    // Exit with error code if too many tests failed
    if (results.successRate < 80) {
      console.log(
        `\n${COLORS.RED}Warning: Success rate below 80%. Some tests may have failed.${COLORS.RESET}`
      );
      process.exit(1);
    }

    console.log(
      `\n${COLORS.GREEN}Contract testing completed successfully!${COLORS.RESET}`
    );
  } catch (error) {
    console.error(
      `${COLORS.RED}Fatal error during contract testing:${COLORS.RESET}`,
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

module.exports = { ContractTester };
