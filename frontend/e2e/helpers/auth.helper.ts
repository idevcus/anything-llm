/**
 * 인증 관련 E2E 테스트 헬퍼 함수
 */

import { Page, Locator } from '@playwright/test';
import { testUsers, storageKeys, timeouts, testUrls } from '../fixtures/test-data';

const loginErrorSelector =
  'p.text-red-400, .text-red-500, [role="alert"], .error, [class*="error"]';

async function waitForLoginResult(page: Page, userLabel?: string) {
  const errorElement = page.locator(loginErrorSelector);
  const timeout = timeouts.navigation;

  try {
    const result = await Promise.race([
      page
        .waitForURL((url) => !url.pathname.includes(testUrls.login), { timeout })
        .then(() => 'navigated'),
      errorElement
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(() => 'error'),
    ]);

    if (result === 'error') {
      const errorText = await errorElement.first().textContent();
      const detail = errorText || 'Unknown error';
      if (userLabel) {
        throw new Error(`Login failed for user "${userLabel}": ${detail}`);
      }
      throw new Error(`Login failed: ${detail}`);
    }
  } catch (error) {
    const isTimeout = error instanceof Error && /Timeout/i.test(error.message);
    if (isTimeout) {
      const currentUrl = page.url();
      if (currentUrl.includes(testUrls.login)) {
        if (userLabel) {
          throw new Error(
            `Login failed for user "${userLabel}": Still on login page after form submission`
          );
        }
        throw new Error('Login failed: Still on login page after form submission');
      }
    }
    throw error;
  }

  await page.waitForLoadState('domcontentloaded', { timeout: timeouts.medium }).catch(() => {});
}

/**
 * 단일 사용자 모드로 로그인
 * @param page Playwright Page 객체
 * @param password 비밀번호 (기본값: 테스트 데이터)
 */
export async function loginSingleUser(page: Page, password?: string) {
  const pwd = password || testUsers.singleUser.password;

  // 페이지가 완전히 로드될 때까지 대기
  await page.waitForLoadState('networkidle', { timeout: timeouts.navigation }).catch(() => {
    // networkidle 대기 실패 시 domcontentloaded로 대체
    return page.waitForLoadState('domcontentloaded', { timeout: timeouts.medium });
  });

  // 비밀번호 입력 필드가 나타날 때까지 대기
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: timeouts.long });

  await passwordInput.fill(pwd);

  // 제출 버튼 클릭
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  await waitForLoginResult(page);
}

/**
 * 다중 사용자 모드로 로그인
 * @param page Playwright Page 객체
 * @param username 사용명 (기본값: admin)
 * @param password 비밀번호 (기본값: 테스트 데이터)
 */
export async function loginMultiUser(
  page: Page,
  username?: string,
  password?: string
) {
  const user = username || testUsers.admin.username;
  const pwd = password || testUsers.admin.password;

  // 페이지가 완전히 로드될 때까지 대기
  await page.waitForLoadState('networkidle', { timeout: timeouts.navigation }).catch(() => {
    // networkidle 대기 실패 시 domcontentloaded로 대체
    return page.waitForLoadState('domcontentloaded', { timeout: timeouts.medium });
  });

  // 사용명 입력 필드가 나타날 때까지 대기
  const usernameInput = page.locator('input[name="username"]');
  await usernameInput.waitFor({ state: 'visible', timeout: timeouts.long });

  await usernameInput.fill(user);

  // 비밀번호 입력 필드 찾기
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: timeouts.long });

  await passwordInput.fill(pwd);

  // 제출 버튼 클릭
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  await waitForLoginResult(page, user);
}

/**
 * 로그아웃
 * @param page Playwright Page 객체
 */
export async function logout(page: Page) {
  // 사용자 메뉴 버튼 클릭
  const userMenuButton = page.locator('button.uppercase').first();
  await userMenuButton.click();

  // 로그아웃 버튼 클릭 (텍스트로 식별)
  // i18n 키: "profile_settings.signout" -> 실제 텍스트: "Sign out" 또는 한국어 "로그아웃"
  const logoutButton = page.getByText('Sign out').or(page.getByText('로그아웃'));
  await logoutButton.click();

  // 로그아웃 성공 대기 (로그인 페이지로 리다이렉트 또는 홈페이지 유지)
  await page.waitForTimeout(timeouts.medium);
}

