const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Setting up ChromeDriver...');

try {
  // Get Chrome version
  let chromeVersion;
  
  if (process.platform === 'win32') {
    try {
      // Try Windows registry first
      const result = execSync('wmic datafile where name="C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe" get Version /value').toString();
      const versionMatch = result.match(/Version=(\d+)\.\d+\.\d+\.\d+/);
      if (versionMatch) {
        chromeVersion = versionMatch[1]; // Major version
      }
    } catch (error) {
      console.log('Could not get Chrome version from registry, trying alternative method');
      // Alternative method - try to get version directly from Chrome
      const result = execSync('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --version').toString();
      const versionMatch = result.match(/Chrome\s+(\d+)\.\d+\.\d+\.\d+/);
      if (versionMatch) {
        chromeVersion = versionMatch[1]; // Major version
      }
    }
  } else if (process.platform === 'darwin') {
    const result = execSync('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version').toString();
    const versionMatch = result.match(/Chrome\s+(\d+)\.\d+\.\d+\.\d+/);
    if (versionMatch) {
      chromeVersion = versionMatch[1]; // Major version
    }
  } else {
    const result = execSync('google-chrome --version').toString();
    const versionMatch = result.match(/Chrome\s+(\d+)\.\d+\.\d+\.\d+/);
    if (versionMatch) {
      chromeVersion = versionMatch[1]; // Major version
    }
  }

  if (chromeVersion) {
    console.log(`Detected Chrome version: ${chromeVersion}`);
    
    // Update package.json with the correct ChromeDriver version
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Update chromedriver version in dependencies
    packageJson.dependencies.chromedriver = `^${chromeVersion}.0.0`;
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`Updated package.json with ChromeDriver version ${chromeVersion}`);
    
    // Install the updated dependencies
    console.log('Running npm install to update ChromeDriver...');
    execSync('npm install', { stdio: 'inherit' });
    
    console.log('ChromeDriver setup complete!');
  } else {
    console.error('Could not determine Chrome version. Please install chromedriver manually that matches your Chrome version.');
  }
} catch (error) {
  console.error('Error during ChromeDriver setup:', error);
}
