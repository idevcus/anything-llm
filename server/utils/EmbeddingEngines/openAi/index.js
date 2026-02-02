class OpenAiEmbedder {
  constructor() {
    if (!process.env.OPEN_AI_KEY) throw new Error("No OpenAI API key was set.");
    this.className = "OpenAiEmbedder";
    const { OpenAI: OpenAIApi } = require("openai");
    this.openai = new OpenAIApi({
      apiKey: process.env.OPEN_AI_KEY,
    });
    this.model = process.env.EMBEDDING_MODEL_PREF || "text-embedding-ada-002";

    // Limit of how many strings we can process in a single pass to stay with resource or network limits
    this.maxConcurrentChunks = 500;

    // https://platform.openai.com/docs/guides/embeddings/embedding-models
    this.embeddingMaxChunkLength = 8_191;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  // Detailed logging only in development mode
  logDebug(text, ...args) {
    if (process.env.NODE_ENV === "development") {
      console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
    }
  }

  /**
   * Get batch delay from env var (minimum 500ms)
   * @returns {number}
   */
  getBatchDelay() {
    if (!process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS) return 1000; // default 1s
    const delay = Number(process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS);
    if (isNaN(delay)) return 1000;
    return Math.max(500, delay); // minimum 500ms
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry configuration
   * @returns {{maxRetries: number, baseDelay: number, maxDelay: number}}
   */
  getRetryConfig() {
    const maxRetries = Number(process.env.OPENAI_EMBEDDING_MAX_RETRIES) || 3;
    const baseDelay = Number(process.env.OPENAI_EMBEDDING_RETRY_BASE_DELAY_MS) || 1000;
    const maxDelay = Number(process.env.OPENAI_EMBEDDING_RETRY_MAX_DELAY_MS) || 60000;

    return {
      maxRetries: isNaN(maxRetries) ? 3 : Math.max(0, maxRetries),
      baseDelay: isNaN(baseDelay) ? 1000 : baseDelay,
      maxDelay: isNaN(maxDelay) ? 60000 : maxDelay
    };
  }

  /**
   * Check if error is a 429 rate limit error
   * @param {Error} error
   * @returns {boolean}
   */
  is429Error(error) {
    return error?.status === 429 ||
           error?.response?.status === 429 ||
           error?.type === 'rate_limit_error';
  }

  /**
   * Parse Retry-After header from error (returns milliseconds)
   * @param {Error} error
   * @returns {number|null}
   */
  getRetryAfter(error) {
    const retryAfter = error?.response?.headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000); // Convert to ms
      }
    }
    return null;
  }

  /**
   * Execute single batch with retry logic
   * @param {string[]} batch
   * @param {number} batchIndex
   * @param {number} totalBatches
   * @param {number} retryCount
   * @returns {Promise<{data: Array, error: Error|null}>}
   */
  async executeBatchWithRetry(batch, batchIndex, totalBatches, retryCount = 0) {
    const startTime = Date.now();
    const estimatedTokens = batch.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

    this.logDebug(
      `[Batch ${batchIndex + 1}/${totalBatches}] Calling OpenAI API - ${batch.length} chunks, ~${estimatedTokens} tokens` +
      (retryCount > 0 ? ` (retry ${retryCount})` : '')
    );

    try {
      const result = await this.openai.embeddings.create({
        model: this.model,
        input: batch,
      });

      const duration = Date.now() - startTime;
      const actualTokens = result?.usage?.total_tokens || 0;
      this.logDebug(
        `[Batch ${batchIndex + 1}/${totalBatches}] ✓ Success - ${result?.data?.length || 0} embeddings, ` +
        `${actualTokens} tokens used, ${duration}ms` +
        (retryCount > 0 ? ` (succeeded after ${retryCount} retries)` : '')
      );

      return { data: result?.data, error: null };

    } catch (error) {
      const duration = Date.now() - startTime;
      error.type = error?.response?.data?.error?.code || error?.response?.status || "failed_to_embed";
      error.message = error?.response?.data?.error?.message || error.message;

      // Check if this is a retriable 429 error
      if (this.is429Error(error)) {
        const retryConfig = this.getRetryConfig();

        if (retryCount < retryConfig.maxRetries) {
          // Calculate delay
          const retryAfterMs = this.getRetryAfter(error);
          let delayMs;

          if (retryAfterMs) {
            delayMs = retryAfterMs;
            this.log(
              `[Batch ${batchIndex + 1}/${totalBatches}] Rate limit (429) - retrying in ${delayMs}ms (from Retry-After header)`
            );
          } else {
            // Exponential backoff: baseDelay * (2 ^ retryCount)
            delayMs = Math.min(
              retryConfig.maxDelay,
              retryConfig.baseDelay * Math.pow(2, retryCount)
            );
            this.log(
              `[Batch ${batchIndex + 1}/${totalBatches}] Rate limit (429) - retrying in ${delayMs}ms (exponential backoff)`
            );
          }

          await this.sleep(delayMs);

          // Retry
          return await this.executeBatchWithRetry(batch, batchIndex, totalBatches, retryCount + 1);
        } else {
          // Max retries exceeded
          this.log(
            `[Batch ${batchIndex + 1}/${totalBatches}] ✗ Failed after ${retryConfig.maxRetries} retries - ${error.type}: ${error.message}`
          );
          return { data: [], error };
        }
      }

      // Non-retriable error
      this.logDebug(
        `[Batch ${batchIndex + 1}/${totalBatches}] ✗ Failed - ${error.type}: ${error.message}, ${duration}ms`
      );
      return { data: [], error };
    }
  }

  async embedTextInput(textInput) {
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  async embedChunks(textChunks = []) {
    const totalStartTime = Date.now();
    this.log(`Embedding ${textChunks.length} chunks...`);

    // Because there is a hard POST limit on how many chunks can be sent at once to OpenAI
    // Both in terms of request size (~8mb) AND token count (300k tokens per request)
    // we batch chunks intelligently based on estimated token count.
    // OpenAI limit: 300k tokens per request. We use a conservative estimate for safety.
    const MAX_TOKENS_PER_REQUEST = 150_000;

    // Estimate tokens per chunk (conservative estimate for non-English text: 1 token ≈ 2 characters)
    // This accounts for Korean text, special characters, and metadata overhead
    const estimateTokens = (text) => Math.ceil(text.length / 2);

    // Create batches based on token count
    const batches = [];
    let currentBatch = [];
    let currentTokenCount = 0;

    for (const chunk of textChunks) {
      const chunkTokens = estimateTokens(chunk);

      // If a single chunk exceeds the limit, we still need to try it
      // OpenAI will return a proper error for this edge case
      if (chunkTokens > MAX_TOKENS_PER_REQUEST) {
        // If current batch has content, save it first
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentTokenCount = 0;
        }
        // Put the oversized chunk in its own batch
        batches.push([chunk]);
        continue;
      }

      // If adding this chunk would exceed the limit, start a new batch
      if (
        currentTokenCount + chunkTokens > MAX_TOKENS_PER_REQUEST &&
        currentBatch.length > 0
      ) {
        batches.push(currentBatch);
        currentBatch = [chunk];
        currentTokenCount = chunkTokens;
      } else {
        currentBatch.push(chunk);
        currentTokenCount += chunkTokens;
      }

      // Also respect the maxConcurrentChunks limit as a safety measure
      if (currentBatch.length >= this.maxConcurrentChunks) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenCount = 0;
      }
    }

    // Add remaining chunks
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    this.log(
      `Created ${batches.length} batches from ${textChunks.length} chunks`
    );

    // Process batches sequentially with delay between each
    const allResults = [];
    const batchDelay = this.getBatchDelay();

    for (const [batchIndex, batch] of batches.entries()) {
      // Execute batch with retry logic
      const { data, error } = await this.executeBatchWithRetry(
        batch,
        batchIndex,
        batches.length
      );

      // If batch failed, abort entire operation
      if (error) {
        throw new Error(
          `OpenAI Failed to embed batch ${batchIndex + 1}/${batches.length}: [${error.type}] ${error.message}`
        );
      }

      allResults.push(...(data || []));

      // Apply delay before next batch (except for last batch)
      if (batchIndex < batches.length - 1 && batchDelay) {
        this.logDebug(`Delaying next batch for ${batchDelay}ms`);
        await this.sleep(batchDelay);
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    const embeddings = allResults.length > 0 &&
      allResults.every((embd) => embd.hasOwnProperty("embedding"))
      ? allResults.map((embd) => embd.embedding)
      : null;

    if (embeddings) {
      this.logDebug(
        `✓ Completed all embeddings - ${embeddings.length} vectors generated in ${(totalDuration / 1000).toFixed(2)}s ` +
        `(avg: ${(totalDuration / batches.length).toFixed(0)}ms per batch)`
      );
    }

    return embeddings;
  }
}

module.exports = {
  OpenAiEmbedder,
};
