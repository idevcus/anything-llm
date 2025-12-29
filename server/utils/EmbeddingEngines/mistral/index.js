class MistralEmbedder {
  constructor() {
    if (!process.env.MISTRAL_API_KEY)
      throw new Error("No Mistral API key was set.");

    const { OpenAI: OpenAIApi } = require("openai");
    this.className = "MistralEmbedder";
    this.openai = new OpenAIApi({
      baseURL: "https://api.mistral.ai/v1",
      apiKey: process.env.MISTRAL_API_KEY ?? null,
    });
    this.model = process.env.EMBEDDING_MODEL_PREF || "mistral-embed";
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
    try {
      const startTime = Date.now();
      this.logDebug(`Calling Mistral API for single text input`);

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: textInput,
      });

      const duration = Date.now() - startTime;
      this.logDebug(`✓ Success - 1 embedding, ${duration}ms`);

      return response?.data[0]?.embedding || [];
    } catch (error) {
      console.error("Failed to get embedding from Mistral.", error.message);
      return [];
    }
  }

  async embedChunks(textChunks = []) {
    const totalStartTime = Date.now();
    this.log(`Embedding ${textChunks.length} chunks...`);

    try {
      const startTime = Date.now();
      const estimatedTokens = textChunks.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

      this.logDebug(`Calling Mistral API - ${textChunks.length} chunks, ~${estimatedTokens} tokens`);

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: textChunks,
      });

      const duration = Date.now() - startTime;
      const actualTokens = response?.usage?.total_tokens || 0;
      const totalDuration = Date.now() - totalStartTime;

      this.logDebug(
        `✓ Success - ${response?.data?.length || 0} embeddings, ${actualTokens} tokens used, ${duration}ms`
      );
      this.logDebug(
        `✓ Completed all embeddings in ${(totalDuration / 1000).toFixed(2)}s`
      );

      return response?.data?.map((emb) => emb.embedding) || [];
    } catch (error) {
      console.error("Failed to get embeddings from Mistral.", error.message);
      return new Array(textChunks.length).fill([]);
    }
  }
}

module.exports = {
  MistralEmbedder,
};
