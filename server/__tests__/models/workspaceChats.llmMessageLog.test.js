const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceLlmMessageLogs } = require("../../models/workspaceLlmMessageLogs");

// Mock WorkspaceLlmMessageLogs
jest.mock("../../models/workspaceLlmMessageLogs");

describe("WorkspaceChats.createLlmMessageLog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error during tests
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("createLlmMessageLog", () => {
    it("should successfully create an LLM message log", async () => {
      const mockLog = {
        id: 1,
        chat_id: 100,
        system_prompt: "You are a helpful assistant",
        user_prompt: "Hello",
        llm_response: "Hi there!",
      };

      WorkspaceLlmMessageLogs.new = jest.fn().mockResolvedValue({
        log: mockLog,
        message: null,
      });

      const llmData = {
        systemPrompt: "You are a helpful assistant",
        userPrompt: "Hello",
        llmResponse: "Hi there!",
        contextTexts: ["Context 1", "Context 2"],
        chatHistory: [{ role: "user", content: "Previous" }],
        compressedMessages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ],
      };

      const { log, message } = await WorkspaceChats.createLlmMessageLog(100, llmData);

      expect(log).toEqual(mockLog);
      expect(message).toBeNull();
      expect(WorkspaceLlmMessageLogs.new).toHaveBeenCalledWith({
        chatId: 100,
        systemPrompt: "You are a helpful assistant",
        userPrompt: "Hello",
        llmResponse: "Hi there!",
        ragContext: ["Context 1", "Context 2"],
        chatHistory: [{ role: "user", content: "Previous" }],
        compressedMessages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ],
      });
    });

    it("should handle errors from WorkspaceLlmMessageLogs.new", async () => {
      const errorMessage = "Database connection failed";
      WorkspaceLlmMessageLogs.new = jest.fn().mockResolvedValue({
        log: null,
        message: errorMessage,
      });

      const llmData = {
        systemPrompt: "Test",
        userPrompt: "Test",
        llmResponse: "Test",
      };

      const { log, message } = await WorkspaceChats.createLlmMessageLog(100, llmData);

      expect(log).toBeNull();
      expect(message).toBe(errorMessage);
      expect(console.error).toHaveBeenCalledWith(
        `[WorkspaceChats] Failed to create LLM message log for chat 100:`,
        errorMessage
      );
    });

    it("should handle unexpected errors", async () => {
      const unexpectedError = new Error("Unexpected error");
      WorkspaceLlmMessageLogs.new = jest.fn().mockRejectedValue(unexpectedError);

      const llmData = {
        systemPrompt: "Test",
        userPrompt: "Test",
        llmResponse: "Test",
      };

      const { log, message } = await WorkspaceChats.createLlmMessageLog(100, llmData);

      expect(log).toBeNull();
      expect(message).toBe("Unexpected error");
      expect(console.error).toHaveBeenCalledWith(
        `[WorkspaceChats] Error creating LLM message log for chat 100:`,
        "Unexpected error"
      );
    });

    it("should pass all llmData fields correctly", async () => {
      const mockLog = { id: 1, chat_id: 100 };
      WorkspaceLlmMessageLogs.new = jest.fn().mockResolvedValue({
        log: mockLog,
        message: null,
      });

      const llmData = {
        systemPrompt: "System prompt here",
        userPrompt: "User prompt here",
        llmResponse: "LLM response here",
        contextTexts: ["RAG context 1", "RAG context 2", "RAG context 3"],
        chatHistory: [
          { role: "user", content: "Message 1" },
          { role: "assistant", content: "Response 1" },
          { role: "user", content: "Message 2" },
        ],
        compressedMessages: [
          { role: "system", content: "System" },
          { role: "user", content: "User" },
        ],
      };

      await WorkspaceChats.createLlmMessageLog(200, llmData);

      expect(WorkspaceLlmMessageLogs.new).toHaveBeenCalledWith({
        chatId: 200,
        systemPrompt: "System prompt here",
        userPrompt: "User prompt here",
        llmResponse: "LLM response here",
        ragContext: ["RAG context 1", "RAG context 2", "RAG context 3"],
        chatHistory: [
          { role: "user", content: "Message 1" },
          { role: "assistant", content: "Response 1" },
          { role: "user", content: "Message 2" },
        ],
        compressedMessages: [
          { role: "system", content: "System" },
          { role: "user", content: "User" },
        ],
      });
    });

    it("should handle empty arrays correctly", async () => {
      const mockLog = { id: 1, chat_id: 100 };
      WorkspaceLlmMessageLogs.new = jest.fn().mockResolvedValue({
        log: mockLog,
        message: null,
      });

      const llmData = {
        systemPrompt: null,
        userPrompt: null,
        llmResponse: null,
        contextTexts: [],
        chatHistory: [],
        compressedMessages: [],
      };

      await WorkspaceChats.createLlmMessageLog(100, llmData);

      expect(WorkspaceLlmMessageLogs.new).toHaveBeenCalledWith({
        chatId: 100,
        systemPrompt: null,
        userPrompt: null,
        llmResponse: null,
        ragContext: [],
        chatHistory: [],
        compressedMessages: [],
      });
    });
  });
});
