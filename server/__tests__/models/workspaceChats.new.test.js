const { WorkspaceChats } = require("../../models/workspaceChats");
const prisma = require("../../utils/prisma");

jest.mock("../../utils/prisma", () => {
  const mockPrisma = {
    workspace_chats: {
      create: jest.fn(),
    },
  };
  return mockPrisma;
});

describe("WorkspaceChats.new", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stores reactTrace inside response JSON when saving a react chat", async () => {
    const responsePayload = {
      text: "Final answer from ReAct mode",
      type: "react",
      sources: [{ title: "Doc A", published: "2026-02-12" }],
      reactTrace: [
        {
          iteration: 1,
          llmOutput:
            'Thought: I should search\nAction: search_documents\nAction Input: {"query":"react"}',
          parsed: {
            type: "action",
            thought: "I should search",
            action: "search_documents",
            actionInput: "react",
          },
        },
        {
          iteration: 1,
          searchQuery: "react",
          observationLength: 128,
        },
      ],
    };

    prisma.workspace_chats.create.mockResolvedValue({
      id: 100,
      workspaceId: 1,
      prompt: "ReAct trace test",
      response: JSON.stringify(responsePayload),
    });

    const { chat, message } = await WorkspaceChats.new({
      workspaceId: 1,
      prompt: "ReAct trace test",
      response: responsePayload,
      user: { id: 55 },
      threadId: 7,
    });

    expect(message).toBeNull();
    expect(chat.id).toBe(100);
    expect(prisma.workspace_chats.create).toHaveBeenCalledTimes(1);

    const createArg = prisma.workspace_chats.create.mock.calls[0][0];
    expect(createArg.data.workspaceId).toBe(1);
    expect(createArg.data.prompt).toBe("ReAct trace test");
    expect(createArg.data.user_id).toBe(55);
    expect(createArg.data.thread_id).toBe(7);

    expect(typeof createArg.data.response).toBe("string");
    const savedResponse = JSON.parse(createArg.data.response);
    expect(savedResponse.type).toBe("react");
    expect(Array.isArray(savedResponse.reactTrace)).toBe(true);
    expect(savedResponse.reactTrace).toHaveLength(2);
    expect(savedResponse.reactTrace[0].parsed.action).toBe("search_documents");
    expect(savedResponse.reactTrace[1].searchQuery).toBe("react");
  });

  it("returns chat:null and error message when create fails", async () => {
    prisma.workspace_chats.create.mockRejectedValue(
      new Error("db unavailable")
    );

    const { chat, message } = await WorkspaceChats.new({
      workspaceId: 1,
      prompt: "failure case",
      response: { text: "x", type: "react", reactTrace: [] },
    });

    expect(chat).toBeNull();
    expect(message).toBe("db unavailable");
    expect(console.error).toHaveBeenCalledWith("db unavailable");
  });
});
