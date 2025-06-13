# Comprehensive Blockchain Testing Suite

A comprehensive testing framework for both EVM-based blockchain networks and Cosmos SDK chains that validates RPC functionality, smart contract deployment and execution, native token transfers, gas estimation accuracy, and Cosmos SDK module functionality including bank module operations.

## 🚀 Features

### Core Testing Capabilities

- **RPC Method Testing**: Comprehensive validation of all standard Ethereum RPC methods
- **Smart Contract Testing**: Deploy and test complex contracts with various operations
- **Native Token Transfers**: Test ETH/native token transfers with edge cases
- **Gas Estimation Validation**: Verify gas estimation accuracy across different transaction types
- **ERC20 Token Testing**: Full ERC20 implementation testing with advanced features
- **Batch Operations**: Test batch transactions and gas efficiency
- **Error Handling**: Validate proper error responses and edge cases
- **EIP-1559 Support**: Test modern transaction types and fee mechanisms
- **Cosmos SDK Bank Module Testing**: Comprehensive testing of Cosmos SDK bank module queries and transactions
- **Multi-Chain Support**: Test both EVM and Cosmos SDK functionality in a single framework

### Advanced Features

- **Automated Contract Deployment**: Deploy test contracts with verification
- **Gas Efficiency Analysis**: Compare gas usage between different operations
- **Network Compatibility**: Test against any EVM-compatible network
- **Detailed Reporting**: Comprehensive test results with gas usage analytics
- **Configurable Test Suites**: Run specific test categories or skip problematic tests
- **Real-time Monitoring**: Track test progress with colored output and timing
- **Cosmos SDK Integration**: Full support for Cosmos SDK chain testing with CosmJS

## 📋 Requirements

- Node.js 16+
- npm or yarn
- Access to an EVM-compatible network (local, testnet, or mainnet) for EVM tests
- Access to a Cosmos SDK chain (local, testnet, or mainnet) for Cosmos tests
- Private key with sufficient balance for EVM testing
- Mnemonic phrase with sufficient balance for Cosmos SDK testing

## 🛠 Installation

1. **Clone or download the project**:
```bash
git clone <repository-url>
cd upgrades-tests-scripts
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment configuration**:
```bash
cp .env.example .env
```

4. **Configure your environment** (see Configuration section below)

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example` and configure the following:

#### Network Configuration
```env
# RPC endpoint for your target network
RPC_URL=http://localhost:8545
CHAIN_ID=31337

# Private key for testing (ensure sufficient balance)
PRIVATE_KEY=0x1234567890abcdef...

# Custom network settings (optional)
CUSTOM_RPC_URL=http://localhost:8546
CUSTOM_PRIVATE_KEY=0x...
CUSTOM_CHAIN_ID=31337
```

#### Testing Configuration
```env
# Enable verbose output for detailed logging
VERBOSE=true

# Number of confirmations to wait for deployments
DEPLOY_CONFIRMATIONS=1

# Verify contracts on block explorers (if supported)
VERIFY_CONTRACTS=false

# Test amounts and limits
TEST_TRANSFER_AMOUNT_ETH=1000000000000000000  # 1 ETH in wei
TEST_GAS_LIMIT=21000

# Test behavior
TEST_TIMEOUT=60000
TEST_RETRIES=3
```

#### Cosmos SDK Configuration
```env
# Cosmos SDK chain configuration
COSMOS_RPC_URL=http://localhost:26657
COSMOS_REST_URL=http://localhost:1317
COSMOS_CHAIN_ID=cosmoshub-4
COSMOS_MNEMONIC=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
COSMOS_PREFIX=cosmos
COSMOS_DENOM=uatom

# Cosmos test configuration
COSMOS_TEST_TIMEOUT=30000
COSMOS_TEST_RETRIES=3
COSMOS_GAS_PRICE=0.025uatom
COSMOS_DEFAULT_GAS_LIMIT=200000

# Bank module test configuration
BANK_TEST_AMOUNT=1000000
BANK_TEST_DENOM=uatom
BANK_RECIPIENT_ADDRESS=cosmos1...
```

#### Gas Reporting
```env
# Enable gas usage reporting
REPORT_GAS=true
COINMARKETCAP_API_KEY=your_api_key_here
```

### Network Configuration

The project supports multiple network configurations through `hardhat.config.js`:

- **Local Development**: Hardhat Network (default)
- **Custom Networks**: Configure via environment variables
- **Testnet/Mainnet**: Set appropriate RPC URLs and chain IDs

## 🎯 Usage

### Quick Start

