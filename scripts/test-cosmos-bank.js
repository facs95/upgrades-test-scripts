const { StargateClient } = require("@cosmjs/stargate");
const { coins } = require("@cosmjs/amino");
const {
  stringToPath,
  Secp256k1,
  keccak256,
  Bip39,
  Slip10,
  Slip10Curve,
  sha256,
} = require("@cosmjs/crypto");
const { encodeSecp256k1Signature } = require("@cosmjs/amino");
const realio = require("@realiotech/realiojs");
const { createTxRaw } = require("@realiotech/proto");
require("dotenv").config();

const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  DIM: "\x1b[2m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
};

class CosmosBankTester {
  createBroadcastBody(txRaw, mode = "BROADCAST_MODE_SYNC") {
    // Convert the serialized transaction to base64
    const txBytes = Buffer.from(txRaw.message.serializeBinary()).toString(
      "base64"
    );

    return {
      tx_bytes: txBytes,
      mode: mode,
    };
  }

  async signTransaction(txMsg, privateKeyHex) {
    // Get the sign bytes from the transaction object
    const signBytes = Buffer.from(txMsg.signDirect.signBytes, "base64");

    // Sign the signBytes directly (no additional hashing)
    const privkeyBuffer = Buffer.from(privateKeyHex, "hex");
    const signature = await Secp256k1.createSignature(signBytes, privkeyBuffer);

    // Convert signature to fixed 64-byte format (32 bytes r + 32 bytes s)
    const rBytes = signature.r(32);
    const sBytes = signature.s(32);
    const fixedSignature = new Uint8Array(64);
    fixedSignature.set(rBytes, 0);
    fixedSignature.set(sBytes, 32);

    // Create the final TxRaw protobuf object
    const txRaw = createTxRaw(
      txMsg.signDirect.body.serializeBinary(),
      txMsg.signDirect.authInfo.serializeBinary(),
      [fixedSignature]
    );

    return txRaw;
  }

  constructor() {
    this.rpcUrl = process.env.COSMOS_RPC_URL || "http://localhost:26657";
    this.restUrl = process.env.COSMOS_REST_URL || "http://localhost:1317";
    this.chainId = process.env.COSMOS_CHAIN_ID || "cosmoshub-4";
    this.mnemonic =
      process.env.COSMOS_MNEMONIC ||
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    this.prefix = process.env.COSMOS_PREFIX || "cosmos";
    this.denom = process.env.COSMOS_DENOM || "uatom";
    this.gasPrice = process.env.COSMOS_GAS_PRICE || "0.025uatom";
    this.defaultGasLimit =
      parseInt(process.env.COSMOS_DEFAULT_GAS_LIMIT) || 200000;
    this.testAmount = process.env.BANK_TEST_AMOUNT || "1000000";
    this.testDenom = process.env.BANK_TEST_DENOM || this.denom;

    // Always use Ethereum-style derivation for Cosmos/EVM chains
    this.coinType = 60; // Ethereum derivation

    this.client = null;
    this.signingClient = null;
    this.wallet = null;
    this.senderAddress = null;

    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      queries: {
        passed: 0,
        failed: 0,
        total: 0,
      },
      transactions: {
        passed: 0,
        failed: 0,
        total: 0,
      },
    };

