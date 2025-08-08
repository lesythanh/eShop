const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { setupDriver } = require('../../config/baseConfig');
const { HomePage } = require('../../pages/ProductPages');

describe('Product Search', function() {
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
  
  it('should search for existing products', async function() {
    await homePage.navigate();
    
    // Search for a common product term like "shoes" or "laptop"
    const searchTerm = 'laptop';
    const hasResults = await homePage.searchProduct(searchTerm);
    
    expect(hasResults).to.be.true;
  });
  
  it('should handle search with no results', async function() {
    await homePage.navigate();
    
    // Search for a random string that should not match any products
    const randomSearch = `nonexistent${Math.random().toString(36).substring(2, 10)}`;
    const hasResults = await homePage.searchProduct(randomSearch);
    
    // This should either return false or an empty results set
    expect(hasResults).to.be.false;
  });
});