Run all EVM tests with default configuration:
```bash
npm run test:all
```

Run comprehensive tests (EVM + Cosmos):
```bash
npm run test:comprehensive
```

Run only Cosmos SDK tests:
```bash
npm run test:cosmos
```

### Individual Test Suites

Run specific test categories:

```bash
# Test RPC methods only
npm run test:rpc

# Test contract deployment and execution
npm run test:contracts

# Test native token transfers
npm run test:transfers

# Test gas estimation accuracy
npm run test:gas

# Test Cosmos SDK bank module
npm run test:cosmos
```

### Advanced Usage

#### Comprehensive Testing (EVM + Cosmos)
```bash
# Run both EVM and Cosmos tests
RUN_EVM=true RUN_COSMOS=true npm run test:comprehensive

# Run only EVM tests
npm run test:comprehensive -- --evm-only

# Run only Cosmos tests  
npm run test:comprehensive -- --cosmos-only

# Run with verbose output
npm run test:comprehensive -- --verbose

# Deploy contracts first, then run comprehensive tests
npm run test:comprehensive -- --deploy
```

#### Cosmos-Specific Testing
```bash
# Run Cosmos tests with custom configuration
COSMOS_RPC_URL=http://localhost:26657 COSMOS_CHAIN_ID=my-chain npm run test:cosmos

# Run with verbose Cosmos output
VERBOSE=true npm run test:cosmos

# Test with different denomination
BANK_TEST_DENOM=ustake BANK_TEST_AMOUNT=5000000 npm run test:cosmos
```

#### EVM-Specific Advanced Usage

#### Deploy contracts first, then run all tests:
```bash
npm run deploy:test
npm run test:all
```

#### Run with verbose output:
```bash
VERBOSE=true npm run test:all
```

#### Skip specific test suites:
```bash
SKIP_SUITES=Contracts,Gas npm run test:all
```

#### Run only specific test suites:
```bash
ONLY_SUITES="RPC Calls,Transfers" npm run test:all
```

#### Run tests with contract deployment:
```bash
DEPLOY_FIRST=true npm run test:all
```

### Command Line Options

The test runners support several command-line options:

```bash
# EVM tests with verbose output
npm run test:all -- --verbose

# EVM tests with contract deployment
npm run test:all -- --deploy

# Comprehensive tests with various options
npm run test:comprehensive -- --help
npm run test:comprehensive -- --verbose
npm run test:comprehensive -- --debug
npm run test:comprehensive -- --evm-only
npm run test:comprehensive -- --cosmos-only

# Show help for comprehensive tests
npm run test:comprehensive -- --help
```

## 📊 Test Suites

### 1. RPC Calls Testing (`test-rpc-calls.js`)

Validates all standard Ethereum RPC methods:

- **Basic RPC**: `eth_blockNumber`, `eth_chainId`, `eth_gasPrice`
- **Account RPC**: `eth_getBalance`, `eth_getTransactionCount`
- **Block RPC**: `eth_getBlockByNumber`, `eth_getBlockByHash`
- **Transaction RPC**: `eth_getTransactionByHash`, `eth_getTransactionReceipt`
- **Filter RPC**: `eth_newFilter`, `eth_getLogs`
- **Advanced RPC**: `debug_traceTransaction`, `trace_transaction`
- **EIP-1559 RPC**: `eth_feeHistory`, `eth_maxPriorityFeePerGas`

### 2. Contract Testing (`test-contracts.js`)

Comprehensive smart contract testing:

- **Deployment Testing**: Deploy complex contracts with gas analysis
- **Function Testing**: View, pure, and state-changing functions
- **Event Testing**: Event emission and log parsing
- **Error Testing**: Revert conditions and custom errors
- **Access Control**: Owner-only functions and modifiers
- **Data Structures**: Arrays, mappings, and structs
- **Payable Functions**: Native token handling
- **Gas Optimization**: Gas-intensive operations analysis

### 3. Transfer Testing (`test-transfers.js`)

Native token transfer validation:

- **Basic Transfers**: EOA to EOA transfers
- **Edge Cases**: Zero amounts, self-transfers, insufficient balance
- **Batch Transfers**: Sequential and rapid transfers
- **Gas Analysis**: Transfer gas costs and optimization
- **Transaction Details**: Receipt analysis and confirmation tracking
- **Error Scenarios**: Invalid addresses and failed transactions

### 4. Gas Estimation Testing (`test-gas-estimation.js`)

Gas estimation accuracy validation:

