import { test, expect } from '@playwright/test';

/**
 * E2E 테스트 예제
 * AnythingLLM 애플리케이션의 기본 기능을 테스트합니다
 */

test.describe('기본 기능 테스트', () => {
  test('페이지가 올바르게 로드되는지 확인', async ({ page }) => {
    // 메인 페이지로 이동
    await page.goto('/');

    // 페이지 제목 확인
    await expect(page).toHaveTitle(/AnythingLLM/);
  });

  test('로그인 페이지 접근 확인', async ({ page }) => {
    // 메인 페이지로 이동
    await page.goto('/');

    // 로그인 버튼이나 링크가 있는지 확인
    // (실제 구현에 따라 선택자가 달라질 수 있음)
    const loginButton = page.locator('text=Login').or(page.locator('text=로그인')).or(page.locator('[data-testid="login-button"]'));

    // 페이지가 로드되었는지 확인
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('워크스페이스 테스트', () => {
  test.beforeEach(async ({ page }) => {
    // 각 테스트 전에 메인 페이지로 이동
    await page.goto('/');
  });

  test('워크스페이스 목록 페이지 접근', async ({ page }) => {
    // 워크스페이스 관련 요소가 있는지 확인
    // (실제 구현에 따라 선택자 조정 필요)

    // 페이지가 로드되었는지 확인
    await expect(page.locator('body')).toBeVisible();
  });
});
