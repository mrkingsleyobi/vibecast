/**
 * Initialize AgentDB Database
 * Creates tables/collections and seeds initial data
 */

import { getAgentDB } from '../lib/agentdb'
import { generateEmbedding } from '../lib/embeddings'

async function main() {
  console.log('🚀 Initializing TrustSwarm AgentDB Database...\n')

  const agentdb = getAgentDB()

  // Get initial stats
  const initialStats = agentdb.getStats()
  console.log('📊 Initial Stats:')
  console.log(`  Total Documents: ${initialStats.totalDocuments}`)
  console.log(`  Total Patterns: ${initialStats.totalPatterns}`)
  console.log(`  Total Scores: ${initialStats.totalScores}`)
  console.log(`  Collections: ${initialStats.collections}\n`)

  // Seed fraud patterns
  console.log('📝 Seeding fraud patterns...')

  const fraudPatterns = [
    {
      description: 'Urgent account verification request with threat of suspension',
      category: 'phishing' as const,
      riskLevel: 'critical' as const,
      indicators: ['urgent', 'verify', 'suspended', 'immediately', 'click here'],
    },
    {
      description: 'Too-good-to-be-true investment opportunity with guaranteed returns',
      category: 'ponzi-scheme' as const,
      riskLevel: 'critical' as const,
      indicators: ['guaranteed', 'returns', 'investment', 'opportunity', 'limited time'],
    },
    {
      description: 'Request to send crypto to claim prize or inheritance',
      category: 'advance-fee-fraud' as const,
      riskLevel: 'critical' as const,
      indicators: ['prize', 'winner', 'inheritance', 'send', 'claim'],
    },
    {
      description: 'Fake customer support asking for private keys or seed phrases',
      category: 'credential-theft' as const,
      riskLevel: 'critical' as const,
      indicators: ['support', 'private key', 'seed phrase', 'recovery', 'verify wallet'],
    },
    {
      description: 'Unusual transaction pattern with rapid successive transfers',
      category: 'wash-trading' as const,
      riskLevel: 'high' as const,
      indicators: ['rapid transfers', 'same addresses', 'circular pattern'],
    },
    {
      description: 'Token approval for unlimited amount to unknown contract',
      category: 'approval-scam' as const,
      riskLevel: 'high' as const,
      indicators: ['unlimited approval', 'unknown contract', 'approve all'],
    },
    {
      description: 'Liquidity pool creation followed by immediate drain',
      category: 'rug-pull' as const,
      riskLevel: 'critical' as const,
      indicators: ['new pool', 'liquidity drain', 'dev wallet', 'honeypot'],
    },
    {
      description: 'Transaction from known mixer or tumbler service',
      category: 'money-laundering' as const,
      riskLevel: 'high' as const,
      indicators: ['mixer', 'tumbler', 'tornado cash', 'privacy protocol'],
    },
    {
      description: 'Duplicate transactions with slightly different amounts',
      category: 'double-spending-attempt' as const,
      riskLevel: 'medium' as const,
      indicators: ['duplicate tx', 'similar amounts', 'same recipient'],
    },
    {
      description: 'Transaction with suspiciously low gas price during network congestion',
      category: 'front-running' as const,
      riskLevel: 'medium' as const,
      indicators: ['low gas', 'mempool manipulation', 'sandwich attack'],
    },
  ]

  for (const pattern of fraudPatterns) {
    const embedding = await generateEmbedding(pattern.description)
    const id = agentdb.storeFraudPattern({
      ...pattern,
      embedding,
      occurrences: Math.floor(Math.random() * 50) + 10, // Random historical occurrences
      lastSeen: Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000), // Random within last 30 days
    })
    console.log(`  ✅ Stored pattern: ${pattern.category} (${id.substring(0, 8)}...)`)
  }

  // Seed example trust scores
  console.log('\n📝 Seeding example trust scores...')

  const exampleAddresses = [
    { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', score: 950, riskLevel: 'low' as const },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', score: 920, riskLevel: 'low' as const }, // Tether
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', score: 930, riskLevel: 'low' as const }, // USDC
    { address: '0x1234567890123456789012345678901234567890', score: 650, riskLevel: 'medium' as const },
    { address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', score: 300, riskLevel: 'high' as const },
    { address: '0x0000000000000000000000000000000000000000', score: 100, riskLevel: 'critical' as const },
  ]

  for (const { address, score, riskLevel } of exampleAddresses) {
    agentdb.upsertTrustScore({
      address,
      overall: score,
      dimensions: {
        transactionPatterns: score + Math.floor(Math.random() * 100) - 50,
        entityReputation: score + Math.floor(Math.random() * 100) - 50,
        sentimentRisk: Math.floor(Math.random() * 100),
        documentValidity: score + Math.floor(Math.random() * 100) - 50,
        networkTrust: score + Math.floor(Math.random() * 100) - 50,
      },
      confidence: 0.85 + Math.random() * 0.1,
      riskLevel,
      lastUpdated: Date.now(),
      explainability: [`Trust score: ${score}/1000`, `Risk level: ${riskLevel}`],
    })
    console.log(`  ✅ Stored trust score for ${address.substring(0, 10)}... (${score})`)
  }

  // Seed example reflexion memory
  console.log('\n📝 Seeding reflexion memory...')

  const reflexions = [
    {
      decisionId: 'task-001',
      taskType: 'fraud-analysis' as const,
      initialPrediction: 'fraud',
      actualOutcome: 'fraud',
      predictionCorrect: true,
      critique: 'Successfully identified phishing keywords and urgency tactics',
      improvement: 'Reinforce urgency keyword detection pattern',
      timestamp: Date.now() - 86400000, // 1 day ago
      agentId: 'sentiment-agent',
    },
    {
      decisionId: 'task-002',
      taskType: 'fraud-analysis' as const,
      initialPrediction: 'legitimate',
      actualOutcome: 'fraud',
      predictionCorrect: false,
      critique: 'Missed subtle phishing indicators in transaction memo',
      improvement: 'Increase weight for subtle phishing patterns',
      timestamp: Date.now() - 172800000, // 2 days ago
      agentId: 'sentiment-agent',
    },
    {
      decisionId: 'task-003',
      taskType: 'trust-scoring' as const,
      initialPrediction: 'high-risk',
      actualOutcome: 'high-risk',
      predictionCorrect: true,
      critique: 'Correctly identified wash trading pattern',
      improvement: 'Continue monitoring circular transfer patterns',
      timestamp: Date.now() - 259200000, // 3 days ago
      agentId: 'pattern-agent',
    },
  ]

  for (const reflexion of reflexions) {
    const id = agentdb.storeReflexion(reflexion)
    console.log(`  ✅ Stored reflexion: ${reflexion.decisionId} (${reflexion.predictionCorrect ? 'correct' : 'incorrect'})`)
  }

  // Get final stats
  console.log('\n📊 Final Stats:')
  const finalStats = agentdb.getStats()
  console.log(`  Total Documents: ${finalStats.totalDocuments}`)
  console.log(`  Total Patterns: ${finalStats.totalPatterns}`)
  console.log(`  Total Scores: ${finalStats.totalScores}`)
  console.log(`  Collections: ${finalStats.collections}`)

  console.log('\n✅ Database initialization complete!')
  console.log('\n💡 Test the database with:')
  console.log('   npm run dev')
  console.log('   Or run: npx ts-node examples/demo-integration.ts')
}

main()
  .then(() => {
    console.log('\n🎉 Success!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
