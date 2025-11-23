/**
 * TrustSwarm Orchestrator
 *
 * Multi-agent swarm coordination for real-time fraud detection
 * Uses Queen-Worker architecture with distributed intelligence
 */

import { AgentDB, TrustScore, FraudPattern, getAgentDB } from './agentdb'
import { generateEmbedding } from './embeddings'

// Transaction data structure
export interface TransactionData {
  txHash: string
  from: string
  to: string
  amount: number
  chain: 'ethereum' | 'base' | 'optimism'
  memo?: string
  timestamp: number
  metadata?: Record<string, any>
}

// Agent types
export type AgentType =
  | 'queen'
  | 'sentiment'
  | 'pattern'
  | 'ner'
  | 'document'
  | 'behavioral'

// Agent result
export interface AgentResult {
  agentType: AgentType
  confidence: number
  riskScore: number
  findings: string[]
  evidence: any
  executionTime: number
}

// Analysis task
export interface AnalysisTask {
  id: string
  transactionData: TransactionData
  priority: 'low' | 'normal' | 'high' | 'critical'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  agentResults: AgentResult[]
  finalScore?: TrustScore
  createdAt: number
  completedAt?: number
}

// Worker Agent interface
interface WorkerAgent {
  type: AgentType
  analyze(data: TransactionData): Promise<AgentResult>
  confidence: number
}

/**
 * TrustSwarm Orchestrator
 * Coordinates multiple AI agents for fraud detection
 */
export class TrustSwarmOrchestrator {
  private memory: AgentDB
  private workers: Map<AgentType, WorkerAgent>
  private activeTasks: Map<string, AnalysisTask>

  constructor() {
    this.memory = getAgentDB()
    this.workers = new Map()
    this.activeTasks = new Map()

    // Initialize worker agents
    this.initializeWorkers()
  }

