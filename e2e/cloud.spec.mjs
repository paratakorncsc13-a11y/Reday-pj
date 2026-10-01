import { test, expect } from '@playwright/test';

// ทดสอบโหมดออนไลน์กับ Supabase จริง: สมัคร → ตั้งค่า → บันทึกเวลาตื่น → ตรวจว่าข้อมูลขึ้นฐานข้อมูล
// → ล้าง cache ในเครื่องแล้วโหลดใหม่ ข้อมูลยังอยู่ (มาจากเซิร์ฟเวอร์) → ลบบัญชี
// ต้องเปิดยืนยันอีเมลเป็น "ปิด" ในโปรเจกต์ (supabase/config.toml: enable_confirmations = false) และใช้โควตาสมัครของ Supabase เล็กน้อย
// รันเฉพาะเมื่อสั่ง: REDAY_E2E_CLOUD=1 npx playwright test e2e/cloud.spec.mjs
test.skip(!process.env.REDAY_E2E_CLOUD, 'ตั้ง REDAY_E2E_CLOUD=1 เพื่อรันกับ Supabase จริง');

test('โหมดออนไลน์: สมัคร ซิงก์ข้อมูล โหลดจากเซิร์ฟเวอร์ และลบบัญชี', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `reday-e2e-${Date.now()}@mailinator.com`;
  const password = 'e2e-pass-' + Math.random().toString(36).slice(2, 8);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/index.html?nosw=1&now=' + encodeURIComponent('2026-10-01T10:00:00+07:00') + '#/auth');
  expect(await page.evaluate(() => RD.store.cloud), 'ต้องอยู่ในโหมดออนไลน์').toBe(true);

  // สมัคร
  await page.getByPlaceholder('เช่น มะนาว').fill('ทดสอบ e2e');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('อย่างน้อย 6 ตัว').fill(password);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: 'สมัครและเริ่มตั้งค่า' }).click();

  // onboarding 3 ขั้น
  await expect(page.getByRole('heading', { name: 'จังหวะนอนของคุณ' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'ต่อไป' }).click();
  await page.getByRole('button', { name: 'ต่อไป' }).click();
  await page.getByRole('button', { name: 'เสร็จสิ้น' }).click();
  await expect(page.getByText('พร้อมรีเซ็ตวันนี้แล้ว')).toBeVisible();
  await expect(page.getByText('รหัสกู้คืนบัญชี')).toHaveCount(0); // โหมดออนไลน์ไม่มีรหัสกู้คืน
  await page.getByRole('button', { name: 'ไปหน้าวันนี้' }).click();

  // บันทึกเวลาตื่น 08:15
  await page.getByRole('button', { name: /^ตื่นกี่โมง/ }).click();
  await page.getByLabel('พิมพ์เวลา แบบ ชั่วโมง:นาที').fill('0815');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('08:15 น.').first()).toBeVisible();

  // ข้อมูลต้องไปอยู่ในฐานข้อมูลจริง
  await expect
    .poll(async () => page.evaluate(async () => {
      const { data } = await RD.remote.client.from('daily_logs').select('woke_at');
      return data && data.length ? new Date(data[0].woke_at).toISOString() : null;
    }), { timeout: 20_000 })
    .toBe('2026-10-01T01:15:00.000Z');
  expect(await page.evaluate(() => RD.store.syncState())).toBe('ok');

  // ล้าง cache ในเครื่อง แล้วโหลดใหม่: session ยังอยู่ ข้อมูลมาจากเซิร์ฟเวอร์
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('reday2.u.')).forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  await expect(page.getByText('08:15 น.').first()).toBeVisible({ timeout: 20_000 });

  // ลบบัญชี
  await page.goto('/index.html?nosw=1&now=' + encodeURIComponent('2026-10-01T10:00:00+07:00') + '#/me');
  await page.getByRole('button', { name: /^ลบบัญชี/ }).click();
  await page.getByLabel('พิมพ์ ลบบัญชี เพื่อยืนยัน').fill('ลบบัญชี');
  await page.getByRole('button', { name: 'ลบบัญชีถาวร' }).click();
  await expect(page.getByRole('heading', { name: /รีเซ็ตวันนี้/ })).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(async (a) => (await RD.remote.client.auth.signInWithPassword(a)).error ? 'denied' : 'still-exists', { email, password }), { timeout: 20_000 })
    .toBe('denied');

  expect(errors).toEqual([]);
});
