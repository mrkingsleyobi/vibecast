/**
 * tRPC Router for TrustSwarm API
 */

import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { getOrchestrator } from '../swarm-orchestrator'
import { getAgentDB } from '../agentdb'
import type { TransactionData } from '../swarm-orchestrator'

const t = initTRPC.create()

const router = t.router
const publicProcedure = t.procedure

const orchestrator = getOrchestrator()
const agentDB = getAgentDB()

export const appRouter = router({
  // Analyze transaction
  analyzeTransaction: publicProcedure
    .input(
      z.object({
        txHash: z.string(),
        from: z.string(),
        to: z.string(),
        amount: z.number().positive(),
        chain: z.enum(['ethereum', 'base', 'optimism']),
        memo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const txData: TransactionData = {
        ...input,
        timestamp: Date.now(),
      }

      const result = await orchestrator.analyzeTransaction(txData)

      return {
        success: true,
        taskId: result.taskId,
        trustScore: result.score,
      }
    }),

  // Get trust score
  getTrustScore: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ input }) => {
      const score = agentDB.getTrustScore(input.address)

      if (!score) {
        return {
          success: false,
          message: 'No trust score found',
        }
      }

      return {
        success: true,
        trustScore: score,
      }
    }),

  // Get task status
  getTaskStatus: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const task = orchestrator.getTask(input.taskId)

      if (!task) {
        return {
          success: false,
          message: 'Task not found',
        }
      }

      return {
        success: true,
        task: {
          id: task.id,
          status: task.status,
          priority: task.priority,
          completedAgents: task.agentResults.length,
          totalAgents: 4,
          trustScore: task.finalScore,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        },
      }
    }),

  // Get active tasks
  getActiveTasks: publicProcedure.query(async () => {
    const tasks = orchestrator.getActiveTasks()

    return {
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
      })),
      count: tasks.length,
    }
  }),

  // Search fraud patterns
  searchFraudPatterns: publicProcedure
    .input(
      z.object({
        description: z.string(),
        topK: z.number().optional().default(10),
      })
    )
    .query(async ({ input }) => {
      const { generateEmbedding } = await import('../embeddings')
      const embedding = await generateEmbedding(input.description)
      const patterns = agentDB.searchFraudPatterns(embedding, input.topK)

      return {
        success: true,
        patterns,
        count: patterns.length,
      }
    }),

  // Learn from feedback
  learnFromFeedback: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        actualOutcome: z.enum(['fraud', 'legitimate']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await orchestrator.learnFromFeedback({
        taskId: input.taskId,
        actualOutcome: input.actualOutcome,
        notes: input.notes,
      })

      return {
        success: true,
        message: 'Feedback processed successfully',
      }
    }),

  // Get learning insights
  getLearningInsights: publicProcedure
    .input(z.object({ limit: z.number().optional().default(10) }))
    .query(async ({ input }) => {
      const insights = orchestrator.getLearningInsights()

      return {
        success: true,
        insights,
        count: insights.length,
      }
    }),

  // Get system stats
  getStats: publicProcedure.query(async () => {
    const stats = orchestrator.getStats()

    return {
      success: true,
      stats,
    }
  }),

  // Store fraud pattern
  storeFraudPattern: publicProcedure
    .input(
      z.object({
        description: z.string(),
        category: z.string(),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        indicators: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const { generateEmbedding } = await import('../embeddings')
      const embedding = await generateEmbedding(input.description)

      const id = agentDB.storeFraudPattern({
        description: input.description,
        category: input.category,
        riskLevel: input.riskLevel,
        indicators: input.indicators,
        embedding,
        occurrences: 1,
        lastSeen: Date.now(),
      })

      return {
        success: true,
        patternId: id,
        message: 'Fraud pattern stored successfully',
      }
    }),

  // Batch analyze transactions
  batchAnalyzeTransactions: publicProcedure
    .input(
      z.object({
        transactions: z.array(
          z.object({
            txHash: z.string(),
            from: z.string(),
            to: z.string(),
            amount: z.number().positive(),
            chain: z.enum(['ethereum', 'base', 'optimism']),
            memo: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const results = await Promise.all(
        input.transactions.map((tx) =>
          orchestrator.analyzeTransaction({
            ...tx,
            timestamp: Date.now(),
          })
        )
      )

      return {
        success: true,
        results,
        count: results.length,
      }
    }),
})

export type AppRouter = typeof appRouter
