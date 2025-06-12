const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
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

class ContractDeployer {
    constructor() {
        this.provider = ethers.provider;
        this.deployments = {
            contracts: {},
            network: {},
            deployment: {
                timestamp: new Date().toISOString(),
                deployer: null,
                gasUsed: "0",
                totalCost: "0"
            }
        };
        this.verbose = process.env.VERBOSE === 'true';
        this.confirmations = parseInt(process.env.DEPLOY_CONFIRMATIONS || "1");
    }

    log(message, color = COLORS.RESET) {
        console.log(`${color}${message}${COLORS.RESET}`);
    }

    async getNetworkInfo() {
        try {
            const network = await this.provider.getNetwork();
            const blockNumber = await this.provider.getBlockNumber();
            const gasPrice = await this.provider.getGasPrice();

            return {
                name: network.name,
                chainId: network.chainId.toString(),
                blockNumber,
                gasPrice: gasPrice.toString(),
                gasPriceInGwei: ethers.formatUnits(gasPrice, "gwei")
            };
        } catch (error) {
            this.log(`Warning: Could not fetch complete network info: ${error.message}`, COLORS.YELLOW);
            return {
                name: "unknown",
                chainId: "unknown",
                blockNumber: 0,
                gasPrice: "0",
                gasPriceInGwei: "0"
            };
        }
    }

    async estimateDeploymentCost(contractFactory, ...args) {
        try {
            const deployTx = await contractFactory.getDeployTransaction(...args);
            const gasEstimate = await this.provider.estimateGas(deployTx);
            const gasPrice = await this.provider.getGasPrice();
            const estimatedCost = gasEstimate * gasPrice;

            return {
                gasEstimate: gasEstimate.toString(),
                gasPrice: gasPrice.toString(),
                estimatedCost: estimatedCost.toString(),
                estimatedCostInEth: ethers.formatEther(estimatedCost)
            };
        } catch (error) {
            this.log(`Warning: Could not estimate deployment cost: ${error.message}`, COLORS.YELLOW);
            return {
                gasEstimate: "unknown",
                gasPrice: "unknown",
                estimatedCost: "unknown",
                estimatedCostInEth: "unknown"
            };
        }
    }

    async deployContract(contractName, contractFactory, constructorArgs = [], deploymentOptions = {}) {
        this.log(`\n${COLORS.CYAN}Deploying ${contractName}...${COLORS.RESET}`);

        try {
            // Estimate deployment cost
            const costEstimate = await this.estimateDeploymentCost(contractFactory, ...constructorArgs);

            if (this.verbose) {
                this.log(`Estimated gas: ${costEstimate.gasEstimate}`);
                this.log(`Estimated cost: ${costEstimate.estimatedCostInEth} ETH`);
            }

            // Deploy the contract
            const startTime = Date.now();
            const contract = await contractFactory.deploy(...constructorArgs, deploymentOptions);

            this.log(`${COLORS.YELLOW}Deployment transaction sent: ${contract.deploymentTransaction().hash}${COLORS.RESET}`);

            // Wait for deployment
            await contract.waitForDeployment();
            const address = await contract.getAddress();

            // Wait for additional confirmations if specified
            if (this.confirmations > 1) {
                this.log(`${COLORS.YELLOW}Waiting for ${this.confirmations} confirmations...${COLORS.RESET}`);
                const deployTx = contract.deploymentTransaction();
                await deployTx.wait(this.confirmations);
            }

            const deploymentTime = Date.now() - startTime;

            // Get deployment transaction receipt
            const deploymentTx = contract.deploymentTransaction();
            const receipt = await deploymentTx.wait();

            // Verify deployment
            const deployedCode = await this.provider.getCode(address);
            if (deployedCode === '0x') {
                throw new Error(`Deployment failed - no code at address ${address}`);
            }

            // Calculate actual costs
            const actualGasUsed = receipt.gasUsed;
            const actualGasPrice = receipt.gasPrice;
            const actualCost = actualGasUsed * actualGasPrice;

            this.log(`${COLORS.GREEN}✓ ${contractName} deployed successfully!${COLORS.RESET}`);
            this.log(`  Address: ${address}`);
            this.log(`  Gas used: ${actualGasUsed.toString()}`);
            this.log(`  Gas price: ${ethers.formatUnits(actualGasPrice, "gwei")} gwei`);
            this.log(`  Total cost: ${ethers.formatEther(actualCost)} ETH`);
            this.log(`  Deployment time: ${deploymentTime}ms`);

            // Store deployment info
            const deploymentInfo = {
                name: contractName,
                address: address,
                deploymentTransaction: deploymentTx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: actualGasUsed.toString(),
                gasPrice: actualGasPrice.toString(),
                totalCost: actualCost.toString(),
                totalCostInEth: ethers.formatEther(actualCost),
                deploymentTime: deploymentTime,
                constructorArgs: constructorArgs,
                codeSize: deployedCode.length,
                confirmations: this.confirmations,
                timestamp: new Date().toISOString()
            };

            this.deployments.contracts[contractName] = deploymentInfo;

            // Update total deployment cost
            const currentTotalCost = BigInt(this.deployments.deployment.totalCost);
            this.deployments.deployment.totalCost = (currentTotalCost + actualCost).toString();

            const currentGasUsed = BigInt(this.deployments.deployment.gasUsed);
            this.deployments.deployment.gasUsed = (currentGasUsed + actualGasUsed).toString();

            return contract;

        } catch (error) {
            this.log(`${COLORS.RED}✗ Failed to deploy ${contractName}: ${error.message}${COLORS.RESET}`);
            throw error;
        }
    }

