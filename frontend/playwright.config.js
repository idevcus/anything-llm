import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 테스트를 위한 Playwright 설정
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* 병렬로 실행되는 테스트 파일들 */
  fullyParallel: true,
  /* 테스트 실패 시 CI에서 리트레이하지 않음 */
  forbidOnly: !!process.env.CI,
  /* CI에서 모든 테스트 파일을 병렬로 실행 */
  retries: process.env.CI ? 2 : 0,
  /* 병렬 워커 수 (CI에서는 1, 로컬에서는 사용 가능한 모든 코어) */
  workers: process.env.CI ? 1 : undefined,
  /* 테스트 리포터 설정 */
  reporter: 'html',
  /* 공유 설정 for all projects */
  use: {
    /* 기본 베이스 URL */
    baseURL: 'http://localhost:3000',
    /* 테스트 실패 시 자동으로 캡처를 추적 */
    trace: 'on-first-retry',
  },

  /* 다양한 브라우저에서 테스트를 실행하기 위한 프로젝트 설정 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* 모바일 브라우저 테스트 */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* 테스트 실행 전 개발 서버 시작 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