  /**
   * Initialize specialized worker agents
   */
  private initializeWorkers(): void {
    // Sentiment Analysis Agent
    this.workers.set('sentiment', {
      type: 'sentiment',
      confidence: 0.92,
      analyze: async (data: TransactionData): Promise<AgentResult> => {
        const startTime = performance.now()
        const findings: string[] = []
        let riskScore = 0

        // Analyze transaction memo for phishing/scam indicators
        if (data.memo) {
          const memo = data.memo.toLowerCase()

          // Check for urgency keywords (phishing indicator)
          const urgencyKeywords = [
            'urgent',
            'immediate',
            'verify',
            'suspended',
            'expire',
            'act now',
            'limited time',
          ]
          const hasUrgency = urgencyKeywords.some((keyword) =>
            memo.includes(keyword)
          )
          if (hasUrgency) {
            riskScore += 0.3
            findings.push('Urgent language detected (phishing indicator)')
          }

          // Check for suspicious requests
          const suspiciousRequests = [
            'password',
            'private key',
            'seed phrase',
            'recovery',
            'confirm',
            'validate',
          ]
          const hasSuspiciousRequest = suspiciousRequests.some((keyword) =>
            memo.includes(keyword)
          )
          if (hasSuspiciousRequest) {
            riskScore += 0.4
            findings.push('Suspicious information request detected')
          }

          // Check for impersonation
          if (memo.includes('support') || memo.includes('official')) {
            riskScore += 0.2
            findings.push('Potential impersonation attempt')
          }
        }

        return {
          agentType: 'sentiment',
          confidence: 0.92,
          riskScore: Math.min(riskScore, 1.0),
          findings,
          evidence: { memo: data.memo },
          executionTime: performance.now() - startTime,
        }
      },
    })

    // Pattern Recognition Agent
    this.workers.set('pattern', {
      type: 'pattern',
      confidence: 0.89,
      analyze: async (data: TransactionData): Promise<AgentResult> => {
        const startTime = performance.now()
        const findings: string[] = []
        let riskScore = 0

        // Generate embedding for transaction
        const txDescription = `${data.from} sends ${data.amount} to ${data.to} on ${data.chain}. ${data.memo || ''}`
        const embedding = await generateEmbedding(txDescription)

        // Search for similar fraud patterns in memory
        const similarPatterns = this.memory.searchFraudPatterns(embedding, 5)

        if (similarPatterns.length > 0) {
          const highRiskPatterns = similarPatterns.filter(
            (p) => p.riskLevel === 'critical' || p.riskLevel === 'high'
          )

          if (highRiskPatterns.length > 0) {
            riskScore = 0.7
            findings.push(
              `Matches ${highRiskPatterns.length} known fraud pattern(s)`
            )
            findings.push(
              `Most similar: ${highRiskPatterns[0].description} (${Math.round(highRiskPatterns[0].score * 100)}% match)`
            )
          } else {
            riskScore = 0.3
            findings.push('Matches low-risk historical patterns')
          }
        }

        // Check for unusual transaction amounts
        if (data.amount > 100000) {
          riskScore += 0.2
          findings.push('Unusually high transaction amount')
        }

        // Check for round number (potential automated attack)
        if (data.amount % 1000 === 0 && data.amount > 10000) {
          riskScore += 0.15
          findings.push('Round number transaction (potential automation)')
        }

        return {
          agentType: 'pattern',
          confidence: 0.89,
          riskScore: Math.min(riskScore, 1.0),
          findings,
          evidence: { similarPatterns, embedding },
          executionTime: performance.now() - startTime,
        }
      },
    })

    // Named Entity Recognition Agent
    this.workers.set('ner', {
      type: 'ner',
      confidence: 0.87,
      analyze: async (data: TransactionData): Promise<AgentResult> => {
        const startTime = performance.now()
        const findings: string[] = []
        let riskScore = 0

        // Check if addresses are in blacklist (simulated)
        const knownScamAddresses = [
          '0x0000000000000000000000000000000000000000', // Burn address
        ]

        if (
          knownScamAddresses.includes(data.from) ||
          knownScamAddresses.includes(data.to)
        ) {
          riskScore = 0.9
          findings.push('Address associated with known scams')
        }

        // Check for new addresses (< 1 day old) - simulated
        // In production, would check on-chain data
        if (data.from.toLowerCase().startsWith('0x000')) {
          riskScore += 0.3
          findings.push('Sender is a newly created address')
        }

        // Extract entities from memo
        if (data.memo) {
          const entities = {
            addresses: data.memo.match(/0x[a-fA-F0-9]{40}/g) || [],
            urls: data.memo.match(/https?:\/\/[^\s]+/g) || [],
            emails: data.memo.match(/\S+@\S+\.\S+/g) || [],
          }

          if (entities.urls.length > 0) {
            riskScore += 0.25
            findings.push(`Suspicious URLs detected: ${entities.urls.length}`)
          }

          if (entities.emails.length > 0) {
            findings.push(`Email addresses found: ${entities.emails.length}`)
          }
        }

        return {
          agentType: 'ner',
          confidence: 0.87,
          riskScore: Math.min(riskScore, 1.0),
          findings,
          evidence: { from: data.from, to: data.to },
          executionTime: performance.now() - startTime,
        }
      },
    })

    // Behavioral Analysis Agent
    this.workers.set('behavioral', {
      type: 'behavioral',
      confidence: 0.85,
      analyze: async (data: TransactionData): Promise<AgentResult> => {
        const startTime = performance.now()
        const findings: string[] = []
        let riskScore = 0

        // Get historical trust score
        const existingScore = this.memory.getTrustScore(data.from)

        if (existingScore) {
          if (existingScore.overall < 300) {
            riskScore = 0.8
            findings.push(
              `Sender has low trust score: ${existingScore.overall}/1000`
            )
          } else if (existingScore.overall < 500) {
            riskScore = 0.4
            findings.push(
              `Sender has medium trust score: ${existingScore.overall}/1000`
            )
          } else {
            findings.push(
              `Sender has good trust score: ${existingScore.overall}/1000`
            )
          }

          if (existingScore.riskLevel === 'critical') {
            riskScore = Math.max(riskScore, 0.9)
            findings.push('Sender marked as critical risk')
          }
        } else {
          riskScore = 0.5
          findings.push('No historical data for sender (new entity)')
        }

        // Check transaction velocity (simulated)
        // In production, would track actual transaction history
        const isHighVelocity = data.amount > 50000
        if (isHighVelocity && (!existingScore || existingScore.overall < 500)) {
          riskScore += 0.3
          findings.push('High value transaction from unverified entity')
        }

        return {
          agentType: 'behavioral',
          confidence: 0.85,
          riskScore: Math.min(riskScore, 1.0),
          findings,
          evidence: { existingScore },
          executionTime: performance.now() - startTime,
        }
      },
    })
  }

