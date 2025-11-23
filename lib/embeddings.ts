/**
 * Embeddings Generation
 *
 * Generate vector embeddings for text using simple hashing
 * In production, would use actual transformer models
 */

/**
 * Generate 384-dimensional embedding vector for text
 * Uses simple hashing for demo purposes
 * In production, would use @huggingface/transformers pipeline
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const dimensions = 384
  const embedding: number[] = new Array(dimensions)

  // Simple hash-based embedding for demo
  // In production, replace with:
  // const extractor = await pipeline('feature-extraction', 'sentence-transformers/all-MiniLM-L6-v2')
  // const output = await extractor(text, { pooling: 'mean', normalize: true })
  // return Array.from(output.data)

  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash = hash & hash
  }

  // Generate pseudo-random but deterministic embedding
  for (let i = 0; i < dimensions; i++) {
    const seed = hash + i * 1234567
    embedding[i] = Math.sin(seed) * Math.cos(seed * 0.1)
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  return embedding.map((val) => val / norm)
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
