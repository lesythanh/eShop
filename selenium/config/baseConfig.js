require('dotenv').config();
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

// Import chromedriver to register it with selenium
require('chromedriver');

// Base URL for testing
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Setup driver with common configuration
async function setupDriver() {
  try {
    console.log("Setting up Chrome driver...");
    
    const options = new chrome.Options();
    
    // Uncomment the line below to run tests headless
    // options.addArguments('--headless=new');
    
    options.addArguments('--start-maximized');
    options.addArguments('--disable-notifications');
    options.addArguments('--disable-extensions');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    return driver;
  } catch (error) {
    console.error('Error setting up WebDriver:', error);
    throw error;
  }
}

// Common actions
async function navigateTo(driver, path) {
  await driver.get(`${BASE_URL}${path}`);
}

// Utility function to wait for element and get it
async function waitForElement(driver, locator, timeout = 10000) {
  const { until, By } = require('selenium-webdriver');
  
  if (typeof locator === 'string') {
    locator = By.css(locator);
  }
  
  await driver.wait(until.elementLocated(locator), timeout);
  return await driver.findElement(locator);
}

module.exports = {
  BASE_URL,
  setupDriver,
  navigateTo,
  waitForElement
};
