require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2 || "0x" + "0".repeat(64);
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const CHAIN_ID = process.env.CHAIN_ID || 31337;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: parseInt(CHAIN_ID),
      accounts:
        PRIVATE_KEY !== "0x" + "0".repeat(64)
          ? [PRIVATE_KEY, PRIVATE_KEY_2]
          : [],
    },
    testnet: {
      url: RPC_URL,
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64) ? [PRIVATE_KEY] : [],
      chainId: parseInt(CHAIN_ID),
      gas: "auto",
      gasPrice: "auto",
      timeout: 60000,
    },
    // Add more networks as needed
    custom: {
      url: process.env.CUSTOM_RPC_URL || "http://localhost:8545",
      accounts: process.env.CUSTOM_PRIVATE_KEY
        ? [process.env.CUSTOM_PRIVATE_KEY]
        : [],
      chainId: parseInt(process.env.CUSTOM_CHAIN_ID || "31337"),
      timeout: 60000,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 60000,
  },
};
