class VoyageAiEmbedder {
  constructor() {
    if (!process.env.VOYAGEAI_API_KEY)
      throw new Error("No Voyage AI API key was set.");

    const {
      VoyageEmbeddings,
    } = require("@langchain/community/embeddings/voyage");

    this.className = "VoyageAiEmbedder";
    this.model = process.env.EMBEDDING_MODEL_PREF || "voyage-3-lite";
    this.voyage = new VoyageEmbeddings({
      apiKey: process.env.VOYAGEAI_API_KEY,
      modelName: this.model,
      // Voyage AI's limit per request is 128 https://docs.voyageai.com/docs/rate-limits#use-larger-batches
      batchSize: 128,
    });
    this.embeddingMaxChunkLength = this.#getMaxEmbeddingLength();
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

  // https://docs.voyageai.com/docs/embeddings
  #getMaxEmbeddingLength() {
    switch (this.model) {
      case "voyage-finance-2":
      case "voyage-multilingual-2":
      case "voyage-3":
      case "voyage-3-lite":
      case "voyage-3-large":
      case "voyage-code-3":
        return 32_000;
      case "voyage-large-2-instruct":
      case "voyage-law-2":
      case "voyage-code-2":
      case "voyage-large-2":
        return 16_000;
      case "voyage-2":
        return 4_000;
      default:
        return 4_000;
    }
  }

  async embedTextInput(textInput) {
    const result = await this.voyage.embedDocuments(
      Array.isArray(textInput) ? textInput : [textInput]
    );

    // If given an array return the native Array[Array] format since that should be the outcome.
    // But if given a single string, we need to flatten it so that we have a 1D array.
    return (Array.isArray(textInput) ? result : result.flat()) || [];
  }

  async embedChunks(textChunks = []) {
    const totalStartTime = Date.now();
    this.log(`Embedding ${textChunks.length} chunks...`);

    try {
      const startTime = Date.now();
      const estimatedTokens = textChunks.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

      this.logDebug(`Calling VoyageAI API - ${textChunks.length} chunks, ~${estimatedTokens} tokens (auto-batched in groups of 128)`);

      const embeddings = await this.voyage.embedDocuments(textChunks);

      const duration = Date.now() - startTime;
      const totalDuration = Date.now() - totalStartTime;

      this.logDebug(
        `✓ Success - ${embeddings.length} embeddings, ${duration}ms`
      );
      this.logDebug(
        `✓ Completed all embeddings in ${(totalDuration / 1000).toFixed(2)}s`
      );

      return embeddings;
    } catch (error) {
      console.error("Voyage AI Failed to embed:", error);
      if (
        error.message.includes(
          "Cannot read properties of undefined (reading '0')"
        )
      )
        throw new Error("Voyage AI failed to embed: Rate limit reached");
      throw error;
    }
  }
}

module.exports = {
  VoyageAiEmbedder,
};
