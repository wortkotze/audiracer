<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1c3llqfS91P9pHhkJblsiif-dQllgGAND

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
   `npm run dev`

## Testing

### Unit Tests
Run unit tests using Vitest:
```bash
npm run test:unit
```
To generate an HTML report:
```bash
npm run test:unit:report
```

### E2E Tests
Run end-to-end tests using Playwright:
```bash
npm run test:e2e
```
To run E2E tests with UI mode:
```bash
npm run test:e2e:ui
```
