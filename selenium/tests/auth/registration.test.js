const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const path = require('path');
const { setupDriver } = require('../../config/baseConfig');
const { RegistrationPage } = require('../../pages/AuthPages');
const { generateRandomUser } = require('../../utils/testUtils');

describe('User Registration', function() {
  let driver;
  let registrationPage;
  let testUser;
  
  before(async function() {
    driver = await setupDriver();
    registrationPage = new RegistrationPage(driver);
    testUser = generateRandomUser();
  });
  
  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });
  
  it('should allow a new user to register', async function() {
    // Provide path to a test avatar image
    const avatarPath = path.resolve(__dirname, '../../test-data/test-avatar.png');
    
    // Perform registration with longer wait time for processing
    await registrationPage.registerUser(
      testUser.name,
      testUser.email,
      testUser.password,
      avatarPath
    );
    
    // Give more time for toast message to appear
    await driver.sleep(2000);
    
    // Verify success message
    const isSuccess = await registrationPage.isSuccessMessageDisplayed();
    expect(isSuccess).to.be.true;
  });
  
  it('should not allow registration with existing email', async function() {
    // Try to register with same email again
    await registrationPage.registerUser(
      testUser.name,
      testUser.email,
      testUser.password
    );
    
    // Verify error message
    const isSuccess = await registrationPage.isSuccessMessageDisplayed();
    expect(isSuccess).to.be.false;
  });
});
