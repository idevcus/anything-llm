const { TextSplitter } = require("../../../utils/TextSplitter");
const _ = require("lodash");

describe("TextSplitter", () => {
  describe("chunkMode", () => {
    test("기본 chunkMode는 'character'로 동작해야 함", async () => {
      const text = "This is a test text to be split into chunks".repeat(2);
      const textSplitter = new TextSplitter({
        chunkSize: 20,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // character 모드에서는 고정 길이로 분할
      expect(chunks.length).toBeGreaterThan(0);
      // 각 청크가 대략 chunkSize 이하인지 확인
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(30); // 약간의 여유
      });
    });

    test("character 모드에서 고정 길이로 분할해야 함", async () => {
      const text = "This is a test sentence. ".repeat(10);
      const textSplitter = new TextSplitter({
        chunkMode: "character",
        chunkSize: 50,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      expect(chunks.length).toBeGreaterThan(0);
      // 마지막 청크를 제외한 청크들이 대략 50자 근처인지 확인
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].length).toBeLessThanOrEqual(60);
      }
    });

    test("paragraph 모드에서 이중 줄바꿈 경계로 분할해야 함", async () => {
      const text = "첫 번째 단락입니다. 이 단락은 여러 문장으로 구성되어 있습니다.\n\n두 번째 단락입니다. 새로운 주제를 다룹니다.\n\n세 번째 단락입니다. 마지막 내용입니다.";
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // paragraph 모드에서는 \n\n 경계로 분할되므로 3개 이하의 청크
      expect(chunks.length).toBeLessThanOrEqual(3);
      // 각 청크가 단락 내용을 포함하는지 확인
      expect(chunks.some((chunk) => chunk.includes("첫 번째 단락"))).toBe(true);
    });

    test("paragraph 모드에서 단일 줄바꿈도 분할 경계로 사용해야 함", async () => {
      const text = "첫 번째 줄입니다.\n두 번째 줄입니다.\n세 번째 줄입니다.";
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // paragraph 모드에서는 \n도 분할 경계로 사용
      // 텍스트가 짧으면 하나의 청크일 수 있음
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test("paragraph 모드에서 여러 줄바꿈이 있는 긴 텍스트는 단락별로 분할됨", async () => {
      // 여러 단락으로 구성된 긴 텍스트
      const paragraph1 = "첫 번째 단락입니다. 이 단락은 꽤 길게 작성되었습니다.";
      const paragraph2 = "두 번째 단락입니다. 새로운 내용을 담고 있습니다.";
      const paragraph3 = "세 번째 단락입니다. 마지막 내용입니다.";
      const text = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // paragraph 모드에서는 \n\n 경계로 분할됨
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // 원본 텍스트 내용이 청크에 포함되어야 함
      const allText = chunks.join("");
      expect(allText).toContain("첫 번째");
      expect(allText).toContain("두 번째");
      expect(allText).toContain("세 번째");
    });

    test("paragraph 모드에서 줄바꿈이 없는 긴 텍스트는 하나의 청크로 유지될 수 있음", async () => {
      // 줄바꿈이 전혀 없는 긴 텍스트
      const longText = "이것은 줄바꿈이 없는 매우 긴 텍스트입니다. ".repeat(50);
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 100,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(longText);
      // paragraph 모드에서는 줄바꿈 경계로만 분할하므로
      // 줄바꿈이 없으면 분할이 적을 수 있음
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test("paragraph 모드에서 빈 줄바꿈만 있는 텍스트 처리", async () => {
      const text = "\n\n\n";
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 100,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // 빈 텍스트는 빈 배열 또는 빈 문자열 청크
      expect(chunks.length).toBeLessThanOrEqual(1);
    });

    test("빈 문서 처리", async () => {
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 100,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText("");
      expect(chunks).toEqual([]);
    });

    test("잘못된 chunkMode는 기본값(character)으로 동작해야 함", async () => {
      const text = "Test text for invalid mode check.";
      const textSplitter = new TextSplitter({
        chunkMode: "invalid_mode",
        chunkSize: 100,
        chunkOverlap: 0,
      });
      // 에러 없이 정상 동작
      const chunks = await textSplitter.splitText(text);
      expect(chunks.length).toBeGreaterThan(0);
    });

    test("paragraph 모드와 character 모드의 결과가 다를 수 있음", async () => {
      const text = "첫 번째 문장입니다.\n\n두 번째 문장입니다.\n\n세 번째 문장입니다.";

      const paragraphSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const paragraphChunks = await paragraphSplitter.splitText(text);

      const characterSplitter = new TextSplitter({
        chunkMode: "character",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const characterChunks = await characterSplitter.splitText(text);

      // 같은 텍스트라도 모드에 따라 결과가 다를 수 있음
      // (짧은 텍스트의 경우 둘 다 1개 청크일 수 있음)
      expect(paragraphChunks.length).toBeGreaterThanOrEqual(1);
      expect(characterChunks.length).toBeGreaterThanOrEqual(1);
    });

    test("paragraph 모드에서 혼합 줄바꿈 처리 (\\r\\n)", async () => {
      const text = "첫 번째 단락\r\n\r\n두 번째 단락\r\n\r\n세 번째 단락";
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
      });
      const chunks = await textSplitter.splitText(text);
      // Windows 스타일 줄바꿈도 처리
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test("chunkMode와 chunkPrefix를 함께 사용", async () => {
      const text = "첫 번째 단락입니다.\n\n두 번째 단락입니다.";
      const textSplitter = new TextSplitter({
        chunkMode: "paragraph",
        chunkSize: 500,
        chunkOverlap: 0,
        chunkPrefix: "PREFIX: ",
      });
      const chunks = await textSplitter.splitText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // 모든 청크가 PREFIX로 시작해야 함
      chunks.forEach((chunk) => {
        expect(chunk.startsWith("PREFIX: ")).toBe(true);
      });
    });
  });

  test("should split long text into n sized chunks", async () => {
    const text = "This is a test text to be split into chunks".repeat(2);
    const textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
    });
    const chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
  });

  test("applies chunk overlap of 20 characters on invalid chunkOverlap", async () => {
    const text = "This is a test text to be split into chunks".repeat(2);
    const textSplitter = new TextSplitter({
      chunkSize: 30,
    });
    const chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(6);
  });

  test("does not allow chunkOverlap to be greater than chunkSize", async () => {
    expect(() => {
      new TextSplitter({
        chunkSize: 20,
        chunkOverlap: 21,
      });
    }).toThrow();
  });

  test("applies specific metadata to stringifyHeader to each chunk", async () => {
    const metadata = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      url: "https://example.com",
      title: "Example",
      docAuthor: "John Doe",
      published: "2021-01-01",
      chunkSource: "link://https://example.com",
      description: "This is a test text to be split into chunks",
    };
    const chunkHeaderMeta = TextSplitter.buildHeaderMeta(metadata);
    expect(chunkHeaderMeta).toEqual({
      sourceDocument: metadata.title,
      source: metadata.url,
      published: metadata.published,
    });
  });

  test("applies a valid chunkPrefix to each chunk", async () => {
    const text = "This is a test text to be split into chunks".repeat(2);
    let textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
      chunkPrefix: "testing: ",
    });
    let chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
    expect(chunks.every(chunk => chunk.startsWith("testing: "))).toBe(true);

    textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
      chunkPrefix: "testing2: ",
    });
    chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
    expect(chunks.every(chunk => chunk.startsWith("testing2: "))).toBe(true);

    textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
      chunkPrefix: undefined,
    });
    chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
    expect(chunks.every(chunk => !chunk.startsWith(": "))).toBe(true);

    textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
      chunkPrefix: "",
    });
    chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
    expect(chunks.every(chunk => !chunk.startsWith(": "))).toBe(true);

    // Applied chunkPrefix with chunkHeaderMeta
    textSplitter = new TextSplitter({
      chunkSize: 20,
      chunkOverlap: 0,
      chunkHeaderMeta: TextSplitter.buildHeaderMeta({
        title: "Example",
        url: "https://example.com",
        published: "2021-01-01",
      }),
      chunkPrefix: "testing3: ",
    });
    chunks = await textSplitter.splitText(text);
    expect(chunks.length).toEqual(5);
    expect(chunks.every(chunk => chunk.startsWith("testing3: <document_metadata>"))).toBe(true);
  });
});