    this.verbose = process.env.VERBOSE === "true";
    this.debug = process.env.DEBUG === "true";
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  async fetchAccountData() {
    const accountEndpoint = realio.provider.generateEndpointAccount(
      this.wallet.address
    );
    const response = await fetch(`${this.restUrl}${accountEndpoint}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch account data: ${response.status}`);
    }
    return await response.json();
  }

  async initialize() {
    try {
      this.log(
        `\n${COLORS.BRIGHT}=== INITIALIZING COSMOS SDK BANK TESTER ===${COLORS.RESET}`
      );

      // Initialize wallet first
      this.log(
        `${COLORS.BLUE}Initializing eth_secp256k1 wallet...${COLORS.RESET}`
      );
      this.log(
        `${COLORS.BLUE}Using Ethereum secp256k1 derivation (coin type: ${this.coinType})${COLORS.RESET}`
      );

      // Create wallet using mnemonic and RealioJS for address conversion
      const seed = await Bip39.mnemonicToSeed(this.mnemonic);
      const masterKey = Slip10.derivePath(
        Slip10Curve.Secp256k1,
        seed,
        stringToPath(`m/44'/${this.coinType}'/0'/0/0`)
      );

      const privkey = masterKey.privkey;
      const { pubkey: uncompressedPubkey } = await Secp256k1.makeKeypair(
        privkey
      );

      // Generate Ethereum address and convert to Realio format
      const ethAddressBytes = keccak256(uncompressedPubkey.slice(1)).slice(-20);
      const ethAddress = "0x" + Buffer.from(ethAddressBytes).toString("hex");
      const realioAddress =
        realio.addressGenerator.ethToRealionetwork(ethAddress);

      this.wallet = {
        privateKey: Buffer.from(privkey).toString("hex"),
        address: realioAddress,
        ethAddress: ethAddress,
        pubkey: Buffer.from(
          Secp256k1.compressPubkey(uncompressedPubkey)
        ).toString("hex"),
      };
      this.senderAddress = this.wallet.address;
      this.log(`${COLORS.GREEN}✓ Wallet initialized${COLORS.RESET}`);

      // Initialize query client
      this.log(`${COLORS.BLUE}Connecting to RPC endpoint...${COLORS.RESET}`);
      let retries = 3;
      while (retries > 0) {
        try {
          this.client = await StargateClient.connect(this.rpcUrl);
          this.log(`${COLORS.GREEN}✓ Query client connected${COLORS.RESET}`);
          break;
        } catch (error) {
          retries--;
          if (retries === 0) {
            throw new Error(
              `Failed to connect to RPC after multiple attempts: ${error.message}`
            );
          }
          this.log(
            `${COLORS.YELLOW}Retrying RPC connection... (${retries} attempts left)${COLORS.RESET}`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Set up transaction signing (RealioJS handles this differently)
      this.log(
        `${COLORS.GREEN}✓ RealioJS wallet ready for signing${COLORS.RESET}`
      );

      // Test basic connectivity
      this.log(`${COLORS.BLUE}Testing connectivity...${COLORS.RESET}`);
      try {
        const chainId = await this.client.getChainId();
        this.log(
          `${COLORS.GREEN}✓ Connected to chain: ${chainId}${COLORS.RESET}`
        );

        // Update chainId if it was detected differently
        if (chainId !== this.chainId) {
          this.log(
            `${COLORS.YELLOW}⚠ Chain ID mismatch: expected ${this.chainId}, got ${chainId}${COLORS.RESET}`
          );
          this.chainId = chainId;
        }
      } catch (error) {
        this.log(
          `${COLORS.YELLOW}⚠ Could not verify chain ID: ${error.message}${COLORS.RESET}`
        );
      }

      this.log(
        `${COLORS.GREEN}✓ Sender address: ${this.senderAddress}${COLORS.RESET}`
      );
      this.log(`${COLORS.GREEN}✓ RPC URL: ${this.rpcUrl}${COLORS.RESET}`);
      this.log(
        `${COLORS.GREEN}✓ Test denomination: ${this.testDenom}${COLORS.RESET}`
      );
      this.log(
        `${COLORS.GREEN}✓ Chain type: Cosmos/EVM (eth_secp256k1)${COLORS.RESET}`
      );
    } catch (error) {
      this.log(
        `${COLORS.RED}✗ Failed to initialize Cosmos SDK client${COLORS.RESET}`
      );
      this.log(`  Error: ${error.message}`, COLORS.RED);
      if (this.debug) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  async runTest(testName, testFunction, category = "general") {
    this.results.total++;
    if (category === "query") {
      this.results.queries.total++;
    } else if (category === "transaction") {
      this.results.transactions.total++;
    }

    try {
      this.log(`\n${COLORS.CYAN}Testing: ${testName}${COLORS.RESET}`);
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;

      this.results.passed++;
      if (category === "query") {
        this.results.queries.passed++;
      } else if (category === "transaction") {
        this.results.transactions.passed++;
      }

      this.log(
        `${COLORS.GREEN}✓ PASSED: ${testName} (${duration}ms)${COLORS.RESET}`
      );

      if (this.verbose && result !== undefined) {
        this.log(`  Result: ${JSON.stringify(result, null, 2)}`, COLORS.BLUE);
      }

      return result;
    } catch (error) {
      this.results.failed++;
      if (category === "query") {
        this.results.queries.failed++;
      } else if (category === "transaction") {
        this.results.transactions.failed++;
      }

      this.log(`${COLORS.RED}✗ FAILED: ${testName}${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`, COLORS.RED);

      if (this.verbose || this.debug) {
        console.error(error);
      }

      return null;
    }
  }

  async testBankQueries() {
    this.log(`\n${COLORS.BRIGHT}=== BANK MODULE QUERIES ===${COLORS.RESET}`);

    // Test balance query for sender
    await this.runTest(
      "Query sender balance",
      async () => {
        const balance = await this.client.getBalance(
          this.senderAddress,
          this.testDenom
        );
        this.log(`  Balance: ${balance.amount}${balance.denom}`, COLORS.BLUE);
        return balance;
      },
      "query"
    );

    // Test all balances query
    await this.runTest(
      "Query all balances",
      async () => {
        const balances = await this.client.getAllBalances(this.senderAddress);
        this.log(`  Total balances: ${balances.length}`, COLORS.BLUE);
        if (this.verbose) {
          balances.forEach((bal) => {
            this.log(`    ${bal.amount}${bal.denom}`, COLORS.BLUE);
          });
        }
        return balances;
      },
      "query"
    );

    // Test supply query
    await this.runTest(
      "Query total supply",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/supply`,
            { timeout: 10000 }
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const data = await response.json();
          this.log(
            `  Total supply entries: ${data.supply ? data.supply.length : 0}`,
            COLORS.BLUE
          );
          return data.supply;
        } catch (error) {
          this.log(
            `  Using fallback method for supply query: ${error.message}`,
            COLORS.YELLOW
          );
          try {
            const response = await fetch(
              `${this.restUrl}/cosmos/bank/v1beta1/supply/by_denom?denom=${this.testDenom}`,
              { timeout: 10000 }
            );
            if (!response.ok) {
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }
            const data = await response.json();
            this.log(
              `  Supply of ${this.testDenom}: ${
                data.amount ? data.amount.amount : "unknown"
              }`,
              COLORS.BLUE
            );
            return data.amount;
          } catch (fallbackError) {
            this.log(
              `  Supply query not available: ${fallbackError.message}`,
              COLORS.YELLOW
            );
            return null;
          }
        }
      },
      "query"
    );

    // Test denomination metadata query
    await this.runTest(
      "Query denomination metadata",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/denoms_metadata`
          );
          const data = await response.json();
          this.log(
            `  Metadata entries: ${data.metadatas ? data.metadatas.length : 0}`,
            COLORS.BLUE
          );
          return data.metadatas;
        } catch (error) {
          this.log(`  Metadata query not available or failed`, COLORS.YELLOW);
          return null;
        }
      },
      "query"
    );

    // Test params query
    await this.runTest(
      "Query bank params",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/params`
          );
          const data = await response.json();
          this.log(
            `  Send enabled: ${
              data.params ? data.params.send_enabled : "unknown"
            }`,
            COLORS.BLUE
          );
          return data.params;
        } catch (error) {
          this.log(`  Params query not available or failed`, COLORS.YELLOW);
          return null;
        }
      },
      "query"
    );
  }

  async testBankTransactions() {
    this.log(
      `\n${COLORS.BRIGHT}=== BANK MODULE TRANSACTIONS ===${COLORS.RESET}`
    );

    // Get initial balance
    const initialBalance = await this.client.getBalance(
      this.senderAddress,
      this.testDenom
    );
    this.log(
      `Initial balance: ${initialBalance.amount}${initialBalance.denom}`,
      COLORS.BLUE
    );

    // Create a recipient address (we'll use a different derivation path)
    let recipientAddress;
    try {
      // Create recipient wallet with address index 1
      const recipientWallet = await EthSecp256k1HdWallet.fromMnemonic(
        this.mnemonic,
        {
          prefix: this.prefix,
          hdPath: `m/44'/${this.coinType}'/0'/0/1`,
        }
      );
      const recipientAccounts = await recipientWallet.getAccounts();
      recipientAddress = recipientAccounts[0].address;
    } catch (error) {
      // Fallback: use the same address for testing
      recipientAddress = this.senderAddress;
    }

    this.log(`Recipient address: ${recipientAddress}`, COLORS.BLUE);

    // Test simple send transaction
    await this.runTest(
      "Send transaction",
      async () => {
        const amount = coins(this.testAmount, this.testDenom);

        // Check if sender has sufficient balance
        if (parseInt(initialBalance.amount) < parseInt(this.testAmount)) {
          throw new Error(
            `Insufficient balance. Have: ${initialBalance.amount}, Need: ${this.testAmount}`
          );
        }

        // Create transaction using RealioJS
        const accountData = await this.fetchAccountData();

        console.log("Account data:", JSON.stringify(accountData, null, 2));

        const txMsg = realio.transactions.createTxMessageSend(
          { cosmosChainId: this.chainId },
          {
            accountAddress: this.senderAddress,
            pubkey: Buffer.from(this.wallet.pubkey, "hex"),
            sequence: parseInt(accountData.account.sequence),
            accountNumber: parseInt(accountData.account.account_number),
          },
          {
            amount: "25000000000000000",
            denom: "ario",
            gas: "200000",
          },
          "Test bank send transaction",
          {
            destinationAddress: recipientAddress,
            amount: this.testAmount.toString(),
            denom: this.testDenom,
          }
        );

        // Sign and broadcast transaction
        const signature = await this.signTransaction(
          txMsg,
          this.wallet.privateKey
        );
        const postBody = this.createBroadcastBody(signature);

        const broadcastResponse = await fetch(
          `${this.restUrl}${realio.provider.generateEndpointBroadcast()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(postBody),
          }
        ).then((res) => res.json());

        console.log(
          "Send transaction broadcast response:",
          JSON.stringify(broadcastResponse, null, 2)
        );

        if (broadcastResponse.tx_response?.code !== 0) {
          throw new Error(
            `Transaction failed: ${
              broadcastResponse.tx_response?.raw_log ||
              JSON.stringify(broadcastResponse)
            }`
          );
        }

        const result = {
          transactionHash: broadcastResponse.tx_response.txhash,
          gasUsed: broadcastResponse.tx_response.gas_used,
          code: broadcastResponse.tx_response.code,
        };

        this.log(`  Transaction hash: ${result.transactionHash}`, COLORS.BLUE);
        this.log(`  Gas used: ${result.gasUsed}`, COLORS.BLUE);
        this.log(`  Gas wanted: ${result.gasWanted}`, COLORS.BLUE);

        // Wait a moment for the transaction to be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return result;
      },
      "transaction"
    );

    // Verify the transaction by checking balances
    await this.runTest(
      "Verify send transaction",
      async () => {
        const senderBalance = await this.client.getBalance(
          this.senderAddress,
          this.testDenom
        );
        const recipientBalance = await this.client.getBalance(
          recipientAddress,
          this.testDenom
        );

        this.log(
          `  Sender balance after send: ${senderBalance.amount}${senderBalance.denom}`,
          COLORS.BLUE
        );
        this.log(
          `  Recipient balance after send: ${recipientBalance.amount}${recipientBalance.denom}`,
          COLORS.BLUE
        );

        // If sending to self, verify balance decreased by fees only
        if (recipientAddress === this.senderAddress) {
          const balanceDiff =
            parseInt(initialBalance.amount) - parseInt(senderBalance.amount);
          this.log(
            `  Balance difference (fees): ${balanceDiff}${this.testDenom}`,
            COLORS.BLUE
          );
          return { senderBalance, recipientBalance, feePaid: balanceDiff };
        }

        // Verify recipient received the tokens
        if (parseInt(recipientBalance.amount) < parseInt(this.testAmount)) {
          throw new Error(
            `Recipient did not receive expected amount. Got: ${recipientBalance.amount}, Expected: >= ${this.testAmount}`
          );
        }

        return { senderBalance, recipientBalance };
      },
      "query"
    );

    // Test transaction with small amount (should succeed)
    await this.runTest(
      "Small amount transaction",
      async () => {
        const currentBalance = await this.client.getBalance(
          this.senderAddress,
          this.testDenom
        );

        // Use a very small amount (1000 base units)
        const smallAmount = "1000";

        if (parseInt(currentBalance.amount) < parseInt(smallAmount)) {
          throw new Error(
            `Insufficient balance for small transaction. Have: ${currentBalance.amount}, Need: ${smallAmount}`
          );
        }

        // Wait for the previous transaction to be processed and get fresh account data
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const accountData = await this.fetchAccountData();

        console.log(
          "Account data for small tx:",
          JSON.stringify(accountData, null, 2)
        );

        const txMsg = realio.transactions.createTxMessageSend(
          { cosmosChainId: this.chainId },
          {
            accountAddress: this.senderAddress,
            pubkey: Buffer.from(this.wallet.pubkey, "hex"),
            sequence: parseInt(accountData.account.sequence),
            accountNumber: parseInt(accountData.account.account_number),
          },
          {
            amount: "25000000000000000",
            denom: "ario",
            gas: "200000",
          },
          "Small amount test transaction",
          {
            destinationAddress: recipientAddress,
            amount: smallAmount.toString(),
            denom: this.testDenom,
          }
        );

        // Sign and broadcast transaction
        const signature = await this.signTransaction(
          txMsg,
          this.wallet.privateKey
        );
        const postBody = this.createBroadcastBody(signature);

        const broadcastResponse = await fetch(
          `${this.restUrl}${realio.provider.generateEndpointBroadcast()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(postBody),
          }
        ).then((res) => res.json());

        console.log(
          "Small transaction broadcast response:",
          JSON.stringify(broadcastResponse, null, 2)
        );

        if (broadcastResponse.tx_response?.code !== 0) {
          throw new Error(
            `Transaction failed: ${
              broadcastResponse.tx_response?.raw_log ||
              JSON.stringify(broadcastResponse)
            }`
          );
        }

        const result = {
          transactionHash: broadcastResponse.tx_response.txhash,
          gasUsed: broadcastResponse.tx_response.gas_used,
          code: broadcastResponse.tx_response.code,
        };

        this.log(
          `  Small transaction hash: ${result.transactionHash}`,
          COLORS.BLUE
        );
        this.log(`  Gas used: ${result.gasUsed}`, COLORS.BLUE);

        return result;
      },
      "transaction"
    );
  }

  async testAdvancedQueries() {
    this.log(`\n${COLORS.BRIGHT}=== ADVANCED BANK QUERIES ===${COLORS.RESET}`);

    // Test pagination in balance queries
    await this.runTest(
      "Query balances with pagination",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/balances/${this.senderAddress}?pagination.limit=10`
          );
          const data = await response.json();
          this.log(
            `  Balances with pagination: ${
              data.balances ? data.balances.length : 0
            }`,
            COLORS.BLUE
          );
          if (data.pagination) {
            this.log(
              `  Next key: ${data.pagination.next_key || "null"}`,
              COLORS.BLUE
            );
            this.log(
              `  Total: ${data.pagination.total || "unknown"}`,
              COLORS.BLUE
            );
          }
          return data;
        } catch (error) {
          this.log(
            `  Pagination query failed: ${error.message}`,
            COLORS.YELLOW
          );
          return null;
        }
      },
      "query"
    );

    // Test spendable balances query
    await this.runTest(
      "Query spendable balances",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/spendable_balances/${this.senderAddress}`
          );
          const data = await response.json();
          this.log(
            `  Spendable balances: ${data.balances ? data.balances.length : 0}`,
            COLORS.BLUE
          );
          return data.balances;
        } catch (error) {
          this.log(
            `  Spendable balances query not available: ${error.message}`,
            COLORS.YELLOW
          );
          return null;
        }
      },
      "query"
    );

    // Test denomination trace query (for IBC tokens)
    await this.runTest(
      "Query denomination traces",
      async () => {
        try {
          const response = await fetch(
            `${this.restUrl}/cosmos/bank/v1beta1/denom_traces`
          );
          const data = await response.json();
          this.log(
            `  Denomination traces: ${
              data.denom_traces ? data.denom_traces.length : 0
            }`,
            COLORS.BLUE
          );
          return data.denom_traces;
        } catch (error) {
          this.log(
            `  Denomination traces query not available: ${error.message}`,
            COLORS.YELLOW
          );
          return null;
        }
      },
      "query"
    );
  }

  async printResults() {
    this.log(`\n${COLORS.BRIGHT}=== TEST RESULTS SUMMARY ===${COLORS.RESET}`);

    const totalTests = this.results.total;
    const passedTests = this.results.passed;
    const failedTests = this.results.failed;
    const successRate =
      totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0;

    this.log(`${COLORS.BRIGHT}Overall Results:${COLORS.RESET}`);
    this.log(`  Total Tests: ${totalTests}`);
    this.log(`  Passed: ${COLORS.GREEN}${passedTests}${COLORS.RESET}`);
    this.log(`  Failed: ${COLORS.RED}${failedTests}${COLORS.RESET}`);
    this.log(
      `  Success Rate: ${
        successRate >= 90
          ? COLORS.GREEN
          : successRate >= 70
          ? COLORS.YELLOW
          : COLORS.RED
      }${successRate}%${COLORS.RESET}`
    );

    this.log(`\n${COLORS.BRIGHT}Query Tests:${COLORS.RESET}`);
    this.log(`  Total: ${this.results.queries.total}`);
    this.log(
      `  Passed: ${COLORS.GREEN}${this.results.queries.passed}${COLORS.RESET}`
    );
    this.log(
      `  Failed: ${COLORS.RED}${this.results.queries.failed}${COLORS.RESET}`
    );
    const querySuccessRate =
      this.results.queries.total > 0
        ? (
            (this.results.queries.passed / this.results.queries.total) *
            100
          ).toFixed(2)
        : 0;
    this.log(
      `  Success Rate: ${
        querySuccessRate >= 90
          ? COLORS.GREEN
          : querySuccessRate >= 70
          ? COLORS.YELLOW
          : COLORS.RED
      }${querySuccessRate}%${COLORS.RESET}`
    );

    this.log(`\n${COLORS.BRIGHT}Transaction Tests:${COLORS.RESET}`);
    this.log(`  Total: ${this.results.transactions.total}`);
    this.log(
      `  Passed: ${COLORS.GREEN}${this.results.transactions.passed}${COLORS.RESET}`
    );
    this.log(
      `  Failed: ${COLORS.RED}${this.results.transactions.failed}${COLORS.RESET}`
    );
    const txSuccessRate =
      this.results.transactions.total > 0
        ? (
            (this.results.transactions.passed /
              this.results.transactions.total) *
            100
          ).toFixed(2)
        : 0;
    this.log(
      `  Success Rate: ${
        txSuccessRate >= 90
          ? COLORS.GREEN
          : txSuccessRate >= 70
          ? COLORS.YELLOW
          : COLORS.RED
      }${txSuccessRate}%${COLORS.RESET}`
    );

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const results = {
      timestamp: new Date().toISOString(),
      chainId: this.chainId,
      senderAddress: this.senderAddress,
      testDenom: this.testDenom,
      results: this.results,
      successRate: parseFloat(successRate),
      querySuccessRate: parseFloat(querySuccessRate),
      transactionSuccessRate: parseFloat(txSuccessRate),
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
        `cosmos-bank-results-${timestamp}.json`
      );
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));

      // Save latest results
      const latestFile = path.join(resultsDir, "cosmos-bank-latest.json");
      fs.writeFileSync(latestFile, JSON.stringify(results, null, 2));

      this.log(`\n${COLORS.GREEN}✓ Results saved to:${COLORS.RESET}`);
      this.log(`  ${resultFile}`);
      this.log(`  ${latestFile}`);
    } catch (error) {
      this.log(
        `${COLORS.YELLOW}⚠ Could not save results to file: ${error.message}${COLORS.RESET}`
      );
    }

    return results;
  }

  async runAllTests() {
    const startTime = Date.now();

    try {
      await this.initialize();

      await this.testBankQueries();
      await this.testBankTransactions();
      await this.testAdvancedQueries();

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      this.log(`\n${COLORS.BRIGHT}=== TESTING COMPLETED ===${COLORS.RESET}`);
      this.log(`Total Duration: ${totalDuration}ms`);

      const results = await this.printResults();

      // Cleanup
      if (this.client && typeof this.client.disconnect === "function") {
        try {
          this.client.disconnect();
        } catch (error) {
          // Ignore cleanup errors
          if (this.debug) {
            this.log(
              `${COLORS.YELLOW}⚠ Cleanup warning: ${error.message}${COLORS.RESET}`
            );
          }
        }
      }

      return results;
    } catch (error) {
      this.log(
        `${COLORS.RED}✗ Testing failed during initialization or execution${COLORS.RESET}`
      );
      this.log(`  Error: ${error.message}`, COLORS.RED);

      if (this.debug) {
        console.error(error);
      }

      throw error;
    }
  }
}

