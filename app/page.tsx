'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <nav className="border-b border-blue-800/50 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">TrustSwarm</h1>
                <p className="text-xs text-blue-300">AI Fraud Detection</p>
              </div>
            </div>
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <div className="inline-block mb-4">
            <span className="px-4 py-1 bg-blue-500/20 border border-blue-500/50 rounded-full text-blue-300 text-sm font-medium">
              🛡️ Intelligent Swarm Protection
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Decentralized AI
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
              Fraud Detection
            </span>
          </h1>

          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Real-time fraud detection powered by autonomous AI agent swarms.
            Analyze transactions in &lt;2 seconds with 150x faster vector search.
          </p>

          <div className="flex gap-4 justify-center mb-12">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-blue-500/50"
            >
              Launch Dashboard
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-lg p-6">
              <div className="text-3xl font-bold text-blue-400 mb-2">150x</div>
              <div className="text-sm text-gray-400">Faster Search</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6">
              <div className="text-3xl font-bold text-purple-400 mb-2">&lt;2s</div>
              <div className="text-sm text-gray-400">Analysis Time</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30 rounded-lg p-6">
              <div className="text-3xl font-bold text-green-400 mb-2">84.8%</div>
              <div className="text-sm text-gray-400">Accuracy</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-yellow-500/30 rounded-lg p-6">
              <div className="text-3xl font-bold text-yellow-400 mb-2">15+</div>
              <div className="text-sm text-gray-400">MCP Tools</div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Key Features
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-8 hover:border-blue-500/50 transition-colors">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Real-Time Analysis</h3>
            <p className="text-gray-400">
              Analyze transactions in under 2 seconds using multi-agent AI swarms.
              99.99% faster than traditional fraud detection systems.
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Privacy-Preserving</h3>
            <p className="text-gray-400">
              Federated learning and zero-knowledge proofs ensure sensitive data
              never leaves your control. Trust without exposure.
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30 rounded-xl p-8 hover:border-green-500/50 transition-colors">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Continuous Learning</h3>
            <p className="text-gray-400">
              Reflexion memory enables self-critique and improvement. The system
              learns from every decision to increase accuracy over time.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400 text-sm">
          <p>&copy; 2025 TrustSwarm. Built with ❤️ for the decentralized future.</p>
        </div>
      </footer>
    </main>
  )
}
