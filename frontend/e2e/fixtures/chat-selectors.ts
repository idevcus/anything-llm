/**
 * 채팅 관련 DOM 선택자 상수
 * 기존 DOM 구조 기반으로 작성
 */

// 입력 영역
export const chatSelectors = {
  // 입력 필드 (PromptInput/index.jsx Line 29)
  input: '#primary-prompt-input',

  // 전송 버튼 (form submit 버튼)
  sendButton: 'button[type="submit"]',

  // 채팅 히스토리 컨테이너
  chatHistory: '#chat-history',

  // 메시지 컨텐츠 (HistoricalMessage 컴포넌트)
  messageContent: '.markdown',

  // 에러 메시지
  errorMessage: '.text-red-500',
};

// 역할별 메시지 선택자 (이미지 아이콘으로 식별)
export const roleSelectors = {
  user: 'img[alt*="user"]',
  assistant: 'img[alt*="workspace"]',
};
