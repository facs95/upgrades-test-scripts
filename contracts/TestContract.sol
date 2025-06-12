// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TestContract {
    // State variables for testing storage operations
    uint256 public counter;
    string public message;
    address public owner;
    bool public isActive;

    // Complex data structures
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;
    uint256[] public dynamicArray;

    struct User {
        string name;
        uint256 age;
        bool isRegistered;
        uint256[] scores;
    }

    mapping(address => User) public users;
    address[] public userList;

    // Events for testing event logs
    event CounterIncremented(uint256 newValue, address indexed incrementer);
    event MessageUpdated(string oldMessage, string newMessage);
    event UserRegistered(address indexed user, string name, uint256 age);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 amount
    );
    event ErrorOccurred(string reason, uint256 errorCode);
    event GasTest(uint256 gasUsed, string operation);

    // Modifiers for access control testing
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    modifier onlyActive() {
        require(isActive, "Contract is not active");
        _;
    }

    // Custom errors for testing
    error InsufficientBalance(uint256 requested, uint256 available);
    error InvalidAddress(address addr);
    error ContractPaused();

    constructor() {
        owner = msg.sender;
        isActive = true;
        message = "Initial message";
        counter = 0;
    }

    // Basic state changing functions
    function incrementCounter() external onlyActive {
        counter++;
        emit CounterIncremented(counter, msg.sender);
    }

    function incrementCounterBy(uint256 amount) external onlyActive {
        counter += amount;
        emit CounterIncremented(counter, msg.sender);
    }

    function setMessage(string calldata newMessage) external onlyOwner {
        string memory oldMessage = message;
        message = newMessage;
        emit MessageUpdated(oldMessage, newMessage);
    }

    function toggleActive() external onlyOwner {
        isActive = !isActive;
    }

    // Payable functions for testing native token transfers
    function deposit() external payable {
        require(msg.value > 0, "Must send some value");
        balances[msg.sender] += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (balances[msg.sender] < amount) {
            revert InsufficientBalance(amount, balances[msg.sender]);
        }

        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    function withdrawAll() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to withdraw");

        balances[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    // View functions for testing read operations
    function getCounter() external view returns (uint256) {
        return counter;
    }

    function getMessage() external view returns (string memory) {
        return message;
    }

    function getBalance(address account) external view returns (uint256) {
        return balances[account];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Pure functions for testing
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    function multiply(uint256 a, uint256 b) external pure returns (uint256) {
        return a * b;
    }

    function concatenateStrings(
        string calldata str1,
        string calldata str2
    ) external pure returns (string memory) {
        return string(abi.encodePacked(str1, str2));
    }

    // Array operations for testing dynamic data
    function addToArray(uint256 value) external {
        dynamicArray.push(value);
    }

    function getArrayLength() external view returns (uint256) {
        return dynamicArray.length;
    }

    function getArrayElement(uint256 index) external view returns (uint256) {
        require(index < dynamicArray.length, "Index out of bounds");
        return dynamicArray[index];
    }

    function removeLastElement() external {
        require(dynamicArray.length > 0, "Array is empty");
        dynamicArray.pop();
    }

    // User management for testing structs and complex operations
    function registerUser(string calldata name, uint256 age) external {
        require(!users[msg.sender].isRegistered, "User already registered");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(age > 0 && age < 150, "Invalid age");

        users[msg.sender].name = name;
        users[msg.sender].age = age;
        users[msg.sender].isRegistered = true;
        userList.push(msg.sender);

        emit UserRegistered(msg.sender, name, age);
    }

    function addScore(uint256 score) external {
        require(users[msg.sender].isRegistered, "User not registered");
        users[msg.sender].scores.push(score);
    }

    function getUser(
        address userAddr
    )
        external
        view
        returns (
            string memory name,
            uint256 age,
            bool isRegistered,
            uint256[] memory scores
        )
    {
        User memory user = users[userAddr];
        return (user.name, user.age, user.isRegistered, user.scores);
    }

    function getUserCount() external view returns (uint256) {
        return userList.length;
    }

    // Gas-intensive operations for testing
    function gasIntensiveLoop(uint256 iterations) external {
        uint256 startGas = gasleft();

        for (uint256 i = 0; i < iterations; i++) {
            counter++;
        }

        uint256 gasUsed = startGas - gasleft();
        emit GasTest(gasUsed, "Loop operation");
    }

    function gasIntensiveStorage(uint256 operations) external {
        uint256 startGas = gasleft();

        for (uint256 i = 0; i < operations; i++) {
            balances[address(uint160(i))] = i;
        }

        uint256 gasUsed = startGas - gasleft();
        emit GasTest(gasUsed, "Storage operation");
    }

    // Error testing functions
    function forceRevert(string calldata reason) external pure {
        revert(reason);
    }

    function forceCustomError(
        uint256 requested,
        uint256 available
    ) external pure {
        revert InsufficientBalance(requested, available);
    }

    function forceAssert() external pure {
        assert(false);
    }

    function forceRequire(
        bool condition,
        string calldata message
    ) external pure {
        require(condition, message);
    }

    // Approval system for testing allowances
    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(
            allowances[from][msg.sender] >= amount,
            "Insufficient allowance"
        );
        require(balances[from] >= amount, "Insufficient balance");

        allowances[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // Fallback and receive functions
    receive() external payable {
        balances[msg.sender] += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }

    fallback() external payable {
        emit ErrorOccurred("Fallback function called", 404);
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        payable(owner).transfer(balance);
    }

    function pause() external onlyOwner {
        isActive = false;
    }

    function unpause() external onlyOwner {
        isActive = true;
    }

    // Math operations that could test overflow/underflow
    function safeAdd(uint256 a, uint256 b) external pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "Addition overflow");
        return c;
    }

    function safeSub(uint256 a, uint256 b) external pure returns (uint256) {
        require(b <= a, "Subtraction underflow");
        return a - b;
    }

    function safeMul(uint256 a, uint256 b) external pure returns (uint256) {
        if (a == 0) return 0;
        uint256 c = a * b;
        require(c / a == b, "Multiplication overflow");
        return c;
    }

    function safeDiv(uint256 a, uint256 b) external pure returns (uint256) {
        require(b > 0, "Division by zero");
        return a / b;
    }

    // Batch operations for testing transaction throughput
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Arrays length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                balances[msg.sender] >= amounts[i],
                "Insufficient balance for transfer"
            );
            balances[msg.sender] -= amounts[i];
            balances[recipients[i]] += amounts[i];
            emit Transfer(msg.sender, recipients[i], amounts[i]);
        }
    }

    // Time-based operations for testing block timestamp
    uint256 public lastActionTime;

    function updateTimestamp() external {
        lastActionTime = block.timestamp;
    }

    function getTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function getBlockHash(uint256 blockNumber) external view returns (bytes32) {
        return blockhash(blockNumber);
    }

    // Contract interaction testing
    function callExternalContract(
        address target,
        bytes calldata data
    ) external returns (bool success, bytes memory returnData) {
        return target.call(data);
    }

    function delegateCallExternalContract(
        address target,
        bytes calldata data
    ) external returns (bool success, bytes memory returnData) {
        return target.delegatecall(data);
    }

    // Destroy contract (for testing selfdestruct)
    function destroyContract() external onlyOwner {
        selfdestruct(payable(owner));
    }
}
