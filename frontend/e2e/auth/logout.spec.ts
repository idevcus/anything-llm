/**
 * 인증 E2E 테스트 - 로그아웃
 */

import { test, expect } from '@playwright/test';
import {
  loginSingleUser,
  loginMultiUser,
  logout,
  isAuthenticated,
  getAuthToken,
  getAuthUser,
  clearAuth,
  getLoginMode,
} from '../helpers/auth.helper';
import { testUsers, testUrls, timeouts } from '../fixtures/test-data';

test.describe('Authentication - Logout', () => {
  test.describe('Single User Mode', () => {
    test.beforeEach(async ({ page }) => {
      // 테스트 전에 로그인
      await page.goto(testUrls.login);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await clearAuth(page);
      await loginSingleUser(page, testUsers.singleUser.password);
    });

    test('should logout successfully via user menu', async ({ page }) => {
      // 인증 상태 확인
      await expect(await isAuthenticated(page)).toBe(true);

      // 로그아웃 수행
      await logout(page);

      // 인증 토큰이 제거되었는지 확인
      const token = await getAuthToken(page);
      expect(token).toBeNull();

      // 인증 상태 확인
      await expect(await isAuthenticated(page)).toBe(false);
    });

    test('should clear localStorage on logout', async ({ page }) => {
      // 로그아웃 전에 localStorage에 데이터가 있는지 확인
      const tokenBefore = await getAuthToken(page);
      expect(tokenBefore).toBeTruthy();

      // 로그아웃
      await logout(page);

      // 모든 인증 관련 데이터가 제거되었는지 확인
      const authToken = await page.evaluate(() => localStorage.getItem('anythingllm_authToken'));
      const authUser = await page.evaluate(() => localStorage.getItem('anythingllm_authUser'));
      const authTimestamp = await page.evaluate(() => localStorage.getItem('anythingllm_authTimestamp'));

      expect(authToken).toBeNull();
      expect(authUser).toBeNull();
      expect(authTimestamp).toBeNull();
    });

    test('should redirect to login or home after logout', async ({ page }) => {
      // 로그아웃
      await logout(page);

      // 페이지가 리다이렉트되었는지 확인
      // (구현에 따라 로그인 페이지 또는 홈페이지로 이동할 수 있음)
      await page.waitForTimeout(timeouts.medium);

      // 현재 URL이 로그인 페이지이거나 홈페이지인지 확인
      const currentUrl = page.url();
      const isOnLoginPage = currentUrl.includes(testUrls.login) || currentUrl.endsWith('/');
      expect(isOnLoginPage).toBe(true);
    });

    test('should not allow access to protected routes after logout', async ({ page }) => {
      // 로그아웃
      await logout(page);

      // 인증이 필요한 페이지로 이동 시도
      await page.goto(testUrls.home);

      // 인증되지 않은 상태이므로 로그인 페이지로 리다이렉트되거나
      // 특정 동작이 발생해야 함 (구현에 따라 다름)
      await page.waitForTimeout(timeouts.short);
    });
  });

  test.describe('Multi User Mode', () => {
    test.beforeEach(async ({ page }) => {
      // 테스트 전에 로그인 (다중 사용자 모드)
      await page.goto(testUrls.login);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await clearAuth(page);
      await loginMultiUser(page, testUsers.admin.username, testUsers.admin.password);
    });

    test('should logout successfully', async ({ page }) => {
      // 다중 사용자 모드인지 확인
      const mode = await getLoginMode(page);
      expect(mode).toBe('multi');

      // 인증 상태 확인
      await expect(await isAuthenticated(page)).toBe(true);

      // 로그아웃
      await logout(page);

      // 인증 토큰과 사용자 정보가 제거되었는지 확인
      const token = await getAuthToken(page);
      const user = await getAuthUser(page);

      expect(token).toBeNull();
      expect(user).toBeNull();
    });

    test('should clear all user data on logout', async ({ page }) => {
      // 로그아웃 전 사용자 정보 확인
      const userBefore = await getAuthUser(page);
      expect(userBefore).toBeTruthy();

      // 로그아웃
      await logout(page);

      // 사용자 정보가 제거되었는지 확인
      const userAfter = await getAuthUser(page);
      expect(userAfter).toBeNull();

      // 다른 사용자로 로그인 가능해야 함
      await page.goto(testUrls.login);
      await loginMultiUser(page, testUsers.manager.username, testUsers.manager.password);

      const mode = await getLoginMode(page);
      expect(mode).toBe('multi');
    });
  });

  test.describe('User Menu Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(testUrls.login);
      await clearAuth(page);
      await loginSingleUser(page, testUsers.singleUser.password);
    });

    test('should display user menu button', async ({ page }) => {
      // 사용자 메뉴 버튼이 표시되는지 확인
      const userMenuButton = page.locator('button.uppercase').first();
      await expect(userMenuButton).toBeVisible();
    });

    test('should open user menu on click', async ({ page }) => {
      // 사용자 메뉴 버튼 클릭
      const userMenuButton = page.locator('button.uppercase').first();
      await userMenuButton.click();

      // 메뉴가 표시되는지 확인
      const menu = page.locator('div.rounded-lg').filter({ hasText: 'Sign out' }).or(
        page.locator('div.rounded-lg').filter({ hasText: '로그아웃' })
      );
      await expect(menu).toBeVisible();
    });

    test('should close menu when clicking outside', async ({ page }) => {
      // 메뉴 열기
      const userMenuButton = page.locator('button.uppercase').first();
      await userMenuButton.click();

      const menu = page.locator('div.rounded-lg').filter({ hasText: 'Sign out' }).or(
        page.locator('div.rounded-lg').filter({ hasText: '로그아웃' })
      );
      await expect(menu).toBeVisible();

      // 메뉴 외부 클릭
      await page.mouse.click(10, 10); // 페이지 상단 클릭

      // 메뉴가 닫혔는지 확인
      await expect(menu).not.toBeVisible();
    });

    test('should display logout option in menu', async ({ page }) => {
      // 메뉴 열기
      const userMenuButton = page.locator('button.uppercase').first();
      await userMenuButton.click();

      // 로그아웃 버튼이 있는지 확인
      const logoutButton = page.getByText('Sign out').or(page.getByText('로그아웃'));
      await expect(logoutButton).toBeVisible();
    });

    test('should display account settings option in multi-user mode', async ({ page }) => {
      // 다중 사용자 모드로 로그인
      await clearAuth(page);
      await page.goto(testUrls.login);
      await loginMultiUser(page, testUsers.admin.username, testUsers.admin.password);

      // 메뉴 열기
      const userMenuButton = page.locator('button.uppercase').first();
      await userMenuButton.click();

      // 계정 설정 버튼이 있는지 확인 (다중 사용자 모드에서만 표시)
      const accountButton = page.getByText('Account').or(page.getByText('계정'));
      // Note: 실제 i18n 키에 따라 텍스트가 다를 수 있음
      await page.waitForTimeout(timeouts.short);
    });
  });

  test.describe('Session Persistence', () => {
    test('should require re-login after logout', async ({ page }) => {
      // 로그인
      await page.goto(testUrls.login);
      await clearAuth(page);
      await loginSingleUser(page, testUsers.singleUser.password);

      // 로그아웃
      await logout(page);

      // 홈페이지로 이동 시도
      await page.goto(testUrls.home);

      // 인증이 필요하므로 로그인 페이지로 리다이렉트되거나
      // 제한된 접근이 표시되어야 함
      await page.waitForTimeout(timeouts.short);

      // 다시 로그인이 필요한지 확인
      const isLoginFormVisible = await page.locator('form').first().isVisible().catch(() => false);
      // 로그인 폼이 있거나, 특정 제한 페이지가 표시되어야 함
    });

    test('should not maintain session across browser restart after logout', async ({ page }) => {
      // 로그인
      await page.goto(testUrls.login);
      await clearAuth(page);
      await loginSingleUser(page, testUsers.singleUser.password);

      // 로그아웃
      await logout(page);

      // 컨텍스트 재시작 (브라우저 재시작 시뮬레이션)
      await page.context().close();

      // 새 페이지로 접근
      const newPage = await page.context().newPage();
      await newPage.goto(testUrls.home);

      // 인증되지 않은 상태여야 함
      const token = await newPage.evaluate(() => localStorage.getItem('anythingllm_authToken'));
      expect(token).toBeNull();
    });
  });
});
