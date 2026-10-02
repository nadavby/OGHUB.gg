import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './src',
    globals: true,
    environment: 'node',
    env: {
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
      JWT_SECRET: 'test-secret',
      DATABASE_URL: 'postgresql://oghub:oghub_secret@localhost:5432/oghub',
      REDIS_URL: 'redis://localhost:6379',
    },
    include: ['tests/**/*.test.ts', '**/*.test.ts'],
  },
});
