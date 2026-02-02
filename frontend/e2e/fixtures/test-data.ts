/**
 * E2E 테스트용 데이터
 */

/**
 * 테스트용 사용자 정보
 * 실제 테스트 실행 시에는 환경 변수 또는 실제 테스트 계정 정보로 대체해야 합니다
 */
export const testUsers = {
  // 단일 사용자 모드 (Single User Mode)
  singleUser: {
    password: process.env.E2E_SINGLE_USER_PASSWORD || 'password',
  },

  // 다중 사용자 모드 (Multi User Mode)
  admin: {
    username: process.env.E2E_ADMIN_USERNAME || 'admin',
    password: process.env.E2E_ADMIN_PASSWORD || 'password',
    role: 'admin',
  },

  manager: {
    username: process.env.E2E_MANAGER_USERNAME || 'manager',
    password: process.env.E2E_MANAGER_PASSWORD || 'password',
    role: 'manager',
  },

  default: {
    username: process.env.E2E_USER_USERNAME || 'user',
    password: process.env.E2E_USER_PASSWORD || 'password',
    role: 'default',
  },
};

/**
 * 잘못된 인증 정보 (실패 시나리오용)
 */
export const invalidCredentials = {
  emptyPassword: '',
  wrongPassword: 'wrong-password-12345',
  wrongUsername: 'nonexistent-user',
  emptyUsername: '',
  emptyFields: {
    username: '',
    password: '',
  },
};

/**
 * 테스트용 URLs
 */
export const testUrls = {
  base: process.env.E2E_BASE_URL || 'http://localhost:3000',
  login: '/login',
  home: '/',
  onboarding: '/onboarding',
  workspace: (slug: string) => `/workspace/${slug}`,
};

/**
 * localStorage 키 (상수)
 * 실제 애플리케이션의 constants.js와 일치하도록 설정
 */
export const storageKeys = {
  authToken: 'anythingllm_authToken',
  authUser: 'anythingllm_user',
  authTimestamp: 'anythingllm_authTimestamp',
};

/**
 * 테스트 대기 시간 (밀리초)
 */
export const timeouts = {
  short: 1000,
  medium: 3000,
  long: 10000,
  navigation: 30000,
};

/**
 * 워크스페이스 채팅 관련 테스트 데이터
 */
export const chatTestData = {
  messages: {
    simple: 'Hello, this is a test message.',
    question: 'What is 2 + 2?',
    korean: '안녕하세요',
  },

  // 응답 대기 시간
  responseTimeout: 30000,
};
