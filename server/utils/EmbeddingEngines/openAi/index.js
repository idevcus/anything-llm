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

    const embeddingRequests = [];
    for (const [batchIndex, chunk] of batches.entries()) {
      embeddingRequests.push(
        new Promise((resolve) => {
          const startTime = Date.now();
          const estimatedTokens = chunk.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

          this.logDebug(`[Batch ${batchIndex + 1}/${batches.length}] Calling OpenAI API - ${chunk.length} chunks, ~${estimatedTokens} tokens`);

          this.openai.embeddings
            .create({
              model: this.model,
              input: chunk,
            })
            .then((result) => {
              const duration = Date.now() - startTime;
              const actualTokens = result?.usage?.total_tokens || 0;
              this.logDebug(
                `[Batch ${batchIndex + 1}/${batches.length}] ✓ Success - ${result?.data?.length || 0} embeddings, ` +
                `${actualTokens} tokens used, ${duration}ms`
              );
              resolve({ data: result?.data, error: null });
            })
            .catch((e) => {
              const duration = Date.now() - startTime;
              e.type =
                e?.response?.data?.error?.code ||
                e?.response?.status ||
                "failed_to_embed";
              e.message = e?.response?.data?.error?.message || e.message;
              this.logDebug(
                `[Batch ${batchIndex + 1}/${batches.length}] ✗ Failed - ${e.type}: ${e.message}, ${duration}ms`
              );
              resolve({ data: [], error: e });
            });
        })
      );
    }

    const { data = [], error = null } = await Promise.all(
      embeddingRequests
    ).then((results) => {
      // If any errors were returned from OpenAI abort the entire sequence because the embeddings
      // will be incomplete.
      const errors = results
        .filter((res) => !!res.error)
        .map((res) => res.error)
        .flat();
      if (errors.length > 0) {
        let uniqueErrors = new Set();
        errors.map((error) =>
          uniqueErrors.add(`[${error.type}]: ${error.message}`)
        );

        return {
          data: [],
          error: Array.from(uniqueErrors).join(", "),
        };
      }
      return {
        data: results.map((res) => res?.data || []).flat(),
        error: null,
      };
    });

    if (!!error) throw new Error(`OpenAI Failed to embed: ${error}`);

    const totalDuration = Date.now() - totalStartTime;
    const embeddings = data.length > 0 &&
      data.every((embd) => embd.hasOwnProperty("embedding"))
      ? data.map((embd) => embd.embedding)
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