    async verifyContract(contractName, address, constructorArgs = []) {
        if (!process.env.VERIFY_CONTRACTS || process.env.VERIFY_CONTRACTS !== 'true') {
            this.log(`${COLORS.YELLOW}Skipping verification (VERIFY_CONTRACTS not enabled)${COLORS.RESET}`);
            return;
        }

        this.log(`\n${COLORS.CYAN}Verifying ${contractName}...${COLORS.RESET}`);

        try {
            await hre.run("verify:verify", {
                address: address,
                constructorArguments: constructorArgs,
            });

            this.log(`${COLORS.GREEN}✓ ${contractName} verified successfully!${COLORS.RESET}`);

            if (this.deployments.contracts[contractName]) {
                this.deployments.contracts[contractName].verified = true;
            }
        } catch (error) {
            if (error.message.includes("Already Verified")) {
                this.log(`${COLORS.YELLOW}Contract already verified${COLORS.RESET}`);
                if (this.deployments.contracts[contractName]) {
                    this.deployments.contracts[contractName].verified = true;
                }
            } else {
                this.log(`${COLORS.RED}Verification failed: ${error.message}${COLORS.RESET}`);
                if (this.deployments.contracts[contractName]) {
                    this.deployments.contracts[contractName].verified = false;
                    this.deployments.contracts[contractName].verificationError = error.message;
                }
            }
        }
    }

    async testDeployedContract(contract, contractName) {
        this.log(`\n${COLORS.CYAN}Testing ${contractName}...${COLORS.RESET}`);

        try {
            const address = await contract.getAddress();

            // Basic checks
            const code = await this.provider.getCode(address);
            if (code === '0x') {
                throw new Error("No code at contract address");
            }

            // Contract-specific tests
            if (contractName === 'TestContract') {
                await this.testTestContract(contract);
            } else if (contractName === 'TestERC20') {
                await this.testERC20Contract(contract);
            }

            this.log(`${COLORS.GREEN}✓ ${contractName} tests passed!${COLORS.RESET}`);

            if (this.deployments.contracts[contractName]) {
                this.deployments.contracts[contractName].tested = true;
            }

        } catch (error) {
            this.log(`${COLORS.RED}✗ ${contractName} tests failed: ${error.message}${COLORS.RESET}`);
            if (this.deployments.contracts[contractName]) {
                this.deployments.contracts[contractName].tested = false;
                this.deployments.contracts[contractName].testError = error.message;
            }
        }
    }