  /**
   * Analyze transaction using multi-agent swarm
   */
  async analyzeTransaction(
    txData: TransactionData
  ): Promise<{ taskId: string; score: TrustScore }> {
    // Create analysis task
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const task: AnalysisTask = {
      id: taskId,
      transactionData: txData,
      priority: this.determinePriority(txData),
      status: 'in_progress',
      agentResults: [],
      createdAt: Date.now(),
    }

    this.activeTasks.set(taskId, task)

    try {
      // Queen agent delegates to workers (parallel execution)
      const workerTypes: AgentType[] = [
        'sentiment',
        'pattern',
        'ner',
        'behavioral',
      ]

      const agentPromises = workerTypes.map(async (type) => {
        const worker = this.workers.get(type)
        if (!worker) return null

        try {
          const result = await worker.analyze(txData)
          return result
        } catch (error) {
          console.error(`Worker ${type} failed:`, error)
          return null
        }
      })

      // Wait for all agents to complete
      const results = (await Promise.all(agentPromises)).filter(
        (r) => r !== null
      ) as AgentResult[]

      task.agentResults = results

      // Queen agent aggregates results
      const trustScore = this.aggregateResults(txData, results)
      task.finalScore = trustScore
      task.status = 'completed'
      task.completedAt = Date.now()

      // Store trust score in memory
      this.memory.upsertTrustScore(trustScore)

      // Store transaction analysis for learning
      const txDescription = `${txData.from} sends ${txData.amount} to ${txData.to}. ${txData.memo || ''}`
      const embedding = await generateEmbedding(txDescription)

      this.memory.insert({
        collection: 'analyzed-transactions',
        content: {
          transaction: txData,
          results,
          trustScore,
        },
        embedding,
        metadata: {
          riskLevel: trustScore.riskLevel,
          overall: trustScore.overall,
        },
      })

      // If high risk, store as fraud pattern for future learning
      if (trustScore.riskLevel === 'critical' || trustScore.overall < 300) {
        this.memory.storeFraudPattern({
          description: txDescription,
          category: 'suspicious-transaction',
          riskLevel: trustScore.riskLevel,
          indicators: results.flatMap((r) => r.findings),
          embedding,
          occurrences: 1,
          lastSeen: Date.now(),
        })
      }

      return { taskId, score: trustScore }
    } catch (error) {
      task.status = 'failed'
      task.completedAt = Date.now()
      throw error
    }
  }

  /**
   * Determine task priority based on transaction data
   */
  private determinePriority(
    txData: TransactionData
  ): 'low' | 'normal' | 'high' | 'critical' {
    if (txData.amount > 100000) return 'critical'
    if (txData.amount > 50000) return 'high'
    if (txData.amount > 10000) return 'normal'
    return 'low'
  }

