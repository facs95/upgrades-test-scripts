const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { stringToPath } = require("@cosmjs/crypto");
require("dotenv").config();

const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m"
};

class DerivationPathTester {
  constructor() {
    this.mnemonic = process.env.COSMOS_MNEMONIC ||
      "maximum display century economy unlock van census kite error heart snow filter midnight usage egg venture cash kick motor survey drastic edge muffin visual";
    this.prefix = process.env.COSMOS_PREFIX || "realio";
    this.expectedAddress = process.env.EXPECTED_ADDRESS || "realio1jcltmuhplrdcwp7stlr4hlhlhgd4htqh6ftpkj";

    // Common coin types to test
    this.coinTypes = [
      { name: "Cosmos", value: 118 },
      { name: "Ethereum", value: 60 },
      { name: "Kava", value: 459 },
      { name: "Bitcoin", value: 0 },
      { name: "Evmos", value: 60 }, // Same as Ethereum but different implementation sometimes
      { name: "Osmosis", value: 118 }, // Same as Cosmos
    ];

    // Different path patterns to test
    this.pathPatterns = [
      // Standard patterns
      (coinType, account, addressIndex) => `m/44'/${coinType}'/${account}'/0/${addressIndex}`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/${account}'/0'/${addressIndex}'`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/${account}'/0'/${addressIndex}`,

      // Alternative patterns
      (coinType, account, addressIndex) => `m/44'/${coinType}'/0'/0/${addressIndex}`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/0'/0'/${addressIndex}'`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/0'/${addressIndex}/0`,

      // Without hardened account
      (coinType, account, addressIndex) => `m/44'/${coinType}'/0/0/${addressIndex}`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/0/0'/${addressIndex}`,

      // Legacy patterns
      (coinType, account, addressIndex) => `m/44'/${coinType}'/${account}'/${addressIndex}'/0`,
      (coinType, account, addressIndex) => `m/44'/${coinType}'/${account}'/${addressIndex}'/0'`,
    ];
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  async testDerivationPath(derivationPath) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(this.mnemonic, {
        prefix: this.prefix,
        hdPaths: [stringToPath(derivationPath)]
      });

      const accounts = await wallet.getAccounts();
      if (accounts.length === 0) {
        return null;
      }

      return accounts[0].address;
    } catch (error) {
      // Invalid path
      return null;
    }
  }

  async testAllPaths() {
    this.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}=== DERIVATION PATH TESTER ===${COLORS.RESET}`);
    this.log(`\nConfiguration:`);
    this.log(`  Mnemonic: ${this.mnemonic.substring(0, 30)}...`);
    this.log(`  Address Prefix: ${this.prefix}`);
    this.log(`  Expected Address: ${COLORS.YELLOW}${this.expectedAddress}${COLORS.RESET}`);

    let foundMatch = false;
    let totalTests = 0;

    // Test with different accounts (0-2) and address indices (0-9)
    const accounts = [0, 1, 2];
    const addressIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    this.log(`\n${COLORS.BRIGHT}Testing derivation paths...${COLORS.RESET}`);

    for (const coinType of this.coinTypes) {
      this.log(`\n${COLORS.CYAN}--- Testing ${coinType.name} (coin type ${coinType.value}) ---${COLORS.RESET}`);

      for (const pattern of this.pathPatterns) {
        for (const account of accounts) {
          for (const addressIndex of addressIndices) {
            try {
              const derivationPath = pattern(coinType.value, account, addressIndex);
              const generatedAddress = await this.testDerivationPath(derivationPath);

              totalTests++;

              if (generatedAddress) {
                const isMatch = generatedAddress === this.expectedAddress;

                if (isMatch) {
                  this.log(`${COLORS.GREEN}${COLORS.BRIGHT}🎉 MATCH FOUND! 🎉${COLORS.RESET}`);
                  this.log(`  Path: ${COLORS.YELLOW}${derivationPath}${COLORS.RESET}`);
                  this.log(`  Address: ${COLORS.GREEN}${generatedAddress}${COLORS.RESET}`);
                  this.log(`  Coin Type: ${coinType.name} (${coinType.value})`);
                  foundMatch = true;
                } else if (process.env.VERBOSE === 'true') {
                  this.log(`  ${derivationPath} -> ${generatedAddress}`, COLORS.BLUE);
                }
              }
            } catch (error) {
              // Skip invalid paths
            }
          }
        }
      }
    }

    // Test some specific known patterns that might be used by various chains
    this.log(`\n${COLORS.CYAN}--- Testing Known Chain-Specific Patterns ---${COLORS.RESET}`);

    const specificPatterns = [
      // Evmos specific
      "m/44'/60'/0'/0/0",
      "m/44'/60'/0'/0/1",
      "m/44'/60'/1'/0/0",

      // Cosmos Hub
      "m/44'/118'/0'/0/0",
      "m/44'/118'/0'/0/1",
      "m/44'/118'/1'/0/0",

      // Keplr wallet default
      "m/44'/118'/0'/0/0",

      // MetaMask style
      "m/44'/60'/0'/0/0",
      "m/44'/60'/0'/0/1",
      "m/44'/60'/0'/0/2",

      // Ledger patterns
      "m/44'/118'/0'/0/0",
      "m/44'/118'/0'/1/0",
      "m/44'/118'/1'/0/0",

      // Alternative Cosmos patterns
      "m/44'/118'/0/0/0",
      "m/44'/118'/0/0/1",

      // Realio specific guesses
      "m/44'/3301'/0'/0/0", // Using chain ID as coin type
      "m/44'/3301'/0'/0/1",
    ];

    for (const path of specificPatterns) {
      try {
        const generatedAddress = await this.testDerivationPath(path);
        totalTests++;

        if (generatedAddress) {
          const isMatch = generatedAddress === this.expectedAddress;

          if (isMatch) {
            this.log(`${COLORS.GREEN}${COLORS.BRIGHT}🎉 MATCH FOUND! 🎉${COLORS.RESET}`);
            this.log(`  Path: ${COLORS.YELLOW}${path}${COLORS.RESET}`);
            this.log(`  Address: ${COLORS.GREEN}${generatedAddress}${COLORS.RESET}`);
            foundMatch = true;
          } else if (process.env.VERBOSE === 'true') {
            this.log(`  ${path} -> ${generatedAddress}`, COLORS.BLUE);
          }
        }
      } catch (error) {
        // Skip invalid paths
      }
    }

    this.log(`\n${COLORS.BRIGHT}=== RESULTS ===${COLORS.RESET}`);
    this.log(`Total paths tested: ${totalTests}`);

    if (foundMatch) {
      this.log(`${COLORS.GREEN}✓ Found matching derivation path!${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}You can now use this path in your Cosmos SDK tests.${COLORS.RESET}`);
    } else {
      this.log(`${COLORS.RED}✗ No matching derivation path found.${COLORS.RESET}`);
      this.log(`${COLORS.YELLOW}Possible reasons:${COLORS.RESET}`);
      this.log(`  • The mnemonic might be different`);
      this.log(`  • The chain uses a custom derivation method`);
      this.log(`  • The expected address might be wrong`);
      this.log(`  • The address prefix might be different`);
      this.log(`${COLORS.YELLOW}Try running with VERBOSE=true to see all generated addresses${COLORS.RESET}`);
    }

    return foundMatch;
  }

  // Test a specific path if provided
  async testSpecificPath(path) {
    this.log(`${COLORS.BRIGHT}Testing specific path: ${path}${COLORS.RESET}`);

    try {
      const generatedAddress = await this.testDerivationPath(path);

      if (generatedAddress) {
        const isMatch = generatedAddress === this.expectedAddress;

        this.log(`Generated address: ${generatedAddress}`);
        this.log(`Expected address:  ${this.expectedAddress}`);
        this.log(`Match: ${isMatch ? COLORS.GREEN + 'YES' : COLORS.RED + 'NO'}${COLORS.RESET}`);

        return isMatch;
      } else {
        this.log(`${COLORS.RED}Failed to generate address from path${COLORS.RESET}`);
        return false;
      }
    } catch (error) {
      this.log(`${COLORS.RED}Error testing path: ${error.message}${COLORS.RESET}`);
      return false;
    }
  }
}

async function main() {
  const tester = new DerivationPathTester();

  // Check if a specific path was provided as argument
  const specificPath = process.argv[2];

  if (specificPath) {
    const result = await tester.testSpecificPath(specificPath);
    process.exit(result ? 0 : 1);
  } else {
    try {
      const foundMatch = await tester.testAllPaths();
      process.exit(foundMatch ? 0 : 1);
    } catch (error) {
      console.error(`${COLORS.RED}Error: ${error.message}${COLORS.RESET}`);
      process.exit(1);
    }
  }
}

// Show usage if --help is provided
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${COLORS.BRIGHT}Derivation Path Tester${COLORS.RESET}

${COLORS.BRIGHT}Usage:${COLORS.RESET}
  node test-derivation-paths.js [derivation_path]

${COLORS.BRIGHT}Examples:${COLORS.RESET}
  # Test all common derivation paths
  node test-derivation-paths.js

  # Test a specific path
  node test-derivation-paths.js "m/44'/118'/0'/0/0"

  # Test with verbose output
  VERBOSE=true node test-derivation-paths.js

  # Test with custom mnemonic and expected address
  COSMOS_MNEMONIC="your mnemonic here" EXPECTED_ADDRESS="realio1..." node test-derivation-paths.js

${COLORS.BRIGHT}Environment Variables:${COLORS.RESET}
  COSMOS_MNEMONIC      - The mnemonic to test (required)
  EXPECTED_ADDRESS     - The expected address to match
  COSMOS_PREFIX        - Address prefix (default: realio)
  VERBOSE              - Show all generated addresses (default: false)
`);
  process.exit(0);
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DerivationPathTester };