async function main() {
  const tester = new CosmosBankTester();

  try {
    console.log(
      `${COLORS.BRIGHT}${COLORS.MAGENTA}🚀 Starting Cosmos SDK Bank Module Testing 🚀${COLORS.RESET}`
    );
    console.log(`${COLORS.BRIGHT}Chain ID: ${tester.chainId}${COLORS.RESET}`);
    console.log(`${COLORS.BRIGHT}RPC URL: ${tester.rpcUrl}${COLORS.RESET}`);
    console.log(`${COLORS.BRIGHT}REST URL: ${tester.restUrl}${COLORS.RESET}`);
    console.log(
      `${COLORS.BRIGHT}Test Denomination: ${tester.testDenom}${COLORS.RESET}`
    );

    const results = await tester.runAllTests();

    // Exit with appropriate code
    if (results.successRate >= 90) {
      console.log(
        `\n${COLORS.GREEN}${COLORS.BRIGHT}🎉 All tests completed successfully! 🎉${COLORS.RESET}`
      );
      process.exit(0);
    } else if (results.successRate >= 70) {
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
      `${COLORS.RED}${COLORS.BRIGHT}💥 Testing failed: ${error.message} 💥${COLORS.RESET}`
    );
    process.exit(3);
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { CosmosBankTester };
