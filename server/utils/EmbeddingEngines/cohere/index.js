const { toChunks } = require("../../helpers");

class CohereEmbedder {
  constructor() {
    if (!process.env.COHERE_API_KEY)
      throw new Error("No Cohere API key was set.");

    const { CohereClient } = require("cohere-ai");
    const cohere = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });

    this.className = "CohereEmbedder";
    this.cohere = cohere;
    this.model = process.env.EMBEDDING_MODEL_PREF || "embed-english-v3.0";
    this.inputType = "search_document";

    // Limit of how many strings we can process in a single pass to stay with resource or network limits
    this.maxConcurrentChunks = 96; // Cohere's limit per request is 96
    this.embeddingMaxChunkLength = 1945; // https://docs.cohere.com/docs/embed-2 - assume a token is roughly 4 letters with some padding
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
    this.inputType = "search_query";
    const result = await this.embedChunks([textInput]);
    return result?.[0] || [];
  }

  async embedChunks(textChunks = []) {
    const totalStartTime = Date.now();
    this.log(`Embedding ${textChunks.length} chunks...`);

    const embeddingRequests = [];
    this.inputType = "search_document";

    const batches = toChunks(textChunks, this.maxConcurrentChunks);
    for (const [batchIndex, chunk] of batches.entries()) {
      embeddingRequests.push(
        new Promise((resolve) => {
          const startTime = Date.now();
          const estimatedTokens = chunk.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

          this.logDebug(`[Batch ${batchIndex + 1}/${batches.length}] Calling Cohere API - ${chunk.length} chunks, ~${estimatedTokens} tokens`);

          this.cohere
            .embed({
              texts: chunk,
              model: this.model,
              inputType: this.inputType,
            })
            .then((res) => {
              const duration = Date.now() - startTime;
              this.logDebug(
                `[Batch ${batchIndex + 1}/${batches.length}] ✓ Success - ${res?.embeddings?.length || 0} embeddings, ${duration}ms`
              );
              resolve({ data: res.embeddings, error: null });
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
      const errors = results
        .filter((res) => !!res.error)
        .map((res) => res.error)
        .flat();

      if (errors.length > 0) {
        let uniqueErrors = new Set();
        errors.map((error) =>
          uniqueErrors.add(`[${error.type}]: ${error.message}`)
        );
        return { data: [], error: Array.from(uniqueErrors).join(", ") };
      }

      return {
        data: results.map((res) => res?.data || []).flat(),
        error: null,
      };
    });

    if (!!error) throw new Error(`Cohere Failed to embed: ${error}`);

    const totalDuration = Date.now() - totalStartTime;
    if (data.length > 0) {
      this.logDebug(
        `✓ Completed all embeddings - ${data.length} vectors generated in ${(totalDuration / 1000).toFixed(2)}s ` +
        `(avg: ${(totalDuration / batches.length).toFixed(0)}ms per batch)`
      );
    }

    return data.length > 0 ? data : null;
  }
}

module.exports = {
  CohereEmbedder,
};
