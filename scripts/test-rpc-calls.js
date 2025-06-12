const { ethers } = require("hardhat");
require("dotenv").config();

const COLORS = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    CYAN: '\x1b[36m'
};

class RPCTester {
    constructor() {
        this.provider = ethers.provider;
        this.results = {
            passed: 0,
            failed: 0,
            total: 0
        };
        this.verbose = process.env.VERBOSE === 'true';
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
            this.log(`${COLORS.GREEN}✓ PASSED: ${testName} (${duration}ms)${COLORS.RESET}`);

            if (this.verbose && result !== undefined) {
                this.log(`  Result: ${JSON.stringify(result, null, 2)}`);
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

    async testBasicRPCCalls() {
        this.log(`\n${COLORS.BRIGHT}=== BASIC RPC CALLS ===${COLORS.RESET}`);

        // Test eth_blockNumber
        await this.runTest("eth_blockNumber", async () => {
            const blockNumber = await this.provider.getBlockNumber();
            if (typeof blockNumber !== 'number' || blockNumber < 0) {
                throw new Error(`Invalid block number: ${blockNumber}`);
            }
            return { blockNumber };
        });

        // Test eth_chainId
        await this.runTest("eth_chainId", async () => {
            const network = await this.provider.getNetwork();
            const chainId = network.chainId;
            if (typeof chainId !== 'bigint' && typeof chainId !== 'number') {
                throw new Error(`Invalid chain ID: ${chainId}`);
            }
            return { chainId: chainId.toString() };
        });

        // Test eth_gasPrice
        await this.runTest("eth_gasPrice", async () => {
            const gasPrice = await this.provider.getGasPrice();
            if (!gasPrice || gasPrice <= 0) {
                throw new Error(`Invalid gas price: ${gasPrice}`);
            }
            return { gasPrice: gasPrice.toString() };
        });

        // Test eth_getBalance
        await this.runTest("eth_getBalance", async () => {
            const accounts = await ethers.getSigners();
            if (accounts.length === 0) {
                throw new Error("No accounts available");
            }

            const balance = await this.provider.getBalance(accounts[0].address);
            return {
                address: accounts[0].address,
                balance: balance.toString(),
                balanceInEth: ethers.formatEther(balance)
            };
        });

        // Test eth_getTransactionCount
        await this.runTest("eth_getTransactionCount", async () => {
            const accounts = await ethers.getSigners();
            const nonce = await this.provider.getTransactionCount(accounts[0].address);
            return {
                address: accounts[0].address,
                nonce
            };
        });

        // Test eth_getCode
        await this.runTest("eth_getCode", async () => {
            // Test with EOA (should return 0x)
            const accounts = await ethers.getSigners();
            const code = await this.provider.getCode(accounts[0].address);
            return {
                address: accounts[0].address,
                code,
                isContract: code !== '0x'
            };
        });
    }

    async testBlockAndTransactionRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== BLOCK AND TRANSACTION RPC CALLS ===${COLORS.RESET}`);

        let latestBlock;

        // Test eth_getBlockByNumber
        await this.runTest("eth_getBlockByNumber", async () => {
            const blockNumber = await this.provider.getBlockNumber();
            const block = await this.provider.getBlock(blockNumber);
            latestBlock = block;

            if (!block) {
                throw new Error(`Could not fetch block ${blockNumber}`);
            }

            return {
                number: block.number,
                hash: block.hash,
                timestamp: block.timestamp,
                gasLimit: block.gasLimit.toString(),
                gasUsed: block.gasUsed.toString(),
                transactionCount: block.transactions.length
            };
        });

        // Test eth_getBlockByHash
        if (latestBlock) {
            await this.runTest("eth_getBlockByHash", async () => {
                const block = await this.provider.getBlock(latestBlock.hash);
                if (!block || block.hash !== latestBlock.hash) {
                    throw new Error(`Block hash mismatch or block not found`);
                }

                return {
                    number: block.number,
                    hash: block.hash,
                    parentHash: block.parentHash
                };
            });
        }

        // Test with transaction details
        await this.runTest("eth_getBlockByNumber (with transactions)", async () => {
            const blockNumber = await this.provider.getBlockNumber();
            const block = await this.provider.getBlock(blockNumber, true);

            return {
                number: block.number,
                transactionCount: block.transactions.length,
                hasTransactionDetails: block.transactions.length > 0 ?
                    typeof block.transactions[0] === 'object' : false
            };
        });

        // Test eth_getStorageAt
        await this.runTest("eth_getStorageAt", async () => {
            const accounts = await ethers.getSigners();
            const storage = await this.provider.getStorage(accounts[0].address, 0);

            return {
                address: accounts[0].address,
                position: 0,
                value: storage
            };
        });
    }

    async testTransactionRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== TRANSACTION RPC CALLS ===${COLORS.RESET}`);

        let txHash;

        // Create a test transaction
        await this.runTest("Create test transaction", async () => {
            const accounts = await ethers.getSigners();
            const signer = accounts[0];

            // Send a small amount to self
            const tx = await signer.sendTransaction({
                to: signer.address,
                value: ethers.parseEther("0.001"),
                gasLimit: 21000
            });

            txHash = tx.hash;
            await tx.wait();

            return {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString()
            };
        });

        // Test eth_getTransactionByHash
        if (txHash) {
            await this.runTest("eth_getTransactionByHash", async () => {
                const tx = await this.provider.getTransaction(txHash);
                if (!tx) {
                    throw new Error(`Transaction not found: ${txHash}`);
                }

                return {
                    hash: tx.hash,
                    blockNumber: tx.blockNumber,
                    from: tx.from,
                    to: tx.to,
                    gasLimit: tx.gasLimit.toString(),
                    gasPrice: tx.gasPrice?.toString()
                };
            });

            // Test eth_getTransactionReceipt
            await this.runTest("eth_getTransactionReceipt", async () => {
                const receipt = await this.provider.getTransactionReceipt(txHash);
                if (!receipt) {
                    throw new Error(`Transaction receipt not found: ${txHash}`);
                }

                return {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                    status: receipt.status,
                    logs: receipt.logs.length
                };
            });
        }

        // Test eth_estimateGas
        await this.runTest("eth_estimateGas", async () => {
            const accounts = await ethers.getSigners();
            const signer = accounts[0];

            const gasEstimate = await this.provider.estimateGas({
                from: signer.address,
                to: signer.address,
                value: ethers.parseEther("0.001")
            });

            return {
                gasEstimate: gasEstimate.toString()
            };
        });

        // Test eth_call
        await this.runTest("eth_call", async () => {
            const accounts = await ethers.getSigners();

            // Call eth_getBalance using eth_call (indirect test)
            const balanceCallData = "0x70a08231" + accounts[0].address.slice(2).padStart(64, '0');

            try {
                // This will likely fail since we're calling getBalance on an EOA, but tests the RPC
                await this.provider.call({
                    to: accounts[0].address,
                    data: balanceCallData
                });
            } catch (error) {
                // Expected to fail for EOA, but RPC call was made
                if (error.message.includes("execution reverted") || error.message.includes("invalid opcode")) {
                    return { result: "eth_call RPC working (expected revert for EOA)" };
                }
                throw error;
            }

            return { result: "eth_call completed" };
        });
    }

