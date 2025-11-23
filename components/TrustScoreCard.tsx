'use client'

import { useMemo } from 'react'

export interface TrustScoreCardProps {
  address: string
  overall: number
  dimensions: {
    transactionPatterns: number
    entityReputation: number
    sentimentRisk: number
    documentValidity: number
    networkTrust: number
  }
  confidence: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  explainability: string[]
  lastUpdated: number
}

export function TrustScoreCard({
  address,
  overall,
  dimensions,
  confidence,
  riskLevel,
  explainability,
  lastUpdated
}: TrustScoreCardProps) {
  const riskColors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    critical: 'bg-red-500',
  }

  const riskTextColors = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    critical: 'text-red-600',
  }

  const riskBorderColors = {
    low: 'border-green-200',
    medium: 'border-yellow-200',
    high: 'border-orange-200',
    critical: 'border-red-200',
  }

  const percentageScore = useMemo(() => (overall / 1000) * 100, [overall])

  const formattedDate = useMemo(() => {
    return new Date(lastUpdated).toLocaleString()
  }, [lastUpdated])

  const dimensionNames = {
    transactionPatterns: 'Transaction Patterns',
    entityReputation: 'Entity Reputation',
    sentimentRisk: 'Sentiment Risk',
    documentValidity: 'Document Validity',
    networkTrust: 'Network Trust',
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg border-2 ${riskBorderColors[riskLevel]} p-6 max-w-2xl`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-500">Wallet Address</h3>
          <p className="text-lg font-mono text-gray-900 mt-1 break-all">
            {address}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full ${riskColors[riskLevel]} ml-4`}>
          <span className="text-white font-bold uppercase text-sm">
            {riskLevel}
          </span>
        </div>
      </div>

      {/* Trust Score Gauge */}
      <div className="mb-6">
        <div className="flex items-end justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Trust Score</h4>
          <div className="text-right">
            <span className="text-3xl font-bold text-gray-900">{overall}</span>
            <span className="text-xl text-gray-500">/1000</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full ${riskColors[riskLevel]} transition-all duration-500`}
            style={{ width: `${percentageScore}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0</span>
          <span>250</span>
          <span>500</span>
          <span>750</span>
          <span>1000</span>
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Confidence</span>
          <span className="text-sm font-bold text-gray-900">
            {(confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Dimension Scores */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Dimension Analysis</h4>
        <div className="space-y-3">
          {Object.entries(dimensions).map(([key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">
                  {dimensionNames[key as keyof typeof dimensionNames]}
                </span>
                <span className="text-xs font-semibold text-gray-900">{value}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    value > 700 ? 'bg-green-500' :
                    value > 500 ? 'bg-yellow-500' :
                    value > 300 ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${(value / 1000) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explainability */}
      {explainability.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Analysis</h4>
          <ul className="space-y-1">
            {explainability.map((reason, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-start">
                <span className="mr-2">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Last updated: {formattedDate}
        </p>
      </div>
    </div>
  )
}