/**
 * localStorage에서 인증 토큰 가져오기
 * @param page Playwright Page 객체
 * @returns 인증 토큰 또는 null
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate((key) => {
    return localStorage.getItem(key);
  }, storageKeys.authToken);
}

/**
 * localStorage에서 사용자 정보 가져오기
 * @param page Playwright Page 객체
 * @returns 사용자 객체 또는 null
 */
export async function getAuthUser(page: Page): Promise<object | null> {
  const userString = await page.evaluate((key) => {
    return localStorage.getItem(key);
  }, storageKeys.authUser);

  if (!userString) return null;

  try {
    return JSON.parse(userString);
  } catch {
    return null;
  }
}

/**
 * 인증 상태 확인
 * @param page Playwright Page 객체
 * @returns 인증 여부
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const token = await getAuthToken(page);
  return !!token;
}

/**
 * localStorage 클리어 (인증 정보 제거)
 * @param page Playwright Page 객체
 */
export async function clearAuth(page: Page) {
  // 페이지 컨텍스트가 준비될 때까지 대기
  await page.waitForLoadState('domcontentloaded').catch(() => {
    // 페이지가 아직 로드되지 않은 경우 무시
  });

  await page.evaluate((keys) => {
    try {
      localStorage.removeItem(keys.authToken);
      localStorage.removeItem(keys.authUser);
      localStorage.removeItem(keys.authTimestamp);
    } catch (error) {
      // SecurityError 무시 (페이지가 아직 로드되지 않은 경우)
    }
  }, storageKeys);
}

/**
 * 로그인 모드 확인 (단일/다중 사용자)
 * @param page Playwright Page 객체
 * @returns 'single' | 'multi' | null
 */
export async function getLoginMode(page: Page): Promise<'single' | 'multi' | null> {
  const hasUser = await page.evaluate((key) => {
    return !!localStorage.getItem(key);
  }, storageKeys.authUser);

  const hasToken = await page.evaluate((key) => {
    return !!localStorage.getItem(key);
  }, storageKeys.authToken);

  if (hasUser && hasToken) return 'multi';
  if (!hasUser && hasToken) return 'single';
  return null;
}

/**
 * 로그인 폼이 표시되는지 확인
 * @param page Playwright Page 객체
 * @returns 로그인 폼이 표시되는지 여부
 */
export async function isLoginFormVisible(page: Page): Promise<boolean> {
  const form = page.locator('form').first();
  return await form.isVisible();
}

/**
 * 다중 사용자 로그인 폼인지 확인
 * @param page Playwright Page 객체
 * @returns 다중 사용자 폼인지 여부
 */
export async function isMultiUserForm(page: Page): Promise<boolean> {
  const usernameInput = page.locator('input[name="username"]');
  return await usernameInput.count().then((count) => count > 0);
}

/**
 * 에러 메시지가 표시되는지 확인
 * @param page Playwright Page 객체
 * @returns 에러 메시지 텍스트 또는 null
 */
export async function getErrorMessage(page: Page): Promise<string | null> {
  const errorElement = page.locator('p.text-red-400');
  const count = await errorElement.count();

  if (count === 0) return null;

  const text = await errorElement.textContent();
  return text?.replace('Error: ', '') || null;
}

/**
 * 비밀번호 재설정 버튼이 있는지 확인 (다중 사용자 모드)
 * @param page Playwright Page 객체
 * @returns 비밀번호 재설정 버튼 존재 여부
 */
export async function hasForgotPasswordButton(page: Page): Promise<boolean> {
  const forgotButton = page.getByText('Forgot password').or(
    page.getByText(/비밀번호 찾기/)
  );
  return await forgotButton.count().then((count) => count > 0);
}
