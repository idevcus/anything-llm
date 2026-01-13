/* eslint-env jest */
const { messageArrayCompressor } = require("../../../utils/helpers/chat");

// Mock TokenManager
jest.mock("../../../utils/helpers/tiktoken", () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    countFromString: jest.fn((text) => {
      // 간단한 토큰 카운트 모의: 공백으로 분리된 단어 수로 근사
      return text.split(/\s+/).length;
    }),
    statsFrom: jest.fn((messages) => {
      if (Array.isArray(messages)) {
        return messages.reduce((total, msg) => {
          if (typeof msg === "string") {
            return total + msg.split(/\s+/).length;
          }
          return total + (msg.content ? msg.content.split(/\s+/).length : 0);
        }, 0);
      }
      return messages.split(/\s+/).length;
    }),
    tokensFromString: jest.fn((text) => {
      return text.split(/\s+/);
    }),
    bytesFromTokens: jest.fn((tokens) => {
      return tokens.join(" ");
    }),
  })),
}));

// Mock convertToPromptHistory
jest.mock("../../../utils/helpers/chat/responses", () => ({
  convertToPromptHistory: jest.fn((history) => {
    return history.map((h) => [
      { role: "user", content: h.prompt },
      { role: "assistant", content: h.response },
    ])[0];
  }),
}));

describe("messageArrayCompressor", () => {
  let mockLLM;
  let originalEnv;

  beforeEach(() => {
    // 환경 변수 백업
    originalEnv = { ...process.env };

    // LLM 모킹
    mockLLM = {
      model: "gpt-3.5-turbo",
      promptWindowLimit: jest.fn(() => 4000),
      limits: {
        system: 600,   // 15% of 4000
        history: 600,  // 15% of 4000
        user: 2800,    // 70% of 4000
      },
    };
  });

  afterEach(() => {
    // 환경 변수 복원
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe("DISABLE_MESSAGE_COMPRESSION", () => {
    test("should return original messages when DISABLE_MESSAGE_COMPRESSION is true", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "true";

      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello" },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, []);

      expect(result).toEqual(messages);
    });

    test("should process normally when DISABLE_MESSAGE_COMPRESSION is false", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";

      // 작은 메시지 (압축 불필요)
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "User question" },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, []);

      // 메시지가 작으므로 압축 없이 통과
      expect(result).toEqual(messages);
      expect(result).toHaveLength(2);
    });
  });

  describe("COMPRESS_ONLY_HISTORY", () => {
    test("should compress only history when COMPRESS_ONLY_HISTORY is true", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "true";

      const systemPrompt = "You are a helpful assistant";
      const userPrompt = "What is the weather?";

      // 큰 히스토리 생성
      const rawHistory = [];
      for (let i = 0; i < 10; i++) {
        rawHistory.push({
          prompt: `Question ${i} ${"word ".repeat(100)}`,
          response: `Answer ${i} ${"word ".repeat(100)}`,
        });
      }

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, rawHistory);

      // 시스템과 사용자 프롬프트는 원본 그대로여야 함
      expect(result[0].content).toBe(systemPrompt);
      expect(result[result.length - 1].content).toBe(userPrompt);

      // 히스토리는 압축되어야 함 (10개보다 적어야 함)
      // (시스템 1개 + 히스토리 N개 + 사용자 1개)
      expect(result.length).toBeLessThan(2 + rawHistory.length * 2);
    });

    test("should log warning when system + user exceeds 90% of window", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "true";

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      // 시스템 + 사용자가 90% 이상인 메시지 (4000 * 0.9 = 3600 토큰 이상)
      // 각 단어를 1토큰으로 계산하므로 총 3600개 이상의 단어 필요
      const largeSystemPrompt = "word ".repeat(2000);
      const largeUserPrompt = "word ".repeat(1700);

      const messages = [
        { role: "system", content: largeSystemPrompt },
        { role: "user", content: largeUserPrompt },
      ];

      // 토큰 버퍼(600) 때문에 압축이 트리거되도록 조정
      mockLLM.promptWindowLimit.mockReturnValueOnce(3500);

      await messageArrayCompressor(mockLLM, messages, []);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const callArgs = consoleWarnSpy.mock.calls[0][0];
      expect(callArgs).toContain("[COMPRESS_ONLY_HISTORY] Warning");

      consoleWarnSpy.mockRestore();
    });

    test("should log compression stats when COMPRESS_ONLY_HISTORY is true", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "true";

      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      // 압축이 트리거되도록 큰 메시지 생성
      const messages = [
        { role: "system", content: "word ".repeat(1000) },
        { role: "user", content: "word ".repeat(1000) },
      ];

      const rawHistory = [
        { prompt: "word ".repeat(100), response: "word ".repeat(100) },
      ];

      // 압축 트리거를 위해 window limit 조정
      mockLLM.promptWindowLimit.mockReturnValueOnce(2000);

      await messageArrayCompressor(mockLLM, messages, rawHistory);

      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls.find(call =>
        call[0].includes("[COMPRESS_ONLY_HISTORY] Compressed history only")
      );
      expect(callArgs).toBeDefined();

      consoleLogSpy.mockRestore();
    });
  });

  describe("Default compression behavior", () => {
    test("should not compress when messages fit within window", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "false";

      const messages = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "User question" },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, []);

      // 메시지가 작으므로 압축 없이 통과
      expect(result).toEqual(messages);
    });

    test("should compress user prompt when it exceeds 70% of window", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "false";

      // 매우 큰 사용자 프롬프트 (70% 이상 = 2800 토큰 이상)
      const largeUserPrompt = "word ".repeat(3000);

      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: largeUserPrompt },
      ];

      // window limit을 작게 설정하여 압축 트리거
      // 3000 토큰 + 600 버퍼 = 3600 > 3500 (window limit)
      mockLLM.promptWindowLimit.mockReturnValue(3500);
      mockLLM.limits.user = 2450; // 70% of 3500

      const result = await messageArrayCompressor(mockLLM, messages, []);

      // 사용자 프롬프트가 70% 이상이면 단독 실행 모드로 전환
      // 결과는 사용자 메시지만 포함하고 cannonball 압축됨
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
      expect(result[0].content).toContain("--prompt truncated for brevity--");
    });

    test("should compress history when it exceeds 15% limit", async () => {
      process.env.DISABLE_MESSAGE_COMPRESSION = "false";
      process.env.COMPRESS_ONLY_HISTORY = "false";

      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: "Question" },
      ];

      // 큰 히스토리 생성
      const rawHistory = [];
      for (let i = 0; i < 20; i++) {
        rawHistory.push({
          prompt: `Q${i} ${"word ".repeat(50)}`,
          response: `A${i} ${"word ".repeat(50)}`,
        });
      }

      const result = await messageArrayCompressor(mockLLM, messages, rawHistory);

      // 히스토리가 압축되었는지 확인 (모든 히스토리가 포함되지 않음)
      expect(result.length).toBeLessThan(2 + rawHistory.length * 2);
    });
  });

  describe("Edge cases", () => {
    test("should handle empty history", async () => {
      process.env.COMPRESS_ONLY_HISTORY = "true";

      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: "User" },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, []);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("System");
      expect(result[1].content).toBe("User");
    });

    test("should handle undefined environment variables", async () => {
      delete process.env.DISABLE_MESSAGE_COMPRESSION;
      delete process.env.COMPRESS_ONLY_HISTORY;

      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: "User" },
      ];

      const result = await messageArrayCompressor(mockLLM, messages, []);

      // 기본 동작 (압축 없음)
      expect(result).toEqual(messages);
    });
  });
});
