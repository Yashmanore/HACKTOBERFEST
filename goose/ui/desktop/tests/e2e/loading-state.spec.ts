import { test, expect } from './fixtures';

test.describe('Loading State', () => {
  test('shows a model placeholder while creating a new chat session', async ({ mayhemPage }) => {
    await mayhemPage.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });

    const chatInput = await mayhemPage.waitForSelector('[data-testid="chat-input"]');
    await chatInput.fill('Respond with the single word hello.');
    await chatInput.press('Enter');

    await mayhemPage.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'visible',
      timeout: 10000,
    });

    const loadingModel = mayhemPage.locator('[data-testid="model-loading-state"]');
    await expect(loadingModel).toHaveText(/loading model/i, { timeout: 10000 });

    await mayhemPage.screenshot({
      path: test.info().outputPath('loading-state-fresh-session.png'),
      fullPage: true,
    });
  });
});