    async testTestContract(contract) {
        // Test basic functionality
        const initialCounter = await contract.getCounter();
        const initialMessage = await contract.getMessage();
        const owner = await contract.owner();
        const isActive = await contract.isActive();

        if (this.verbose) {
            this.log(`  Initial counter: ${initialCounter.toString()}`);
            this.log(`  Initial message: "${initialMessage}"`);
            this.log(`  Owner: ${owner}`);
            this.log(`  Is active: ${isActive}`);
        }

        // Test a simple function call
        const addResult = await contract.add(10, 20);
        if (addResult.toString() !== "30") {
            throw new Error(`Add function failed: expected 30, got ${addResult.toString()}`);
        }

        // Test a state-changing function
        const tx = await contract.incrementCounter();
        await tx.wait();

        const newCounter = await contract.getCounter();
        if (newCounter !== initialCounter + 1n) {
            throw new Error(`Counter increment failed: expected ${initialCounter + 1n}, got ${newCounter}`);
        }
    }

    async testERC20Contract(contract) {
        // Test basic ERC20 functionality
        const name = await contract.name();
        const symbol = await contract.symbol();
        const decimals = await contract.decimals();
        const totalSupply = await contract.totalSupply();

        const [deployer] = await ethers.getSigners();
        const deployerBalance = await contract.balanceOf(deployer.address);

        if (this.verbose) {
            this.log(`  Name: ${name}`);
            this.log(`  Symbol: ${symbol}`);
            this.log(`  Decimals: ${decimals}`);
            this.log(`  Total Supply: ${totalSupply.toString()}`);
            this.log(`  Deployer Balance: ${deployerBalance.toString()}`);
        }

        // Verify initial state
        if (deployerBalance !== totalSupply) {
            throw new Error(`Initial balance mismatch: deployer should have total supply`);
        }

        // Test a transfer (to self)
        const transferAmount = ethers.parseUnits("100", decimals);
        const tx = await contract.transfer(deployer.address, transferAmount);
        await tx.wait();

        const newBalance = await contract.balanceOf(deployer.address);
        if (newBalance !== deployerBalance) {
            throw new Error(`Self-transfer failed: balance should remain the same`);
        }
    }

    async saveDeploymentInfo() {
        try {
            // Create deployments directory if it doesn't exist
            const deploymentsDir = path.join(__dirname, '../deployments');
            if (!fs.existsSync(deploymentsDir)) {
                fs.mkdirSync(deploymentsDir, { recursive: true });
            }

            // Save network-specific deployment file
            const networkName = this.deployments.network.name || 'unknown';
            const chainId = this.deployments.network.chainId || 'unknown';
            const fileName = `${networkName}-${chainId}-${Date.now()}.json`;
            const filePath = path.join(deploymentsDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(this.deployments, null, 2));
            this.log(`\n${COLORS.GREEN}Deployment info saved to: ${filePath}${COLORS.RESET}`);

            // Save latest deployment file
            const latestPath = path.join(deploymentsDir, 'latest.json');
            fs.writeFileSync(latestPath, JSON.stringify(this.deployments, null, 2));
            this.log(`${COLORS.GREEN}Latest deployment info saved to: ${latestPath}${COLORS.RESET}`);

            // Create simple addresses file for easy reference
            const addresses = {};
            for (const [name, info] of Object.entries(this.deployments.contracts)) {
                addresses[name] = info.address;
            }

            const addressesPath = path.join(deploymentsDir, 'addresses.json');
            fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
            this.log(`${COLORS.GREEN}Contract addresses saved to: ${addressesPath}${COLORS.RESET}`);

        } catch (error) {
            this.log(`${COLORS.RED}Failed to save deployment info: ${error.message}${COLORS.RESET}`);
        }
    }

