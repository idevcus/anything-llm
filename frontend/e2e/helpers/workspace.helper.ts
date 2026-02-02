import { Page } from '@playwright/test';

/**
 * 테스트용 워크스페이스 slug 반환
 * @param page Playwright Page 객체
 * @returns 워크스페이스 slug
 */
export async function getTestWorkspaceSlug(page: Page): Promise<string> {
  // TODO: 나중에 기존 워크스페이스를 확인하거나 생성하는 로직으로 개선
  // 현재는 첫 번째 워크스페이스를 사용한다고 가정

  // 홈페이지로 이동하여 기존 워크스페이스 확인
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  // URL이 이미 workspace인 경우
  const url = page.url();
  const match = url.match(/\/workspace\/([^/]+)/);
  if (match) return match[1];

  // 기본 워크스페이스 slug (테스트용)
  // 주의: 실제 워크스페이스가 없으면 테스트가 실패할 수 있음
  return 'test-workspace';
}

/**
 * 테스트용 워크스페이스 생성 (UI를 통해) - 실패 시 기본 slug 반환
 * @param page Playwright Page 객체
 * @returns 워크스페이스 slug
 */
export async function createTestWorkspace(page: Page): Promise<{ slug: string }> {
  try {
    // 홈페이지에서 "New Workspace" 버튼 클릭 시도
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const newWorkspaceBtn = page.getByText('New Workspace').or(page.getByText('+'));

    // 버튼이 있는지 확인
    const count = await newWorkspaceBtn.count();
    if (count > 0) {
      await newWorkspaceBtn.click();
      await page.waitForLoadState('networkidle');

      // 현재 URL에서 slug 추출
      const url = page.url();
      const match = url.match(/\/workspace\/([^/]+)/);
      if (match) return { slug: match[1] };
    }

    // 실패 시 기본 slug 반환
    return { slug: 'test-workspace' };
  } catch (error) {
    // 실패 시 기본 slug 반환
    return { slug: 'test-workspace' };
  }
}

/**
 * 워크스페이스 페이지로 이동
 * @param page Playwright Page 객체
 * @param slug 워크스페이스 slug
 */
export async function navigateToWorkspace(page: Page, slug: string): Promise<void> {
  await page.goto(`/workspace/${slug}`);
  await page.waitForLoadState('networkidle');
}
