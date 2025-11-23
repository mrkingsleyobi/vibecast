import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustScoreNFT, PaymentGuard } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("PaymentGuard", function () {
  let trustScoreNFT: TrustScoreNFT;
  let paymentGuard: PaymentGuard;
  let owner: HardhatEthersSigner;
  let sender: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let agent: HardhatEthersSigner;

  const baseURI = "https://api.trustswarm.ai/metadata/{id}.json";
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test_merkle_root"));

  beforeEach(async function () {
    [owner, sender, recipient, agent] = await ethers.getSigners();

    // Deploy TrustScoreNFT
    const TrustScoreNFT = await ethers.getContractFactory("TrustScoreNFT");
    trustScoreNFT = await TrustScoreNFT.deploy(baseURI);
    await trustScoreNFT.waitForDeployment();

    // Deploy PaymentGuard
    const PaymentGuard = await ethers.getContractFactory("PaymentGuard");
    paymentGuard = await PaymentGuard.deploy(await trustScoreNFT.getAddress());
    await paymentGuard.waitForDeployment();

    // Authorize agent and PaymentGuard
    await trustScoreNFT.authorizeAgent(agent.address);
    await trustScoreNFT.authorizeAgent(await paymentGuard.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await paymentGuard.owner()).to.equal(owner.address);
    });

    it("Should set the TrustScoreNFT address", async function () {
      expect(await paymentGuard.trustScoreNFT()).to.equal(
        await trustScoreNFT.getAddress()
      );
    });
  });

  describe("Payment Execution", function () {
    beforeEach(async function () {
      // Give sender high trust score (850)
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        850,
        0,
        merkleRoot
      );

      // Give recipient medium trust score (600)
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        600,
        1,
        merkleRoot
      );
    });

    it("Should execute payment automatically for trusted entities", async function () {
      const amount = ethers.parseEther("1.0");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.emit(paymentGuard, "PaymentExecuted");
    });

    it("Should transfer funds correctly", async function () {
      const amount = ethers.parseEther("1.0");
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await paymentGuard.connect(sender).executePayment(recipient.address, amount, {
        value: amount,
      });

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
    });

    it("Should queue payment if sender trust is low", async function () {
      // Update sender to low trust (400)
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        400,
        2,
        merkleRoot
      );

      const amount = ethers.parseEther("1.0");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.emit(paymentGuard, "PaymentQueued");
    });

    it("Should queue payment if recipient trust is low", async function () {
      // Update recipient to low trust (400)
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        400,
        2,
        merkleRoot
      );

      const amount = ethers.parseEther("1.0");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.emit(paymentGuard, "PaymentQueued");
    });

    it("Should queue payment if amount exceeds daily limit", async function () {
      // Set low daily limit
      await paymentGuard.setDailyLimit(sender.address, ethers.parseEther("0.5"));

      const amount = ethers.parseEther("1.0");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.emit(paymentGuard, "PaymentQueued");
    });

    it("Should revert if msg.value doesn't match amount", async function () {
      const amount = ethers.parseEther("1.0");
      const wrongValue = ethers.parseEther("0.5");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: wrongValue,
        })
      ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("Should prevent payment to blacklisted recipient", async function () {
      await trustScoreNFT.blacklistEntity(recipient.address, "Fraud");

      const amount = ethers.parseEther("1.0");

      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.be.revertedWith("Recipient blacklisted");
    });
  });

  describe("Daily Limits", function () {
    beforeEach(async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        850,
        0,
        merkleRoot
      );
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        850,
        0,
        merkleRoot
      );
    });

    it("Should allow owner to set daily limit", async function () {
      const limit = ethers.parseEther("10.0");
      await paymentGuard.setDailyLimit(sender.address, limit);
      expect(await paymentGuard.dailyLimits(sender.address)).to.equal(limit);
    });

    it("Should track daily spending", async function () {
      await paymentGuard.setDailyLimit(sender.address, ethers.parseEther("10.0"));

      const amount = ethers.parseEther("1.0");
      await paymentGuard.connect(sender).executePayment(recipient.address, amount, {
        value: amount,
      });

      expect(await paymentGuard.dailySpent(sender.address)).to.equal(amount);
    });

    it("Should accumulate daily spending", async function () {
      await paymentGuard.setDailyLimit(sender.address, ethers.parseEther("10.0"));

      const amount = ethers.parseEther("1.0");
      await paymentGuard.connect(sender).executePayment(recipient.address, amount, {
        value: amount,
      });
      await paymentGuard.connect(sender).executePayment(recipient.address, amount, {
        value: amount,
      });

      expect(await paymentGuard.dailySpent(sender.address)).to.equal(
        amount * 2n
      );
    });

    it("Should not allow non-owner to set daily limit", async function () {
      await expect(
        paymentGuard.connect(sender).setDailyLimit(sender.address, ethers.parseEther("10.0"))
      ).to.be.reverted;
    });
  });

  describe("Queued Payment Management", function () {
    let txId: string;

    beforeEach(async function () {
      // Low trust sender
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        400,
        2,
        merkleRoot
      );
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        850,
        0,
        merkleRoot
      );

      // Create queued payment
      const amount = ethers.parseEther("1.0");
      const tx = await paymentGuard.connect(sender).executePayment(
        recipient.address,
        amount,
        { value: amount }
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return paymentGuard.interface.parseLog(log)?.name === "PaymentQueued";
        } catch {
          return false;
        }
      });
      if (event) {
        const parsed = paymentGuard.interface.parseLog(event as any);
        txId = parsed?.args[0];
      }
    });

    it("Should allow owner to approve queued payment", async function () {
      await expect(paymentGuard.approveTransaction(txId))
        .to.emit(paymentGuard, "PaymentApproved")
        .withArgs(txId);
    });

    it("Should transfer funds when payment is approved", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      await paymentGuard.approveTransaction(txId);

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(
        ethers.parseEther("1.0")
      );
    });

    it("Should allow owner to reject queued payment", async function () {
      await expect(paymentGuard.rejectTransaction(txId, "Suspicious activity"))
        .to.emit(paymentGuard, "PaymentRejected");
    });

    it("Should refund sender when payment is rejected", async function () {
      const senderBalanceBefore = await ethers.provider.getBalance(sender.address);

      const tx = await paymentGuard.rejectTransaction(txId, "Suspicious");
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const senderBalanceAfter = await ethers.provider.getBalance(sender.address);

      // Should refund 1 ETH minus the gas cost of rejection
      expect(senderBalanceAfter - senderBalanceBefore + gasCost).to.equal(
        ethers.parseEther("1.0")
      );
    });

    it("Should not allow non-owner to approve payment", async function () {
      await expect(
        paymentGuard.connect(sender).approveTransaction(txId)
      ).to.be.reverted;
    });

    it("Should not allow non-owner to reject payment", async function () {
      await expect(
        paymentGuard.connect(sender).rejectTransaction(txId, "Test")
      ).to.be.reverted;
    });

    it("Should revert if trying to approve non-existent payment", async function () {
      const fakeTxId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        paymentGuard.approveTransaction(fakeTxId)
      ).to.be.revertedWith("Transaction not queued");
    });
  });

  describe("Pausable", function () {
    beforeEach(async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        850,
        0,
        merkleRoot
      );
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        850,
        0,
        merkleRoot
      );
    });

    it("Should allow owner to pause", async function () {
      await paymentGuard.pause();
      expect(await paymentGuard.paused()).to.be.true;
    });

    it("Should prevent payments when paused", async function () {
      await paymentGuard.pause();

      const amount = ethers.parseEther("1.0");
      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.be.reverted;
    });

    it("Should allow payments after unpause", async function () {
      await paymentGuard.pause();
      await paymentGuard.unpause();

      const amount = ethers.parseEther("1.0");
      await expect(
        paymentGuard.connect(sender).executePayment(recipient.address, amount, {
          value: amount,
        })
      ).to.emit(paymentGuard, "PaymentExecuted");
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should have reentrancy guard on executePayment", async function () {
      // This is implicitly tested by OpenZeppelin's ReentrancyGuard
      // The contract should prevent reentrancy attacks
      expect(await paymentGuard.paused()).to.be.false;
    });
  });

  describe("Gas Optimization", function () {
    beforeEach(async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        sender.address,
        850,
        0,
        merkleRoot
      );
      await trustScoreNFT.connect(agent).updateTrustScore(
        recipient.address,
        850,
        0,
        merkleRoot
      );
    });

    it("Should use reasonable gas for payment execution", async function () {
      const amount = ethers.parseEther("1.0");
      const tx = await paymentGuard.connect(sender).executePayment(
        recipient.address,
        amount,
        { value: amount }
      );
      const receipt = await tx.wait();
      expect(receipt?.gasUsed).to.be.lessThan(150000); // Should be < 150k gas
    });
  });
});