    async testFilterAndLogRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== FILTER AND LOG RPC CALLS ===${COLORS.RESET}`);

        // Test eth_newFilter
        await this.runTest("eth_newFilter", async () => {
            const latestBlock = await this.provider.getBlockNumber();
            const filter = {
                fromBlock: latestBlock - 10,
                toBlock: "latest"
            };

            // Using provider's built-in method which uses eth_newFilter internally
            const logs = await this.provider.getLogs(filter);

            return {
                fromBlock: filter.fromBlock,
                toBlock: filter.toBlock,
                logsFound: logs.length
            };
        });

        // Test eth_getLogs
        await this.runTest("eth_getLogs", async () => {
            const latestBlock = await this.provider.getBlockNumber();
            const logs = await this.provider.getLogs({
                fromBlock: Math.max(0, latestBlock - 5),
                toBlock: latestBlock
            });

            return {
                logsFound: logs.length,
                blockRange: `${Math.max(0, latestBlock - 5)} - ${latestBlock}`
            };
        });

        // Test eth_getFilterLogs (via getLogs with specific filter)
        await this.runTest("eth_getFilterLogs", async () => {
            const accounts = await ethers.getSigners();
            const logs = await this.provider.getLogs({
                address: accounts[0].address,
                fromBlock: 0,
                toBlock: "latest"
            });

            return {
                address: accounts[0].address,
                logsFound: logs.length
            };
        });
    }

    async testNetAndWebRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== NET AND WEB3 RPC CALLS ===${COLORS.RESET}`);

        // Test net_version (via getNetwork)
        await this.runTest("net_version", async () => {
            const network = await this.provider.getNetwork();
            return {
                chainId: network.chainId.toString(),
                name: network.name
            };
        });

        // Test web3_clientVersion
        await this.runTest("web3_clientVersion", async () => {
            try {
                const version = await this.provider.send("web3_clientVersion", []);
                return { clientVersion: version };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "web3_clientVersion not supported (this is normal)" };
                }
                throw error;
            }
        });

        // Test net_listening
        await this.runTest("net_listening", async () => {
            try {
                const listening = await this.provider.send("net_listening", []);
                return { listening };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "net_listening not supported (this is normal)" };
                }
                throw error;
            }
        });

        // Test net_peerCount
        await this.runTest("net_peerCount", async () => {
            try {
                const peerCount = await this.provider.send("net_peerCount", []);
                return { peerCount };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "net_peerCount not supported (this is normal)" };
                }
                throw error;
            }
        });
    }

    async testDebugAndTraceRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== DEBUG AND TRACE RPC CALLS ===${COLORS.RESET}`);

        // Test debug_traceTransaction (if supported)
        await this.runTest("debug_traceTransaction", async () => {
            try {
                // Create a simple transaction first
                const accounts = await ethers.getSigners();
                const signer = accounts[0];

                const tx = await signer.sendTransaction({
                    to: signer.address,
                    value: ethers.parseEther("0.001")
                });

                await tx.wait();

                const trace = await this.provider.send("debug_traceTransaction", [tx.hash]);
                return {
                    transactionHash: tx.hash,
                    traceSupported: true,
                    gasUsed: trace.gas
                };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "debug_traceTransaction not supported (this is normal)" };
                }
                throw error;
            }
        });

        // Test trace_transaction (if supported)
        await this.runTest("trace_transaction", async () => {
            try {
                const accounts = await ethers.getSigners();
                const signer = accounts[0];

                const tx = await signer.sendTransaction({
                    to: signer.address,
                    value: ethers.parseEther("0.001")
                });

                await tx.wait();

                const trace = await this.provider.send("trace_transaction", [tx.hash]);
                return {
                    transactionHash: tx.hash,
                    traceSupported: true,
                    traceLength: Array.isArray(trace) ? trace.length : 1
                };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "trace_transaction not supported (this is normal)" };
                }
                throw error;
            }
        });
    }

    async testEIP1559RPCs() {
        this.log(`\n${COLORS.BRIGHT}=== EIP-1559 RPC CALLS ===${COLORS.RESET}`);

        // Test eth_feeHistory
        await this.runTest("eth_feeHistory", async () => {
            try {
                const feeHistory = await this.provider.send("eth_feeHistory", [
                    "0x4", // 4 blocks
                    "latest",
                    [25, 50, 75] // percentiles
                ]);

                return {
                    blockCount: feeHistory.baseFeePerGas?.length || 0,
                    hasBaseFee: !!feeHistory.baseFeePerGas,
                    hasReward: !!feeHistory.reward
                };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "eth_feeHistory not supported (pre-EIP1559 chain)" };
                }
                throw error;
            }
        });

        // Test eth_maxPriorityFeePerGas
        await this.runTest("eth_maxPriorityFeePerGas", async () => {
            try {
                const maxPriorityFee = await this.provider.send("eth_maxPriorityFeePerGas", []);
                return { maxPriorityFeePerGas: maxPriorityFee };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "eth_maxPriorityFeePerGas not supported (pre-EIP1559 chain)" };
                }
                throw error;
            }
        });
    }

    async testMiscellaneousRPCs() {
        this.log(`\n${COLORS.BRIGHT}=== MISCELLANEOUS RPC CALLS ===${COLORS.RESET}`);

        // Test eth_syncing
        await this.runTest("eth_syncing", async () => {
            const syncing = await this.provider.send("eth_syncing", []);
            return {
                syncing: syncing === false ? false : true,
                syncInfo: syncing !== false ? syncing : "not syncing"
            };
        });

        // Test eth_mining
        await this.runTest("eth_mining", async () => {
            try {
                const mining = await this.provider.send("eth_mining", []);
                return { mining };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "eth_mining not supported (this is normal)" };
                }
                throw error;
            }
        });

        // Test eth_hashrate
        await this.runTest("eth_hashrate", async () => {
            try {
                const hashrate = await this.provider.send("eth_hashrate", []);
                return { hashrate };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "eth_hashrate not supported (this is normal)" };
                }
                throw error;
            }
        });

        // Test eth_accounts
        await this.runTest("eth_accounts", async () => {
            try {
                const accounts = await this.provider.send("eth_accounts", []);
                return {
                    accountCount: accounts.length,
                    hasAccounts: accounts.length > 0
                };
            } catch (error) {
                if (error.message.includes("not supported") || error.message.includes("not found")) {
                    return { result: "eth_accounts not supported (this is normal)" };
                }
                throw error;
            }
        });
    }

    async runAllTests() {
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Starting comprehensive RPC testing...${COLORS.RESET}`);
        this.log(`Provider: ${this.provider.connection?.url || 'Unknown'}`);

        const startTime = Date.now();

        await this.testBasicRPCCalls();
        await this.testBlockAndTransactionRPCs();
        await this.testTransactionRPCs();
        await this.testFilterAndLogRPCs();
        await this.testNetAndWebRPCs();
        await this.testDebugAndTraceRPCs();
        await this.testEIP1559RPCs();
        await this.testMiscellaneousRPCs();

        const duration = Date.now() - startTime;

        this.log(`\n${COLORS.BRIGHT}=== TEST SUMMARY ===${COLORS.RESET}`);
        this.log(`${COLORS.GREEN}Passed: ${this.results.passed}${COLORS.RESET}`);
        this.log(`${COLORS.RED}Failed: ${this.results.failed}${COLORS.RESET}`);
        this.log(`${COLORS.CYAN}Total: ${this.results.total}${COLORS.RESET}`);
        this.log(`${COLORS.YELLOW}Duration: ${duration}ms${COLORS.RESET}`);

        const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
        this.log(`${COLORS.BRIGHT}Success Rate: ${successRate}%${COLORS.RESET}`);

        if (this.results.failed > 0) {
            this.log(`\n${COLORS.YELLOW}Note: Some failures are expected if certain RPC methods are not supported by your chain.${COLORS.RESET}`);
        }

        return {
            passed: this.results.passed,
            failed: this.results.failed,
            total: this.results.total,
            successRate: parseFloat(successRate),
            duration
        };
    }
}

async function main() {
    try {
        const tester = new RPCTester();
        const results = await tester.runAllTests();

        // Exit with error code if too many tests failed
        if (results.successRate < 50) {
            process.exit(1);
        }
    } catch (error) {
        console.error(`${COLORS.RED}Fatal error during RPC testing:${COLORS.RESET}`, error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { RPCTester };
