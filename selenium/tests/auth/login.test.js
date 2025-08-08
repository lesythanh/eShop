const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { setupDriver } = require('../../config/baseConfig');
const { LoginPage, ProfilePage } = require('../../pages/AuthPages');

describe('User Login and Logout', function() {
  let driver;
  let loginPage;
  let profilePage;
  
  // Use a test user that already exists in your system
  const testUser = {
    email: 'htkhoi7112003@gmail.com', 
    password: 'Htkhoi71103'            
  };
  
  before(async function() {
    driver = await setupDriver();
    loginPage = new LoginPage(driver);
    profilePage = new ProfilePage(driver);
  });
  
  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });
  
  it('should allow a user to login with valid credentials', async function() {
    await loginPage.login(testUser.email, testUser.password);
    
    const isLoggedIn = await loginPage.isLoggedIn();
    expect(isLoggedIn).to.be.true;
  });
  
  it('should show error with invalid credentials', async function() {
    // First logout if logged in
    try {
      await profilePage.logout();
    } catch (error) {
      // Ignore errors if not logged in
    }
    
    // Try login with wrong password
    await loginPage.login(testUser.email, 'wrongpassword');
    
    const errorMessage = await loginPage.getLoginError();
    expect(errorMessage).to.include('Please provide the correct information');
  });
  
  it('should allow a user to logout', async function() {
    // First login
    await loginPage.login(testUser.email, testUser.password);
    
    // Then logout
    await profilePage.logout();
    
    // Verify we're back to the login page or home page for non-authenticated users
    await driver.sleep(1000); // Wait for redirect
    const currentUrl = await driver.getCurrentUrl();
    expect(currentUrl).to.include('/login');
  });
});
