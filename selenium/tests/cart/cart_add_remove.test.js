const { Builder, By, until, Key } = require('selenium-webdriver');
const { expect } = require('chai');
const { createDriver, goToUrl, login, waitAndClick, waitForElementVisible } = require('../../utils/testUtils');
require('dotenv').config();

describe('Cart - Add and Remove Products Tests', function() {
  let driver;
  
  const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'htkhoi7112003@gmail.com';
  const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'Htkhoi71103';

  before(async function() {
    driver = await createDriver();
  });

  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });

  beforeEach(async function() {
    await goToUrl(driver, '/');
    // Login before each test if needed
    try {
      await login(driver, TEST_USER_EMAIL, TEST_USER_PASSWORD);
    } catch (error) {
      console.log('User might already be logged in or login not needed');
    }
  });

  it('should add a product to the cart from product listing page', async function() {
    // Navigate to the products page
    await goToUrl(driver, '/products');
    
    // Wait for products to load
    await driver.sleep(2000);
    
    // Find a product card - updated selector to match the actual DOM
    const productCards = await driver.findElements(By.css('.w-full.bg-white.rounded-lg.shadow-sm.p-3.relative'));
    expect(productCards.length).to.be.above(0, 'No product cards found on page');
    
    // Get initial cart count if it exists
    let initialCartCount = 0;
    try {
      const cartCountElement = await driver.findElement(By.css('.absolute.right-0.top-0.rounded-full'));
      initialCartCount = parseInt(await cartCountElement.getText()) || 0;
    } catch (error) {
      // No items in cart yet, count is 0
      initialCartCount = 0;
    }
    
    // Click add to cart button on the first product
    try {
      // Scroll to make sure the element is visible
      await driver.executeScript("arguments[0].scrollIntoView(true);", productCards[0]);
      
      // Find and click the add to cart icon within the product card
      const addToCartButton = await productCards[0].findElement(By.css('.absolute.right-2.top-24'));
      await addToCartButton.click();
      
      // Wait for the toast notification
      await driver.wait(until.elementLocated(By.className('Toastify__toast-body')), 5000);
    } catch (error) {
      console.log("Error clicking add to cart button: ", error);
      throw error;
    }
    
    // Verify cart count increased
    await driver.sleep(1000);
    try {
      const cartCountElement = await driver.findElement(By.css('.absolute.right-0.top-0.rounded-full'));
      const newCartCount = parseInt(await cartCountElement.getText());
      expect(newCartCount).to.be.at.least(initialCartCount + 1);
    } catch (error) {
      throw new Error('Failed to verify cart count after adding product');
    }
  });

  it('should add a product to the cart from product details page', async function() {
    // Navigate to the products page
    await goToUrl(driver, '/products');
    
    // Wait for products to load
    await driver.sleep(2000);
    
    // Find and click on a product to go to its details page
    const productCards = await driver.findElements(By.css('.w-full.bg-white.rounded-lg.shadow-sm.p-3.relative'));
    expect(productCards.length).to.be.above(0, 'No product cards found on page');
    
    // Click on the product image or name to navigate to details page
    const productLink = await productCards[0].findElement(By.css('img.w-full.h-\\[170px\\].object-contain'));
    await productLink.click();
    
    // Wait for product details page to load
    await driver.sleep(2000);
    
    // Get initial cart count if available
    let initialCartCount = 0;
    try {
      const cartCountElement = await driver.findElement(By.css('.absolute.right-0.top-0.rounded-full'));
      initialCartCount = parseInt(await cartCountElement.getText()) || 0;
    } catch (error) {
      initialCartCount = 0;
    }
    
    // Click add to cart button on the product details page
    try {
      // Find the "Add to cart" button
      const addToCartButton = await driver.findElement(By.xpath("//span[contains(text(), 'Add to cart')]"));
      await addToCartButton.click();
      
      // Wait for the toast notification
      await driver.wait(until.elementLocated(By.className('Toastify__toast-body')), 5000);
    } catch (error) {
      console.log("Error clicking add to cart button on details page: ", error);
      throw error;
    }
    
    // Verify cart count increased
    await driver.sleep(1000);
    try {
      const cartCountElement = await driver.findElement(By.css('.absolute.right-0.top-0.rounded-full'));
      const newCartCount = parseInt(await cartCountElement.getText());
      expect(newCartCount).to.be.at.least(initialCartCount + 1);
    } catch (error) {
      throw new Error('Failed to verify cart count after adding product from details page');
    }
  });

  it('should remove a product from the cart', async function() {
    // First, make sure there's at least one product in the cart
    await goToUrl(driver, '/products');
    await driver.sleep(2000);
    
    // Find a product card
    const productCards = await driver.findElements(By.css('.w-full.bg-white.rounded-lg.shadow-sm.p-3.relative'));
    expect(productCards.length).to.be.above(0, 'No product cards found on page');
    
    // Click add to cart button on the first product if not already in cart
    try {
      const addToCartButton = await productCards[0].findElement(By.css('.absolute.right-2.top-24'));
      await addToCartButton.click();
    } catch (error) {
      console.log("Error adding product to cart: ", error);
    }
    
    // Wait a moment for the cart to update
    await driver.sleep(2000);
    
    // Click on the cart icon to open the cart
    try {
      // Find and click the cart icon in the header
      const cartIcon = await driver.findElement(By.css('.relative.cursor-pointer'));
      await cartIcon.click();
    } catch (error) {
      console.log("Error clicking cart icon: ", error);
      throw error;
    }
    
    // Wait for cart sidebar to open
    await driver.sleep(2000);
    
    // Check if there are items in the cart
    const cartItems = await driver.findElements(By.css('.border-b.p-4'));
    
    if (cartItems.length > 0) {
      // Get the number of items before removal
      const initialCartItems = cartItems.length;
      
      // Find and click the remove (X) button for the first item
      try {
        const removeButton = await cartItems[0].findElement(By.css('svg.cursor-pointer'));
        await removeButton.click();
      } catch (error) {
        console.log("Error clicking remove button: ", error);
        // Try an alternative approach
        const removeButton = await cartItems[0].findElement(By.xpath(".//svg[contains(@class, 'cursor-pointer')]"));
        await removeButton.click();
      }
      
      // Wait for cart to update
      await driver.sleep(2000);
      
      // Get updated items count
      const updatedCartItems = await driver.findElements(By.css('.border-b.p-4'));
      
      // Verify an item was removed
      expect(updatedCartItems.length).to.be.lessThan(initialCartItems);
    } else {
      throw new Error('No items in cart to remove');
    }
  });
});
