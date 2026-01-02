#!/usr/bin/env node

/**
 * OpenAI Embedding Rate Limit 수동 테스트 스크립트
 *
 * 사용법:
 *   node scripts/test-embedding-rate-limit.js
 *
 * 환경 변수:
 *   OPEN_AI_KEY - OpenAI API 키 (필수)
 *   EMBEDDING_MODEL_PREF - 모델 선택 (기본: text-embedding-3-small)
 *   OPENAI_EMBEDDING_BATCH_DELAY_MS - 배치 딜레이 (기본: 1000)
 *   NODE_ENV=development - 상세 로그 출력
 */

require('dotenv').config();
const { OpenAiEmbedder } = require('../utils/EmbeddingEngines/openAi');

async function main() {
  if (!process.env.OPEN_AI_KEY) {
    console.error('Error: OPEN_AI_KEY environment variable is required');
    process.exit(1);
  }

  console.log('Starting OpenAI Embedding Rate Limit Test...\n');
  console.log('Configuration:');
  console.log('  Model:', process.env.EMBEDDING_MODEL_PREF || 'text-embedding-3-small');
  console.log('  Batch Delay:', process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS || '1000ms');
  console.log('  Max Retries:', process.env.OPENAI_EMBEDDING_MAX_RETRIES || '3');
  console.log('');

  const embedder = new OpenAiEmbedder();

  // Test 1: Small batch (no rate limit expected)
  console.log('Test 1: Small batch (10 chunks)...');
  try {
    const chunks = Array(10).fill('This is a test chunk for embedding.');
    const start = Date.now();
    const embeddings = await embedder.embedChunks(chunks);
    const duration = Date.now() - start;
    console.log(`✓ Success: ${embeddings.length} embeddings in ${duration}ms\n`);
  } catch (error) {
    console.error('✗ Failed:', error.message, '\n');
  }

  // Test 2: Large batch (may trigger rate limit)
  console.log('Test 2: Large batch (2000 chunks)...');
  try {
    const chunks = Array(2000).fill('This is a larger test chunk to potentially trigger rate limiting behavior.');
    const start = Date.now();
    const embeddings = await embedder.embedChunks(chunks);
    const duration = Date.now() - start;
    console.log(`✓ Success: ${embeddings.length} embeddings in ${(duration/1000).toFixed(2)}s\n`);
  } catch (error) {
    console.error('✗ Failed:', error.message, '\n');
  }

  console.log('Test completed!');
}

main().catch(console.error);
