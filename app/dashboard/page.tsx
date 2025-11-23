'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Dashboard() {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const analyzeTransaction = async () => {
    setAnalyzing(true)

    // Simulate analysis
    setTimeout(() => {
      setResult({
        trustScore: 847,
        riskLevel: 'low',
        analysis: {
          sentiment: 0.12,
          pattern: 0.08,
          entity: 0.15,
          behavioral: 0.10
        }
      })
      setAnalyzing(false)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <nav className="border-b border-blue-800/50 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">TrustSwarm</h1>
                <p className="text-xs text-blue-300">Dashboard</p>
              </div>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Transaction Analysis</h1>
          <p className="text-gray-400">Analyze transactions in real-time using AI agent swarms</p>
        </div>

        {/* Demo Section */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Analysis Form */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Analyze Transaction</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Transaction Hash
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    From Address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    To Address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount (ETH)
                  </label>
                  <input
                    type="number"
                    placeholder="0.0"
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Chain
                  </label>
                  <select className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500">
                    <option>Ethereum</option>
                    <option>Base</option>
                    <option>Optimism</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Memo (Optional)
                </label>
                <textarea
                  placeholder="Transaction description..."
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={analyzeTransaction}
                disabled={analyzing}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {analyzing ? 'Analyzing...' : 'Analyze Transaction'}
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            {/* Trust Score */}
            {result && (
              <div className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Trust Score</h2>

                <div className="text-center mb-6">
                  <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 mb-2">
                    {result.trustScore}
                  </div>
                  <div className="text-sm text-gray-400">out of 1000</div>
                  <div className="mt-2">
                    <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full text-green-300 text-sm font-medium">
                      {result.riskLevel.toUpperCase()} RISK
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Sentiment Analysis</span>
                      <span className="text-white">{(result.analysis.sentiment * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${result.analysis.sentiment * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Pattern Recognition</span>
                      <span className="text-white">{(result.analysis.pattern * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${result.analysis.pattern * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Entity Analysis</span>
                      <span className="text-white">{(result.analysis.entity * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${result.analysis.entity * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Behavioral Analysis</span>
                      <span className="text-white">{(result.analysis.behavioral * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${result.analysis.behavioral * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* System Stats */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-4">System Stats</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Active Workers</span>
                  <span className="text-white font-bold">4/4</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Patterns in Memory</span>
                  <span className="text-white font-bold">1,247</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Trust Scores</span>
                  <span className="text-white font-bold">3,891</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Avg Analysis Time</span>
                  <span className="text-white font-bold">1.8s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MCP Tools Info */}
        <div className="mt-8 bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Available MCP Tools</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">trustswarm/analyze-transaction</h3>
              <p className="text-sm text-gray-400">Analyze transaction for fraud using AI swarm</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">trustswarm/get-trust-score</h3>
              <p className="text-sm text-gray-400">Get trust score for wallet address</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">trustswarm/search-patterns</h3>
              <p className="text-sm text-gray-400">Search fraud patterns using vector similarity</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">trustswarm/learn-from-feedback</h3>
              <p className="text-sm text-gray-400">Provide feedback for reflexion learning</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">trustswarm/get-stats</h3>
              <p className="text-sm text-gray-400">Get system statistics and metrics</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-bold text-white mb-2">+ 10 more tools</h3>
              <p className="text-sm text-gray-400">View full documentation for all 15+ tools</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
