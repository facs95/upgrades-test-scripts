# EVM Chain Comprehensive Testing Suite

A comprehensive testing framework for EVM-based blockchain networks that validates RPC functionality, smart contract deployment and execution, native token transfers, and gas estimation accuracy.

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

### Advanced Features

- **Automated Contract Deployment**: Deploy test contracts with verification
- **Gas Efficiency Analysis**: Compare gas usage between different operations
- **Network Compatibility**: Test against any EVM-compatible network
- **Detailed Reporting**: Comprehensive test results with gas usage analytics
- **Configurable Test Suites**: Run specific test categories or skip problematic tests
- **Real-time Monitoring**: Track test progress with colored output and timing

## 📋 Requirements

- Node.js 16+
- npm or yarn
- Access to an EVM-compatible network (local, testnet, or mainnet)
- Private key with sufficient balance for testing

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
TEST_TRANSFER_AMOUNT=1000000000000000000  # 1 ETH in wei
TEST_GAS_LIMIT=21000

# Test behavior
TEST_TIMEOUT=60000
TEST_RETRIES=3
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

Run all tests with default configuration:
```bash
npm run test:all
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
```

### Advanced Usage

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

The main test runner supports several command-line options:

```bash
# Enable verbose output
npm run test:all -- --verbose

# Deploy contracts before testing
npm run test:all -- --deploy

# Show help
npm run test:all -- --help
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

## 📈 Test Results and Reporting

### Output Format

Tests provide detailed colored output with:
- ✅ **Passed tests**: Green indicators with timing
- ❌ **Failed tests**: Red indicators with error details
- 📊 **Statistics**: Success rates, gas usage, and performance metrics
- 📝 **Detailed logs**: Transaction hashes, addresses, and gas costs

### Result Files

Test results are automatically saved to:
- `test-results/latest.json`: Latest test run results
- `test-results/test-results-[timestamp].json`: Historical results
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

### Network Support

1. **Add network config**: Update `hardhat.config.js`
2. **Set environment**: Configure network-specific variables
3. **Test compatibility**: Verify RPC method support
4. **Document differences**: Note any network-specific behaviors

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

### Configuration Options

All test classes support:
- **Verbose mode**: Detailed logging output
- **Custom timeouts**: Configurable test timeouts
- **Result filtering**: Skip or focus on specific tests
- **Gas analysis**: Detailed gas usage reporting

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

- [Ethereum JSON-RPC Specification](https://ethereum.github.io/execution-apis/api-documentation/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)
- [Solidity Documentation](https://docs.soliditylang.org/)

---

**Happy Testing! 🚀**

*This testing suite helps ensure your EVM chain is fully compatible and performs optimally across all standard operations.*