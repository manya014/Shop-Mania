const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const launchBrowser = require("./chrome");
const cron = require("node-cron");

let browserInstance = null;
let flipkartCache = {}; // 🔁 In-memory cache { query: [products] }

const getConfig = () => ({
  maxProducts: 16,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
  navigationTimeout: 60000,
  waitForSelectorTimeout: 10000,
  retryCount: 2
});

const initializeBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log("Launching browser...");
    browserInstance = await launchBrowser();
  }
  return browserInstance;
};

const autoScroll = async (page, maxScrolls = 5) => {
  await page.evaluate(async (maxScrolls) => {
    await new Promise((resolve) => {
      let scrolls = 0;
      const distance = 100;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        scrolls++;
        if (scrolls >= maxScrolls || (window.innerHeight + window.scrollY) >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }, maxScrolls);
};

const parseFlipkartProducts = ($, selector, config) => {
  const results = [];
  $(selector).each((index, el) => {
    if (results.length >= config.maxProducts) return false;

    try {
      const brand = $(el).find(".syl9yP").text().trim();
      const productName = $(el).find("a.WKTcLC").text().trim();
      const title = `${brand} ${productName}`;
      const relativeLink = $(el).find("a.WKTcLC").attr("href");
      const link = relativeLink ? `https://www.flipkart.com${relativeLink}` : "";
      const image = $(el).find("img._53J4C-").attr("src") || "";
      const priceText = $(el).find(".Nx9bqj").first().text().replace(/[₹,]/g, "").trim();
      const price = parseInt(priceText, 10) || 0;

      if (title && !isNaN(price) && price > 0) {
        results.push({
          title,
          image_url: image || 'https://placehold.co/150x150/e0e0e0/ffffff?text=No+Image',
          link,
          price: `₹${price}`,
          description: title,
          platform: "flipkart"
        });
      }
    } catch (error) {
      console.error(`Error parsing Flipkart product #${index + 1}:`, error.message);
    }
  });
  return results;
};

const scrapeFlipkart = async (query, config) => {
  console.log("Scraping Flipkart for:", query);
  const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;

  let products = [];
  let page;

  for (let attempts = 0; attempts < config.retryCount; attempts++) {
    try {
      if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await launchBrowser();
      }

      page = await browserInstance.newPage();
      await page.setUserAgent(config.userAgent);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (["stylesheet", "font"].includes(req.resourceType())) req.abort();
        else req.continue();
      });

      await page.goto(searchUrl, {
        waitUntil: ['domcontentloaded', 'networkidle0'],
        timeout: config.navigationTimeout
      });

      // Try to close popup
      try {
        await page.waitForSelector("._2KpZ6l._2doB4z", { timeout: 5000 });
        await page.click("._2KpZ6l._2doB4z");
      } catch (_) {}

      await page.waitForSelector("div[data-id]", { timeout: config.waitForSelectorTimeout });
      await autoScroll(page);
      const content = await page.content();
      const $ = cheerio.load(content);
      products = parseFlipkartProducts($, "div[data-id]", config);
      return products;

    } catch (err) {
      console.error(`Flipkart scrape error (Attempt ${attempts + 1}):`, err.message);
    } finally {
      if (page && !page.isClosed()) await page.close();
    }
  }
  return products;
};

// 🔁 Update cache for common queries every X minutes
const autoUpdateFlipkartCache = async () => {
  const config = getConfig();
  const queries = ["t-shirt", "shoes", "mobile"];
  console.log("⏱️ Updating Flipkart cache...");

  for (const query of queries) {
    try {
      const products = await scrapeFlipkart(query, config);
      flipkartCache[query] = products;
      console.log(`✅ Cached ${products.length} products for "${query}"`);
    } catch (err) {
      console.error(`❌ Failed to cache for ${query}:`, err.message);
    }
  }
};

// 🕒 Schedule job every 5 hours
cron.schedule('0 */5 * * *', autoUpdateFlipkartCache); // Every 5th hour
autoUpdateFlipkartCache(); // Run once on startup

// ✅ Public API to get cached data
const getFlipkartProductsFromCache = (query) => {
  return flipkartCache[query] || [];
};

module.exports = {
  getConfig,
  scrapeFlipkart,
  initializeBrowser, // ✅ This must be exported!
  getFlipkartProductsFromCache // if you're using cache
};

