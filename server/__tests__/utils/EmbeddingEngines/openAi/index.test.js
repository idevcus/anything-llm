/* eslint-env jest */

// Mock OpenAI SDK before importing OpenAiEmbedder
jest.mock("openai");

const { OpenAiEmbedder } = require("../../../../utils/EmbeddingEngines/openAi");
const { OpenAI } = require("openai");

describe("OpenAiEmbedder", () => {
  let embedder;
  let mockEmbeddingsCreate;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup environment
    process.env.OPEN_AI_KEY = "test-key";
    delete process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS;
    delete process.env.OPENAI_EMBEDDING_MAX_RETRIES;
    delete process.env.OPENAI_EMBEDDING_RETRY_BASE_DELAY_MS;
    delete process.env.OPENAI_EMBEDDING_RETRY_MAX_DELAY_MS;

    // Setup OpenAI mock
    mockEmbeddingsCreate = jest.fn();
    OpenAI.mockImplementation(() => ({
      embeddings: { create: mockEmbeddingsCreate }
    }));

    embedder = new OpenAiEmbedder();

    // Spy on sleep to avoid actual delays in tests
    jest.spyOn(embedder, 'sleep').mockResolvedValue();
  });

  describe("Helper Methods", () => {
    describe("getBatchDelay", () => {
      test("returns default 1000ms when env var not set", () => {
        expect(embedder.getBatchDelay()).toBe(1000);
      });

      test("returns env var value when set", () => {
        process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS = "2000";
        embedder = new OpenAiEmbedder();
        expect(embedder.getBatchDelay()).toBe(2000);
      });

      test("returns minimum 500ms when env var is below minimum", () => {
        process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS = "300";
        embedder = new OpenAiEmbedder();
        expect(embedder.getBatchDelay()).toBe(500);
      });

      test("returns default 1000ms when env var is NaN", () => {
        process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS = "invalid";
        embedder = new OpenAiEmbedder();
        expect(embedder.getBatchDelay()).toBe(1000);
      });
    });

    describe("sleep", () => {
      beforeEach(() => {
        // Remove mock for this specific test
        embedder.sleep.mockRestore();
      });

      test("waits for specified milliseconds", async () => {
        const start = Date.now();
        await embedder.sleep(100);
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(90);
        expect(duration).toBeLessThan(150);
      });
    });

    describe("getRetryConfig", () => {
      test("returns default config when env vars not set", () => {
        const config = embedder.getRetryConfig();
        expect(config).toEqual({
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 60000
        });
      });

      test("returns env var values when set", () => {
        process.env.OPENAI_EMBEDDING_MAX_RETRIES = "5";
        process.env.OPENAI_EMBEDDING_RETRY_BASE_DELAY_MS = "2000";
        process.env.OPENAI_EMBEDDING_RETRY_MAX_DELAY_MS = "30000";
        embedder = new OpenAiEmbedder();

        const config = embedder.getRetryConfig();
        expect(config).toEqual({
          maxRetries: 5,
          baseDelay: 2000,
          maxDelay: 30000
        });
      });

      test("clamps negative maxRetries to 0", () => {
        process.env.OPENAI_EMBEDDING_MAX_RETRIES = "-1";
        embedder = new OpenAiEmbedder();
        const config = embedder.getRetryConfig();
        expect(config.maxRetries).toBe(0);
      });
    });

    describe("is429Error", () => {
      test("returns true when error.status is 429", () => {
        const error = { status: 429 };
        expect(embedder.is429Error(error)).toBe(true);
      });

      test("returns true when error.response.status is 429", () => {
        const error = { response: { status: 429 } };
        expect(embedder.is429Error(error)).toBe(true);
      });

      test("returns true when error.type is rate_limit_error", () => {
        const error = { type: 'rate_limit_error' };
        expect(embedder.is429Error(error)).toBe(true);
      });

      test("returns false for non-429 errors", () => {
        expect(embedder.is429Error({ status: 401 })).toBe(false);
        expect(embedder.is429Error({ status: 500 })).toBe(false);
        expect(embedder.is429Error({})).toBe(false);
      });
    });

    describe("getRetryAfter", () => {
      test("parses decimal Retry-After header correctly", () => {
        const error = {
          response: {
            headers: { 'retry-after': '1.075' }
          }
        };
        expect(embedder.getRetryAfter(error)).toBe(1075);
      });

      test("parses integer Retry-After header correctly", () => {
        const error = {
          response: {
            headers: { 'retry-after': '2' }
          }
        };
        expect(embedder.getRetryAfter(error)).toBe(2000);
      });

      test("returns null when Retry-After header missing", () => {
        const error = { response: { headers: {} } };
        expect(embedder.getRetryAfter(error)).toBeNull();
      });

      test("returns null when Retry-After is invalid", () => {
        const error = {
          response: {
            headers: { 'retry-after': 'invalid' }
          }
        };
        expect(embedder.getRetryAfter(error)).toBeNull();
      });

      test("returns null when Retry-After is zero or negative", () => {
        const error1 = {
          response: {
            headers: { 'retry-after': '0' }
          }
        };
        const error2 = {
          response: {
            headers: { 'retry-after': '-1' }
          }
        };
        expect(embedder.getRetryAfter(error1)).toBeNull();
        expect(embedder.getRetryAfter(error2)).toBeNull();
      });
    });
  });

  describe("executeBatchWithRetry", () => {
    const mockSuccessResponse = {
      data: [
        { embedding: [0.1, 0.2, 0.3], index: 0 },
        { embedding: [0.4, 0.5, 0.6], index: 1 }
      ],
      usage: { total_tokens: 100 }
    };

    test("returns data on first successful attempt", async () => {
      mockEmbeddingsCreate.mockResolvedValueOnce(mockSuccessResponse);

      const result = await embedder.executeBatchWithRetry(
        ["chunk1", "chunk2"],
        0,
        1
      );

      expect(result.data).toEqual(mockSuccessResponse.data);
      expect(result.error).toBeNull();
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    });

    test("retries on 429 error with Retry-After header", async () => {
      const error429 = new Error("Rate limit");
      error429.status = 429;
      error429.response = {
        status: 429,
        headers: { 'retry-after': '1.5' },
        data: {
          error: {
            code: 'rate_limit_error',
            message: 'Rate limit reached'
          }
        }
      };
      error429.type = 'rate_limit_error';

      mockEmbeddingsCreate
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(mockSuccessResponse);

      const result = await embedder.executeBatchWithRetry(
        ["chunk1"],
        0,
        1
      );

      expect(result.data).toEqual(mockSuccessResponse.data);
      expect(result.error).toBeNull();
      expect(embedder.sleep).toHaveBeenCalledWith(1500);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
    });

    test("uses exponential backoff when Retry-After header missing", async () => {
      const error429 = new Error("Rate limit");
      error429.status = 429;
      error429.response = {
        status: 429,
        headers: {},
        data: { error: { code: 'rate_limit_error' } }
      };

      mockEmbeddingsCreate
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(mockSuccessResponse);

      await embedder.executeBatchWithRetry(["chunk1"], 0, 1);

      // First retry: baseDelay * 2^0 = 1000
      expect(embedder.sleep).toHaveBeenCalledWith(1000);
    });

    test("respects maxDelay in exponential backoff", async () => {
      process.env.OPENAI_EMBEDDING_RETRY_BASE_DELAY_MS = "30000";
      process.env.OPENAI_EMBEDDING_RETRY_MAX_DELAY_MS = "40000";
      embedder = new OpenAiEmbedder();
      jest.spyOn(embedder, 'sleep').mockResolvedValue();

      const error429 = new Error("Rate limit");
      error429.status = 429;
      error429.response = { status: 429, headers: {}, data: { error: {} } };

      mockEmbeddingsCreate
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(mockSuccessResponse);

      await embedder.executeBatchWithRetry(["chunk1"], 0, 1);

      // Second retry: baseDelay * 2^1 = 60000, capped at maxDelay = 40000
      const calls = embedder.sleep.mock.calls;
      expect(calls[1][0]).toBe(40000);
    });

    test("fails after maxRetries exceeded", async () => {
      process.env.OPENAI_EMBEDDING_MAX_RETRIES = "2";
      embedder = new OpenAiEmbedder();
      jest.spyOn(embedder, 'sleep').mockResolvedValue();

      const error429 = new Error("Rate limit");
      error429.status = 429;
      error429.response = {
        status: 429,
        headers: {},
        data: { error: { code: 'rate_limit_error', message: 'Rate limit' } }
      };
      error429.type = 'rate_limit_error';
      error429.message = 'Rate limit';

      mockEmbeddingsCreate.mockRejectedValue(error429);

      const result = await embedder.executeBatchWithRetry(["chunk1"], 0, 1);

      expect(result.data).toEqual([]);
      expect(result.error).toBeTruthy();
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3); // 1 original + 2 retries
    });

    test("does not retry on non-429 errors", async () => {
      const error401 = new Error("Invalid API key");
      error401.status = 401;
      error401.response = {
        status: 401,
        data: { error: { code: 'invalid_api_key', message: 'Invalid key' } }
      };

      mockEmbeddingsCreate.mockRejectedValueOnce(error401);

      const result = await embedder.executeBatchWithRetry(["chunk1"], 0, 1);

      expect(result.data).toEqual([]);
      expect(result.error).toBeTruthy();
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
      expect(embedder.sleep).not.toHaveBeenCalled();
    });
  });

  describe("embedChunks", () => {
    const mockEmbedding = (index) => ({
      embedding: Array(1536).fill(0.1 + index * 0.1),
      index
    });

    test("processes batches sequentially", async () => {
      const callOrder = [];

      mockEmbeddingsCreate.mockImplementation(async () => {
        callOrder.push(Date.now());
        return {
          data: [mockEmbedding(0)],
          usage: { total_tokens: 50 }
        };
      });

      // Create 1500 chunks to trigger 3 batches (maxConcurrentChunks = 500)
      const chunks = Array(1500).fill("test chunk");
      await embedder.embedChunks(chunks);

      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3);
      // Verify sequential execution by checking call order
      expect(callOrder.length).toBe(3);
    });

    test("applies delay between batches", async () => {
      process.env.OPENAI_EMBEDDING_BATCH_DELAY_MS = "1000";
      embedder = new OpenAiEmbedder();
      jest.spyOn(embedder, 'sleep').mockResolvedValue();

      mockEmbeddingsCreate.mockResolvedValue({
        data: [mockEmbedding(0)],
        usage: { total_tokens: 50 }
      });

      // Create 1500 chunks to trigger 3 batches
      const chunks = Array(1500).fill("test chunk");
      await embedder.embedChunks(chunks);

      // Should delay 2 times (not after last batch)
      expect(embedder.sleep).toHaveBeenCalledTimes(2);
      expect(embedder.sleep).toHaveBeenCalledWith(1000);
    });

    test("does not delay after last batch", async () => {
      jest.spyOn(embedder, 'sleep').mockResolvedValue();

      mockEmbeddingsCreate.mockResolvedValue({
        data: [mockEmbedding(0)],
        usage: { total_tokens: 50 }
      });

      const chunks = ["chunk1"];
      await embedder.embedChunks(chunks);

      expect(embedder.sleep).not.toHaveBeenCalled();
    });

    test("throws error when batch fails", async () => {
      const error = new Error("API Error");
      error.type = "api_error";
      error.message = "Something went wrong";

      mockEmbeddingsCreate
        .mockResolvedValueOnce({
          data: [mockEmbedding(0)],
          usage: { total_tokens: 50 }
        })
        .mockRejectedValueOnce(error);

      // Create 1200 chunks to trigger 2+ batches
      const chunks = Array(1200).fill("test chunk");

      await expect(embedder.embedChunks(chunks))
        .rejects
        .toThrow("OpenAI Failed to embed batch 2/");
    });

    test("returns embeddings array on success", async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [mockEmbedding(0), mockEmbedding(1)],
        usage: { total_tokens: 100 }
      });

      const chunks = ["chunk1", "chunk2"];
      const result = await embedder.embedChunks(chunks);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(1536);
    });

    test("handles multiple batches correctly", async () => {
      // Create enough chunks to trigger multiple batches (maxConcurrentChunks = 500)
      const chunks = Array(1200).fill("test chunk");

      // Mock should return the number of embeddings matching the batch size
      mockEmbeddingsCreate.mockImplementation(async ({ input }) => ({
        data: Array(input.length).fill(null).map((_, i) => mockEmbedding(i)),
        usage: { total_tokens: input.length * 10 }
      }));

      const result = await embedder.embedChunks(chunks);

      // Should create 3 batches: 500 + 500 + 200
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3);
      expect(result.length).toBe(1200);
    });
  });
});
