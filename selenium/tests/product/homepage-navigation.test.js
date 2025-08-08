const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { setupDriver } = require('../../config/baseConfig');
const { HomePage } = require('../../pages/ProductPages');

describe('Homepage Navigation', function() {
  let driver;
  let homePage;
  
  before(async function() {
    driver = await setupDriver();
    homePage = new HomePage(driver);
  });
  
  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });
  
  it('should load the homepage successfully', async function() {
    await homePage.navigate();
    
    // Check if products are displayed
    const productCount = await homePage.getProductCount();
    expect(productCount).to.be.greaterThan(0);
  });
  
  it('should display the best deals section', async function() {
    await homePage.navigate();
    
    const isBestDealsVisible = await homePage.isBestDealsVisible();
    expect(isBestDealsVisible).to.be.true;
  });
  
  it('should navigate to best selling page', async function() {
    await homePage.navigate();
    
    const isNavigated = await homePage.navigateToPage('bestSelling');
    expect(isNavigated).to.be.true;
  });
  
  it('should navigate to products page', async function() {
    await homePage.navigate();
    
    const isNavigated = await homePage.navigateToPage('products');
    expect(isNavigated).to.be.true;
  });
  
  it('should navigate to FAQ page', async function() {
    await homePage.navigate();
    
    const isNavigated = await homePage.navigateToPage('faq');
    expect(isNavigated).to.be.true;
  });
});
