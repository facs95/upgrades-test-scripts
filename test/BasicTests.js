const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EVM Chain Test Contracts", function () {
  let testContract;
  let testERC20;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy TestContract
    const TestContract = await ethers.getContractFactory("TestContract");
    testContract = await TestContract.deploy();
    await testContract.waitForDeployment();

    // Deploy TestERC20
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    testERC20 = await TestERC20.deploy("Test Token", "TEST", 18, 1000000);
    await testERC20.waitForDeployment();
  });

  describe("TestContract", function () {
    it("Should have correct initial state", async function () {
      expect(await testContract.getCounter()).to.equal(0);
      expect(await testContract.getMessage()).to.equal("Initial message");
      expect(await testContract.owner()).to.equal(owner.address);
      expect(await testContract.isActive()).to.equal(true);
    });

    it("Should increment counter correctly", async function () {
      await testContract.incrementCounter();
      expect(await testContract.getCounter()).to.equal(1);

      await testContract.incrementCounterBy(5);
      expect(await testContract.getCounter()).to.equal(6);
    });

    it("Should handle pure functions correctly", async function () {
      expect(await testContract.add(10, 20)).to.equal(30);
      expect(await testContract.multiply(5, 6)).to.equal(30);
      expect(await testContract.concatenateStrings("Hello", "World")).to.equal("HelloWorld");
    });

    it("Should handle payable functions", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await testContract.deposit({ value: depositAmount });
      expect(await testContract.getBalance(owner.address)).to.equal(depositAmount);
      expect(await testContract.getContractBalance()).to.equal(depositAmount);
    });

    it("Should allow only owner to set message", async function () {
      const newMessage = "New test message";
      await testContract.setMessage(newMessage);
      expect(await testContract.getMessage()).to.equal(newMessage);

      // Should revert when non-owner tries to set message
      await expect(
        testContract.connect(addr1).setMessage("Should fail")
      ).to.be.revertedWith("Not the owner");
    });

    it("Should handle array operations", async function () {
      await testContract.addToArray(100);
      await testContract.addToArray(200);

      expect(await testContract.getArrayLength()).to.equal(2);
      expect(await testContract.getArrayElement(0)).to.equal(100);
      expect(await testContract.getArrayElement(1)).to.equal(200);

      await testContract.removeLastElement();
      expect(await testContract.getArrayLength()).to.equal(1);
    });

    it("Should emit events correctly", async function () {
      await expect(testContract.incrementCounter())
        .to.emit(testContract, "CounterIncremented")
        .withArgs(1, owner.address);

      const newMessage = "Event test message";
      await expect(testContract.setMessage(newMessage))
        .to.emit(testContract, "MessageUpdated")
        .withArgs("Initial message", newMessage);
    });

    it("Should handle user registration", async function () {
      const userName = "TestUser";
      const userAge = 25;

      await expect(testContract.registerUser(userName, userAge))
        .to.emit(testContract, "UserRegistered")
        .withArgs(owner.address, userName, userAge);

      const userInfo = await testContract.getUser(owner.address);
      expect(userInfo[0]).to.equal(userName); // name
      expect(userInfo[1]).to.equal(userAge);  // age
      expect(userInfo[2]).to.equal(true);     // isRegistered

      expect(await testContract.getUserCount()).to.equal(1);
    });

    it("Should handle custom errors", async function () {
      await expect(
        testContract.forceCustomError(1000, 500)
      ).to.be.revertedWithCustomError(testContract, "InsufficientBalance")
        .withArgs(1000, 500);
    });
  });

  describe("TestERC20", function () {
    it("Should have correct initial state", async function () {
      expect(await testERC20.name()).to.equal("Test Token");
      expect(await testERC20.symbol()).to.equal("TEST");
      expect(await testERC20.decimals()).to.equal(18);
      expect(await testERC20.totalSupply()).to.equal(ethers.parseUnits("1000000", 18));
      expect(await testERC20.owner()).to.equal(owner.address);
      expect(await testERC20.balanceOf(owner.address)).to.equal(ethers.parseUnits("1000000", 18));
    });

    it("Should transfer tokens correctly", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);

      await expect(testERC20.transfer(addr1.address, transferAmount))
        .to.emit(testERC20, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);

      expect(await testERC20.balanceOf(addr1.address)).to.equal(transferAmount);
      expect(await testERC20.balanceOf(owner.address)).to.equal(
        ethers.parseUnits("999000", 18)
      );
    });

    it("Should handle approvals and transferFrom", async function () {
      const approveAmount = ethers.parseUnits("500", 18);
      const transferAmount = ethers.parseUnits("300", 18);

      // Approve addr1 to spend owner's tokens
      await expect(testERC20.approve(addr1.address, approveAmount))
        .to.emit(testERC20, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);

      expect(await testERC20.allowance(owner.address, addr1.address)).to.equal(approveAmount);

      // Transfer from owner to addr2 via addr1
      await expect(
        testERC20.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.emit(testERC20, "Transfer")
        .withArgs(owner.address, addr2.address, transferAmount);

      expect(await testERC20.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await testERC20.allowance(owner.address, addr1.address)).to.equal(
        approveAmount - transferAmount
      );
    });

    it("Should mint tokens correctly", async function () {
      const mintAmount = ethers.parseUnits("10000", 18);
      const initialSupply = await testERC20.totalSupply();

      await expect(testERC20.mint(addr1.address, mintAmount))
        .to.emit(testERC20, "Mint")
        .withArgs(addr1.address, mintAmount)
        .and.to.emit(testERC20, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, mintAmount);

      expect(await testERC20.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await testERC20.totalSupply()).to.equal(initialSupply + mintAmount);
    });

    it("Should burn tokens correctly", async function () {
      const burnAmount = ethers.parseUnits("1000", 18);
      const initialSupply = await testERC20.totalSupply();
      const initialBalance = await testERC20.balanceOf(owner.address);

      await expect(testERC20.burn(burnAmount))
        .to.emit(testERC20, "Burn")
        .withArgs(owner.address, burnAmount)
        .and.to.emit(testERC20, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, burnAmount);

      expect(await testERC20.balanceOf(owner.address)).to.equal(initialBalance - burnAmount);
      expect(await testERC20.totalSupply()).to.equal(initialSupply - burnAmount);
    });

    it("Should handle pausing correctly", async function () {
      await testERC20.pause();
      expect(await testERC20.paused()).to.equal(true);

      // Should revert transfers when paused
      await expect(
        testERC20.transfer(addr1.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(testERC20, "ContractPaused");

      await testERC20.unpause();
      expect(await testERC20.paused()).to.equal(false);

      // Should work after unpausing
      await expect(
        testERC20.transfer(addr1.address, ethers.parseUnits("100", 18))
      ).to.not.be.reverted;
    });

    it("Should handle blacklisting correctly", async function () {
      await testERC20.blacklist(addr1.address);
      expect(await testERC20.isBlacklisted(addr1.address)).to.equal(true);

      // Should revert transfers to/from blacklisted address
      await expect(
        testERC20.transfer(addr1.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(testERC20, "BlacklistedAccount")
        .withArgs(addr1.address);

      await testERC20.unblacklist(addr1.address);
      expect(await testERC20.isBlacklisted(addr1.address)).to.equal(false);
    });

    it("Should handle batch operations", async function () {
      const recipients = [addr1.address, addr2.address];
      const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];

      await expect(testERC20.batchTransfer(recipients, amounts))
        .to.emit(testERC20, "Transfer")
        .withArgs(owner.address, addr1.address, amounts[0])
        .and.to.emit(testERC20, "Transfer")
        .withArgs(owner.address, addr2.address, amounts[1]);

      expect(await testERC20.balanceOf(addr1.address)).to.equal(amounts[0]);
      expect(await testERC20.balanceOf(addr2.address)).to.equal(amounts[1]);
    });

    it("Should reject invalid operations", async function () {
      const largeAmount = ethers.parseUnits("2000000", 18); // More than total supply

      await expect(
        testERC20.transfer(addr1.address, largeAmount)
      ).to.be.revertedWithCustomError(testERC20, "InsufficientBalance");

      await expect(
        testERC20.connect(addr1).transferFrom(owner.address, addr2.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(testERC20, "InsufficientAllowance");
    });

    it("Should only allow owner functions", async function () {
      await expect(
        testERC20.connect(addr1).mint(addr2.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(testERC20, "OnlyOwner");

      await expect(
        testERC20.connect(addr1).pause()
      ).to.be.revertedWithCustomError(testERC20, "OnlyOwner");

      await expect(
        testERC20.connect(addr1).blacklist(addr2.address)
      ).to.be.revertedWithCustomError(testERC20, "OnlyOwner");
    });

    it("Should track statistics correctly", async function () {
      const initialTransferCount = await testERC20.getTransferCount();
      const initialMintCount = await testERC20.getMintCount();
      const initialBurnCount = await testERC20.getBurnCount();

      await testERC20.transfer(addr1.address, ethers.parseUnits("100", 18));
      await testERC20.mint(addr2.address, ethers.parseUnits("200", 18));
      await testERC20.burn(ethers.parseUnits("50", 18));

      expect(await testERC20.getTransferCount()).to.equal(initialTransferCount + 1n);
      expect(await testERC20.getMintCount()).to.equal(initialMintCount + 1n);
      expect(await testERC20.getBurnCount()).to.equal(initialBurnCount + 1n);
    });
  });

  describe("Gas Usage Analysis", function () {
    it("Should measure gas usage for different operations", async function () {
      // Basic transfer
      const transferTx = await testContract.incrementCounter();
      const transferReceipt = await transferTx.wait();
      console.log(`Gas used for incrementCounter: ${transferReceipt.gasUsed.toString()}`);

      // ERC20 transfer
      const erc20TransferTx = await testERC20.transfer(addr1.address, ethers.parseUnits("100", 18));
      const erc20TransferReceipt = await erc20TransferTx.wait();
      console.log(`Gas used for ERC20 transfer: ${erc20TransferReceipt.gasUsed.toString()}`);

      // Contract deployment gas was already measured in beforeEach
      console.log(`TestContract deployed at: ${await testContract.getAddress()}`);
      console.log(`TestERC20 deployed at: ${await testERC20.getAddress()}`);
    });
  });
});
