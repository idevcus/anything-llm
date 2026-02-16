/* eslint-env jest, node */
const { parseReactOutput } = require("../../../../utils/chats/react/outputParser");

describe("parseReactOutput", () => {
  // ── action parsing ──────────────────────────────────────────────────────────
  describe("action type", () => {
    it("JSON query를 포함한 표준 action 포맷을 파싱한다", () => {
      const text = [
        'Thought: 먼저 문서를 검색해야 한다.',
        'Action: search_documents',
        'Action Input: {"query":"ReAct pattern"}',
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      expect(result.thought).toBe("먼저 문서를 검색해야 한다.");
      expect(result.action).toBe("search_documents");
      expect(result.actionInput).toBe("ReAct pattern");
    });

    it("Action Input이 JSON이 아닐 경우 원문 그대로 actionInput으로 반환한다", () => {
      const text = [
        "Thought: 검색 필요.",
        "Action: search_documents",
        "Action Input: plain query text",
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      expect(result.actionInput).toBe("plain query text");
    });

    it("JSON에 query 키가 없을 경우 원문 Action Input을 그대로 사용한다", () => {
      const text = [
        "Thought: 검색.",
        "Action: search_documents",
        'Action Input: {"term":"react"}',
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      // JSON은 파싱되지만 query 키가 없으므로 원문 JSON 문자열을 사용
      expect(result.actionInput).toBe('{"term":"react"}');
    });

    it("키워드 대소문자에 관계없이 action을 파싱한다", () => {
      const text = [
        "thought: 검색.",
        "action: search_documents",
        'action input: {"query":"test query"}',
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      expect(result.actionInput).toBe("test query");
    });

    it("Thought가 없어도 action을 파싱한다", () => {
      const text = [
        "Action: search_documents",
        'Action Input: {"query":"no thought query"}',
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      expect(result.thought).toBe("");
      expect(result.actionInput).toBe("no thought query");
    });

    it("알 수 없는 action 이름도 파싱하여 반환한다", () => {
      const text = [
        "Thought: 뭔가.",
        "Action: unknown_tool",
        'Action Input: {"query":"test"}',
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("action");
      expect(result.action).toBe("unknown_tool");
    });
  });

  // ── final_answer parsing ────────────────────────────────────────────────────
  describe("final_answer type", () => {
    it("Thought와 Final Answer를 모두 파싱한다", () => {
      const text = [
        "Thought: 충분한 정보를 수집했다.",
        "Final Answer: ReAct는 추론+행동 패턴이다.",
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.thought).toBe("충분한 정보를 수집했다.");
      expect(result.answer).toBe("ReAct는 추론+행동 패턴이다.");
    });

    it("여러 줄에 걸친 Final Answer를 파싱한다", () => {
      const text = [
        "Thought: 완료.",
        "Final Answer: 첫 번째 줄.",
        "두 번째 줄.",
        "세 번째 줄.",
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.answer).toContain("첫 번째 줄.");
      expect(result.answer).toContain("두 번째 줄.");
      expect(result.answer).toContain("세 번째 줄.");
    });

    it("Thought 없이도 Final Answer를 파싱한다", () => {
      const text = "Final Answer: 바로 답변입니다.";

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.thought).toBe("");
      expect(result.answer).toBe("바로 답변입니다.");
    });

    it("Final Answer가 Action보다 우선적으로 인식된다", () => {
      // 두 패턴이 모두 존재할 때 Final Answer가 우선
      const text = [
        "Thought: 생각.",
        "Action: search_documents",
        'Action Input: {"query":"x"}',
        "Final Answer: 최종 답변.",
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.answer).toBe("최종 답변.");
    });

    it("Final Answer 키워드 대소문자를 구분하지 않는다", () => {
      const text = "final answer: 소문자 키워드 테스트.";

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.answer).toBe("소문자 키워드 테스트.");
    });
  });

  // ── incomplete parsing ──────────────────────────────────────────────────────
  describe("incomplete type", () => {
    it("패턴과 매칭되지 않는 텍스트는 incomplete로 반환한다", () => {
      const result = parseReactOutput("단순한 일반 텍스트입니다.");

      expect(result.type).toBe("incomplete");
      expect(result.text).toBe("단순한 일반 텍스트입니다.");
    });

    it("null 입력은 incomplete로 반환하고 text는 빈 문자열이다", () => {
      const result = parseReactOutput(null);

      expect(result.type).toBe("incomplete");
      expect(result.text).toBe("");
    });

    it("빈 문자열은 incomplete로 반환한다", () => {
      const result = parseReactOutput("");

      expect(result.type).toBe("incomplete");
    });

    it("undefined 입력은 incomplete로 반환한다", () => {
      const result = parseReactOutput(undefined);

      expect(result.type).toBe("incomplete");
      expect(result.text).toBe("");
    });

    it("Action만 있고 Action Input이 없으면 incomplete로 반환한다", () => {
      const text = "Thought: 검색.\nAction: search_documents";

      const result = parseReactOutput(text);

      expect(result.type).toBe("incomplete");
    });

    it("앞뒤 공백은 제거한 후 파싱한다", () => {
      const text = "   단순 텍스트   ";

      const result = parseReactOutput(text);

      expect(result.type).toBe("incomplete");
      expect(result.text).toBe("단순 텍스트");
    });
  });

  // ── thought extraction edge cases ───────────────────────────────────────────
  describe("thought extraction", () => {
    it("Thought가 여러 줄에 걸쳐 있어도 올바르게 추출한다", () => {
      const text = [
        "Thought: 첫 번째 생각.",
        "두 번째 생각.",
        "Final Answer: 답변.",
      ].join("\n");

      const result = parseReactOutput(text);

      expect(result.type).toBe("final_answer");
      expect(result.thought).toContain("첫 번째 생각.");
      expect(result.thought).toContain("두 번째 생각.");
    });
  });
});
