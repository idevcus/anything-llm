import { test, expect } from '@playwright/test';
import { clearAuth } from '../helpers/auth.helper';
import { createTestWorkspace, navigateToWorkspace } from '../helpers/workspace.helper';
import {
  sendMessage,
  sendMessageWithEnter,
  waitForResponse,
  getChatHistoryCount,
  typeMessage,
  getChatHistory,
} from '../helpers/chat.helper';
import { chatTestData, timeouts } from '../fixtures/test-data';

test.describe('Workspace Chat - Message Sending', () => {
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

  test('should send a message and receive response', async ({ page }) => {
    // Arrange: 워크스페이스 생성 및 이동
    const workspace = await createTestWorkspace(page);
    await navigateToWorkspace(page, workspace.slug);

    // Act: 메시지 전송
    await sendMessage(page, chatTestData.messages.simple);

    // Assert: 응답 대기 및 확인
    await waitForResponse(page);
    const messageCount = await getChatHistoryCount(page);
    expect(messageCount).toBeGreaterThan(0); // 최소한 메시지가 있어야 함
  });

  test('should send message with Enter key', async ({ page }) => {
    const workspace = await createTestWorkspace(page);
    await navigateToWorkspace(page, workspace.slug);

    await sendMessageWithEnter(page, chatTestData.messages.question);
    await waitForResponse(page);

    const messages = await getChatHistory(page);
    expect(messages.some(m => m.includes(chatTestData.messages.question))).toBeTruthy();
  });

  test('should preserve input with Shift+Enter', async ({ page }) => {
    const workspace = await createTestWorkspace(page);
    await navigateToWorkspace(page, workspace.slug);

    // Act: Shift+Enter로 줄바꿈
    await typeMessage(page, 'Line 1');
    await page.keyboard.press('Shift+Enter');
    await typeMessage(page, 'Line 2');

    // Assert: 입력 필드에 줄바꿈 유지
    const input = page.locator('#primary-prompt-input');
    const value = await input.inputValue();
    expect(value).toContain('\n');
    expect(value).toContain('Line 2');
  });
});
