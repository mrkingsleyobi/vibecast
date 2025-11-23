import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustScoreNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TrustScoreNFT", function () {
  let trustScoreNFT: TrustScoreNFT;
  let owner: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const baseURI = "https://api.trustswarm.ai/metadata/{id}.json";
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test_merkle_root"));

  beforeEach(async function () {
    [owner, agent, user1, user2] = await ethers.getSigners();

    const TrustScoreNFT = await ethers.getContractFactory("TrustScoreNFT");
    trustScoreNFT = await TrustScoreNFT.deploy(baseURI);
    await trustScoreNFT.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await trustScoreNFT.owner()).to.equal(owner.address);
    });

    it("Should set the base URI", async function () {
      expect(await trustScoreNFT.uri(0)).to.equal(baseURI);
    });

    it("Should not have any authorized agents initially", async function () {
      expect(await trustScoreNFT.authorizedAgents(agent.address)).to.be.false;
    });
  });

  describe("Agent Authorization", function () {
    it("Should allow owner to authorize an agent", async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
      expect(await trustScoreNFT.authorizedAgents(agent.address)).to.be.true;
    });

    it("Should emit AgentAuthorized event", async function () {
      await expect(trustScoreNFT.authorizeAgent(agent.address))
        .to.emit(trustScoreNFT, "AgentAuthorized")
        .withArgs(agent.address);
    });

    it("Should allow owner to revoke agent", async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
      await trustScoreNFT.revokeAgent(agent.address);
      expect(await trustScoreNFT.authorizedAgents(agent.address)).to.be.false;
    });

    it("Should emit AgentRevoked event", async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
      await expect(trustScoreNFT.revokeAgent(agent.address))
        .to.emit(trustScoreNFT, "AgentRevoked")
        .withArgs(agent.address);
    });

    it("Should not allow non-owner to authorize agent", async function () {
      await expect(
        trustScoreNFT.connect(user1).authorizeAgent(agent.address)
      ).to.be.reverted;
    });
  });

  describe("Trust Score Updates", function () {
    beforeEach(async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
    });

    it("Should allow authorized agent to update trust score", async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        850,
        0, // low risk
        merkleRoot
      );

      const trustData = await trustScoreNFT.trustScores(user1.address);
      expect(trustData.score).to.equal(850);
      expect(trustData.riskLevel).to.equal(0);
      expect(trustData.merkleRoot).to.equal(merkleRoot);
      expect(trustData.isBlacklisted).to.be.false;
    });

    it("Should emit TrustScoreUpdated event", async function () {
      await expect(
        trustScoreNFT.connect(agent).updateTrustScore(
          user1.address,
          850,
          0,
          merkleRoot
        )
      ).to.emit(trustScoreNFT, "TrustScoreUpdated");
    });

    it("Should increment transaction count on update", async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        850,
        0,
        merkleRoot
      );
      let trustData = await trustScoreNFT.trustScores(user1.address);
      expect(trustData.transactionCount).to.equal(1);

      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        900,
        0,
        merkleRoot
      );
      trustData = await trustScoreNFT.trustScores(user1.address);
      expect(trustData.transactionCount).to.equal(2);
    });

    it("Should not allow unauthorized agent to update", async function () {
      await expect(
        trustScoreNFT.connect(user1).updateTrustScore(
          user2.address,
          850,
          0,
          merkleRoot
        )
      ).to.be.revertedWith("Not authorized agent");
    });

    it("Should not allow score above 1000", async function () {
      await expect(
        trustScoreNFT.connect(agent).updateTrustScore(
          user1.address,
          1001,
          0,
          merkleRoot
        )
      ).to.be.revertedWith("Invalid score");
    });

    it("Should not allow invalid risk level", async function () {
      await expect(
        trustScoreNFT.connect(agent).updateTrustScore(
          user1.address,
          850,
          4, // invalid (max is 3)
          merkleRoot
        )
      ).to.be.revertedWith("Invalid risk level");
    });
  });

  describe("Batch Updates", function () {
    beforeEach(async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
    });

    it("Should allow batch trust score updates", async function () {
      const entities = [user1.address, user2.address];
      const scores = [850, 750];
      const riskLevels = [0, 1];
      const merkleRoots = [merkleRoot, merkleRoot];

      await trustScoreNFT.connect(agent).batchUpdateTrustScores(
        entities,
        scores,
        riskLevels,
        merkleRoots
      );

      const trust1 = await trustScoreNFT.trustScores(user1.address);
      const trust2 = await trustScoreNFT.trustScores(user2.address);

      expect(trust1.score).to.equal(850);
      expect(trust2.score).to.equal(750);
    });

    it("Should revert if array lengths don't match", async function () {
      await expect(
        trustScoreNFT.connect(agent).batchUpdateTrustScores(
          [user1.address],
          [850, 750], // mismatched length
          [0],
          [merkleRoot]
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("Blacklist Management", function () {
    it("Should allow owner to blacklist entity", async function () {
      await trustScoreNFT.blacklistEntity(user1.address, "Fraud detected");

      const trustData = await trustScoreNFT.trustScores(user1.address);
      expect(trustData.isBlacklisted).to.be.true;
      expect(trustData.score).to.equal(0);
    });

    it("Should emit EntityBlacklisted event", async function () {
      await expect(
        trustScoreNFT.blacklistEntity(user1.address, "Fraud detected")
      ).to.emit(trustScoreNFT, "EntityBlacklisted");
    });

    it("Should allow owner to whitelist entity", async function () {
      await trustScoreNFT.blacklistEntity(user1.address, "Fraud detected");
      await trustScoreNFT.whitelistEntity(user1.address);

      const trustData = await trustScoreNFT.trustScores(user1.address);
      expect(trustData.isBlacklisted).to.be.false;
    });

    it("Should emit EntityWhitelisted event", async function () {
      await trustScoreNFT.blacklistEntity(user1.address, "Fraud detected");
      await expect(trustScoreNFT.whitelistEntity(user1.address))
        .to.emit(trustScoreNFT, "EntityWhitelisted");
    });

    it("Should not allow non-owner to blacklist", async function () {
      await expect(
        trustScoreNFT.connect(user1).blacklistEntity(user2.address, "Test")
      ).to.be.reverted;
    });
  });

  describe("Trust Verification", function () {
    beforeEach(async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
    });

    it("Should return true for trusted entity (score > 700)", async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        850,
        0,
        merkleRoot
      );

      expect(await trustScoreNFT.isTrusted(user1.address)).to.be.true;
    });

    it("Should return false for low trust entity", async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        600,
        2,
        merkleRoot
      );

      expect(await trustScoreNFT.isTrusted(user1.address)).to.be.false;
    });

    it("Should return false for blacklisted entity", async function () {
      await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        850,
        0,
        merkleRoot
      );
      await trustScoreNFT.blacklistEntity(user1.address, "Fraud");

      expect(await trustScoreNFT.isTrusted(user1.address)).to.be.false;
    });

    it("Should return false for entity with no score", async function () {
      expect(await trustScoreNFT.isTrusted(user1.address)).to.be.false;
    });
  });

  describe("Pausable", function () {
    beforeEach(async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
    });

    it("Should allow owner to pause", async function () {
      await trustScoreNFT.pause();
      expect(await trustScoreNFT.paused()).to.be.true;
    });

    it("Should allow owner to unpause", async function () {
      await trustScoreNFT.pause();
      await trustScoreNFT.unpause();
      expect(await trustScoreNFT.paused()).to.be.false;
    });

    it("Should prevent updates when paused", async function () {
      await trustScoreNFT.pause();

      await expect(
        trustScoreNFT.connect(agent).updateTrustScore(
          user1.address,
          850,
          0,
          merkleRoot
        )
      ).to.be.reverted;
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(trustScoreNFT.connect(user1).pause()).to.be.reverted;
    });
  });

  describe("Gas Optimization", function () {
    beforeEach(async function () {
      await trustScoreNFT.authorizeAgent(agent.address);
    });

    it("Should use reasonable gas for single update", async function () {
      const tx = await trustScoreNFT.connect(agent).updateTrustScore(
        user1.address,
        850,
        0,
        merkleRoot
      );
      const receipt = await tx.wait();
      expect(receipt?.gasUsed).to.be.lessThan(100000); // Should be < 100k gas
    });

    it("Should be more efficient for batch updates", async function () {
      const entities = Array(10).fill(0).map((_, i) =>
        ethers.Wallet.createRandom().address
      );
      const scores = Array(10).fill(850);
      const riskLevels = Array(10).fill(0);
      const merkleRoots = Array(10).fill(merkleRoot);

      const tx = await trustScoreNFT.connect(agent).batchUpdateTrustScores(
        entities,
        scores,
        riskLevels,
        merkleRoots
      );
      const receipt = await tx.wait();

      // Batch should be more efficient than 10 individual calls
      const gasPerUpdate = Number(receipt?.gasUsed) / 10;
      expect(gasPerUpdate).to.be.lessThan(50000); // < 50k per update in batch
    });
  });
});
