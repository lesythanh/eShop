const { Builder, By, until, Key } = require('selenium-webdriver');
const { expect } = require('chai');
const { createDriver, goToUrl, login, waitAndClick, waitForElementVisible } = require('../../utils/testUtils');
require('dotenv').config();

describe('Cart - Checkout Process Tests', function() {
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
    // Login before each test
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
      
      // Wait for the toast notification to disappear
      await driver.wait(until.elementLocated(By.className('Toastify__toast-body')), 5000);
      await driver.sleep(2000);
    } catch (error) {
      console.log("Error adding product to cart: ", error);
      throw error;
    }
  }

  it('should display correct items and totals in the checkout page', async function() {
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
    
    // Get the number of items in the cart
    const cartItems = await driver.findElements(By.css('.border-b.p-4'));
    const cartItemsCount = cartItems.length;
    
    // Get the total price displayed in the cart
    try {
      const checkoutButton = await driver.findElement(By.xpath("//h1[contains(@class, 'text-[#fff]') and contains(@class, 'text-[18px]') and contains(@class, 'font-[600]')]"));
      const cartTotalText = await checkoutButton.getText();
      const cartTotalMatch = cartTotalText.match(/USD\$(\d+(\.\d+)?)/);
      
      if (!cartTotalMatch) {
        throw new Error(`Could not parse cart total from: ${cartTotalText}`);
      }
      
      const cartTotal = parseFloat(cartTotalMatch[1]);
      
      // Click the checkout button
      await checkoutButton.click();
      
      // Wait for checkout page to load
      await driver.wait(until.urlContains('/checkout'), 5000);
      
      // Get the subtotal from the checkout page
      const subtotalText = await driver.findElement(By.xpath("//h3[contains(text(), 'subtotal:')]/following-sibling::h5")).getText();
      const subtotal = parseFloat(subtotalText.replace('$', ''));
      
      // Get the shipping cost
      const shippingText = await driver.findElement(By.xpath("//h3[contains(text(), 'shipping:')]/following-sibling::h5")).getText();
      const shipping = parseFloat(shippingText.replace('$', ''));
      
      // Get the final total
      const totalElement = await driver.findElement(By.xpath("//h5[contains(@class, 'text-[18px]') and contains(@class, 'font-[600]') and contains(@class, 'text-end')]"));
      const totalText = await totalElement.getText();
      const total = parseFloat(totalText.replace('$', ''));
      
      // Verify that subtotal + shipping approximately equals the total (allowing for small rounding differences)
      const calculatedTotal = (subtotal + shipping).toFixed(2);
      const displayedTotal = total.toFixed(2);
      expect(Math.abs(parseFloat(calculatedTotal) - parseFloat(displayedTotal))).to.be.lessThan(0.1, 'Total price calculation is incorrect');
    } catch (error) {
      console.log("Error verifying checkout totals:", error);
      throw error;
    }
  });

  it('should allow filling shipping address in checkout page', async function() {
    // Navigate to checkout page
    await goToUrl(driver, '/checkout');
    await driver.sleep(1000);
    
    // Fill out the address form
    // First clear any existing values
    try {
      const addressFields = await driver.findElements(By.css('input[type="address"]'));
      
      if (addressFields.length >= 2) {
        // Clear and fill first address field
        await addressFields[0].clear();
        await addressFields[0].sendKeys('1234 Test Avenue');
        
        // Address 2
        await addressFields[1].clear();
        await addressFields[1].sendKeys('Suite 100');
        
        // Zip code
        const zipCodeField = await driver.findElement(By.css('input[type="number"][placeholder=""]'));
        await zipCodeField.clear();
        await zipCodeField.sendKeys('90210');
        
        // Country
        const countrySelect = await driver.findElement(By.xpath("//select[contains(@class, 'border') and contains(@class, 'h-[40px]')]"));
        await countrySelect.click();
        await driver.sleep(500);
        
        // Select US
        const usOption = await driver.findElement(By.xpath("//option[@value='US']"));
        await usOption.click();
        
        // Wait for city options to populate
        await driver.sleep(1000);
        
        // City/State - second select element
        const selectElements = await driver.findElements(By.xpath("//select[contains(@class, 'border') and contains(@class, 'h-[40px]')]"));
        if (selectElements.length > 1) {
          await selectElements[1].click();
          await driver.sleep(500);
          
          // Select first non-empty option
          const cityOptions = await selectElements[1].findElements(By.xpath("./option[not(@value='')]"));
          if (cityOptions.length > 0) {
            await cityOptions[0].click();
          }
        }
        
        // Verify the Go to Payment button is enabled
        const paymentButton = await driver.findElement(By.xpath("//div[contains(@class, 'mt-10') and .//h5[contains(text(), 'Go to Payment')]]"));
        const isEnabled = await driver.executeScript("return arguments[0].classList.contains('opacity-50') === false;", paymentButton);
        expect(isEnabled).to.be.true;
      } else {
        console.log("Address fields not found or fewer than expected");
      }
    } catch (error) {
      console.error('Error in address form filling:', error);
      throw error;
    }
  });

  it('should show validation errors for missing shipping information', async function() {
    // Navigate to checkout page
    await goToUrl(driver, '/checkout');
    await driver.sleep(1000);
    
    // Try to clear address fields if they exist
    try {
      // Clear all address fields
      const addressFields = await driver.findElements(By.css('input[type="address"]'));
      for (const field of addressFields) {
        await field.clear();
      }
      
      // Clear zip code if it exists
      try {
        const zipCodeField = await driver.findElement(By.css('input[type="number"][placeholder=""]'));
        await zipCodeField.clear();
      } catch (error) {
        console.log("Zip code field not found or already empty");
      }
      
      // Reset country and city selections if possible
      try {
        const selects = await driver.findElements(By.css('select.border.h-\\[40px\\]'));
        for (const select of selects) {
          await select.click();
          await driver.sleep(500);
          const firstOption = await select.findElement(By.css('option:first-child'));
          await firstOption.click();
        }
      } catch (error) {
        console.log("Could not reset dropdown selections");
      }
      
      // Click the Go to Payment button
      const paymentButton = await driver.findElement(By.xpath("//div[contains(@class, 'mt-10') and .//h5[contains(text(), 'Go to Payment')]]"));
      await paymentButton.click();
      
      // Wait for toast error message
      await driver.sleep(1000);
      try {
        const toastMessage = await driver.wait(
          until.elementLocated(By.className('Toastify__toast-body')), 
          5000
        );
        const toastText = await toastMessage.getText();
        
        // Check for address-related error message
        const errorKeywords = ['address', 'delivery', 'shipping', 'please'];
        const hasAddressError = errorKeywords.some(keyword => 
          toastText.toLowerCase().includes(keyword)
        );
        
        expect(hasAddressError).to.be.true;
      } catch (error) {
        console.log("Toast message not found:", error);
        // Alternative check: verify we're still on checkout page
        const currentUrl = await driver.getCurrentUrl();
        expect(currentUrl).to.include('/checkout');
      }
    } catch (error) {
      console.log("Error in validation test:", error);
      throw error;
    }
    
    // Verify we're still on the checkout page
    const currentUrl = await driver.getCurrentUrl();
    expect(currentUrl).to.include('/checkout');
  });
});
