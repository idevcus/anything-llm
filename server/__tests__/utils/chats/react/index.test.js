/* eslint-env jest, node */
const { streamReactChat } = require("../../../../utils/chats/react");
const { WorkspaceChats } = require("../../../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../../../../utils/helpers");
const { writeResponseChunk } = require("../../../../utils/helpers/chat/responses");
const { chatPrompt, recentChatHistory } = require("../../../../utils/chats");
const { DocumentManager } = require("../../../../utils/DocumentManager");

jest.mock("../../../../models/workspaceChats");
jest.mock("../../../../utils/helpers");
jest.mock("../../../../utils/helpers/chat/responses");
jest.mock("../../../../utils/chats");
jest.mock("../../../../utils/DocumentManager", () => ({
  DocumentManager: jest.fn(),
}));

describe("streamReactChat", () => {
  let mockWorkspace;
  let mockResponse;
  let mockVectorDb;
  let mockLLMConnector;
  let mockPinnedDocs;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkspace = {
      id: 1,
      slug: "react-test-workspace",
      chatProvider: "openai",
      chatModel: "gpt-4o-mini",
      openAiTemp: 0.7,
      similarityThreshold: 0.25,
      topN: 4,
      vectorSearchMode: "default",
      adjacentChunks: 0,
    };

    mockResponse = {
      writableEnded: false,
      write: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    mockPinnedDocs = jest.fn().mockResolvedValue([]);
    DocumentManager.mockImplementation(() => ({
      pinnedDocs: mockPinnedDocs,
    }));

    mockVectorDb = {
      hasNamespace: jest.fn().mockResolvedValue(true),
      namespaceCount: jest.fn().mockResolvedValue(10),
      performSimilaritySearch: jest.fn().mockResolvedValue({
        contextTexts: ["ReAct is a reasoning + acting pattern for LLMs."],
        sources: [{ title: "react-notes", published: "2026-02-12" }],
        message: null,
      }),
    };
    getVectorDbClass.mockReturnValue(mockVectorDb);

    mockLLMConnector = {
      defaultTemp: 0.7,
      getChatCompletion: jest
        .fn()
        .mockResolvedValueOnce({
          textResponse:
            'Thought: 문서에서 ReAct 정의를 먼저 찾아야 한다.\nAction: search_documents\nAction Input: {"query":"ReAct pattern definition"}',
        })
        .mockResolvedValueOnce({
          textResponse:
            "Thought: 충분한 근거를 찾았다.\nFinal Answer: ReAct는 모델이 Thought-Action-Observation 루프로 검색과 추론을 반복해 답변 품질을 높이는 패턴입니다.",
        }),
    };
    getLLMProvider.mockReturnValue(mockLLMConnector);

    recentChatHistory.mockResolvedValue({ rawHistory: [], chatHistory: [] });
    chatPrompt.mockResolvedValue("You are a helpful assistant.");
    WorkspaceChats.new.mockResolvedValue({ chat: { id: 999 }, message: null });
  });

  it("persists reactTrace when the react loop performs search then finalizes", async () => {
    await streamReactChat(
      mockResponse,
      mockWorkspace,
      "ReAct가 뭐야?",
      { id: 7 },
      { id: 11 },
      []
    );

    expect(mockLLMConnector.getChatCompletion).toHaveBeenCalledTimes(2);
    expect(mockVectorDb.performSimilaritySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "react-test-workspace",
        input: "ReAct pattern definition",
      })
    );

    expect(WorkspaceChats.new).toHaveBeenCalledTimes(1);
    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.workspaceId).toBe(1);
    expect(createArg.prompt).toBe("ReAct가 뭐야?");
    expect(createArg.threadId).toBe(11);
    expect(createArg.response.type).toBe("react");
    expect(createArg.response.text).toContain("ReAct는 모델이");
    expect(Array.isArray(createArg.response.reactTrace)).toBe(true);
    expect(createArg.response.reactTrace).toHaveLength(3);
    expect(createArg.response.reactTrace[0].parsed.action).toBe(
      "search_documents"
    );
    expect(createArg.response.reactTrace[1].searchQuery).toBe(
      "ReAct pattern definition"
    );
    expect(createArg.response.reactTrace[2].parsed.type).toBe("final_answer");
  });

  it("emits stream chunks while processing react mode", async () => {
    await streamReactChat(mockResponse, mockWorkspace, "테스트 질문");

    const chunkTypes = writeResponseChunk.mock.calls.map(
      ([, payload]) => payload.type
    );
    expect(chunkTypes).toContain("statusResponse");
    expect(chunkTypes).toContain("textResponseChunk");
    expect(chunkTypes).toContain("finalizeResponseStream");
  });

  it("검색 결과가 없어도 pinned docs가 있으면 컨텍스트와 소스로 사용한다", async () => {
    mockPinnedDocs.mockResolvedValue([
      {
        id: "pin-1",
        title: "Pinned Guide",
        published: "2026-02-16",
        pageContent: "이 문서는 고정 문서 컨텍스트입니다.",
      },
    ]);
    mockVectorDb.performSimilaritySearch.mockResolvedValue({
      contextTexts: [],
      sources: [],
      message: null,
    });
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 관련 문서를 찾자.\nAction: search_documents\nAction Input: {"query":"pinned-only query"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          "Thought: 고정 문서로 답한다.\nFinal Answer: pinned 문서 기반 답변입니다.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "pinned 테스트");

    const statusMessages = writeResponseChunk.mock.calls
      .filter(([, payload]) => payload.type === "statusResponse")
      .map(([, payload]) => payload.textResponse);
    expect(statusMessages.some((msg) => msg.includes("1 document(s) found"))).toBe(
      true
    );

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("pinned 문서 기반 답변");
    expect(createArg.response.sources.length).toBeGreaterThan(0);
  });

  it("pinned docs가 있고 검색 결과도 있으면 양쪽 모두 소스로 포함하고 카운트에 합산한다", async () => {
    mockPinnedDocs.mockResolvedValue([
      {
        id: "pin-1",
        title: "Pinned Guide",
        published: "2026-02-16",
        pageContent: "핀된 문서의 전체 내용입니다.",
      },
    ]);
    mockVectorDb.performSimilaritySearch.mockResolvedValue({
      contextTexts: ["검색 결과 청크의 전체 텍스트"],
      sources: [
        {
          id: "s1",
          title: "Search Result",
          published: "2026-02-16",
          text: "검색 결과 청크의 전체 텍스트",
          score: 0.9,
        },
      ],
      message: null,
    });
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 검색하자.\nAction: search_documents\nAction Input: {"query":"pinned and search query"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          "Thought: 충분한 정보.\nFinal Answer: pinned와 검색 결과 모두 기반한 답변.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "pinned + 검색 테스트");

    const statusMessages = writeResponseChunk.mock.calls
      .filter(([, payload]) => payload.type === "statusResponse")
      .map(([, payload]) => payload.textResponse);
    // 1 pinned + 1 search result = 2
    expect(
      statusMessages.some((msg) => msg.includes("2 document(s) found"))
    ).toBe(true);

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("pinned와 검색 결과 모두 기반한 답변");
    // allSources = pinnedSources (초기화) + filledSources.sources (검색 결과)
    expect(createArg.response.sources.length).toBeGreaterThanOrEqual(2);
  });

  it("여러 반복에서 rawHistory가 변이되지 않아 backfill이 일관되게 동작한다", async () => {
    // rawHistory를 직접 참조로 전달해 변이 여부를 확인
    const rawHistoryData = [
      {
        response: JSON.stringify({
          sources: [
            { id: "h1", title: "Old Doc", text: "오래된 소스", score: 0.6 },
          ],
        }),
      },
      {
        response: JSON.stringify({
          sources: [
            { id: "h2", title: "New Doc", text: "최신 소스", score: 0.9 },
          ],
        }),
      },
    ];
    recentChatHistory.mockResolvedValue({
      rawHistory: rawHistoryData,
      chatHistory: [],
    });

    // topN=1: fillSourceWindow가 history에서 최대 1개 backfill
    mockWorkspace = { ...mockWorkspace, topN: 1 };
    mockVectorDb.performSimilaritySearch.mockResolvedValue({
      contextTexts: [],
      sources: [],
      message: null,
    });
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 첫 번째 검색.\nAction: search_documents\nAction Input: {"query":"first search"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 두 번째 검색.\nAction: search_documents\nAction Input: {"query":"second search"}',
      })
      .mockResolvedValueOnce({
        textResponse: "Thought: 충분.\nFinal Answer: 두 번의 검색 후 답변.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "mutation 방지 테스트");

    // rawHistoryData 원본 배열이 변이되지 않아야 함 (oldest가 여전히 index 0)
    expect(rawHistoryData[0].response).toContain("h1");
    expect(rawHistoryData[1].response).toContain("h2");

    // 두 반복 모두 history backfill로 1개씩 찾아야 함 (pinned 없음 → count = 0 + 1 = 1)
    const statusMessages = writeResponseChunk.mock.calls
      .filter(([, payload]) => payload.type === "statusResponse")
      .map(([, payload]) => payload.textResponse);
    const foundMessages = statusMessages.filter((msg) =>
      msg.includes("document(s) found")
    );
    expect(foundMessages).toHaveLength(2);
    expect(
      foundMessages.every((msg) => msg.includes("1 document(s) found"))
    ).toBe(true);
  });

  it("알 수 없는 action을 받으면 루프를 계속하고 최종 답변으로 마무리한다", async () => {
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 알 수 없는 툴을 사용해보자.\nAction: some_unknown_tool\nAction Input: {"query":"test"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          "Thought: 올바른 툴을 사용해야 한다.\nFinal Answer: 복구된 최종 답변입니다.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "질문");

    // 알 수 없는 action에서는 벡터 검색을 수행하지 않아야 한다
    expect(mockVectorDb.performSimilaritySearch).not.toHaveBeenCalled();

    expect(WorkspaceChats.new).toHaveBeenCalledTimes(1);
    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("복구된 최종 답변입니다.");

    // reactTrace 구조: [unknown action parsed, unknown observation, final_answer parsed]
    expect(createArg.response.reactTrace).toHaveLength(3);
    expect(createArg.response.reactTrace[0].parsed.action).toBe(
      "some_unknown_tool"
    );
    expect(createArg.response.reactTrace[1].observation).toContain(
      "Unknown action"
    );
    expect(createArg.response.reactTrace[2].parsed.type).toBe("final_answer");
  });

  it("벡터화된 문서가 없을 경우 검색 없이 최종 답변을 반환한다", async () => {
    mockVectorDb.hasNamespace.mockResolvedValue(false);

    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 검색이 필요하다.\nAction: search_documents\nAction Input: {"query":"no docs query"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          "Thought: 문서가 없다.\nFinal Answer: 문서 없이 작성한 답변입니다.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "문서 없는 질문");

    // 벡터 공간이 없으므로 similarity search를 호출하지 않아야 한다
    expect(mockVectorDb.performSimilaritySearch).not.toHaveBeenCalled();

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("문서 없이 작성한 답변입니다.");

    // reactTrace: [action parsed, search observation (no docs), final_answer parsed]
    expect(createArg.response.reactTrace).toHaveLength(3);
    expect(createArg.response.reactTrace[1].searchQuery).toBe("no docs query");
  });

  it("getChatCompletion에서 예외 발생 시 sanitized abort 청크를 전송한다", async () => {
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockRejectedValue(new Error("LLM 서비스 오류"));

    await streamReactChat(mockResponse, mockWorkspace, "에러 케이스 질문");

    // DB 저장은 수행되지 않아야 한다
    expect(WorkspaceChats.new).not.toHaveBeenCalled();

    const abortCall = writeResponseChunk.mock.calls.find(
      ([, payload]) => payload.type === "abort"
    );
    expect(abortCall).toBeDefined();
    // 내부 오류 메시지가 사용자에게 노출되지 않아야 한다
    expect(abortCall[1].error).not.toContain("LLM 서비스 오류");
    expect(abortCall[1].error).toContain("error occurred");
    expect(abortCall[1].close).toBe(true);
  });

  it("DB 저장 실패 시 클라이언트에는 abort 청크를 보내지 않는다", async () => {
    WorkspaceChats.new.mockReset().mockRejectedValue(new Error("db error"));

    await streamReactChat(mockResponse, mockWorkspace, "DB 실패 테스트");

    // textResponseChunk는 전송되어야 한다 (응답은 이미 스트리밍됨)
    const textChunk = writeResponseChunk.mock.calls.find(
      ([, payload]) => payload.type === "textResponseChunk"
    );
    expect(textChunk).toBeDefined();

    // DB 실패 이후 abort 청크를 보내면 안 된다
    const abortCall = writeResponseChunk.mock.calls.find(
      ([, payload]) => payload.type === "abort"
    );
    expect(abortCall).toBeUndefined();
  });

  it("embeddingsCount가 0이면 검색 없이 처리한다", async () => {
    mockVectorDb.namespaceCount.mockResolvedValue(0);

    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 검색 필요.\nAction: search_documents\nAction Input: {"query":"empty count query"}',
      })
      .mockResolvedValueOnce({
        textResponse: "Thought: 임베딩 없음.\nFinal Answer: 임베딩 없이 답변.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "임베딩 없는 질문");

    expect(mockVectorDb.performSimilaritySearch).not.toHaveBeenCalled();

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("임베딩 없이 답변.");
  });

  it("벡터 검색이 오류 메시지를 반환하면 루프를 계속하고 최종 답변을 반환한다", async () => {
    mockVectorDb.performSimilaritySearch.mockResolvedValue({
      contextTexts: [],
      sources: [],
      message: "VectorDB connection timeout",
    });

    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 검색 필요.\nAction: search_documents\nAction Input: {"query":"error query"}',
      })
      .mockResolvedValueOnce({
        textResponse: "Thought: 검색 실패.\nFinal Answer: 검색 없이 답변.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "검색 오류 테스트");

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("검색 없이 답변.");
    // 검색 오류 시 소스 없음
    expect(createArg.response.sources).toHaveLength(0);
  });

  it("벡터 검색 결과가 빈 contextTexts를 반환하면 적절히 처리한다", async () => {
    mockVectorDb.performSimilaritySearch.mockResolvedValue({
      contextTexts: [],
      sources: [],
      message: null,
    });

    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce({
        textResponse:
          'Thought: 검색 필요.\nAction: search_documents\nAction Input: {"query":"no results query"}',
      })
      .mockResolvedValueOnce({
        textResponse:
          "Thought: 관련 문서 없음.\nFinal Answer: 관련 문서가 없어 일반 지식으로 답변.",
      });

    await streamReactChat(mockResponse, mockWorkspace, "빈 결과 테스트");

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("일반 지식으로 답변");
    expect(createArg.response.sources).toHaveLength(0);
  });

  it("MAX_ITERATIONS 초과 시 요약 LLM 호출 후 최종 답변을 저장한다", async () => {
    const actionResponse = {
      textResponse:
        'Thought: 더 검색이 필요하다.\nAction: search_documents\nAction Input: {"query":"max iter query"}',
    };
    const summaryResponse = {
      textResponse:
        "Thought: 충분히 검색했다.\nFinal Answer: 반복 한계 후 요약된 답변입니다.",
    };

    // MAX_ITERATIONS(5)번 action 응답 후 요약 응답 1번
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValueOnce(actionResponse)
      .mockResolvedValueOnce(actionResponse)
      .mockResolvedValueOnce(actionResponse)
      .mockResolvedValueOnce(actionResponse)
      .mockResolvedValueOnce(actionResponse)
      .mockResolvedValueOnce(summaryResponse);

    await streamReactChat(mockResponse, mockWorkspace, "반복 한계 테스트");

    // loop(5) + 요약 호출(1) = 총 6번
    expect(mockLLMConnector.getChatCompletion).toHaveBeenCalledTimes(6);

    // 반복마다 벡터 검색 수행
    expect(mockVectorDb.performSimilaritySearch).toHaveBeenCalledTimes(5);

    const createArg = WorkspaceChats.new.mock.calls[0][0];
    expect(createArg.response.text).toContain("반복 한계 후 요약된 답변입니다.");

    // 각 iteration마다 2개의 trace 엔트리(parsed action + search result) = 10개
    expect(createArg.response.reactTrace).toHaveLength(10);

    // statusResponse 중 "Reached maximum" 메시지가 전송되어야 한다
    const statusMessages = writeResponseChunk.mock.calls
      .filter(([, payload]) => payload.type === "statusResponse")
      .map(([, payload]) => payload.textResponse);
    expect(statusMessages.some((msg) => msg.includes("maximum"))).toBe(true);
  });

  it("LLM이 빈 응답을 반환하면 abort 청크를 전송한다", async () => {
    mockLLMConnector.getChatCompletion
      .mockReset()
      .mockResolvedValue({ textResponse: null });

    await streamReactChat(mockResponse, mockWorkspace, "빈 응답 테스트");

    expect(WorkspaceChats.new).not.toHaveBeenCalled();

    const abortCall = writeResponseChunk.mock.calls.find(
      ([, payload]) => payload.type === "abort"
    );
    expect(abortCall).toBeDefined();
  });
});
