// Plays one AI test match in headless Chromium: node ai_match.js <black> <white> [base URL] [result file]
// The page (?match=black,white) plays both sides by itself and reports the game to the live stats page; this script only
// waits for window.MATCH_RESULT, logs progress and writes the result as JSON.
const { chromium } = require("playwright");
const [black, white, base = "http://localhost:8000", out = "match-result.json"] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on("pageerror", e => console.log("page error:", e.message));
  page.on("console", m => { if (m.type() === "error" || /warmup|bench|failed/i.test(m.text())) console.log("console:", m.text().slice(0, 300)); });
  page.on("dialog", d => d.dismiss());
  await page.goto(`${base}/?boss&match=${black},${white}`);
  const t0 = Date.now();
  let result = null;
  while (!result) {
    await page.waitForTimeout(60000);
    result = await page.evaluate(() => window.MATCH_RESULT || null);
    const st = await page.evaluate(() => { const s = document.getElementById("status"); return s ? s.textContent.replace(/\s+/g, " ").slice(0, 80) : ""; });
    console.log(`${Math.round((Date.now() - t0) / 60000)} min · ${st}`);
  }
  console.log("RESULT", JSON.stringify(result));
  require("fs").writeFileSync(out, JSON.stringify(result));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
