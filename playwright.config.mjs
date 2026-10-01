import { defineConfig } from '@playwright/test';

// ใช้ Edge ที่ติดตั้งในเครื่องอยู่แล้ว (ไม่ต้องดาวน์โหลดเบราว์เซอร์) ถ้าจะเพิ่ม Chromium/Firefox/WebKit:
//   npx playwright install chromium firefox webkit  แล้วเพิ่มรายการใน projects ด้านล่าง
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5180' },
  webServer: { command: 'node scripts/serve.mjs 5180', url: 'http://127.0.0.1:5180/', reuseExistingServer: true },
  projects: [
    { name: 'edge', use: { channel: 'msedge' } },
    { name: 'webkit', use: { browserName: 'webkit' } }, // ใกล้เคียง Safari บน iPhone
  ],
});
