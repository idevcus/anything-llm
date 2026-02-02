import { Page } from '@playwright/test';
import { chatSelectors } from '../fixtures/chat-selectors';

/**
 * 메시지 입력
 * @param page Playwright Page 객체
 * @param message 입력할 메시지
 */
export async function typeMessage(page: Page, message: string): Promise<void> {
  const input = page.locator(chatSelectors.input);
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(message);
}

/**
 * 메시지 전송 (입력 + 전송 버튼 클릭)
 * @param page Playwright Page 객체
 * @param message 전송할 메시지
 */
export async function sendMessage(page: Page, message: string): Promise<void> {
  await typeMessage(page, message);
  const sendButton = page.locator(chatSelectors.sendButton);
  await sendButton.click();
}

/**
 * Enter 키로 메시지 전송
 * @param page Playwright Page 객체
 * @param message 전송할 메시지
 */
export async function sendMessageWithEnter(page: Page, message: string): Promise<void> {
  await typeMessage(page, message);
  await page.keyboard.press('Enter');
}

/**
 * 응답 대기 (입력 필드가 다시 활성화될 때까지)
 * @param page Playwright Page 객체
 * @param timeout 최대 대기 시간 (ms)
 */
export async function waitForResponse(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForSelector(
    `${chatSelectors.input}:not([disabled])`,
    { timeout }
  );
  await page.waitForTimeout(1000); // 버퍼
}

/**
 * 채팅 히스토리 메시지 수 가져오기
 * @param page Playwright Page 객체
 * @returns 메시지 수
 */
export async function getChatHistoryCount(page: Page): Promise<number> {
  const history = page.locator(chatSelectors.chatHistory);
  const messages = await history.locator(chatSelectors.messageContent);
  return await messages.count();
}

/**
 * 모든 채팅 메시지 텍스트 가져오기
 * @param page Playwright Page 객체
 * @returns 메시지 텍스트 배열
 */
export async function getChatHistory(page: Page): Promise<string[]> {
  const history = page.locator(chatSelectors.chatHistory);
  const messages = await history.locator(chatSelectors.messageContent).allTextContents();
  return messages;
}

/**
 * 입력 필드 초기화
 * @param page Playwright Page 객체
 */
export async function clearInput(page: Page): Promise<void> {
  const input = page.locator(chatSelectors.input);
  await input.fill('');
}
