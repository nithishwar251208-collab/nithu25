import { createHash } from 'node:crypto';

// Cosine similarity between two float vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate deterministic pseudo-embedding using FastText-style subword n-grams and token hashing
export function generateDeterministicEmbedding(text: string, dimensions: number = 64): number[] {
  const embedding: number[] = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of words) {
    // 1. Hash full word
    const hash = createHash('sha256').update(word).digest();
    for (let d = 0; d < dimensions; d++) {
      const byteVal = hash[d % hash.length];
      embedding[d] += (byteVal - 128) / 128.0;
    }

    // 2. Hash character 3-grams for morphological similarity
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const trigram = word.slice(j, j + 3);
        const triHash = createHash('sha256').update(trigram).digest();
        for (let d = 0; d < dimensions; d++) {
          const byteVal = triHash[d % triHash.length];
          embedding[d] += ((byteVal - 128) / 128.0) * 0.5;
        }
      }
    }
  }

  // Normalize to unit length (L2 norm)
  let norm = 0;
  for (let d = 0; d < dimensions; d++) {
    norm += embedding[d] * embedding[d];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let d = 0; d < dimensions; d++) {
      embedding[d] = embedding[d] / norm;
    }
  }

  return embedding;
}
