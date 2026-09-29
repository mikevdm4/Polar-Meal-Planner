// Test-only stand-in for tesseract.js, aliased in tests/vite.test.config.js. Real OCR needs a Web Worker,
// which the smoke test's simulated browser (jsdom) can't run — everything else in the flow (the UI, the
// parsing logic in labelParser.js, confirming, logging) is exercised for real.
export async function createWorker() {
  return {
    setParameters: async () => {},
    recognize: async () => ({
      data: {
        confidence: 88,
        text: "Nutrition\nTypical values Per 100g Per 30g serving %RI*\nEnergy 1590kJ/378kcal 477kJ/113kcal 6%\nFat 5.19 1.59 2%\nCarbohydrate 699 219g 8%\nProtein 8.39 2.59 5%",
      },
    }),
    terminate: async () => {},
  };
}