    async deploy() {
        this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Starting contract deployment...${COLORS.RESET}`);

        try {
            // Get deployer account
            const [deployer] = await ethers.getSigners();
            if (!deployer) {
                throw new Error("No deployer account available");
            }

            this.deployments.deployment.deployer = deployer.address;

            // Get network information
            this.deployments.network = await this.getNetworkInfo();

            this.log(`\nDeployer: ${deployer.address}`);
            this.log(`Network: ${this.deployments.network.name} (Chain ID: ${this.deployments.network.chainId})`);
            this.log(`Block Number: ${this.deployments.network.blockNumber}`);
            this.log(`Gas Price: ${this.deployments.network.gasPriceInGwei} gwei`);

            // Check deployer balance
            const deployerBalance = await this.provider.getBalance(deployer.address);
            this.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} ETH`);

            if (deployerBalance < ethers.parseEther("0.01")) {
                this.log(`${COLORS.YELLOW}Warning: Low deployer balance. Deployment may fail.${COLORS.RESET}`);
            }

            // Deploy TestContract
            this.log(`\n${COLORS.BRIGHT}=== DEPLOYING TEST CONTRACT ===${COLORS.RESET}`);
            const TestContract = await ethers.getContractFactory("TestContract");
            const testContract = await this.deployContract("TestContract", TestContract);

            // Deploy TestERC20
            this.log(`\n${COLORS.BRIGHT}=== DEPLOYING TEST ERC20 ===${COLORS.RESET}`);
            const TestERC20 = await ethers.getContractFactory("TestERC20");
            const erc20Args = ["Test Token", "TEST", 18, 1000000]; // 1M tokens
            const testERC20 = await this.deployContract("TestERC20", TestERC20, erc20Args);

            // Test deployed contracts
            this.log(`\n${COLORS.BRIGHT}=== TESTING DEPLOYED CONTRACTS ===${COLORS.RESET}`);
            await this.testDeployedContract(testContract, "TestContract");
            await this.testDeployedContract(testERC20, "TestERC20");

            // Verify contracts if enabled
            if (process.env.VERIFY_CONTRACTS === 'true') {
                this.log(`\n${COLORS.BRIGHT}=== VERIFYING CONTRACTS ===${COLORS.RESET}`);
                await this.verifyContract("TestContract", await testContract.getAddress());
                await this.verifyContract("TestERC20", await testERC20.getAddress(), erc20Args);
            }

            // Save deployment information
            await this.saveDeploymentInfo();

            // Print deployment summary
            this.printDeploymentSummary();

            this.log(`\n${COLORS.GREEN}${COLORS.BRIGHT}Deployment completed successfully!${COLORS.RESET}`);

        } catch (error) {
            this.log(`\n${COLORS.RED}${COLORS.BRIGHT}Deployment failed: ${error.message}${COLORS.RESET}`);
            throw error;
        }
    }

    printDeploymentSummary() {
        this.log(`\n${COLORS.BRIGHT}=== DEPLOYMENT SUMMARY ===${COLORS.RESET}`);

        const contractCount = Object.keys(this.deployments.contracts).length;
        const totalGasUsed = this.deployments.deployment.gasUsed;
        const totalCost = this.deployments.deployment.totalCost;

        this.log(`Contracts Deployed: ${contractCount}`);
        this.log(`Total Gas Used: ${totalGasUsed}`);
        this.log(`Total Cost: ${ethers.formatEther(totalCost)} ETH`);
        this.log(`Network: ${this.deployments.network.name} (${this.deployments.network.chainId})`);
        this.log(`Deployer: ${this.deployments.deployment.deployer}`);

        this.log(`\n${COLORS.CYAN}Contract Addresses:${COLORS.RESET}`);
        for (const [name, info] of Object.entries(this.deployments.contracts)) {
            const status = info.tested ? '✓' : '✗';
            const verified = info.verified ? '(verified)' : '';
            this.log(`  ${status} ${name}: ${info.address} ${verified}`);
        }
    }
}

async function main() {
    try {
        const deployer = new ContractDeployer();
        await deployer.deploy();
    } catch (error) {
        console.error(`${COLORS.RED}Fatal deployment error:${COLORS.RESET}`, error);
        process.exit(1);
    }
}

// Export for use as module
module.exports = { ContractDeployer };

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
