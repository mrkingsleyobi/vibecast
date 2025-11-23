import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Starting TrustSwarm smart contract deployment...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy TrustScoreNFT
  console.log("📦 Deploying TrustScoreNFT...");
  const TrustScoreNFT = await ethers.getContractFactory("TrustScoreNFT");
  const trustScoreNFT = await TrustScoreNFT.deploy(
    "https://api.trustswarm.ai/metadata/{id}.json" // Base URI for metadata
  );
  await trustScoreNFT.waitForDeployment();
  const trustScoreAddress = await trustScoreNFT.getAddress();
  console.log("✅ TrustScoreNFT deployed to:", trustScoreAddress);

  // Deploy PaymentGuard
  console.log("\n📦 Deploying PaymentGuard...");
  const PaymentGuard = await ethers.getContractFactory("PaymentGuard");
  const paymentGuard = await PaymentGuard.deploy(trustScoreAddress);
  await paymentGuard.waitForDeployment();
  const paymentGuardAddress = await paymentGuard.getAddress();
  console.log("✅ PaymentGuard deployed to:", paymentGuardAddress);

  // Authorize PaymentGuard as an agent
  console.log("\n🔐 Authorizing PaymentGuard as agent...");
  const authTx = await trustScoreNFT.authorizeAgent(paymentGuardAddress);
  await authTx.wait();
  console.log("✅ PaymentGuard authorized");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Summary");
  console.log("=".repeat(60));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("\nContract Addresses:");
  console.log("  TrustScoreNFT:", trustScoreAddress);
  console.log("  PaymentGuard:", paymentGuardAddress);
  console.log("\nDeployer:", deployer.address);
  console.log("Remaining Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("=".repeat(60));

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      TrustScoreNFT: trustScoreAddress,
      PaymentGuard: paymentGuardAddress,
    },
  };

  console.log("\n📄 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Verification instructions
  console.log("\n📋 To verify contracts on Basescan, run:");
  console.log(`npx hardhat verify --network baseSepolia ${trustScoreAddress} "https://api.trustswarm.ai/metadata/{id}.json"`);
  console.log(`npx hardhat verify --network baseSepolia ${paymentGuardAddress} ${trustScoreAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
