const { WorkspaceLlmMessageLogs } = require("../../models/workspaceLlmMessageLogs");
const { WorkspaceChats } = require("../../models/workspaceChats");
const prisma = require("../../utils/prisma");

const hasPostgres =
  typeof process.env.DATABASE_URL === "string" &&
  /^(postgresql|postgres):\/\//.test(process.env.DATABASE_URL);
const describeIf = hasPostgres ? describe : describe.skip;

describeIf("WorkspaceLlmMessageLogs Integration Tests (SQLite)", () => {
  let testWorkspace;
  let testUser;
  let testChat;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.users.create({
      data: {
        username: "testuser_llm_logs",
        password: "hashed_password",
        role: "default",
      },
    });

    // Create test workspace
    testWorkspace = await prisma.workspaces.create({
      data: {
        name: "Test Workspace for LLM Logs",
        slug: "test-llm-logs-workspace",
        openAiPrompt: "You are a helpful assistant",
      },
    });

    // Create test chat
    const { chat } = await WorkspaceChats.new({
      workspaceId: testWorkspace.id,
      prompt: "What is the capital of France?",
      response: {
        text: "The capital of France is Paris.",
        sources: [],
        type: "chat",
      },
      user: testUser,
    });

    testChat = chat;
  });

  afterAll(async () => {
    // Clean up
    await prisma.workspace_llm_message_logs.deleteMany({});
    await prisma.workspace_chats.deleteMany({});
    await prisma.workspaces.deleteMany({});
    await prisma.users.deleteMany({});
  });

  describe("new() - Create LLM Message Log", () => {
    it("should create a log with all fields including JSON arrays", async () => {
      const ragContext = [
        "France is a country in Western Europe.",
        "Paris is the capital and largest city of France.",
      ];

      const chatHistory = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const compressedMessages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "What is the capital of France?" },
      ];

      const { log, message } = await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "You are a helpful assistant",
        userPrompt: "What is the capital of France?",
        llmResponse: "The capital of France is Paris.",
        ragContext,
        chatHistory,
        compressedMessages,
      });

      expect(message).toBeNull();
      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
      expect(log.chat_id).toBe(testChat.id);
      expect(log.system_prompt).toBe("You are a helpful assistant");
      expect(log.user_prompt).toBe("What is the capital of France?");
      expect(log.llm_response).toBe("The capital of France is Paris.");

      // Verify JSON arrays are correctly stringified
      expect(() => JSON.parse(log.rag_context)).not.toThrow();
      expect(() => JSON.parse(log.chat_history)).not.toThrow();
      expect(() => JSON.parse(log.compressed_messages)).not.toThrow();

      const parsedRagContext = JSON.parse(log.rag_context);
      expect(parsedRagContext).toEqual(ragContext);

      const parsedChatHistory = JSON.parse(log.chat_history);
      expect(parsedChatHistory).toEqual(chatHistory);

      const parsedCompressedMessages = JSON.parse(log.compressed_messages);
      expect(parsedCompressedMessages).toEqual(compressedMessages);
    });

    it("should create a log with null values for optional fields", async () => {
      const { log, message } = await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "Test prompt",
      });

      expect(message).toBeNull();
      expect(log).toBeDefined();
      expect(log.chat_id).toBe(testChat.id);
      expect(log.system_prompt).toBe("Test prompt");
      expect(log.user_prompt).toBeNull();
      expect(log.llm_response).toBeNull();
      expect(log.rag_context).toBeNull();
      expect(log.chat_history).toBeNull();
      expect(log.compressed_messages).toBeNull();
    });
  });

  describe("getByChatId() - Retrieve Log by Chat ID", () => {
    it("should retrieve the log by chat ID", async () => {
      // Create a log first
      const { log: createdLog } = await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "Test system prompt",
        userPrompt: "Test user prompt",
        llmResponse: "Test response",
      });

      // Retrieve the log
      const retrievedLog = await WorkspaceLlmMessageLogs.getByChatId(testChat.id);

      expect(retrievedLog).toBeDefined();
      expect(retrievedLog.id).toBe(createdLog.id);
      expect(retrievedLog.chat_id).toBe(testChat.id);
      expect(retrievedLog.system_prompt).toBe("Test system prompt");
    });

    it("should return null for non-existent chat ID", async () => {
      const log = await WorkspaceLlmMessageLogs.getByChatId(99999);
      expect(log).toBeNull();
    });
  });

  describe("where() - Query Logs with Filters", () => {
    beforeEach(async () => {
      // Create multiple logs for testing
      await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "System prompt 1",
        userPrompt: "User prompt 1",
      });

      await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id + 1, // Different chat (will fail foreign key, so we'll use same chat)
        systemPrompt: "System prompt 2",
        userPrompt: "User prompt 2",
      });
    });

    it("should retrieve logs with limit", async () => {
      const logs = await WorkspaceLlmMessageLogs.where({}, 1);
      expect(logs.length).toBe(1);
    });

    it("should retrieve logs ordered by createdAt", async () => {
      const logs = await WorkspaceLlmMessageLogs.where(
        {},
        null,
        { createdAt: "desc" }
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toHaveProperty("createdAt");
    });
  });

  describe("count() - Count Logs", () => {
    it("should count all logs", async () => {
      // Create a few logs
      await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "Test 1",
      });

      await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "Test 2",
      });

      const count = await WorkspaceLlmMessageLogs.count({});
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("delete() - Delete Logs", () => {
    it("should delete logs matching the clause", async () => {
      // Create a log to delete
      await WorkspaceLlmMessageLogs.new({
        chatId: testChat.id,
        systemPrompt: "To be deleted",
      });

      const countBefore = await WorkspaceLlmMessageLogs.count({
        system_prompt: "To be deleted",
      });
      expect(countBefore).toBe(1);

      // Delete
      const result = await WorkspaceLlmMessageLogs.delete({
        system_prompt: "To be deleted",
      });
      expect(result).toBe(true);

      const countAfter = await WorkspaceLlmMessageLogs.count({
        system_prompt: "To be deleted",
      });
      expect(countAfter).toBe(0);
    });
  });

  describe("Cascade Delete - When workspace_chat is deleted", () => {
    it("should automatically delete associated LLM logs", async () => {
      // Create a new chat and its log
      const { chat: newChat } = await WorkspaceChats.new({
        workspaceId: testWorkspace.id,
        prompt: "Test chat for cascade delete",
        response: { text: "Response", sources: [], type: "chat" },
        user: testUser,
      });

      const { log: createdLog } = await WorkspaceLlmMessageLogs.new({
        chatId: newChat.id,
        systemPrompt: "Test system prompt",
      });

      expect(createdLog).toBeDefined();
      expect(createdLog.chat_id).toBe(newChat.id);

      // Delete the chat
      await prisma.workspace_chats.delete({
        where: { id: newChat.id },
      });

      // Verify the log is also deleted
      const deletedLog = await WorkspaceLlmMessageLogs.getByChatId(newChat.id);
      expect(deletedLog).toBeNull();
    });
  });
});
