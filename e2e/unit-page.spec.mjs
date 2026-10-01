import { test, expect } from '@playwright/test';

// รันหน้าทดสอบเดิม (tests/index.html: engine + app + iframe 390×844) ในเบราว์เซอร์จริง แล้วรายงานรายข้อ
test('ชุดทดสอบในแอป (tests/index.html) ผ่านทั้งหมด', async ({ page }) => {
  await page.goto('/tests/index.html');
  await page.waitForFunction(() => window.__results, null, { timeout: 170_000 });
  const res = await page.evaluate(() => window.__results);
  const detail = res.failed.map((f) => `${f.name}\n   ${f.error}`).join('\n');
  expect(res.total, 'ต้องมีเทสต์จำนวนมาก').toBeGreaterThan(100);
  expect(res.failed, detail).toEqual([]);
});

// ตรวจเบื้องต้นกับแอปจริง: หน้าแรกและคู่มือเปิดได้ ไม่มี error ใน console
for (const [name, hash, heading] of [['หน้าแรก', '#/', /รีเซ็ตวันนี้/], ['คู่มือการใช้งาน', '#/guide', /คู่มือการใช้งาน/]]) {
  test(`${name} เปิดได้และไม่มี error ใน console`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g(oogleapis|static)/.test(m.text()) && errors.push(m.text()));
    await page.goto(`/index.html?nosw=1&ns=pw-smoke${hash}`);
    await expect(page.locator('h1').first()).toContainText(heading);
    expect(errors).toEqual([]);
  });
}
