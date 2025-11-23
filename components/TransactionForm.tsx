'use client'

import { useState } from 'react'

export interface TransactionFormData {
  txHash: string
  from: string
  to: string
  amount: number
  chain: 'ethereum' | 'base' | 'optimism'
  memo?: string
}

export interface TransactionFormProps {
  onSubmit: (data: TransactionFormData) => Promise<void>
  isAnalyzing?: boolean
}

export function TransactionForm({ onSubmit, isAnalyzing = false }: TransactionFormProps) {
  const [formData, setFormData] = useState<TransactionFormData>({
    txHash: '',
    from: '',
    to: '',
    amount: 0,
    chain: 'base',
    memo: '',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormData, string>>>({})

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TransactionFormData, string>> = {}

    if (!formData.txHash || formData.txHash.length < 10) {
      newErrors.txHash = 'Transaction hash is required'
    }

    if (!formData.from || !/^0x[a-fA-F0-9]{40}$/.test(formData.from)) {
      newErrors.from = 'Valid sender address required (0x...)'
    }

    if (!formData.to || !/^0x[a-fA-F0-9]{40}$/.test(formData.to)) {
      newErrors.to = 'Valid recipient address required (0x...)'
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      await onSubmit(formData)
    }
  }

  const handleChange = (field: keyof TransactionFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const loadExamplePhishing = () => {
    setFormData({
      txHash: '0x' + 'a'.repeat(64),
      from: '0x' + '1'.repeat(40),
      to: '0x' + '2'.repeat(40),
      amount: 1000,
      chain: 'base',
      memo: 'URGENT: Verify your account now or funds will be frozen! Click here immediately.',
    })
  }

  const loadExampleLegitimate = () => {
    setFormData({
      txHash: '0x' + 'b'.repeat(64),
      from: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Tether
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      amount: 500,
      chain: 'base',
      memo: 'Payment for services rendered',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Analyze Transaction</h2>

      {/* Example Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={loadExamplePhishing}
          className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm font-medium"
        >
          Load Phishing Example
        </button>
        <button
          type="button"
          onClick={loadExampleLegitimate}
          className="px-4 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-sm font-medium"
        >
          Load Legitimate Example
        </button>
      </div>

      {/* Transaction Hash */}
      <div className="mb-4">
        <label htmlFor="txHash" className="block text-sm font-medium text-gray-700 mb-2">
          Transaction Hash *
        </label>
        <input
          type="text"
          id="txHash"
          value={formData.txHash}
          onChange={(e) => handleChange('txHash', e.target.value)}
          className={`w-full px-4 py-2 border rounded-md font-mono text-sm ${
            errors.txHash ? 'border-red-500' : 'border-gray-300'
          } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          placeholder="0x1234567890abcdef..."
          disabled={isAnalyzing}
        />
        {errors.txHash && (
          <p className="mt-1 text-sm text-red-600">{errors.txHash}</p>
        )}
      </div>

      {/* Sender Address */}
      <div className="mb-4">
        <label htmlFor="from" className="block text-sm font-medium text-gray-700 mb-2">
          From (Sender) *
        </label>
        <input
          type="text"
          id="from"
          value={formData.from}
          onChange={(e) => handleChange('from', e.target.value)}
          className={`w-full px-4 py-2 border rounded-md font-mono text-sm ${
            errors.from ? 'border-red-500' : 'border-gray-300'
          } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
          disabled={isAnalyzing}
        />
        {errors.from && (
          <p className="mt-1 text-sm text-red-600">{errors.from}</p>
        )}
      </div>

      {/* Recipient Address */}
      <div className="mb-4">
        <label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-2">
          To (Recipient) *
        </label>
        <input
          type="text"
          id="to"
          value={formData.to}
          onChange={(e) => handleChange('to', e.target.value)}
          className={`w-full px-4 py-2 border rounded-md font-mono text-sm ${
            errors.to ? 'border-red-500' : 'border-gray-300'
          } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          placeholder="0xdAC17F958D2ee523a2206206994597C13D831ec7"
          disabled={isAnalyzing}
        />
        {errors.to && (
          <p className="mt-1 text-sm text-red-600">{errors.to}</p>
        )}
      </div>

      {/* Amount and Chain */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Amount *
          </label>
          <input
            type="number"
            id="amount"
            value={formData.amount}
            onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)}
            className={`w-full px-4 py-2 border rounded-md ${
              errors.amount ? 'border-red-500' : 'border-gray-300'
            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            placeholder="1000"
            step="0.01"
            min="0"
            disabled={isAnalyzing}
          />
          {errors.amount && (
            <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
          )}
        </div>

        <div>
          <label htmlFor="chain" className="block text-sm font-medium text-gray-700 mb-2">
            Chain *
          </label>
          <select
            id="chain"
            value={formData.chain}
            onChange={(e) => handleChange('chain', e.target.value as TransactionFormData['chain'])}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isAnalyzing}
          >
            <option value="base">Base</option>
            <option value="ethereum">Ethereum</option>
            <option value="optimism">Optimism</option>
          </select>
        </div>
      </div>

      {/* Memo */}
      <div className="mb-6">
        <label htmlFor="memo" className="block text-sm font-medium text-gray-700 mb-2">
          Transaction Memo (Optional)
        </label>
        <textarea
          id="memo"
          value={formData.memo}
          onChange={(e) => handleChange('memo', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          placeholder="Payment for services, invoice #123..."
          disabled={isAnalyzing}
        />
        <p className="mt-1 text-xs text-gray-500">
          Memo helps AI agents detect phishing keywords and social engineering attempts
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isAnalyzing}
        className={`w-full py-3 px-6 rounded-md font-semibold text-white transition-all ${
          isAnalyzing
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
        }`}
      >
        {isAnalyzing ? (
          <span className="flex items-center justify-center">
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Analyzing Transaction...
          </span>
        ) : (
          'Analyze for Fraud'
        )}
      </button>

      <p className="mt-4 text-xs text-gray-500 text-center">
        Analysis uses multi-agent AI swarm with 150x faster vector search
      </p>
    </form>
  )
}
