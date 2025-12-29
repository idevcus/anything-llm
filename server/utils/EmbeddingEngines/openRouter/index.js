const { toChunks } = require("../../helpers");

class OpenRouterEmbedder {
  constructor() {
    if (!process.env.OPENROUTER_API_KEY)
      throw new Error("No OpenRouter API key was set.");
    this.className = "OpenRouterEmbedder";
    const { OpenAI: OpenAIApi } = require("openai");
    this.openai = new OpenAIApi({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://anythingllm.com",
        "X-Title": "AnythingLLM",
      },
    });
    this.model = process.env.EMBEDDING_MODEL_PREF || "baai/bge-m3";

    // Limit of how many strings we can process in a single pass to stay with resource or network limits
    this.maxConcurrentChunks = 500;

    // https://openrouter.ai/docs/api/reference/embeddings
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
    this.log(`Embedding ${textChunks.length} document chunks...`);

    const batches = toChunks(textChunks, this.maxConcurrentChunks);
    const embeddingRequests = [];
    for (const [batchIndex, chunk] of batches.entries()) {
      embeddingRequests.push(
        new Promise((resolve) => {
          const startTime = Date.now();
          const estimatedTokens = chunk.reduce((sum, text) => sum + Math.ceil(text.length / 2), 0);

          this.logDebug(`[Batch ${batchIndex + 1}/${batches.length}] Calling OpenRouter API - ${chunk.length} chunks, ~${estimatedTokens} tokens`);

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

    if (!!error) throw new Error(`OpenRouter Failed to embed: ${error}`);

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

async function fetchOpenRouterEmbeddingModels() {
  return await fetch(`https://openrouter.ai/api/v1/embeddings/models`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => res.json())
    .then(({ data = [] }) => {
      const models = {};
      data.forEach((model) => {
        models[model.id] = {
          id: model.id,
          name: model.name || model.id,
          organization:
            model.id.split("/")[0].charAt(0).toUpperCase() +
            model.id.split("/")[0].slice(1),
          maxLength: model.context_length,
        };
      });
      return models;
    })
    .catch((e) => {
      console.error("OpenRouter:fetchEmbeddingModels", e.message);
      return {};
    });
}

module.exports = {
  OpenRouterEmbedder,
  fetchOpenRouterEmbeddingModels,
};