  /**
   * Aggregate agent results into final trust score
   */
  private aggregateResults(
    txData: TransactionData,
    results: AgentResult[]
  ): TrustScore {
    // Weighted aggregation
    const weights = {
      sentiment: 0.20,
      pattern: 0.30,
      ner: 0.25,
      behavioral: 0.25,
    }

    let totalRisk = 0
    let totalWeight = 0
    const explainability: string[] = []

    for (const result of results) {
      const weight = weights[result.agentType as keyof typeof weights] || 0
      totalRisk += result.riskScore * weight * result.confidence
      totalWeight += weight * result.confidence

      // Add findings to explainability
      if (result.findings.length > 0) {
        explainability.push(
          `[${result.agentType.toUpperCase()}] ${result.findings.join('; ')}`
        )
      }
    }

    const avgRiskScore = totalWeight > 0 ? totalRisk / totalWeight : 0.5

    // Calculate dimension scores
    const dimensions = {
      transactionPatterns:
        1 -
        (results.find((r) => r.agentType === 'pattern')?.riskScore || 0.5),
      entityReputation:
        1 - (results.find((r) => r.agentType === 'ner')?.riskScore || 0.5),
      sentimentRisk:
        1 - (results.find((r) => r.agentType === 'sentiment')?.riskScore || 0.5),
      documentValidity: 0.8, // Placeholder - would use document agent
      networkTrust:
        1 - (results.find((r) => r.agentType === 'behavioral')?.riskScore || 0.5),
    }

    // Calculate overall score (0-1000)
    const overall = Math.round((1 - avgRiskScore) * 1000)

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical'
    if (overall >= 700) riskLevel = 'low'
    else if (overall >= 500) riskLevel = 'medium'
    else if (overall >= 300) riskLevel = 'high'
    else riskLevel = 'critical'

    // Calculate confidence
    const avgConfidence =
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length

    return {
      address: txData.from,
      overall,
      dimensions,
      confidence: avgConfidence,
      riskLevel,
      explainability,
      lastUpdated: Date.now(),
    }
  }

  /**
   * Get task status
   */
  getTask(taskId: string): AnalysisTask | undefined {
    return this.activeTasks.get(taskId)
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): AnalysisTask[] {
    return Array.from(this.activeTasks.values())
  }

  /**
   * Stream swarm progress (for SSE)
   */
  async *watchSwarm(taskId: string): AsyncGenerator<any> {
    const task = this.activeTasks.get(taskId)
    if (!task) return

    while (task.status === 'in_progress') {
      yield {
        type: 'progress',
        taskId,
        completedAgents: task.agentResults.length,
        totalAgents: 4,
        status: task.status,
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    yield {
      type: 'completed',
      taskId,
      score: task.finalScore,
      status: task.status,
    }
  }

  /**
   * Learn from feedback (Reflexion)
   */
  async learnFromFeedback(params: {
    taskId: string
    actualOutcome: 'fraud' | 'legitimate'
    notes?: string
  }): Promise<void> {
    const task = this.activeTasks.get(params.taskId)
    if (!task || !task.finalScore) return

    const predicted =
      task.finalScore.riskLevel === 'critical' ||
      task.finalScore.riskLevel === 'high'
        ? 'fraud'
        : 'legitimate'

    const isCorrect = predicted === params.actualOutcome

    let critique = ''
    let improvement = ''

    if (!isCorrect) {
      if (params.actualOutcome === 'fraud') {
        critique =
          'False negative: Failed to detect fraud. Risk score was too low.'
        improvement =
          'Increase weight on indicators that were present: ' +
          task.agentResults
            .filter((r) => r.findings.length > 0)
            .map((r) => r.agentType)
            .join(', ')
      } else {
        critique = 'False positive: Flagged legitimate transaction as fraud.'
        improvement =
          'Reduce sensitivity or add whitelist for this transaction pattern.'
      }

      // Store reflexion memory for learning
      this.memory.storeReflexion({
        decisionId: params.taskId,
        initialPrediction: predicted,
        actualOutcome: params.actualOutcome,
        critique,
        improvement,
      })

      console.log('Learning from feedback:', {
        taskId: params.taskId,
        predicted,
        actual: params.actualOutcome,
        critique,
      })
    }
  }

  /**
   * Get learning insights
   */
  getLearningInsights(): any[] {
    return this.memory.getLearningInsights(10)
  }

  /**
   * Get memory statistics
   */
  getStats(): any {
    return {
      memory: this.memory.getStats(),
      activeTasks: this.activeTasks.size,
      workers: this.workers.size,
    }
  }
}

// Export singleton instance
let orchestratorInstance: TrustSwarmOrchestrator | null = null

export function getOrchestrator(): TrustSwarmOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TrustSwarmOrchestrator()
  }
  return orchestratorInstance
}

export default TrustSwarmOrchestrator
