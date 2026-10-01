import { defineConfig } from '@playwright/test';

// เครื่องนี้ใช้ Edge ที่ติดตั้งอยู่แล้ว (ไม่ต้องดาวน์โหลดเบราว์เซอร์) ส่วน CI (GitHub Actions) ใช้ Chromium ของ Playwright
// ถ้าจะเพิ่ม Firefox: npx playwright install firefox แล้วเพิ่มรายการใน projects
const chromium = process.env.CI ? { name: 'chromium', use: { browserName: 'chromium' } } : { name: 'edge', use: { channel: 'msedge' } };

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5180' },
  webServer: { command: 'node scripts/serve.mjs 5180', url: 'http://127.0.0.1:5180/', reuseExistingServer: !process.env.CI },
  projects: [
    chromium,
    { name: 'webkit', use: { browserName: 'webkit' } }, // ใกล้เคียง Safari บน iPhone
  ],
});
