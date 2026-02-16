/* eslint-env jest, node */
const { streamChatWithWorkspace } = require("../../../utils/chats/stream");
const { writeResponseChunk } = require("../../../utils/helpers/chat/responses");

jest.mock("../../../utils/helpers/chat/responses");
jest.mock("../../../utils/chats/react", () => ({
  streamReactChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../utils/chats/agents", () => ({
  grepAgents: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../../utils/chats/index", () => ({
  grepCommand: jest.fn().mockImplementation((msg) => Promise.resolve(msg)),
  VALID_COMMANDS: {},
  chatPrompt: jest.fn().mockResolvedValue("system prompt"),
  recentChatHistory: jest
    .fn()
    .mockResolvedValue({ rawHistory: [], chatHistory: [] }),
  sourceIdentifier: jest.fn(),
}));

describe("streamChatWithWorkspace — react 모드 라우팅", () => {
  let mockWorkspace;
  let mockResponse;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkspace = {
      id: 1,
      slug: "test-workspace",
      chatProvider: "openai",
      chatModel: "gpt-4o-mini",
    };

    mockResponse = {
      writableEnded: false,
      write: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
  });

  it("chatMode가 react일 때 streamReactChat으로 위임하고 즉시 반환한다", async () => {
    const { streamReactChat } = require("../../../utils/chats/react");

    await streamChatWithWorkspace(
      mockResponse,
      mockWorkspace,
      "ReAct 질문",
      "react",
      { id: 1 },
      { id: 2 },
      []
    );

    expect(streamReactChat).toHaveBeenCalledTimes(1);
    expect(streamReactChat).toHaveBeenCalledWith(
      mockResponse,
      mockWorkspace,
      "ReAct 질문",
      { id: 1 },
      { id: 2 },
      []
    );
  });

  it("chatMode가 chat일 때 streamReactChat을 호출하지 않는다", async () => {
    const { streamReactChat } = require("../../../utils/chats/react");

    // chat 모드에서는 LLM/VectorDB 호출이 일어나므로 추가 mock 필요
    jest.mock("../../../utils/helpers", () => ({
      getVectorDbClass: jest.fn().mockReturnValue({
        hasNamespace: jest.fn().mockResolvedValue(false),
        namespaceCount: jest.fn().mockResolvedValue(0),
        performSimilaritySearch: jest.fn(),
      }),
      getLLMProvider: jest.fn().mockReturnValue({
        defaultTemp: 0.7,
        streamGetChatCompletion: jest.fn().mockResolvedValue(null),
        getChatCompletion: jest.fn().mockResolvedValue({ textResponse: "hi" }),
        promptWindowLimit: jest.fn().mockReturnValue(4096),
        constructor: { name: "MockLLM" },
      }),
    }));

    await streamChatWithWorkspace(
      mockResponse,
      mockWorkspace,
      "일반 채팅 질문",
      "chat"
    ).catch(() => {}); // chat 모드에서 LLM mock 부족으로 에러 발생 가능 — 핵심은 react 호출 여부

    expect(streamReactChat).not.toHaveBeenCalled();
  });

  it("chatMode가 query일 때 streamReactChat을 호출하지 않는다", async () => {
    const { streamReactChat } = require("../../../utils/chats/react");

    await streamChatWithWorkspace(
      mockResponse,
      mockWorkspace,
      "쿼리 질문",
      "query"
    ).catch(() => {});

    expect(streamReactChat).not.toHaveBeenCalled();
  });
});
