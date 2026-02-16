/* eslint-env jest, node */

// workspace.js의 validations 객체를 직접 단위 테스트
// chatMode 검증 함수가 "react"를 올바르게 허용하고 무효 값을 "chat"으로 fallback하는지 검증한다

const { Workspace } = require("../../models/workspace");

describe("Workspace.validations.chatMode", () => {
  it('"chat"을 유효한 값으로 반환한다', () => {
    expect(Workspace.validations.chatMode("chat")).toBe("chat");
  });

  it('"query"를 유효한 값으로 반환한다', () => {
    expect(Workspace.validations.chatMode("query")).toBe("query");
  });

  it('"react"를 유효한 값으로 반환한다', () => {
    expect(Workspace.validations.chatMode("react")).toBe("react");
  });

  it('빈 문자열은 "chat"으로 fallback한다', () => {
    expect(Workspace.validations.chatMode("")).toBe("chat");
  });

  it('null은 "chat"으로 fallback한다', () => {
    expect(Workspace.validations.chatMode(null)).toBe("chat");
  });

  it('undefined는 "chat"으로 fallback한다', () => {
    expect(Workspace.validations.chatMode(undefined)).toBe("chat");
  });

  it('알 수 없는 값은 "chat"으로 fallback한다', () => {
    expect(Workspace.validations.chatMode("agent")).toBe("chat");
    expect(Workspace.validations.chatMode("REACT")).toBe("chat"); // 대소문자 구분
    expect(Workspace.validations.chatMode("Chat")).toBe("chat");
  });
});
