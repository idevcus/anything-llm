const { toChunks } = require("../../helpers");

const MODEL_MAP = {
  "embedding-001": 2048,
  "text-embedding-004": 2048,
  "gemini-embedding-exp-03-07": 8192,
};

class GeminiEmbedder {
  constructor() {
    if (!process.env.GEMINI_EMBEDDING_API_KEY)
      throw new Error("No Gemini API key was set.");

    this.className = "GeminiEmbedder";
    const { OpenAI: OpenAIApi } = require("openai");
    this.model = process.env.EMBEDDING_MODEL_PREF || "text-embedding-004";
    this.openai = new OpenAIApi({
      apiKey: process.env.GEMINI_EMBEDDING_API_KEY,
      // Even models that are v1 in gemini API can be used with v1beta/openai/ endpoint and nobody knows why.
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    this.maxConcurrentChunks = 4;

    // https://ai.google.dev/gemini-api/docs/models/gemini#text-embedding-and-embedding
    this.embeddingMaxChunkLength = MODEL_MAP[this.model] || 2_048;
    this.log(
      `Initialized with ${this.model} - Max Size: ${this.embeddingMaxChunkLength}`
    );
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
   * Embeds a single text input
   * @param {string|string[]} textInput - The text to embed
   * @returns {Promise<Array<number>>} The embedding values
   */
  async embedTextInput(textInput) {
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  /**
   * Embeds a list of text inputs
   * @param {string[]} textChunks - The list of text to embed
   * @returns {Promise<Array<Array<number>>>} The embedding values
   */
  async embedChunks(textChunks = []) {
    const totalStartTime = Date.now();
    this.log(`Embedding ${textChunks.length} chunks...`);

    // Because there is a hard POST limit on how many chunks can be sent at once to OpenAI (~8mb)
    // we concurrently execute each max batch of text chunks possible.
    // Refer to constructor maxConcurrentChunks for more info.
    const batches = toChunks(textChunks, this.maxConcurrentChunks);
    const embeddingRequests = [];
    for (const [batchIndex, chunk] of batches.entries()) {
      embeddingRequests.push(
        new Promise((resolve) => {
          const startTime = Date.now();
          const estimatedTokens = chunk.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

          this.logDebug(`[Batch ${batchIndex + 1}/${batches.length}] Calling Gemini API - ${chunk.length} chunks, ~${estimatedTokens} tokens`);

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

    if (!!error) throw new Error(`Gemini Failed to embed: ${error}`);

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
  GeminiEmbedder,
};
