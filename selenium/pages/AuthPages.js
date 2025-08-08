const { By, until } = require('selenium-webdriver');
const { waitForElement, navigateTo } = require('../config/baseConfig');

class RegistrationPage {
  constructor(driver) {
    this.driver = driver;
    this.nameField = By.name('text');
    this.emailField = By.name('email');
    this.passwordField = By.name('password');
    this.fileInput = By.id('file-input');
    this.submitButton = By.css("button[type='submit']");
  }
  
  async navigate() {
    await navigateTo(this.driver, '/sign-up');
  }
  
  async registerUser(name, email, password, avatarPath) {
    await this.navigate();
    
    // Fill in registration form
    const nameElement = await this.driver.findElement(this.nameField);
    await nameElement.sendKeys(name);
    
    const emailElement = await this.driver.findElement(this.emailField);
    await emailElement.sendKeys(email);
    
    const passwordElement = await this.driver.findElement(this.passwordField);
    await passwordElement.sendKeys(password);
    
    // Upload avatar if provided
    if (avatarPath) {
      const fileUpload = await this.driver.findElement(this.fileInput);
      await fileUpload.sendKeys(avatarPath);
    }
    
    // Submit the form
    const submitElement = await this.driver.findElement(this.submitButton);
    await submitElement.click();
    
    // Wait for registration to complete or notification to appear
    await this.driver.sleep(2000);
  }
  
  async isSuccessMessageDisplayed() {
    try {
      // Wait for toast notification with longer timeout
      await this.driver.sleep(2000); // Give time for toast to appear
      await this.driver.wait(until.elementLocated(By.className('Toastify')), 8000);
      
      // Find all toast elements
      const toastElements = await this.driver.findElements(By.css('.Toastify__toast-body'));
      
      if (toastElements.length === 0) {
        console.log("No toast messages found");
        return false;
      }
      
      // Check each toast element for success message
      for (const toastElement of toastElements) {
        const toastText = await toastElement.getText();
        console.log("Toast message:", toastText);
        
        // Check for common success message texts
        if (
          toastText.includes('check your email') || 
          toastText.includes('success') ||
          toastText.includes('Success') ||
          toastText.includes('registered') ||
          toastText.includes('created')
        ) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking for success message:", error);
      return false;
    }
  }
}

class LoginPage {
  constructor(driver) {
    this.driver = driver;
    this.emailField = By.name('email');
    this.passwordField = By.name('password');
    this.submitButton = By.css("button[type='submit']");
    this.forgotPasswordLink = By.css("a.font-medium.text-blue-600");
    this.signUpLink = By.css("a.text-blue-600");
  }
  
  async navigate() {
    await navigateTo(this.driver, '/login');
  }
  
  async login(email, password) {
    await this.navigate();
    
    // Wait for elements and interact with them
    const emailElement = await this.driver.findElement(this.emailField);
    await emailElement.sendKeys(email);
    
    const passwordElement = await this.driver.findElement(this.passwordField);
    await passwordElement.sendKeys(password);
    
    const submitElement = await this.driver.findElement(this.submitButton);
    await submitElement.click();
    
    // Wait for login to complete
    await this.driver.sleep(2000);
  }
  
  async goToSignUpPage() {
    const signUpElement = await this.driver.findElement(this.signUpLink);
    await signUpElement.click();
  }
  
  async goToForgotPassword() {
    const forgotPasswordElement = await this.driver.findElement(this.forgotPasswordLink);
    await forgotPasswordElement.click();
  }
  
  async isLoggedIn() {
    try {
      await this.driver.wait(until.urlContains('/'), 5000);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async getLoginError() {
    try {
      await this.driver.wait(until.elementLocated(By.className('Toastify__toast-body')), 5000);
      const toastElement = await this.driver.findElement(By.className('Toastify__toast-body'));
      return await toastElement.getText();
    } catch (error) {
      return null;
    }
  }
}

class ProfilePage {
  constructor(driver) {
    this.driver = driver;
    this.logoutButton = By.css('.single_item');
    this.userNameDisplay = By.css('.w-full.flex.items-center.justify-between');
  }
  
  async navigate() {
    await navigateTo(this.driver, '/profile');
  }
  
  async logout() {
    await this.navigate();
    
    // Wait for elements and interact with them
    await this.driver.sleep(1000); // Give time for profile page to load
    const logoutElement = await this.driver.findElement(this.logoutButton);
    await logoutElement.click();
    
    await this.driver.sleep(2000);
  }
  
  async getUserName() {
    const userElement = await this.driver.findElement(this.userNameDisplay);
    return await userElement.getText();
  }
}

module.exports = {
  RegistrationPage,
  LoginPage,
  ProfilePage
};
