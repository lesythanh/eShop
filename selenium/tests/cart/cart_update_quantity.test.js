const { Builder, By, until } = require('selenium-webdriver');
const { expect } = require('chai');
const { createDriver, goToUrl, login, waitAndClick, waitForElementVisible } = require('../../utils/testUtils');
require('dotenv').config();

describe('Cart - Update Product Quantities Tests', function() {
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
    
    // Ensure there's at least one product in the cart
    await addProductIfCartEmpty();
  });
  
  async function addProductIfCartEmpty() {
    // Check if cart is empty by looking at the cart icon
    try {
      // Try to find the cart count badge
      const cartCountElements = await driver.findElements(By.css('.absolute.right-0.top-0.rounded-full'));
      if (cartCountElements.length > 0) {
        const cartCount = parseInt(await cartCountElements[0].getText());
        if (cartCount > 0) return; // Cart already has items
      }
    } catch (error) {
      // No cart count element or error parsing it, assume cart is empty
      console.log("Error checking cart count: ", error);
    }
    
    // Add a product to the cart
    await goToUrl(driver, '/products');
    await driver.sleep(2000);
    
    // Find a product card
    const productCards = await driver.findElements(By.css('.w-full.bg-white.rounded-lg.shadow-sm.p-3.relative'));
    expect(productCards.length).to.be.above(0, 'No product cards found on page');
    
    // Click add to cart button on the first product
    try {
      const addToCartButton = await productCards[0].findElement(By.css('.absolute.right-2.top-24'));
      await addToCartButton.click();
      
      // Wait for the toast notification
      await driver.wait(until.elementLocated(By.className('Toastify__toast-body')), 5000);
      await driver.sleep(1000);
    } catch (error) {
      console.log("Error adding product to cart: ", error);
      throw error;
    }
  }

  it('should increase product quantity in the cart', async function() {
    // Open the cart
    try {
      // Find and click the cart icon
      const cartIcons = await driver.findElements(By.css('.relative.cursor-pointer'));
      let cartIcon;
      for (const icon of cartIcons) {
        // Additional check to ensure we're clicking the right icon
        try {
          await icon.findElement(By.css('svg[size="30"]'));
          cartIcon = icon;
          break;
        } catch (e) {
          // Not the right icon, continue to the next one
        }
      }
      
      if (!cartIcon) {
        // Fallback method
        cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      }
      
      await cartIcon.click();
    } catch (error) {
      console.log("Error clicking cart icon: ", error);
      // Alternative approach using JavaScript click
      const cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      await driver.executeScript("arguments[0].click();", cartIcon);
    }
    
    // Wait for cart sidebar to open
    await driver.sleep(2000);
    
    // Find the first product in the cart
    const cartItems = await driver.findElements(By.css('.border-b.p-4'));
    expect(cartItems.length).to.be.above(0, 'No items in the cart');
    
    // Get the current quantity
    const quantityElement = await cartItems[0].findElement(By.css('span.pl-\\[10px\\]'));
    const initialQuantity = parseInt(await quantityElement.getText());
    
    // Find and click the increment button
    const incrementButton = await cartItems[0].findElement(By.xpath(".//div[contains(@class, 'bg-[#e44343]')]"));
    await incrementButton.click();
    
    // Wait for quantity to update
    await driver.sleep(2000);
    
    // Get the updated quantity
    const updatedQuantityElement = await cartItems[0].findElement(By.css('span.pl-\\[10px\\]'));
    const updatedQuantity = parseInt(await updatedQuantityElement.getText());
    
    // Verify quantity increased
    expect(updatedQuantity).to.equal(initialQuantity + 1, 'Quantity did not increase correctly');
    
    // Verify total price updated
    const totalPriceElement = await cartItems[0].findElement(By.xpath(".//h4[contains(@class, 'text-[#d02222]')]"));
    const totalPriceText = await totalPriceElement.getText();
    expect(totalPriceText).to.include('US$'); // Verify format includes currency symbol
  });

  it('should decrease product quantity in the cart', async function() {
    // Open the cart
    try {
      // Find and click the cart icon
      const cartIcons = await driver.findElements(By.css('.relative.cursor-pointer'));
      let cartIcon;
      for (const icon of cartIcons) {
        try {
          await icon.findElement(By.css('svg[size="30"]'));
          cartIcon = icon;
          break;
        } catch (e) {
          // Not the right icon, continue to the next one
        }
      }
      
      if (!cartIcon) {
        // Fallback method
        cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      }
      
      await cartIcon.click();
    } catch (error) {
      console.log("Error clicking cart icon: ", error);
      const cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      await driver.executeScript("arguments[0].click();", cartIcon);
    }
    
    // Wait for cart sidebar to open
    await driver.sleep(2000);
    
    // Find the first product in the cart
    const cartItems = await driver.findElements(By.css('.border-b.p-4'));
    expect(cartItems.length).to.be.above(0, 'No items in the cart');
    
    // Get the current quantity
    const quantityElement = await cartItems[0].findElement(By.css('span.pl-\\[10px\\]'));
    const initialQuantity = parseInt(await quantityElement.getText());
    
    // Only proceed with test if quantity is greater than 1
    if (initialQuantity > 1) {
      // Find and click the decrement button
      const decrementButton = await cartItems[0].findElement(By.xpath(".//div[contains(@class, 'bg-[#a7abb14f]')]"));
      await decrementButton.click();
      
      // Wait for quantity to update
      await driver.sleep(2000);
      
      // Get the updated quantity
      const updatedQuantityElement = await cartItems[0].findElement(By.css('span.pl-\\[10px\\]'));
      const updatedQuantity = parseInt(await updatedQuantityElement.getText());
      
      // Verify quantity decreased
      expect(updatedQuantity).to.equal(initialQuantity - 1, 'Quantity did not decrease correctly');
    } else {
      // Increment first so we can then decrement
      const incrementButton = await cartItems[0].findElement(By.xpath(".//div[contains(@class, 'bg-[#e44343]')]"));
      await incrementButton.click();
      await driver.sleep(1000);
      
      // Then decrement
      const decrementButton = await cartItems[0].findElement(By.xpath(".//div[contains(@class, 'bg-[#a7abb14f]')]"));
      await decrementButton.click();
      await driver.sleep(1000);
      
      // Verify quantity remains at least 1
      const updatedQuantityElement = await cartItems[0].findElement(By.css('span.pl-\\[10px\\]'));
      const updatedQuantity = parseInt(await updatedQuantityElement.getText());
      expect(updatedQuantity).to.be.at.least(1, 'Quantity should not go below 1');
    }
  });

  it('should update the cart total when quantity changes', async function() {
    // Open the cart
    try {
      // Find and click the cart icon
      const cartIcons = await driver.findElements(By.css('.relative.cursor-pointer'));
      let cartIcon;
      for (const icon of cartIcons) {
        try {
          await icon.findElement(By.css('svg[size="30"]'));
          cartIcon = icon;
          break;
        } catch (e) {
          // Not the right icon, continue to the next one
        }
      }
      
      if (!cartIcon) {
        // Fallback method
        cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      }
      
      await cartIcon.click();
    } catch (error) {
      console.log("Error clicking cart icon: ", error);
      const cartIcon = await driver.findElement(By.xpath("//div[contains(@class, 'relative') and contains(@class, 'cursor-pointer')]"));
      await driver.executeScript("arguments[0].click();", cartIcon);
    }
    
    // Wait for cart sidebar to open
    await driver.sleep(2000);
    
    // Find the first product in the cart
    const cartItems = await driver.findElements(By.css('.border-b.p-4'));
    expect(cartItems.length).to.be.above(0, 'No items in the cart');
    
    // Get the initial total price
    const checkoutButton = await driver.findElement(By.xpath("//h1[contains(@class, 'text-[#fff]') and contains(@class, 'text-[18px]') and contains(@class, 'font-[600]')]"));
    const initialTotalText = await checkoutButton.getText();
    
    // Use regular expression to extract the price
    const initialTotalMatch = initialTotalText.match(/USD\$(\d+(\.\d+)?)/);
    if (!initialTotalMatch) {
      throw new Error(`Could not parse initial total price from: ${initialTotalText}`);
    }
    const initialTotal = parseFloat(initialTotalMatch[1]);
    
    // Increase quantity for the first product
    const incrementButton = await cartItems[0].findElement(By.xpath(".//div[contains(@class, 'bg-[#e44343]')]"));
    await incrementButton.click();
    
    // Wait for prices to update
    await driver.sleep(2000);
    
    // Get the updated total price
    const updatedCheckoutButton = await driver.findElement(By.xpath("//h1[contains(@class, 'text-[#fff]') and contains(@class, 'text-[18px]') and contains(@class, 'font-[600]')]"));
    const updatedTotalText = await updatedCheckoutButton.getText();
    
    // Use regular expression to extract the updated price
    const updatedTotalMatch = updatedTotalText.match(/USD\$(\d+(\.\d+)?)/);
    if (!updatedTotalMatch) {
      throw new Error(`Could not parse updated total price from: ${updatedTotalText}`);
    }
    const updatedTotal = parseFloat(updatedTotalMatch[1]);
    
    // Verify total price increased
    expect(updatedTotal).to.be.above(initialTotal, 'Cart total did not increase after quantity change');
  });
});
