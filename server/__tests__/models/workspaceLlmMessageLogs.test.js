const { WorkspaceLlmMessageLogs } = require("../../models/workspaceLlmMessageLogs");

// Mock prisma
jest.mock("../../utils/prisma", () => ({
  workspace_llm_message_logs: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");

describe("WorkspaceLlmMessageLogs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("new", () => {
    it("should create a new LLM message log with all fields", async () => {
      const mockLog = {
        id: 1,
        chat_id: 100,
        system_prompt: "You are a helpful assistant",
        user_prompt: "Hello, how are you?",
        llm_response: "I'm doing well, thank you!",
        rag_context: '[{"text": "Context 1"}, {"text": "Context 2"}]',
        chat_history: '[{"role": "user", "content": "Previous message"}]',
        compressed_messages: '[{"role": "system", "content": "System prompt"}, {"role": "user", "content": "Hello"}]',
        created_at: new Date(),
        last_updated_at: new Date(),
      };

      prisma.workspace_llm_message_logs.create = jest.fn().mockResolvedValue(mockLog);

      const { log, message } = await WorkspaceLlmMessageLogs.new({
        chatId: 100,
        systemPrompt: "You are a helpful assistant",
        userPrompt: "Hello, how are you?",
        llmResponse: "I'm doing well, thank you!",
        ragContext: [{ text: "Context 1" }, { text: "Context 2" }],
        chatHistory: [{ role: "user", content: "Previous message" }],
        compressedMessages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "Hello" },
        ],
      });

      expect(log).toEqual(mockLog);
      expect(message).toBeNull();
      expect(prisma.workspace_llm_message_logs.create).toHaveBeenCalledWith({
        data: {
          chat_id: 100,
          system_prompt: "You are a helpful assistant",
          user_prompt: "Hello, how are you?",
          llm_response: "I'm doing well, thank you!",
          rag_context: expect.any(String),
          chat_history: expect.any(String),
          compressed_messages: expect.any(String),
        },
      });
    });

    it("should create a log with null values for empty arrays", async () => {
      const mockLog = {
        id: 1,
        chat_id: 100,
        system_prompt: null,
        user_prompt: null,
        llm_response: null,
        rag_context: null,
        chat_history: null,
        compressed_messages: null,
        created_at: new Date(),
        last_updated_at: new Date(),
      };

      prisma.workspace_llm_message_logs.create = jest.fn().mockResolvedValue(mockLog);

      const { log, message } = await WorkspaceLlmMessageLogs.new({
        chatId: 100,
      });

      expect(log).toEqual(mockLog);
      expect(message).toBeNull();
      expect(prisma.workspace_llm_message_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chat_id: 100,
          rag_context: null,
          chat_history: null,
          compressed_messages: null,
        }),
      });
    });

    it("should handle errors gracefully", async () => {
      const mockError = new Error("Database error");
      prisma.workspace_llm_message_logs.create = jest
        .fn()
        .mockRejectedValue(mockError);

      const { log, message } = await WorkspaceLlmMessageLogs.new({
        chatId: 100,
        systemPrompt: "Test",
      });

      expect(log).toBeNull();
      expect(message).toBe("Database error");
    });
  });

  describe("get", () => {
    it("should retrieve a log by clause", async () => {
      const mockLog = {
        id: 1,
        chat_id: 100,
        system_prompt: "Test prompt",
        user_prompt: "Test user prompt",
      };

      prisma.workspace_llm_message_logs.findFirst = jest.fn().mockResolvedValue(mockLog);

      const result = await WorkspaceLlmMessageLogs.get({ chat_id: 100 });

      expect(result).toEqual(mockLog);
      expect(prisma.workspace_llm_message_logs.findFirst).toHaveBeenCalledWith({
        where: { chat_id: 100 },
      });
    });

    it("should return null if log not found", async () => {
      prisma.workspace_llm_message_logs.findFirst = jest.fn().mockResolvedValue(null);

      const result = await WorkspaceLlmMessageLogs.get({ chat_id: 999 });

      expect(result).toBeNull();
    });
  });

  describe("getByChatId", () => {
    it("should retrieve a log by chat ID using unique constraint", async () => {
      const mockLog = {
        id: 1,
        chat_id: 100,
        system_prompt: "Test prompt",
      };

      prisma.workspace_llm_message_logs.findUnique = jest.fn().mockResolvedValue(mockLog);

      const result = await WorkspaceLlmMessageLogs.getByChatId(100);

      expect(result).toEqual(mockLog);
      expect(prisma.workspace_llm_message_logs.findUnique).toHaveBeenCalledWith({
        where: { chat_id: 100 },
      });
    });

    it("should return null for non-existent chat ID", async () => {
      prisma.workspace_llm_message_logs.findUnique = jest.fn().mockResolvedValue(null);

      const result = await WorkspaceLlmMessageLogs.getByChatId(999);

      expect(result).toBeNull();
    });
  });

  describe("where", () => {
    it("should retrieve logs with clause and options", async () => {
      const mockLogs = [
        { id: 1, chat_id: 100, system_prompt: "Test 1" },
        { id: 2, chat_id: 101, system_prompt: "Test 2" },
      ];

      prisma.workspace_llm_message_logs.findMany = jest.fn().mockResolvedValue(mockLogs);

      const result = await WorkspaceLlmMessageLogs.where(
        { system_prompt: { contains: "Test" } },
        10,
        { created_at: "desc" },
        5
      );

      expect(result).toEqual(mockLogs);
      expect(prisma.workspace_llm_message_logs.findMany).toHaveBeenCalledWith({
        where: { system_prompt: { contains: "Test" } },
        take: 10,
        skip: 5,
        orderBy: { created_at: "desc" },
      });
    });

    it("should use default ordering when not specified", async () => {
      const mockLogs = [{ id: 1, chat_id: 100 }];
      prisma.workspace_llm_message_logs.findMany = jest.fn().mockResolvedValue(mockLogs);

      await WorkspaceLlmMessageLogs.where({ chat_id: 100 });

      expect(prisma.workspace_llm_message_logs.findMany).toHaveBeenCalledWith({
        where: { chat_id: 100 },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("count", () => {
    it("should count logs matching the clause", async () => {
      prisma.workspace_llm_message_logs.count = jest.fn().mockResolvedValue(5);

      const result = await WorkspaceLlmMessageLogs.count({ chat_id: 100 });

      expect(result).toBe(5);
      expect(prisma.workspace_llm_message_logs.count).toHaveBeenCalledWith({
        where: { chat_id: 100 },
      });
    });

    it("should return 0 on error", async () => {
      prisma.workspace_llm_message_logs.count = jest
        .fn()
        .mockRejectedValue(new Error("Count error"));

      const result = await WorkspaceLlmMessageLogs.count({ chat_id: 100 });

      expect(result).toBe(0);
    });
  });

  describe("delete", () => {
    it("should delete logs matching the clause", async () => {
      prisma.workspace_llm_message_logs.deleteMany = jest.fn().mockResolvedValue({
        count: 3,
      });

      const result = await WorkspaceLlmMessageLogs.delete({ chat_id: 100 });

      expect(result).toBe(true);
      expect(prisma.workspace_llm_message_logs.deleteMany).toHaveBeenCalledWith({
        where: { chat_id: 100 },
      });
    });

    it("should return false on error", async () => {
      prisma.workspace_llm_message_logs.deleteMany = jest
        .fn()
        .mockRejectedValue(new Error("Delete error"));

      const result = await WorkspaceLlmMessageLogs.delete({ chat_id: 100 });

      expect(result).toBe(false);
    });
  });
});
