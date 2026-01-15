const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceLlmMessageLogs } = require("../../models/workspaceLlmMessageLogs");
const { Workspace } = require("../../models/workspace");
const { User } = require("../../models/user");

// Mock all dependencies
jest.mock("../../models/workspaceLlmMessageLogs");
jest.mock("../../models/workspace");
jest.mock("../../models/user");
jest.mock("../../utils/prisma", () => {
  const mockPrisma = {
    workspace_chats: {
      findMany: jest.fn(),
    },
  };
  return mockPrisma;
});

describe("WorkspaceChats.whereWithData", () => {
  let mockWorkspace, mockUser, mockChat, mockLlmMessageLog;

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error during tests
    jest.spyOn(console, "error").mockImplementation(() => {});

    // Setup mock data
    mockWorkspace = {
      id: 1,
      name: "Test Workspace",
      slug: "test-workspace",
    };

    mockUser = {
      id: 1,
      username: "testuser",
    };

    mockChat = {
      id: 100,
      workspaceId: 1,
      prompt: "What is AI?",
      response: JSON.stringify({ text: "AI is artificial intelligence" }),
      user_id: 1,
      thread_id: null,
      api_session_id: null,
      include: true,
      feedbackScore: null,
      createdAt: new Date("2024-01-15T10:00:00Z"),
      lastUpdatedAt: new Date("2024-01-15T10:00:00Z"),
    };

    mockLlmMessageLog = {
      id: 1,
      chat_id: 100,
      system_prompt: "You are a helpful assistant",
      user_prompt: "What is AI?",
      llm_response: "AI is artificial intelligence",
      rag_context: JSON.stringify(["Context 1", "Context 2"]),
      chat_history: JSON.stringify([
        { role: "user", content: "Previous message" },
      ]),
      compressed_messages: JSON.stringify([
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "What is AI?" },
      ]),
      createdAt: new Date("2024-01-15T10:00:00Z"),
      lastUpdatedAt: new Date("2024-01-15T10:00:00Z"),
    };

    // Setup default mocks
    Workspace.get = jest.fn().mockResolvedValue(mockWorkspace);
    User.get = jest.fn().mockResolvedValue(mockUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should include llmMessageLog with compressedMessages when log exists", async () => {
    // Mock WorkspaceChats.where to return chat
    WorkspaceChats.where = jest.fn().mockResolvedValue([mockChat]);

    // Mock WorkspaceLlmMessageLogs.getByChatId to return log
    WorkspaceLlmMessageLogs.getByChatId = jest
      .fn()
      .mockResolvedValue(mockLlmMessageLog);

    const results = await WorkspaceChats.whereWithData({}, 20, 0, {
      id: "desc",
    });

    expect(results).toHaveLength(1);
    expect(results[0].llmMessageLog).toBeDefined();
    expect(results[0].llmMessageLog.compressedMessages).toBe(
      mockLlmMessageLog.compressed_messages
    );
    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledWith(
      mockChat.id
    );
  });

  it("should set llmMessageLog to null when no log exists", async () => {
    // Mock WorkspaceChats.where to return chat
    WorkspaceChats.where = jest.fn().mockResolvedValue([mockChat]);

    // Mock WorkspaceLlmMessageLogs.getByChatId to return null
    WorkspaceLlmMessageLogs.getByChatId = jest.fn().mockResolvedValue(null);

    const results = await WorkspaceChats.whereWithData({}, 20, 0, {
      id: "desc",
    });

    expect(results).toHaveLength(1);
    expect(results[0].llmMessageLog).toBeNull();
    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledWith(
      mockChat.id
    );
  });

  it("should handle multiple chats with different llm message log states", async () => {
    const mockChat2 = { ...mockChat, id: 101 };
    const mockChat3 = { ...mockChat, id: 102 };

    // Mock WorkspaceChats.where to return multiple chats
    WorkspaceChats.where = jest
      .fn()
      .mockResolvedValue([mockChat, mockChat2, mockChat3]);

    // Mock WorkspaceLlmMessageLogs.getByChatId with different responses
    WorkspaceLlmMessageLogs.getByChatId = jest
      .fn()
      .mockImplementation((chatId) => {
        if (chatId === 100) {
          return Promise.resolve(mockLlmMessageLog);
        } else if (chatId === 101) {
          return Promise.resolve(null);
        } else if (chatId === 102) {
          return Promise.resolve({
            ...mockLlmMessageLog,
            id: 3,
            chat_id: 102,
            compressed_messages: null,
          });
        }
      });

    const results = await WorkspaceChats.whereWithData({}, 20, 0, {
      id: "desc",
    });

    expect(results).toHaveLength(3);

    // First chat: has compressed_messages
    expect(results[0].llmMessageLog).toBeDefined();
    expect(results[0].llmMessageLog.compressedMessages).toBe(
      mockLlmMessageLog.compressed_messages
    );

    // Second chat: no log exists
    expect(results[1].llmMessageLog).toBeNull();

    // Third chat: log exists but compressed_messages is null
    expect(results[2].llmMessageLog).toBeDefined();
    expect(results[2].llmMessageLog.compressedMessages).toBeNull();
  });

  it("should handle errors gracefully", async () => {
    // Mock WorkspaceChats.where to return chat
    WorkspaceChats.where = jest.fn().mockResolvedValue([mockChat]);

    // Mock WorkspaceLlmMessageLogs.getByChatId to throw error
    WorkspaceLlmMessageLogs.getByChatId = jest
      .fn()
      .mockRejectedValue(new Error("Database error"));

    // Should not throw, but return empty array due to error handling
    const results = await WorkspaceChats.whereWithData({}, 20, 0, {
      id: "desc",
    });

    expect(results).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("should pass correct parameters to where method", async () => {
    const clause = { workspaceId: 1 };
    const limit = 10;
    const offset = 20;
    const orderBy = { createdAt: "desc" };

    WorkspaceChats.where = jest.fn().mockResolvedValue([]);
    WorkspaceLlmMessageLogs.getByChatId = jest.fn().mockResolvedValue(null);

    await WorkspaceChats.whereWithData(clause, limit, offset, orderBy);

    expect(WorkspaceChats.where).toHaveBeenCalledWith(
      clause,
      limit,
      orderBy,
      offset
    );
  });

  it("should call getByChatId for each chat returned by where", async () => {
    const mockChats = [
      { ...mockChat, id: 1 },
      { ...mockChat, id: 2 },
      { ...mockChat, id: 3 },
    ];

    WorkspaceChats.where = jest.fn().mockResolvedValue(mockChats);
    WorkspaceLlmMessageLogs.getByChatId = jest.fn().mockResolvedValue(null);

    await WorkspaceChats.whereWithData({}, 20, 0, { id: "desc" });

    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledTimes(3);
    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledWith(1);
    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledWith(2);
    expect(WorkspaceLlmMessageLogs.getByChatId).toHaveBeenCalledWith(3);
  });
});
