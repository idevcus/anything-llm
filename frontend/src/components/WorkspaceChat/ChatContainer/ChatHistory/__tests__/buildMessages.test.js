import { describe, it, expect } from "vitest";
import { getCompletedUuids } from "../index";

describe("getCompletedUuids", () => {
  it("최종 답변이 있는 uuid를 반환한다", () => {
    const history = [
      {
        uuid: "abc",
        role: "assistant",
        type: "statusResponse",
        content: "Thought...",
      },
      {
        uuid: "abc",
        role: "assistant",
        type: "textResponseChunk",
        content: "최종 답변",
      },
    ];
    expect(getCompletedUuids(history).has("abc")).toBe(true);
  });

  it("statusResponse만 있고 최종 답변이 없으면 빈 Set을 반환한다", () => {
    const history = [
      {
        uuid: "abc",
        role: "assistant",
        type: "statusResponse",
        content: "Thought...",
      },
    ];
    expect(getCompletedUuids(history).size).toBe(0);
  });

  it("content가 없는 assistant 메시지는 완료로 처리하지 않는다", () => {
    const history = [
      {
        uuid: "abc",
        role: "assistant",
        type: "statusResponse",
        content: "Thought...",
      },
      {
        uuid: "abc",
        role: "assistant",
        type: "textResponseChunk",
        content: "",
      },
    ];
    expect(getCompletedUuids(history).has("abc")).toBe(false);
  });

  it("uuid가 없는 메시지는 무시한다", () => {
    const history = [
      { role: "assistant", type: "textResponseChunk", content: "응답" },
    ];
    expect(getCompletedUuids(history).size).toBe(0);
  });

  it("여러 uuid가 있을 때 완료된 것만 반환한다", () => {
    const history = [
      {
        uuid: "aaa",
        role: "assistant",
        type: "statusResponse",
        content: "Thought...",
      },
      {
        uuid: "aaa",
        role: "assistant",
        type: "textResponseChunk",
        content: "aaa 답변",
      },
      {
        uuid: "bbb",
        role: "assistant",
        type: "statusResponse",
        content: "Searching...",
      },
      // bbb는 최종 답변 없음 (스트리밍 중)
    ];
    const result = getCompletedUuids(history);
    expect(result.has("aaa")).toBe(true);
    expect(result.has("bbb")).toBe(false);
  });

  it("user 메시지는 포함하지 않는다", () => {
    const history = [
      { uuid: "abc", role: "user", type: "textResponseChunk", content: "질문" },
    ];
    expect(getCompletedUuids(history).size).toBe(0);
  });

  it("빈 history는 빈 Set을 반환한다", () => {
    expect(getCompletedUuids([]).size).toBe(0);
  });

  it("null/undefined 메시지가 섞여 있어도 에러 없이 처리한다", () => {
    const history = [
      null,
      undefined,
      {
        uuid: "abc",
        role: "assistant",
        type: "textResponseChunk",
        content: "답변",
      },
    ];
    expect(() => getCompletedUuids(history)).not.toThrow();
    expect(getCompletedUuids(history).has("abc")).toBe(true);
  });
});
