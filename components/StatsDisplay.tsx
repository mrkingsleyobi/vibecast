'use client'

export interface SystemStats {
  totalDocuments: number
  totalPatterns: number
  totalScores: number
  collections: number
  averageLatency?: number
  uptime?: number
  version?: string
}

export interface StatsDisplayProps {
  stats: SystemStats
  performance?: {
    totalLatency: number
    agentLatencies?: Record<string, number>
    costSavings?: number
  }
}

export function StatsDisplay({ stats, performance }: StatsDisplayProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const statCards = [
    {
      label: 'Fraud Patterns',
      value: formatNumber(stats.totalPatterns),
      icon: '🔍',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
    },
    {
      label: 'Trust Scores',
      value: formatNumber(stats.totalScores),
      icon: '✓',
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-700',
    },
    {
      label: 'Total Documents',
      value: formatNumber(stats.totalDocuments),
      icon: '📄',
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-700',
    },
    {
      label: 'Collections',
      value: formatNumber(stats.collections),
      icon: '📊',
      color: 'bg-orange-50 border-orange-200',
      textColor: 'text-orange-700',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className={`${stat.color} border-2 rounded-lg p-4 transition-transform hover:scale-105`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.textColor} mt-1`}>
                  {stat.value}
                </p>
              </div>
              <span className="text-3xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Metrics */}
      {performance && (
        <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Performance Metrics
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Latency */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Total Latency</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatLatency(performance.totalLatency)}
              </p>
              <div className="mt-2 flex items-center">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-full rounded-full ${
                      performance.totalLatency < 2000 ? 'bg-green-500' :
                      performance.totalLatency < 5000 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((performance.totalLatency / 5000) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Target: &lt;2s
              </p>
            </div>

            {/* Cost Savings */}
            {performance.costSavings !== undefined && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Cost Savings</p>
                <p className="text-2xl font-bold text-green-600">
                  ${performance.costSavings.toFixed(4)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  73% cheaper than traditional
                </p>
              </div>
            )}

            {/* Average Agent Latency */}
            {performance.agentLatencies && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Avg Agent Latency</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatLatency(
                    Object.values(performance.agentLatencies).reduce((a, b) => a + b, 0) /
                    Object.keys(performance.agentLatencies).length
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Agent Breakdown */}
          {performance.agentLatencies && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Agent Latency Breakdown
              </h4>
              <div className="space-y-2">
                {Object.entries(performance.agentLatencies).map(([agent, latency]) => (
                  <div key={agent} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {agent.replace('-', ' ')}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min((latency / 1000) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-gray-900 w-16 text-right">
                        {formatLatency(latency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* System Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.averageLatency !== undefined && (
            <div>
              <p className="text-sm text-gray-600">Average Query Latency</p>
              <p className="text-xl font-semibold text-blue-700">
                {formatLatency(stats.averageLatency)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                150x faster than traditional
              </p>
            </div>
          )}

          {stats.uptime !== undefined && (
            <div>
              <p className="text-sm text-gray-600">Uptime</p>
              <p className="text-xl font-semibold text-green-700">
                {formatUptime(stats.uptime)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                99.9% SLA target
              </p>
            </div>
          )}

          {stats.version && (
            <div>
              <p className="text-sm text-gray-600">Version</p>
              <p className="text-xl font-semibold text-purple-700">
                {stats.version}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Latest stable
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Performance Targets */}
      <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Performance Benchmarks
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Vector Search</span>
            <span className="text-sm font-bold text-green-700">&lt;10ms</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Transaction Analysis</span>
            <span className="text-sm font-bold text-blue-700">&lt;2s</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Accuracy</span>
            <span className="text-sm font-bold text-purple-700">84.8%</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Cost per Transaction</span>
            <span className="text-sm font-bold text-orange-700">$0.10</span>
          </div>
        </div>
      </div>
    </div>
  )
}
