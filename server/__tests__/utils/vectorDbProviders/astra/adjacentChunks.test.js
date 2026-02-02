const { AstraDB } = require("../../../../utils/vectorDbProviders/astra");

/**
 * adjacentChunks 기능 테스트
 *
 * 이 테스트는 AstraDB의 getAdjacentChunks 메서드와
 * performSimilaritySearch의 adjacentChunks 파라미터를 테스트합니다.
 */

describe("AstraDB.adjacentChunks", () => {
  const { AstraDB } = require("../../../../utils/vectorDbProviders/astra");
  describe("getAdjacentChunks", () => {
    it("chunkIndex가 없는 경우 빈 결과를 반환해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: null,
        adjacentCount: 1,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockClient.collection).not.toHaveBeenCalled();
    });

    it("chunkIndex가 숫자가 아닌 경우 빈 결과를 반환해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: "invalid",
        adjacentCount: 1,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockClient.collection).not.toHaveBeenCalled();
    });

    it("adjacentCount=1일 때 앞뒤 1개씩의 청크를 조회해야 함", async () => {
      const mockRows = [
        {
          docId: "doc-123",
          chunkIndex: 0,
          text: "First chunk",
          title: "Test Doc",
        },
        {
          docId: "doc-123",
          chunkIndex: 2,
          text: "Third chunk",
          title: "Test Doc",
        },
      ];

      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockRows),
        }),
      };

      const mockClient = {
        collection: jest.fn().mockResolvedValue(mockCollection),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
      });

      expect(mockClient.collection).toHaveBeenCalledTimes(1);
      expect(mockCollection.find).toHaveBeenCalledTimes(1);

      const filter = mockCollection.find.mock.calls[0][0];
      expect(filter.docId).toBe("doc-123");
      expect(filter.chunkIndex).toEqual({
        $gte: 0,
        $lte: 2,
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
      const mockRows = [
        {
          docId: "doc-123",
          chunkIndex: 0,
          text: "First chunk",
        },
        {
          docId: "doc-123",
          chunkIndex: 2,
          text: "Third chunk",
        },
      ];

      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockRows),
        }),
      };

      const mockClient = {
        collection: jest.fn().mockResolvedValue(mockCollection),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
        excludeIds: ["doc-123-0"],
      });

      expect(result.contextTexts).toEqual(["Third chunk"]);
      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.sourceDocuments[0].chunkIndex).toBe(2);
    });

    it("chunkIndex=0일 때 음수 인덱스는 조회하지 않아야 함", async () => {
      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      };

      const mockClient = {
        collection: jest.fn().mockResolvedValue(mockCollection),
      };

      await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 0,
        adjacentCount: 1,
      });

      const filter = mockCollection.find.mock.calls[0][0];
      expect(filter.chunkIndex).toEqual({
        $gte: 0,
        $lte: 1,
      });
    });

    it("현재 청크 자체는 제외해야 함", async () => {
      const mockRows = [
        {
          docId: "doc-123",
          chunkIndex: 1,
          text: "Current chunk",
        },
        {
          docId: "doc-123",
          chunkIndex: 2,
          text: "Next chunk",
        },
      ];

      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockRows),
        }),
      };

      const mockClient = {
        collection: jest.fn().mockResolvedValue(mockCollection),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
      });

      // 현재 청크(chunkIndex 1)는 제외되어야 함
      expect(result.contextTexts).toEqual(["Next chunk"]);
      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.sourceDocuments[0].chunkIndex).toBe(2);
    });

    it("DB 쿼리 에러가 발생해도 빈 결과를 반환해야 함", async () => {
      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(new Error("DB Error")),
        }),
      };

      const mockClient = {
        collection: jest.fn().mockResolvedValue(mockCollection),
      };

      const result = await AstraDB.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
    });
  });

  describe("performSimilaritySearch - adjacentChunks integration", () => {
    it("adjacentChunks=0일 때 기존 검색 결과만 반환해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      // namespaceExists mock
      AstraDB.namespaceExists = jest.fn().mockResolvedValue(true);

      // similarityResponse mock
      const similarityResult = {
        contextTexts: ["Original chunk 1", "Original chunk 2"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 1,
            text: "Original chunk 1",
            score: 0.9,
          },
          {
            docId: "doc-123",
            chunkIndex: 2,
            text: "Original chunk 2",
            score: 0.8,
          },
        ],
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3]),
      };

      // connect 메서드 mock
      AstraDB.connect = jest.fn().mockResolvedValue({ client: mockClient });
      AstraDB.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      const result = await AstraDB.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 2,
        filterIdentifiers: [],
        adjacentChunks: 0,
      });

      expect(AstraDB.similarityResponse).toHaveBeenCalledWith({
        client: mockClient,
        namespace: "ns_test_namespace",
        queryVector: [1, 2, 3],
        similarityThreshold: 0.25,
        topN: 2,
        filterIdentifiers: [],
      });

      expect(result.contextTexts).toEqual(["Original chunk 1", "Original chunk 2"]);
      expect(result.sources).toHaveLength(2);
    });

    it("adjacentChunks>0일 때 이웃 청크를 포함해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3]),
      };

      // similarityResponse mock
      const similarityResult = {
        contextTexts: ["Original chunk"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 2,
            text: "Original chunk",
            score: 0.9,
          },
        ],
      };

      AstraDB.connect = jest.fn().mockResolvedValue({ client: mockClient });
      AstraDB.namespaceExists = jest.fn().mockResolvedValue(true);
      AstraDB.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      // getAdjacentChunks mock
      const adjacentResult = {
        contextTexts: ["Adjacent chunk 1", "Adjacent chunk 2"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 1,
            text: "Adjacent chunk 1",
            isAdjacentChunk: true,
          },
          {
            docId: "doc-123",
            chunkIndex: 3,
            text: "Adjacent chunk 2",
            isAdjacentChunk: true,
          },
        ],
      };

      AstraDB.getAdjacentChunks = jest.fn().mockResolvedValue(adjacentResult);

      const result = await AstraDB.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      // getAdjacentChunks가 호출되었는지 확인
      expect(AstraDB.getAdjacentChunks).toHaveBeenCalledWith({
        client: mockClient,
        namespace: "ns_test_namespace",
        docId: "doc-123",
        chunkIndex: 2,
        adjacentCount: 1,
        excludeIds: ["doc-123-2"],
      });

      // 결과에 이웃 청크가 포함되는지 확인
      expect(result.contextTexts).toEqual([
        "Original chunk",
        "Adjacent chunk 1",
        "Adjacent chunk 2",
      ]);
      expect(result.sources).toHaveLength(3);
    });

    it("chunkIndex가 없는 청크는 이웃 청크 조회를 스킵해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3]),
      };

      // chunkIndex가 없는 기존 임베딩
      const similarityResult = {
        contextTexts: ["Old chunk"],
        sourceDocuments: [
          {
            docId: "old-doc-123",
            text: "Old chunk", // chunkIndex 없음
            score: 0.9,
          },
        ],
      };

      AstraDB.connect = jest.fn().mockResolvedValue({ client: mockClient });
      AstraDB.namespaceExists = jest.fn().mockResolvedValue(true);
      AstraDB.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      AstraDB.getAdjacentChunks = jest.fn();

      const result = await AstraDB.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      // getAdjacentChunks가 호출되지 않아야 함
      expect(AstraDB.getAdjacentChunks).not.toHaveBeenCalled();

      // 원래 결과만 반환
      expect(result.contextTexts).toEqual(["Old chunk"]);
      expect(result.sources).toHaveLength(1);
    });

    it("중복 청크는 제외해야 함", async () => {
      const mockClient = {
        collection: jest.fn(),
      };

      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue([1, 2, 3]),
      };

      // 검색 결과에 같은 문서의 청크가 2개 포함된 경우
      const similarityResult = {
        contextTexts: ["Chunk 1", "Chunk 3"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 1,
            text: "Chunk 1",
            score: 0.95,
          },
          {
            docId: "doc-123",
            chunkIndex: 3,
            text: "Chunk 3",
            score: 0.85,
          },
        ],
      };

      AstraDB.connect = jest.fn().mockResolvedValue({ client: mockClient });
      AstraDB.namespaceExists = jest.fn().mockResolvedValue(true);
      AstraDB.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      // 청크 1의 이웃: 청크 0, 2
      const adjacentResult1 = {
        contextTexts: ["Chunk 0", "Chunk 2"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 0,
            isAdjacentChunk: true,
          },
          {
            docId: "doc-123",
            chunkIndex: 2,
            isAdjacentChunk: true,
          },
        ],
      };

      // 청크 3의 이웃: 청크 2 (하지만 청크 1의 이웃에서 이미 추가됨)
      const adjacentResult2 = {
        contextTexts: ["Chunk 2", "Chunk 4"],
        sourceDocuments: [
          {
            docId: "doc-123",
            chunkIndex: 2,
            isAdjacentChunk: true,
          },
          {
            docId: "doc-123",
            chunkIndex: 4,
            isAdjacentChunk: true,
          },
        ],
      };

      AstraDB.getAdjacentChunks = jest.fn()
        .mockResolvedValueOnce(adjacentResult1)
        .mockResolvedValueOnce(adjacentResult2);

      const result = await AstraDB.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 2,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      // 중복 청크(Chunk 2)가 한 번만 포함되어야 함
      expect(result.sources).toHaveLength(5); // 원본 2개 + 이웃 3개 (0, 2, 4)
      const chunk2Count = result.sources.filter(s => s.chunkIndex === 2).length;
      expect(chunk2Count).toBe(1);
    });
  });
});
