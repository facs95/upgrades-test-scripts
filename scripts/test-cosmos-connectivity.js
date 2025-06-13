const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { StargateClient, SigningStargateClient } = require("@cosmjs/stargate");
const {
  stringToPath,
  Secp256k1,
  keccak256,
  Bip39,
  Slip10,
  Slip10Curve,
} = require("@cosmjs/crypto");
const { toBech32 } = require("@cosmjs/encoding");
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

class CosmosConnectivityTester {
  constructor() {
    this.rpcUrl = process.env.COSMOS_RPC_URL || "http://localhost:26657";
    this.restUrl = process.env.COSMOS_REST_URL || "http://localhost:1317";
    this.chainId = process.env.COSMOS_CHAIN_ID || "cosmoshub-4";
    this.mnemonic =
      process.env.COSMOS_MNEMONIC ||
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    this.prefix = process.env.COSMOS_PREFIX || "cosmos";
    this.denom = process.env.COSMOS_DENOM || "uatom";

    // Always use Ethereum-style derivation for Cosmos/EVM chains
    this.coinType = 60; // Ethereum derivation
  }

  // Create wallet using Ethereum secp256k1 (eth_secp256k1) compatible with Cosmos/EVM chains
  async createEthSecp256k1Wallet(mnemonic, prefix, addressIndex = 0) {
    // Generate seed from mnemonic
    const seed = await Bip39.mnemonicToSeed(mnemonic);

    // Derive master key with specific address index
    const masterKey = Slip10.derivePath(
      Slip10Curve.Secp256k1,
      seed,
      stringToPath(`m/44'/${this.coinType}'/0'/0/${addressIndex}`)
    );

    // Get private key
    const privkey = masterKey.privkey;

    // Generate public key
    const { pubkey: compressedPubkey } = await Secp256k1.makeKeypair(privkey);

    // Generate Ethereum-style address (keccak256 hash of public key)
    const uncompressedPubkey = Secp256k1.uncompressPubkey(compressedPubkey);
    const addressBytes = keccak256(uncompressedPubkey.slice(1)).slice(-20);

    // Convert to bech32 format with the specified prefix
    const address = toBech32(prefix, addressBytes);

    // Return wallet-like object
    return {
      getAccounts: async () => [
        {
          address: address,
          pubkey: compressedPubkey,
          algo: "secp256k1",
        },
      ],
      privkey: privkey,
    };
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  async testStep(stepName, testFunction) {
    this.log(`\n${COLORS.CYAN}Testing: ${stepName}${COLORS.RESET}`);
    try {
      const result = await testFunction();
      this.log(`${COLORS.GREEN}✓ ${stepName} - SUCCESS${COLORS.RESET}`);
      return result;
    } catch (error) {
      this.log(`${COLORS.RED}✗ ${stepName} - FAILED${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`, COLORS.RED);
      console.error(`  Stack: ${error.stack}`);
      throw error;
    }
  }

  async testHttpConnectivity() {
    // Test RPC endpoint
    await this.testStep("RPC HTTP Connectivity", async () => {
      const response = await fetch(`${this.rpcUrl}/status`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.log(`  RPC Status: ${data.result ? "OK" : "Unknown"}`, COLORS.BLUE);
      this.log(
        `  Node Info: ${data.result?.node_info?.moniker || "Unknown"}`,
        COLORS.BLUE
      );
      return data;
    });

    // Test REST endpoint
    await this.testStep("REST HTTP Connectivity", async () => {
      const response = await fetch(
        `${this.restUrl}/cosmos/base/tendermint/v1beta1/node_info`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.log(`  REST Status: OK`, COLORS.BLUE);
      this.log(
        `  Node Moniker: ${data.default_node_info?.moniker || "Unknown"}`,
        COLORS.BLUE
      );
      return data;
    });
  }

  async testWalletCreation() {
    return await this.testStep("Wallet Creation", async () => {
      this.log(
        `  Using mnemonic: ${this.mnemonic.substring(0, 20)}...`,
        COLORS.BLUE
      );
      this.log(`  Address prefix: ${this.prefix}`, COLORS.BLUE);
      this.log(
        `  Derivation: Ethereum secp256k1 (coin type: ${this.coinType})`,
        COLORS.BLUE
      );

      const wallet = await this.createEthSecp256k1Wallet(
        this.mnemonic,
        this.prefix,
        0
      );

      const accounts = await wallet.getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts generated from mnemonic");
      }

      const address = accounts[0].address;
      this.log(`  Generated address: ${address}`, COLORS.BLUE);
      this.log(
        `  Public key: ${Buffer.from(accounts[0].pubkey).toString("hex")}`,
        COLORS.BLUE
      );

      return { wallet, address };
    });
  }

  async testStargateClient() {
    return await this.testStep("StargateClient Connection", async () => {
      this.log(`  Connecting to: ${this.rpcUrl}`, COLORS.BLUE);

      const client = await StargateClient.connect(this.rpcUrl);

      // Test basic queries
      const chainId = await client.getChainId();
      this.log(`  Connected to chain: ${chainId}`, COLORS.BLUE);

      const height = await client.getHeight();
      this.log(`  Current height: ${height}`, COLORS.BLUE);

      // Disconnect
      client.disconnect();

      return { chainId, height };
    });
  }

  async testSigningClient() {
    return await this.testStep("SigningStargateClient Connection", async () => {
      // Create wallet with Ethereum secp256k1 derivation
      const wallet = await this.createEthSecp256k1Wallet(
        this.mnemonic,
        this.prefix,
        0
      );

      this.log(`  Connecting signing client to: ${this.rpcUrl}`, COLORS.BLUE);

      const signingClient = await SigningStargateClient.connectWithSigner(
        this.rpcUrl,
        wallet
      );

      // Test basic operations
      const chainId = await signingClient.getChainId();
      this.log(`  Signing client connected to: ${chainId}`, COLORS.BLUE);

      const accounts = await wallet.getAccounts();
      const address = accounts[0].address;

      // Test balance query
      try {
        const balance = await signingClient.getBalance(address, this.denom);
        this.log(
          `  Balance query successful: ${balance.amount}${balance.denom}`,
          COLORS.BLUE
        );
      } catch (error) {
        this.log(
          `  Balance query failed (this might be expected): ${error.message}`,
          COLORS.YELLOW
        );
      }

      // Disconnect
      signingClient.disconnect();

      return { chainId, address };
    });
  }

  async testBankQueries() {
    return await this.testStep("Bank Module Queries", async () => {
      const client = await StargateClient.connect(this.rpcUrl);

      const wallet = await this.createEthSecp256k1Wallet(
        this.mnemonic,
        this.prefix,
        0
      );
      const accounts = await wallet.getAccounts();
      const address = accounts[0].address;

      try {
        // Test balance query
        const balance = await client.getBalance(address, this.denom);
        this.log(`  Balance: ${balance.amount}${balance.denom}`, COLORS.BLUE);

        // Test all balances
        const allBalances = await client.getAllBalances(address);
        this.log(`  Total denominations: ${allBalances.length}`, COLORS.BLUE);

        client.disconnect();
        return { balance, allBalances };
      } catch (error) {
        client.disconnect();
        throw error;
      }
    });
  }

  async runAllTests() {
    this.log(
      `${COLORS.BRIGHT}${COLORS.CYAN}=== COSMOS CONNECTIVITY TEST ===${COLORS.RESET}`
    );
    this.log(`\nConfiguration:`);
    this.log(`  RPC URL: ${this.rpcUrl}`);
    this.log(`  REST URL: ${this.restUrl}`);
    this.log(`  Chain ID: ${this.chainId}`);
    this.log(`  Address Prefix: ${this.prefix}`);
    this.log(`  Test Denom: ${this.denom}`);
    this.log(`  Chain Type: Cosmos/EVM`);
    this.log(`  Coin Type: ${this.coinType}`);

    const results = {};

    try {
      // Test 1: HTTP Connectivity
      results.httpConnectivity = await this.testHttpConnectivity();

      // Test 2: Wallet Creation
      results.walletCreation = await this.testWalletCreation();

      // Test 3: StargateClient
      results.stargateClient = await this.testStargateClient();

      // Test 4: SigningStargateClient
      results.signingClient = await this.testSigningClient();

      // Test 5: Bank Queries
      results.bankQueries = await this.testBankQueries();

      this.log(
        `\n${COLORS.GREEN}${COLORS.BRIGHT}🎉 ALL TESTS PASSED! 🎉${COLORS.RESET}`
      );
      this.log(
        `${COLORS.GREEN}Your Cosmos SDK configuration is working correctly.${COLORS.RESET}`
      );

      return results;
    } catch (error) {
      this.log(
        `\n${COLORS.RED}${COLORS.BRIGHT}❌ TESTS FAILED ❌${COLORS.RESET}`
      );
      this.log(
        `${COLORS.RED}Error occurred during: ${error.message}${COLORS.RESET}`
      );

      this.log(
        `\n${COLORS.YELLOW}${COLORS.BRIGHT}🔧 TROUBLESHOOTING TIPS:${COLORS.RESET}`
      );

      if (
        error.message.includes("fetch") ||
        error.message.includes("ECONNREFUSED")
      ) {
        this.log(
          `${COLORS.YELLOW}• Check if your Cosmos node is running${COLORS.RESET}`
        );
        this.log(
          `${COLORS.YELLOW}• Verify RPC_URL and REST_URL are correct${COLORS.RESET}`
        );
        this.log(
          `${COLORS.YELLOW}• Check if ports 26657 (RPC) and 1317 (REST) are accessible${COLORS.RESET}`
        );
      }

      if (
        error.message.includes("accountParser") ||
        error.message.includes("registry")
      ) {
        this.log(
          `${COLORS.YELLOW}• Try updating @cosmjs packages to latest version${COLORS.RESET}`
        );
        this.log(
          `${COLORS.YELLOW}• Check if your chain uses custom account types${COLORS.RESET}`
        );
      }

      if (
        error.message.includes("mnemonic") ||
        error.message.includes("address")
      ) {
        this.log(
          `${COLORS.YELLOW}• Verify COSMOS_MNEMONIC is valid${COLORS.RESET}`
        );
        this.log(
          `${COLORS.YELLOW}• Check if COSMOS_PREFIX matches your chain${COLORS.RESET}`
        );
      }

      this.log(
        `${COLORS.YELLOW}• Enable DEBUG=true for more detailed error information${COLORS.RESET}`
      );

      throw error;
    }
  }
}

async function main() {
  const tester = new CosmosConnectivityTester();

  try {
    await tester.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error(
      `\n${COLORS.RED}Connectivity test failed: ${error.message}${COLORS.RESET}`
    );
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { CosmosConnectivityTester };
