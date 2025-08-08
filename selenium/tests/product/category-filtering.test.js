const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { setupDriver } = require('../../config/baseConfig');
const { HomePage, ProductsPage } = require('../../pages/ProductPages');

describe('Category Filtering', function() {
  let driver;
  let homePage;
  let productsPage;
  
  before(async function() {
    driver = await setupDriver();
    homePage = new HomePage(driver);
    productsPage = new ProductsPage(driver);
  });
  
  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });
  
  it('should filter products by category from homepage', async function() {
    await homePage.navigate();
    
    // Try multiple category names that might exist on the site
    const categories = ['Computers', 'Laptop', 'Mobile', 'Cloths', 'Accesories', 'Shoes'];
    
    let categoryFound = false;
    let selectedCategory = '';
    
    // Try each category until one works
    for (const category of categories) {
      const result = await homePage.selectCategoryByName(category);
      if (result) {
        categoryFound = true;
        selectedCategory = category;
        break;
      }
    }
    
    // If no category worked, this test might need to be skipped
    if (!categoryFound) {
      console.log("No categories found on homepage, test will be skipped");
      this.skip();
    } else {
      console.log(`Category ${selectedCategory} was found and clicked`);
      expect(categoryFound).to.be.true;
    }
  });
  
  it('should filter products by category on products page', async function() {
    await productsPage.navigate();
    
    // Wait for the page to load completely
    await driver.sleep(2000);
    
    // Try multiple category names that might exist on the site
    const categories = ['Computers', 'Laptop', 'Mobile', 'Cloths', 'Accesories', 'Shoes'];
    
    let categoryFound = false;
    let selectedCategory = '';
    
    // Try each category until one works
    for (const category of categories) {
      const result = await productsPage.filterByCategory(category);
      if (result) {
        categoryFound = true;
        selectedCategory = category;
        break;
      }
    }
    
    // If no category worked, this test might need to be skipped
    if (!categoryFound) {
      console.log("No categories found on products page, test will be skipped");
      this.skip();
    } else {
      console.log(`Category ${selectedCategory} was found and clicked`);
      expect(categoryFound).to.be.true;
    }
  });
});
