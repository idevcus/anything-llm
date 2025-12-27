class AzureOpenAiEmbedder {
  constructor() {
    const { AzureOpenAI } = require("openai");
    if (!process.env.AZURE_OPENAI_ENDPOINT)
      throw new Error("No Azure API endpoint was set.");
    if (!process.env.AZURE_OPENAI_KEY)
      throw new Error("No Azure API key was set.");

    this.className = "AzureOpenAiEmbedder";
    this.apiVersion = "2024-12-01-preview";
    const openai = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: this.apiVersion,
    });

    // We cannot assume the model fallback since the model is based on the deployment name
    // and not the model name - so this will throw on embedding if the model is not defined.
    this.model = process.env.EMBEDDING_MODEL_PREF;
    this.openai = openai;

    // Limit of how many strings we can process in a single pass to stay with resource or network limits
    // https://learn.microsoft.com/en-us/azure/ai-services/openai/faq#i-am-trying-to-use-embeddings-and-received-the-error--invalidrequesterror--too-many-inputs--the-max-number-of-inputs-is-1---how-do-i-fix-this-:~:text=consisting%20of%20up%20to%2016%20inputs%20per%20API%20request
    this.maxConcurrentChunks = 16;

    // https://learn.microsoft.com/en-us/answers/questions/1188074/text-embedding-ada-002-token-context-length
    this.embeddingMaxChunkLength = 2048;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  async embedTextInput(textInput) {
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  async embedChunks(textChunks = []) {
    if (!this.model) throw new Error("No Embedding Model preference defined.");

    this.log(`Embedding ${textChunks.length} chunks...`);

    // Because there is a limit on how many chunks can be sent at once to Azure OpenAI
    // Both in terms of batch size AND token count (300k tokens per request)
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
    for (const chunk of batches) {
      embeddingRequests.push(
        new Promise((resolve) => {
          this.openai.embeddings
            .create({
              model: this.model,
              input: chunk,
            })
            .then((res) => {
              resolve({ data: res.data, error: null });
            })
            .catch((e) => {
              e.type =
                e?.response?.data?.error?.code ||
                e?.response?.status ||
                "failed_to_embed";
              e.message = e?.response?.data?.error?.message || e.message;
              resolve({ data: [], error: e });
            });
        })
      );
    }

    const { data = [], error = null } = await Promise.all(
      embeddingRequests
    ).then((results) => {
      // If any errors were returned from Azure abort the entire sequence because the embeddings
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

    if (!!error) throw new Error(`Azure OpenAI Failed to embed: ${error}`);
    return data.length > 0 &&
      data.every((embd) => embd.hasOwnProperty("embedding"))
      ? data.map((embd) => embd.embedding)
      : null;
  }
}

module.exports = {
  AzureOpenAiEmbedder,
};
