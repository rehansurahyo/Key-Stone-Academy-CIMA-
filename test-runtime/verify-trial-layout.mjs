import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

// Run against a local production build. Requests are intercepted: this test
// never registers an actual lead or changes a Supabase account.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:3002';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
await mkdir('outputs/trial-layout', { recursive: true });
try {
  for (const [width, height] of [[1440,900], [1024,768], [960,540], [768,1024], [390,844], [375,667], [320,568]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    let payload;
    await page.route('**/api/free-trial', async route => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 503, json: { error: 'Layout test: request captured safely.' } });
    });
    await page.goto(`${base}/free-trial`);
    const dialog = page.getByRole('dialog', { name: 'Claim your free trial', exact: true });
    await dialog.waitFor();
    const logo = dialog.getByRole('img', { name: 'Keystone Academia — CIMA Global Learning Provider' });
    await logo.waitFor();
    await logo.evaluate(image => image.decode());
    assert.equal(await logo.evaluate(image => image.naturalWidth > 0), true, 'Official logo loads');
    assert.equal(await dialog.getByText('Your dashboard opens immediately.', { exact: false }).count(), 0);
    assert.ok((await dialog.textContent()).includes('Keep your browser data to resume your trial.'));
    await page.getByLabel('Full Name', { exact: true }).fill('Layout Test');
    await page.getByLabel('Email Address', { exact: true }).fill('layout@example.test');
    assert.equal(await page.getByLabel('Country', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Choose phone country code', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Search phone country codes' });
    await search.fill('Pakistan');
    await page.getByRole('option', { name: /Pakistan/ }).click();
    await page.getByLabel('Phone / WhatsApp Number', { exact: true }).fill('03001234567');
    await page.locator('select[name="target_level"]').selectOption('OCS');
    const sizes = await dialog.evaluate(element => {
      const panel = element.querySelector('.free-mock-panel');
      const number = element.querySelector('input[name="phone"]');
      return { viewport: innerWidth, panelWidth: panel.clientWidth, panelContent: panel.scrollWidth, height: panel.clientHeight, contentHeight: panel.scrollHeight, phoneWidth: number.getBoundingClientRect().width };
    });
    assert.ok(sizes.panelContent <= sizes.panelWidth + 1, `No horizontal scroll at ${width}: ${JSON.stringify(sizes)}`);
    assert.ok(sizes.phoneWidth >= 150, `Number field usable at ${width}: ${sizes.phoneWidth}`);
    if (height >= 667) assert.ok(sizes.contentHeight <= sizes.height + 1, `No unnecessary form scrolling at ${width}x${height}: ${JSON.stringify(sizes)}`);
    await page.screenshot({ path: `outputs/trial-layout/${width}x${height}.png`, fullPage: true });
    // Search by a calling prefix, use keyboard selection, and inspect bounds.
    await page.getByRole('button', { name: /Phone country code: Pakistan/ }).click();
    await search.fill('+971');
    await search.press('ArrowDown');
    const menu = page.locator('.free-mock-code-menu');
    const bounds = await menu.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Dropdown stays in viewport');
    assert.ok(bounds.height < 260, 'Dropdown stays compact');
    await search.press('Enter');
    await page.getByRole('button', { name: /Phone country code: United Arab Emirates/ }).click();
    await search.fill('Pakistan');
    await search.press('Enter');
    await dialog.getByRole('button', { name: 'Access Free Mock', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'request captured safely' }).waitFor();
    assert.deepEqual(payload, { full_name: 'Layout Test', email: 'layout@example.test', phone: '+923001234567', phone_country: 'PK', target_level: 'OCS' });
    assert.equal(await page.getByLabel('Phone / WhatsApp Number', { exact: true }).inputValue(), '03001234567');
    assert.deepEqual(failures, [], 'No client runtime errors');
    console.log(`PASS: ${width}x${height}: no horizontal overflow; number ${sizes.phoneWidth}px; prefix search/keyboard, submit payload and error recovery`);
    await context.close();
  }
} finally { await browser.close(); }
