import { test, expect } from '@playwright/test';

// ตรวจโหมดออนไลน์เบื้องต้นกับ Supabase จริง โดยไม่สร้างบัญชีและไม่ส่งอีเมล
test('โหมดออนไลน์: โหลดแอปได้ ไม่มี error และล็อกอินด้วยรหัสผิดได้ข้อความที่ถูกต้องจากเซิร์ฟเวอร์', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('index.html?nosw=1#/auth');
  expect(await page.evaluate(() => RD.store.cloud)).toBe(true);
  expect(await page.evaluate(() => RD.store.isLoggedIn())).toBe(false);

  await page.getByRole('button', { name: 'มีบัญชีอยู่แล้ว เข้าสู่ระบบ' }).click();
  await page.getByPlaceholder('you@example.com').fill('nobody-e2e@mailinator.com');
  await page.getByPlaceholder('รหัสผ่าน').fill('wrong-password-1');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง')).toBeVisible({ timeout: 20_000 });

  // ฐานข้อมูลปิดกั้นผู้ที่ไม่ได้ล็อกอิน (RLS + ไม่ให้สิทธิ์ anon)
  const denied = await page.evaluate(async () => {
    const { error } = await RD.remote.client.from('tasks').select('id').limit(1);
    return error && error.code;
  });
  expect(denied).toBe('42501');
  expect(errors).toEqual([]);
});
