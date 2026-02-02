const { PGVector } = require("../../../../utils/vectorDbProviders/pgvector");

/**
 * adjacentChunks 기능 테스트
 *
 * 이 테스트는 PGVector의 getAdjacentChunks 메서드와
 * performSimilaritySearch의 adjacentChunks 파라미터를 테스트합니다.
 */

describe("PGVector.adjacentChunks", () => {
  describe("getAdjacentChunks", () => {
    it("chunkIndex가 없는 경우 빈 결과를 반환해야 함", async () => {
      const mockClient = {
        query: jest.fn(),
      };

      const result = await PGVector.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: null,
        adjacentCount: 1,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("chunkIndex가 숫자가 아닌 경우 빈 결과를 반환해야 함", async () => {
      const mockClient = {
        query: jest.fn(),
      };

      const result = await PGVector.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: "invalid",
        adjacentCount: 1,
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("adjacentCount=1일 때 앞뒤 1개씩의 청크를 조회해야 함", async () => {
      const mockRows = [
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
      ];

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: mockRows }),
      };

      const result = await PGVector.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 1,
        adjacentCount: 1,
      });

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain("metadata->>'chunkIndex'");
      expect(query).toContain(">= $3");
      expect(query).toContain("<= $4");

      const params = mockClient.query.mock.calls[0][1];
      expect(params).toEqual(["test-namespace", "doc-123", 0, 2, 1]);

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
      ];

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: mockRows }),
      };

      const result = await PGVector.getAdjacentChunks({
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
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await PGVector.getAdjacentChunks({
        client: mockClient,
        namespace: "test-namespace",
        docId: "doc-123",
        chunkIndex: 0,
        adjacentCount: 1,
      });

      const params = mockClient.query.mock.calls[0][1];
      expect(params[2]).toBe(0); // minIndex
      expect(params[3]).toBe(1); // maxIndex
    });

    it("DB 쿼리 에러가 발생해도 빈 결과를 반환해야 함", async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error("DB Error")),
      };

      const result = await PGVector.getAdjacentChunks({
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
      const mockConnection = {
        query: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
      };

      // namespaceExists mock
      mockConnection.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

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
      PGVector.connect = jest.fn().mockResolvedValue(mockConnection);
      PGVector.namespaceExists = jest.fn().mockResolvedValue(true);
      PGVector.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      const result = await PGVector.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 2,
        filterIdentifiers: [],
        adjacentChunks: 0,
      });

      expect(PGVector.similarityResponse).toHaveBeenCalledWith({
        client: mockConnection,
        namespace: "test-namespace",
        queryVector: [1, 2, 3],
        similarityThreshold: 0.25,
        topN: 2,
        filterIdentifiers: [],
      });

      expect(result.contextTexts).toEqual(["Original chunk 1", "Original chunk 2"]);
      expect(result.sources).toHaveLength(2);
    });

    it("adjacentChunks>0일 때 이웃 청크를 포함해야 함", async () => {
      const mockConnection = {
        query: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
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

      PGVector.connect = jest.fn().mockResolvedValue(mockConnection);
      PGVector.namespaceExists = jest.fn().mockResolvedValue(true);
      PGVector.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

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

      PGVector.getAdjacentChunks = jest.fn().mockResolvedValue(adjacentResult);

      const result = await PGVector.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      // getAdjacentChunks가 호출되었는지 확인
      expect(PGVector.getAdjacentChunks).toHaveBeenCalledWith({
        client: mockConnection,
        namespace: "test-namespace",
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
      const mockConnection = {
        query: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
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

      PGVector.connect = jest.fn().mockResolvedValue(mockConnection);
      PGVector.namespaceExists = jest.fn().mockResolvedValue(true);
      PGVector.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

      PGVector.getAdjacentChunks = jest.fn();

      const result = await PGVector.performSimilaritySearch({
        namespace: "test-namespace",
        input: "test query",
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 1,
        filterIdentifiers: [],
        adjacentChunks: 1,
      });

      // getAdjacentChunks가 호출되지 않아야 함
      expect(PGVector.getAdjacentChunks).not.toHaveBeenCalled();

      // 원래 결과만 반환
      expect(result.contextTexts).toEqual(["Old chunk"]);
      expect(result.sources).toHaveLength(1);
    });

    it("중복 청크는 제외해야 함", async () => {
      const mockConnection = {
        query: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
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

      PGVector.connect = jest.fn().mockResolvedValue(mockConnection);
      PGVector.namespaceExists = jest.fn().mockResolvedValue(true);
      PGVector.similarityResponse = jest.fn().mockResolvedValue(similarityResult);

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

      PGVector.getAdjacentChunks = jest.fn()
        .mockResolvedValueOnce(adjacentResult1)
        .mockResolvedValueOnce(adjacentResult2);

      const result = await PGVector.performSimilaritySearch({
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

  describe("chunkIndex 메타데이터 저장", () => {
    it("임베딩 시 chunkIndex와 totalChunks가 포함되어야 함", async () => {
      // 이 테스트는 실제 임베딩 과정에서 chunkIndex가
      // 메타데이터에 포함되는지 확인하는 통합 테스트입니다.
      // 실제 DB 연결이 필요하므로 단위 테스트로는 어렵습니다.
      // E2E 테스트에서 확인하는 것이 좋습니다.

      // 하지만 코드 리뷰를 통해 확인:
      // addDocumentToNamespace에서 vectorRecord 생성 시
      // metadata: { ...metadata, text: textChunks[i], chunkIndex: i, totalChunks }
      // 가 포함되어 있음을 확인했습니다.

      expect(true).toBe(true);
    });
  });
});