- **Transfer Estimation**: Basic and complex transfer gas estimation
- **Contract Calls**: Function call gas estimation
- **Deployment Gas**: Contract deployment cost estimation
- **Batch Operations**: Batch vs individual operation efficiency
- **EIP-1559**: Modern transaction type gas estimation
- **Accuracy Analysis**: Compare estimated vs actual gas usage

### 5. Cosmos SDK Bank Module Testing (`test-cosmos-bank.js`)

Comprehensive Cosmos SDK bank module testing:

#### Query Testing
- **Balance Queries**: Individual and bulk balance queries
- **Supply Queries**: Total supply and denomination-specific supply
- **Metadata Queries**: Denomination metadata and traces
- **Params Queries**: Bank module parameters
- **Pagination**: Advanced pagination support for large datasets
- **Spendable Balances**: Query spendable vs locked balances

#### Transaction Testing
- **Send Transactions**: Basic token transfers between accounts
- **Multi-Send**: Batch transfer operations to multiple recipients
- **Transaction Verification**: Balance verification after transfers
- **Error Handling**: Invalid transactions and insufficient balance scenarios
- **Gas Analysis**: Transaction gas usage and fee estimation

#### Advanced Features
- **Multiple Denominations**: Support for multiple token types
- **IBC Token Support**: Testing with IBC transferred tokens
- **Custom Address Prefixes**: Support for different Cosmos SDK chain prefixes
- **Mnemonic-based Testing**: HD wallet derivation for multiple test accounts

## 📈 Test Results and Reporting

### Output Format

Tests provide detailed colored output with:
- ✅ **Passed tests**: Green indicators with timing
- ❌ **Failed tests**: Red indicators with error details
- 📊 **Statistics**: Success rates, gas usage, and performance metrics
- 📝 **Detailed logs**: Transaction hashes, addresses, and gas costs

### Result Files

Test results are automatically saved to:
- `test-results/latest.json`: Latest EVM test run results
- `test-results/test-results-[timestamp].json`: Historical EVM results
- `test-results/cosmos-bank-latest.json`: Latest Cosmos test results
- `test-results/cosmos-bank-results-[timestamp].json`: Historical Cosmos results
- `test-results/comprehensive-latest.json`: Latest comprehensive test results
- `test-results/comprehensive-results-[timestamp].json`: Historical comprehensive results
- `deployments/latest.json`: Contract deployment information
- `deployments/addresses.json`: Quick contract address reference

### Gas Analysis

Gas estimation tests provide:
- **Accuracy Rates**: Percentage of accurate estimations
- **Over/Under Estimation**: Analysis of estimation bias
- **Gas Efficiency**: Comparison between different operations
- **Cost Analysis**: Total gas costs and optimization opportunities

## 🐛 Troubleshooting

### Common Issues

#### Connection Problems
```
Error: could not detect network
```
**Solution**: Verify RPC_URL is correct and network is accessible

#### Insufficient Balance
```
Error: insufficient funds for gas * price + value
```
**Solution**: Ensure test account has sufficient native tokens

#### Gas Estimation Failures
```
Error: gas required exceeds allowance
```
**Solution**: Check network gas limits and adjust TEST_GAS_LIMIT

#### Contract Deployment Issues
```
Error: contract deployment failed
```
**Solutions**:
- Verify Solidity compiler version compatibility
- Check network supports contract deployment
- Ensure sufficient gas for deployment

### Debug Mode

Enable verbose logging for detailed troubleshooting:
```bash
VERBOSE=true DEBUG=true npm run test:all
```

### Network-Specific Issues

#### Local Networks (Hardhat/Ganache)
- Ensure network is running before tests
- Check account balances and unlock accounts
- Verify gas price settings

#### Testnets
- Confirm sufficient testnet tokens
- Check network congestion and gas prices
- Verify RPC endpoint stability

#### Mainnets
- Use appropriate gas prices
- Monitor transaction costs
- Consider rate limiting

#### Cosmos SDK Networks
- Ensure sufficient balance in test denomination
- Verify RPC and REST endpoints are accessible
- Check chain-specific gas prices and limits
- Confirm mnemonic generates valid addresses for the network

### Common Cosmos Issues

#### Connection Problems
```
Error: could not connect to Tendermint RPC
```
**Solution**: Verify COSMOS_RPC_URL is correct and accessible

#### Insufficient Balance
```
Error: insufficient funds for fees
```
**Solution**: Ensure test account has sufficient tokens for fees and transfers

#### Invalid Address
```
Error: invalid address format
```
**Solutions**:
- Verify COSMOS_PREFIX matches your chain
- Check mnemonic generates correct address format
- Ensure recipient addresses use correct prefix

