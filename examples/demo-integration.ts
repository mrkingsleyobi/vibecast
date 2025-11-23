/**
 * TrustSwarm Integration Demo
 *
 * Demonstrates using npx claude-flow@alpha and npx agentic-flow
 * for production fraud detection with AgentDB optimization
 */

import { createEnhancedOrchestrator } from '../lib/enhanced-swarm-orchestrator'
import type { TransactionData } from '../lib/swarm-orchestrator'

/**
 * Demo: Analyze suspicious transaction with enhanced swarm
 */
async function demoEnhancedAnalysis() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║      TrustSwarm Enhanced Integration Demo                  ║
║      Using claude-flow + agentic-flow + agentdb            ║
╚═══════════════════════════════════════════════════════════╝
  `)

  // Create enhanced orchestrator with all optimizations enabled
  const orchestrator = createEnhancedOrchestrator({
    enableClaudeFlow: true,
    enableAgenticFlow: true,
    optimization: {
      speed: true, // Enable QUIC (50-70% faster)
      cost: true, // Enable multi-model optimization
      quality: true // Maintain high accuracy
    },
    learning: {
      enableReasoningBank: true, // Learn successful patterns
      enableReflexion: true, // Self-critique and improvement
      enablePatternLearning: true // Store fraud patterns
    }
  })

  // Example 1: Legitimate transaction
  console.log('\n📊 Example 1: Analyzing legitimate transaction...\n')

  const legitimateTx: TransactionData = {
    txHash: '0xlegitimate123...',
    from: '0x1234567890abcdef1234567890abcdef12345678',
    to: '0xabcdef1234567890abcdef1234567890abcdef12',
    amount: 50,
    chain: 'base',
    memo: 'Payment for services rendered - Invoice #1234',
    timestamp: Date.now()
  }

  const result1 = await orchestrator.analyzeTransaction(legitimateTx)

  console.log(`
📈 Results:
   Trust Score: ${result1.score.overall}/1000
   Risk Level: ${result1.score.riskLevel.toUpperCase()}
   Confidence: ${(result1.score.confidence * 100).toFixed(1)}%

   Performance:
   • Total Latency: ${result1.performance.totalLatency.toFixed(0)}ms
   • Cost Savings: $${result1.performance.costSavings.toFixed(4)}
   • Models Used: ${JSON.stringify(result1.performance.modelUsed, null, 2)}

   Explainability:
   ${result1.score.explainability.map(e => `   - ${e}`).join('\n')}
  `)

  // Example 2: Phishing attempt
  console.log('\n📊 Example 2: Analyzing phishing attempt...\n')

  const phishingTx: TransactionData = {
    txHash: '0xphishing456...',
    from: '0x0000000000000000000000000000000000000001',
    to: '0x9999999999999999999999999999999999999999',
    amount: 10000,
    chain: 'ethereum',
    memo: 'URGENT: Verify your account immediately or it will be suspended! Click here now!',
    timestamp: Date.now()
  }

  const result2 = await orchestrator.analyzeTransaction(phishingTx)

  console.log(`
🚨 FRAUD DETECTED:
   Trust Score: ${result2.score.overall}/1000
   Risk Level: ${result2.score.riskLevel.toUpperCase()}
   Confidence: ${(result2.score.confidence * 100).toFixed(1)}%

   Performance:
   • Total Latency: ${result2.performance.totalLatency.toFixed(0)}ms
   • Cost Savings: $${result2.performance.costSavings.toFixed(4)}
   • Models Used: ${JSON.stringify(result2.performance.modelUsed, null, 2)}

   Fraud Indicators:
   ${result2.score.explainability.map(e => `   - ${e}`).join('\n')}
  `)

  // Example 3: Learn from feedback
  console.log('\n📊 Example 3: Learning from feedback...\n')

  await orchestrator.learnFromFeedback({
    taskId: result2.taskId,
    actualOutcome: 'fraud',
    notes: 'Confirmed phishing attempt, user reported'
  })

  // Example 4: Get performance report
  console.log('\n📊 Example 4: Performance Report...\n')

  const report = orchestrator.getPerformanceReport()

  console.log(`
📊 Overall Performance:

   Claude Flow Metrics:
   • Solve Rate: ${report.claudeFlow ? (report.claudeFlow.solveRate * 100).toFixed(1) : 'N/A'}%
   • Token Reduction: ${report.claudeFlow ? (report.claudeFlow.tokenReduction * 100).toFixed(1) : 'N/A'}%
   • Speed Improvement: ${report.claudeFlow ? report.claudeFlow.speedImprovement : 'N/A'}x
   • Memory Optimization: ${report.claudeFlow ? report.claudeFlow.memoryOptimization : 'N/A'}x

   Agentic Flow Metrics:
   • Total Savings: $${report.agenticFlow ? report.agenticFlow.totalSavings.toFixed(2) : '0.00'}
   • QUIC Speedup: ${report.agenticFlow ? report.agenticFlow.quicSpeedup : '1.0'}x

   AgentDB Stats:
   • Total Documents: ${report.agentDB.totalDocuments}
   • Fraud Patterns: ${report.agentDB.totalPatterns}
   • Trust Scores: ${report.agentDB.totalScores}
   • Collections: ${report.agentDB.collections}
  `)
}

/**
 * Run demo
 */
if (require.main === module) {
  demoEnhancedAnalysis()
    .then(() => {
      console.log('\n✅ Demo completed successfully!\n')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Demo failed:', error)
      process.exit(1)
    })
}

export default demoEnhancedAnalysis
