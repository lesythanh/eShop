const faker = require('faker');
const { Builder, By, until } = require('selenium-webdriver');
require('chromedriver');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Generate a random user for testing
 * @returns {Object} User object with random data
 */
function generateRandomUser() {
  const firstName = faker.name.firstName();
  const lastName = faker.name.lastName();
  
  return {
    name: `${firstName} ${lastName}`,
    email: faker.internet.email(firstName, lastName, 'test.com').toLowerCase(),
    password: 'Test@123'  // Use fixed password for predictability
  };
}

// Create and configure the WebDriver
const createDriver = async () => {
  const driver = await new Builder()
    .forBrowser('chrome')
    .build();
  
  // Set implicit wait time
  await driver.manage().setTimeouts({ implicit: 10000 });
  // Maximize browser window
  await driver.manage().window().maximize();
  
  return driver;
};

// Navigate to a specific URL using the base URL
const goToUrl = async (driver, path) => {
  const url = `${BASE_URL}${path}`;
  await driver.get(url);
};

// Login function
const login = async (driver, email, password) => {
  await goToUrl(driver, '/login');
  
  // Fill in the login form
  await driver.findElement(By.name('email')).sendKeys(email);
  await driver.findElement(By.name('password')).sendKeys(password);
  
  // Submit the form
  const loginButton = await driver.findElement(By.css('button[type="submit"]'));
  await loginButton.click();
  
  // Wait for login to complete - either redirects or shows the user profile/avatar
  try {
    await driver.wait(
      until.elementLocated(By.css('img.w-[35px].h-[35px].rounded-full')), 
      5000
    );
  } catch (error) {
    // If we can't find the avatar, wait for a different indicator that login worked
    // For example, check if we're redirected to the home page
    await driver.wait(until.urlContains('/'), 5000);
  }
};

// Wait for an element to be clickable and then click it
const waitAndClick = async (driver, locator) => {
  const element = await driver.wait(until.elementLocated(locator), 10000);
  await driver.wait(until.elementIsVisible(element), 10000);
  await driver.wait(until.elementIsEnabled(element), 10000);
  await element.click();
  return element;
};

// Wait for an element to be visible
const waitForElementVisible = async (driver, locator) => {
  const element = await driver.wait(until.elementLocated(locator), 10000);
  await driver.wait(until.elementIsVisible(element), 10000);
  return element;
};

/**
 * Log in a user using the provided credentials
 * @param {WebDriver} driver - Selenium WebDriver instance
 * @param {String} email - User email
 * @param {String} password - User password
 */
async function loginUser(driver, email, password) {
  const { By } = require('selenium-webdriver');
  const { waitForElement, navigateTo } = require('../config/baseConfig');
  
  await navigateTo(driver, '/login');
  
  // Fill the login form
  await waitForElement(driver, By.name('email')).sendKeys(email);
  await waitForElement(driver, By.name('password')).sendKeys(password);
  
  // Submit the form
  await waitForElement(driver, "button[type='submit']").click();
  
  // Wait for login to complete
  await driver.sleep(2000);
}

/**
 * Logout the current user
 * @param {WebDriver} driver - Selenium WebDriver instance 
 */
async function logoutUser(driver) {
  const { By } = require('selenium-webdriver');
  const { waitForElement, navigateTo } = require('../config/baseConfig');
  
  // Navigate to profile
  await navigateTo(driver, '/profile');
  
  // Find and click the logout button
  await waitForElement(driver, '.single_item').click();
  
  // Wait for logout to complete
  await driver.sleep(2000);
}

module.exports = {
  generateRandomUser,
  createDriver,
  goToUrl,
  login,
  waitAndClick,
  waitForElementVisible,
  loginUser,
  logoutUser
};
