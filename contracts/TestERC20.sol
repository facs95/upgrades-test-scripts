// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
}

contract TestERC20 is IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;
    string public name;
    string public symbol;
    uint8 public decimals;
    address public owner;
    bool public paused;

    // Additional test features
    uint256 public mintCount;
    uint256 public burnCount;
    uint256 public transferCount;

    mapping(address => bool) public blacklisted;
    mapping(address => uint256) public lastTransferTime;

    // Events for testing
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Pause();
    event Unpause();
    event Blacklist(address indexed account);
    event Unblacklist(address indexed account);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // Custom errors
    error InsufficientBalance(uint256 requested, uint256 available);
    error InsufficientAllowance(uint256 requested, uint256 available);
    error BlacklistedAccount(address account);
    error ContractPaused();
    error OnlyOwner();
    error ZeroAddress();
    error TransferCooldown(uint256 remainingTime);

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier notPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier notBlacklisted(address account) {
        if (blacklisted[account]) revert BlacklistedAccount(account);
        _;
    }

    modifier validAddress(address account) {
        if (account == address(0)) revert ZeroAddress();
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
        paused = false;

        if (_initialSupply > 0) {
            _totalSupply = _initialSupply * 10 ** _decimals;
            _balances[msg.sender] = _totalSupply;
            emit Transfer(address(0), msg.sender, _totalSupply);
        }
    }

    // Standard ERC20 functions
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(
        address to,
        uint256 amount
    )
        public
        override
        notPaused
        notBlacklisted(msg.sender)
        notBlacklisted(to)
        validAddress(to)
        returns (bool)
    {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(
        address owner,
        address spender
    ) public view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) public override notPaused validAddress(spender) returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        override
        notPaused
        notBlacklisted(from)
        notBlacklisted(to)
        validAddress(to)
        returns (bool)
    {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance < amount) {
            revert InsufficientAllowance(amount, currentAllowance);
        }

        _transfer(from, to, amount);
        _approve(from, msg.sender, currentAllowance - amount);

        return true;
    }

    // Internal functions
    function _transfer(address from, address to, uint256 amount) internal {
        uint256 fromBalance = _balances[from];
        if (fromBalance < amount) {
            revert InsufficientBalance(amount, fromBalance);
        }

        _balances[from] = fromBalance - amount;
        _balances[to] += amount;
        lastTransferTime[from] = block.timestamp;
        lastTransferTime[to] = block.timestamp;
        transferCount++;

        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    // Minting and burning functions
    function mint(
        address to,
        uint256 amount
    ) external onlyOwner notPaused validAddress(to) {
        _totalSupply += amount;
        _balances[to] += amount;
        mintCount++;
        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external notPaused {
        uint256 balance = _balances[msg.sender];
        if (balance < amount) {
            revert InsufficientBalance(amount, balance);
        }

        _balances[msg.sender] = balance - amount;
        _totalSupply -= amount;
        burnCount++;
        emit Burn(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    function burnFrom(address from, uint256 amount) external notPaused {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance < amount) {
            revert InsufficientAllowance(amount, currentAllowance);
        }

        uint256 balance = _balances[from];
        if (balance < amount) {
            revert InsufficientBalance(amount, balance);
        }

        _balances[from] = balance - amount;
        _totalSupply -= amount;
        _approve(from, msg.sender, currentAllowance - amount);
        burnCount++;
        emit Burn(from, amount);
        emit Transfer(from, address(0), amount);
    }

    // Pause functionality
    function pause() external onlyOwner {
        paused = true;
        emit Pause();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpause();
    }

    // Blacklist functionality
    function blacklist(
        address account
    ) external onlyOwner validAddress(account) {
        blacklisted[account] = true;
        emit Blacklist(account);
    }

    function unblacklist(address account) external onlyOwner {
        blacklisted[account] = false;
        emit Unblacklist(account);
    }

    // Ownership transfer
    function transferOwnership(
        address newOwner
    ) external onlyOwner validAddress(newOwner) {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // Batch operations for testing
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external notPaused returns (bool) {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        require(recipients.length <= 100, "Too many recipients");

        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(msg.sender, recipients[i], amounts[i]);
        }
        return true;
    }

    function batchApprove(
        address[] calldata spenders,
        uint256[] calldata amounts
    ) external notPaused returns (bool) {
        require(spenders.length == amounts.length, "Arrays length mismatch");
        require(spenders.length <= 100, "Too many spenders");

        for (uint256 i = 0; i < spenders.length; i++) {
            _approve(msg.sender, spenders[i], amounts[i]);
        }
        return true;
    }

    // View functions for testing
    function getTransferCount() external view returns (uint256) {
        return transferCount;
    }

    function getMintCount() external view returns (uint256) {
        return mintCount;
    }

    function getBurnCount() external view returns (uint256) {
        return burnCount;
    }

    function isBlacklisted(address account) external view returns (bool) {
        return blacklisted[account];
    }

    function getLastTransferTime(
        address account
    ) external view returns (uint256) {
        return lastTransferTime[account];
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner).transfer(balance);
        }
    }

    // Test functions for edge cases
    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) external notPaused validAddress(spender) returns (bool) {
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender] + addedValue
        );
        return true;
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) external notPaused validAddress(spender) returns (bool) {
        uint256 currentAllowance = _allowances[msg.sender][spender];
        require(
            currentAllowance >= subtractedValue,
            "Decreased allowance below zero"
        );
        _approve(msg.sender, spender, currentAllowance - subtractedValue);
        return true;
    }

    // Gas testing functions
    function gasIntensiveOperation(
        uint256 iterations
    ) external view returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < iterations; i++) {
            sum += i * 2;
        }
        return sum;
    }

    // Receive function for testing
    receive() external payable {
        // Accept ETH
    }

    // Fallback function
    fallback() external payable {
        revert("Function not found");
    }
}
