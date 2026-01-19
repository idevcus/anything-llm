const { Pinecone } = require("../../../../utils/vectorDbProviders/pinecone");

/**
 * adjacentChunks 기능 테스트
 *
 * 이 테스트는 Pinecone의 getAdjacentChunks 메서드와
 * performSimilaritySearch의 adjacentChunks 파라미터를 테스트합니다.
 */

describe("Pinecone.adjacentChunks", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getAdjacentChunks", () => {
    it("chunkIndex가 없는 경우 빈 결과를 반환해야 함", async () => {
      const mockNamespace = { query: jest.fn() };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      const result = await Pinecone.getAdjacentChunks({
        pineconeIndex: mockIndex,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: null,
        adjacentCount: 1,
        queryVectorLength: 3,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockNamespace.query).not.toHaveBeenCalled();
    });

    it("queryVectorLength가 없으면 경고 후 빈 결과를 반환해야 함", async () => {
      const mockNamespace = { query: jest.fn() };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await Pinecone.getAdjacentChunks({
        pineconeIndex: mockIndex,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
      });

      expect(warnSpy).toHaveBeenCalled();
      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockNamespace.query).not.toHaveBeenCalled();
    });

    it("adjacentCount=1일 때 범위/제외 필터를 동시에 적용해야 함", async () => {
      const mockNamespace = {
        query: jest.fn().mockResolvedValue({
          matches: [
            {
              metadata: {
                docId: "doc-123",
                chunkIndex: 0,
                text: "First chunk",
                title: "Test Doc",
              },
            },
            {
              metadata: {
                docId: "doc-123",
                chunkIndex: 2,
                text: "Third chunk",
                title: "Test Doc",
              },
            },
          ],
        }),
      };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      const result = await Pinecone.getAdjacentChunks({
        pineconeIndex: mockIndex,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
        queryVectorLength: 3,
      });

      expect(mockNamespace.query).toHaveBeenCalledTimes(1);
      const queryArgs = mockNamespace.query.mock.calls[0][0];
      expect(queryArgs.vector).toEqual([0, 0, 0]);
      expect(queryArgs.filter).toEqual({
        docId: { $eq: "doc-123" },
        chunkIndex: { $gte: 0, $lte: 2, $ne: 1 },
      });

      expect(result.contextTexts).toEqual(["First chunk", "Third chunk"]);
      expect(result.sourceDocuments).toHaveLength(2);
      expect(result.sourceDocuments[0]).toMatchObject({
        docId: "doc-123",
        chunkIndex: 0,
        isAdjacentChunk: true,
      });
    });

    it("excludeIds에 포함된 청크는 결과에서 제외해야 함", async () => {
      const mockNamespace = {
        query: jest.fn().mockResolvedValue({
          matches: [
            {
              metadata: {
                docId: "doc-123",
                chunkIndex: 0,
                text: "First chunk",
                title: "Test Doc",
              },
            },
            {
              metadata: {
                docId: "doc-123",
                chunkIndex: 2,
                text: "Third chunk",
                title: "Test Doc",
              },
            },
          ],
        }),
      };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      const result = await Pinecone.getAdjacentChunks({
        pineconeIndex: mockIndex,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
        queryVectorLength: 3,
        excludeIds: ["doc-123-0"],
      });

      expect(result.contextTexts).toEqual(["Third chunk"]);
      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.sourceDocuments[0].chunkIndex).toBe(2);
    });

    it("쿼리 실패 시 빈 결과를 반환해야 함", async () => {
      const mockNamespace = {
        query: jest.fn().mockRejectedValue(new Error("Pinecone Error")),
      };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      const result = await Pinecone.getAdjacentChunks({
        pineconeIndex: mockIndex,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
        queryVectorLength: 3,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
    });
  });

  describe("performSimilaritySearch - adjacentChunks integration", () => {
    it("adjacentChunks=0일 때 기존 검색 결과만 반환해야 함", async () => {
      const mockNamespace = { query: jest.fn() };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      Pinecone.connect = jest
        .fn()
        .mockResolvedValue({ pineconeIndex: mockIndex });
      Pinecone.namespaceExists = jest.fn().mockResolvedValue(true);

      const similarityResult = {
        contextTexts: ["Original chunk 1"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 1,
            text: "Original chunk 1",
            score: 0.9,
          },
        ],
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3]),
      };

      Pinecone.similarityResponse = jest
        .fn()
        .mockResolvedValue(similarityResult);

      const result = await Pinecone.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 0,
      });

      expect(Pinecone.similarityResponse).toHaveBeenCalledWith({
        client: mockIndex,
        namespace: "test-namespace",
        queryVector: [1, 2, 3],
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
      });
      expect(result.contextTexts).toEqual(["Original chunk 1"]);
      expect(result.sources).toHaveLength(1);
    });

    it("adjacentChunks>0일 때 이웃 청크를 포함해야 함", async () => {
      const mockNamespace = { query: jest.fn() };
      const mockIndex = { namespace: jest.fn().mockReturnValue(mockNamespace) };

      Pinecone.connect = jest
        .fn()
        .mockResolvedValue({ pineconeIndex: mockIndex });
      Pinecone.namespaceExists = jest.fn().mockResolvedValue(true);

      const similarityResult = {
        contextTexts: ["Original chunk 1"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 1,
            text: "Original chunk 1",
            score: 0.9,
          },
        ],
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3, 4]),
      };

      Pinecone.similarityResponse = jest
        .fn()
        .mockResolvedValue(similarityResult);
      const getAdjacentSpy = jest
        .spyOn(Pinecone, "getAdjacentChunks")
        .mockResolvedValue({
          contextTexts: ["Adjacent chunk"],
          sourceDocuments: [
            {
              docId: "doc-123",
              chunkIndex: 2,
              text: "Adjacent chunk",
              isAdjacentChunk: true,
            },
          ],
        });

      const result = await Pinecone.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      expect(getAdjacentSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryVectorLength: 4 })
      );
      expect(result.contextTexts).toEqual([
        "Original chunk 1",
        "Adjacent chunk",
      ]);
      expect(result.sources).toHaveLength(2);
    });
  });
});
