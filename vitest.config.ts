import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './vitest.setup.ts',
        css: true,
        reporters: ['verbose', 'html', 'json'],
        exclude: ['node_modules', 'e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules', 'e2e/**', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'postcss.config.js', 'tailwind.config.js', 'src/vite-env.d.ts', '**/*.d.ts', 'test-results/**', 'playwright-report/**'],
        },
    },
});