#### Chain Configuration Issues
```
Error: chain-id mismatch
```
**Solution**: Verify COSMOS_CHAIN_ID matches the target network

## 🔧 Customization

### Adding New Tests

1. **Create test file**: Follow existing patterns in `scripts/`
2. **Implement test class**: Extend base testing functionality
3. **Add to test runner**: Include in `run-all-tests.js`
4. **Update documentation**: Add test descriptions

### Custom Contracts

1. **Add contracts**: Place in `contracts/` directory
2. **Update deployment**: Modify `deploy-test-contracts.js`
3. **Create tests**: Add specific test functions
4. **Configure environment**: Update necessary settings

### Adding Cosmos SDK Module Tests

1. **Create test file**: Follow the pattern in `test-cosmos-bank.js`
2. **Implement test class**: Extend base Cosmos testing functionality
3. **Add to comprehensive runner**: Include in `run-comprehensive-tests.js`
4. **Update documentation**: Add test descriptions and configuration

### Network Support

#### EVM Networks
1. **Add network config**: Update `hardhat.config.js`
2. **Set environment**: Configure network-specific variables
3. **Test compatibility**: Verify RPC method support  
4. **Document differences**: Note any network-specific behaviors

#### Cosmos SDK Networks
1. **Configure chain**: Set COSMOS_RPC_URL, COSMOS_REST_URL, COSMOS_CHAIN_ID
2. **Set denomination**: Configure COSMOS_DENOM and test amounts
3. **Address prefix**: Set COSMOS_PREFIX for address generation
4. **Test modules**: Verify which modules are available and enabled

## 📚 API Reference

### Test Classes

#### RPCTester
```javascript
const { RPCTester } = require('./scripts/test-rpc-calls');
const tester = new RPCTester();
const results = await tester.runAllTests();
```

#### ContractTester
```javascript
const { ContractTester } = require('./scripts/test-contracts');
const tester = new ContractTester();
const results = await tester.runAllTests();
```

#### TransferTester
```javascript
const { TransferTester } = require('./scripts/test-transfers');
const tester = new TransferTester();
const results = await tester.runAllTests();
```

#### GasEstimationTester
```javascript
const { GasEstimationTester } = require('./scripts/test-gas-estimation');
const tester = new GasEstimationTester();
const results = await tester.runAllTests();
```

#### CosmosBankTester
```javascript
const { CosmosBankTester } = require('./scripts/test-cosmos-bank');
const tester = new CosmosBankTester();
const results = await tester.runAllTests();
```

#### ComprehensiveTestRunner
```javascript
const { ComprehensiveTestRunner } = require('./scripts/run-comprehensive-tests');
const runner = new ComprehensiveTestRunner();
const results = await runner.run();
```

### Configuration Options

All test classes support:
- **Verbose mode**: Detailed logging output
- **Custom timeouts**: Configurable test timeouts
- **Result filtering**: Skip or focus on specific tests
- **Gas analysis**: Detailed gas usage reporting (EVM)
- **Multi-chain testing**: Run EVM and Cosmos tests together or separately
- **Module-specific testing**: Focus on specific Cosmos SDK modules

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the full test suite
6. Submit a pull request

### Code Style

- Use ESLint configuration
- Follow existing naming conventions
- Add comprehensive comments
- Include error handling
- Write detailed commit messages

### Testing Guidelines

- Test all new functionality
- Include edge cases
- Verify gas estimation accuracy
- Test across multiple networks
- Document expected behaviors

## 📄 License

This project is licensed under the ISC License - see the package.json file for details.

## 🆘 Support

For issues, questions, or contributions:

1. Check existing documentation
2. Search for similar issues
3. Create detailed bug reports
4. Include network and environment details
5. Provide reproduction steps

## 🔗 Related Resources

### EVM Resources
- [Ethereum JSON-RPC Specification](https://ethereum.github.io/execution-apis/api-documentation/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)
- [Solidity Documentation](https://docs.soliditylang.org/)

### Cosmos SDK Resources
- [Cosmos SDK Documentation](https://docs.cosmos.network/)
- [CosmJS Documentation](https://cosmos.github.io/cosmjs/)
- [Tendermint RPC Documentation](https://docs.tendermint.com/master/rpc/)
- [Cosmos SDK Bank Module](https://docs.cosmos.network/main/modules/bank/)
- [IBC Protocol](https://ibc.cosmos.network/)

---

**Happy Testing! 🚀**

*This comprehensive testing suite helps ensure your blockchain - whether EVM-compatible or Cosmos SDK-based - is fully functional and performs optimally across all standard operations.*
