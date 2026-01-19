import { test, expect } from '@playwright/test';
import { clearAuth } from '../helpers/auth.helper';
import { createTestWorkspace, navigateToWorkspace } from '../helpers/workspace.helper';
import {
  sendMessage,
  waitForResponse,
  getChatHistory,
  getChatHistoryCount,
} from '../helpers/chat.helper';
import { chatTestData, timeouts } from '../fixtures/test-data';

test.describe('Workspace Chat - History Management', () => {
  test.beforeEach(async ({ page }) => {
    // 비밀번호가 설정되지 않은 경우 바로 진입
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: timeouts.navigation });

    // 로그인이 필요한 경우 처리
    const passwordInput = page.locator('input[name="password"]');
    const hasPassword = await passwordInput.count() > 0;

    if (hasPassword) {
      await clearAuth(page);
      await passwordInput.fill(process.env.E2E_SINGLE_USER_PASSWORD || 'hunter2');
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      await page.waitForURL('/', { timeout: timeouts.navigation });
    }
  });

  test('should display chat history after multiple messages', async ({ page }) => {
    const workspace = await createTestWorkspace(page);
    await navigateToWorkspace(page, workspace.slug);

    // 여러 메시지 전송
    await sendMessage(page, 'Message 1');
    await waitForResponse(page);

    await sendMessage(page, 'Message 2');
    await waitForResponse(page);

    // Assert: 히스토리 확인
    const messageCount = await getChatHistoryCount(page);
    expect(messageCount).toBeGreaterThanOrEqual(4); // 2 사용자 + 2 어시스턴트
  });

  test('should persist chat history after page reload', async ({ page }) => {
    const workspace = await createTestWorkspace(page);
    await navigateToWorkspace(page, workspace.slug);

    // 메시지 전송
    await sendMessage(page, chatTestData.messages.korean);
    await waitForResponse(page);

    const messageCountBefore = await getChatHistoryCount(page);

    // 페이지 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Assert: 히스토리 유지 확인
    const messageCountAfter = await getChatHistoryCount(page);
    expect(messageCountAfter).toBe(messageCountBefore);

    const messages = await getChatHistory(page);
    expect(messages.some(m => m.includes(chatTestData.messages.korean))).toBeTruthy();
  });
});
