// chrome.js
const puppeteer = require('puppeteer-extra'); // Use puppeteer-extra
const StealthPlugin = require('puppeteer-extra-plugin-stealth'); // Import the stealth plugin
const fs = require('fs');

// Add and use the stealth plugin
puppeteer.use(StealthPlugin());

async function findChrome() {
  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/opt/render/project/.render/chrome/opt/google/chrome/',
    '/path/to/your/chrome/executable', // Keep this as a general fallback for custom paths
    '/opt/render/.cache/puppeteer'
  ];

  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      console.log(`✓ Found Chrome at: ${path}`);
      return path;
    }
  }

  // Fallback to Puppeteer's bundled Chromium
  const fallback = puppeteer.executablePath();
  console.log(`ℹ Using Puppeteer's bundled Chromium: ${fallback}`);
  return fallback;
}

const launchBrowser = async () => {
  try {
    const executablePath = await findChrome();

    const browser = await puppeteer.launch({
      headless: 'new', // or true if 'new' fails in your env
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    console.log("✅ Browser launched successfully.");
    return browser;
  } catch (err) {
    console.error("❌ Failed to launch browser:", err.message);
    throw err; // rethrow so server.js knows
  }
};


module.exports = launchBrowser;
