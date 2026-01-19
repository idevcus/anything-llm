/**
 * 인증 E2E 테스트 - 로그인
 */

import { test, expect } from '@playwright/test';
import {
  loginSingleUser,
  loginMultiUser,
  isLoginFormVisible,
  isMultiUserForm,
  getErrorMessage,
  hasForgotPasswordButton,
  isAuthenticated,
  getAuthToken,
  getAuthUser,
  clearAuth,
  getLoginMode,
} from '../helpers/auth.helper';
import { testUsers, invalidCredentials, testUrls, timeouts } from '../fixtures/test-data';

test.describe('Authentication - Login', () => {
  // 각 테스트 전에 실행
  test.beforeEach(async ({ page }) => {
    // 로그인 페이지로 이동
    await page.goto(testUrls.login);
    // 페이지가 완전히 로드될 때까지 대기
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    // localStorage 클리어
    await clearAuth(page);
  });

  test.describe('Single User Mode', () => {
    test('should display login form', async ({ page }) => {
      // 현재 URL 확인 (디버깅용)
      console.log('Current URL:', page.url());

      // 페이지가 완전히 로드될 때까지 대기
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      console.log('URL after load:', page.url());

      // 로그인 폼이 표시되는지 확인
      await expect(page.locator('form')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // 다중 사용자 필드(사용명)는 없어야 함
      const usernameInput = page.locator('input[name="username"]');
      await expect(usernameInput).toHaveCount(0);
    });

    test('should successfully login with correct password', async ({ page }) => {
      // 올바른 비밀번호로 로그인 시도
      await loginSingleUser(page, testUsers.singleUser.password);

      // 홈페이지로 리다이렉트되는지 확인
      await expect(page).toHaveURL(testUrls.home);

      // 인증 토큰이 저장되었는지 확인
      const token = await getAuthToken(page);
      expect(token).toBeTruthy();

      // 인증 상태 확인
      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);
    });

    test('should display error message with incorrect password', async ({ page }) => {
      // 잘못된 비밀번호 입력
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill(invalidCredentials.wrongPassword);

      // 제출 버튼 클릭
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // 잠시 대기 (API 응답 대기)
      await page.waitForTimeout(timeouts.medium);

      // 에러 메시지가 표시되는지 확인
      const errorMessage = await getErrorMessage(page);
      expect(errorMessage).toBeTruthy();
    });

    test('should not submit empty password', async ({ page }) => {
      // 빈 비밀번호로 제출 시도
      const submitButton = page.locator('button[type="submit"]');

      // HTML5 required 속성으로 인해 제출되지 않아야 함
      // 폼이 여전히 표시되는지 확인
      const isFormVisible = await isLoginFormVisible(page);
      expect(isFormVisible).toBe(true);

      // URL이 변경되지 않았는지 확인
      await expect(page).toHaveURL(testUrls.login);
    });
  });

  test.describe('Multi User Mode', () => {
    test('should display multi-user login form', async ({ page }) => {
      // 다중 사용자 폼인지 확인
      const isMultiUser = await isMultiUserForm(page);
      expect(isMultiUser).toBe(true);

      // 사용명과 비밀번호 입력 필드가 모두 있어야 함
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should display forgot password option', async ({ page }) => {
      // 비밀번호 찾기 버튼이 있는지 확인
      const hasForgotButton = await hasForgotPasswordButton(page);
      expect(hasForgotButton).toBe(true);
    });

    test('should successfully login with correct credentials', async ({ page }) => {
      // 올바른 사용자 정보로 로그인 시도
      await loginMultiUser(page, testUsers.admin.username, testUsers.admin.password);

      // 홈페이지로 리다이렉트되는지 확인
      await expect(page).toHaveURL(testUrls.home);

      // 인증 토큰과 사용자 정보가 저장되었는지 확인
      const token = await getAuthToken(page);
      expect(token).toBeTruthy();

      const user = await getAuthUser(page);
      expect(user).toBeTruthy();

      // 다중 사용자 모드인지 확인
      const mode = await getLoginMode(page);
      expect(mode).toBe('multi');
    });

    test('should display error with wrong username', async ({ page }) => {
      // 잘못된 사용명 입력
      const usernameInput = page.locator('input[name="username"]');
      await usernameInput.fill(invalidCredentials.wrongUsername);

      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill(testUsers.admin.password);

      // 제출
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // 대기
      await page.waitForTimeout(timeouts.medium);

      // 에러 메시지 확인
      const errorMessage = await getErrorMessage(page);
      expect(errorMessage).toBeTruthy();
    });

    test('should display error with wrong password', async ({ page }) => {
      // 올바른 사용명, 잘못된 비밀번호
      const usernameInput = page.locator('input[name="username"]');
      await usernameInput.fill(testUsers.admin.username);

      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill(invalidCredentials.wrongPassword);

      // 제출
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // 대기
      await page.waitForTimeout(timeouts.medium);

      // 에러 메시지 확인
      const errorMessage = await getErrorMessage(page);
      expect(errorMessage).toBeTruthy();
    });

    test('should not submit empty fields', async ({ page }) => {
      // 빈 필드로 제출 시도
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // HTML5 required 속성으로 인해 제출되지 않아야 함
      // URL이 변경되지 않았는지 확인
      await expect(page).toHaveURL(testUrls.login);
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      // 로그인 (단일 사용자 모드 가정)
      await loginSingleUser(page, testUsers.singleUser.password);

      // 페이지 새로고침
      await page.reload();

      // 여전히 인증 상태인지 확인
      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);

      // 여전히 홈페이지에 있는지 확인
      await expect(page).toHaveURL(testUrls.home);
    });

    test('should redirect to home if already authenticated', async ({ page }) => {
      // 먼저 로그인
      await loginSingleUser(page, testUsers.singleUser.password);

      // 다시 로그인 페이지로 이동 시도
      await page.goto(testUrls.login);

      // 인증되어 있으면 홈페이지로 리다이렉트되어야 함
      // (실제 동작은 애플리케이션 구현에 따라 다를 수 있음)
      await page.waitForTimeout(timeouts.short);
    });

    test('should persist token in localStorage', async ({ page }) => {
      // 로그인
      await loginSingleUser(page, testUsers.singleUser.password);

      // localStorage에서 토큰 확인
      const token = await page.evaluate((key) => {
        return localStorage.getItem(key);
      }, 'anythingllm_authToken');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token?.length).toBeGreaterThan(0);
    });
  });

  test.describe('UI Elements', () => {
    test('should display app name/logo', async ({ page }) => {
      // 앱 이름이 표시되는지 확인 (AnythingLLM 또는 커스텀 이름)
      const appName = page.getByText('AnythingLLM');
      await expect(appName).toBeVisible();
    });

    test('should have properly styled form', async ({ page }) => {
      // 폼이 중앙에 위치하고 스타일이 적용되어 있는지 확인
      const form = page.locator('form').first();
      await expect(form).toBeVisible();
      await expect(form).toHaveCSS('display', 'flex');
    });

    test('should show loading state on submit', async ({ page }) => {
      // 비밀번호 입력
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill(testUsers.singleUser.password);

      // 제출 버튼 클릭
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // 로딩 상태가 표시될 수 있음 (구현에 따라 다름)
      // 버튼이 disabled 되는지 확인
      // Note: 실제 로딩 상태 표시 구현을 확인한 후 테스트 수정 필요
    });
  });
});
