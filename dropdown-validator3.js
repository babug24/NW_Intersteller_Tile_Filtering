const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

class CompleteDropdownTester {
  constructor() {
    this.driver = null;
    this.results = [];
    this.csvData = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.logDir = 'logs';
    this.errorLogPath = path.join(this.logDir, 'errors.log');
    this.validationLogPath = path.join(this.logDir, 'validation.log');
    this.executionLogPath = path.join(this.logDir, 'execution.log');
    this.executionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentTestContext = null;
    this.retryCounts = {
      navigation: 0,
      dropdownFinding: 0,
      dropdownOptions: 0,
      selection: 0,
      verification: 0
    };
    this.maxRetries = {
      navigation: 3,
      dropdownFinding: 2,
      dropdownOptions: 2,
      selection: 2,
      verification: 2,
      overall: 3
    };
    
    // Initialize log directory and files
    this.initializeLogging();
    // Setup console filtering to suppress Chrome internal warnings
    this.setupConsoleFiltering();
  }

  setupConsoleFiltering() {
    // Backup original console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Define messages to filter out (Chrome internal warnings)
    const filteredMessages = [
      'DEPRECATED_ENDPOINT',
      'Registration response error message',
      'google_apis',
      'GCM',
      'gcm',
      'engine\\registration_request',
      'ERROR:device_event_log',
      'ERROR:gpu_process_host',
      'ERROR:network_service',
      'ERROR:viz',
      'ERROR:angle_platform_impl',
      'ERROR:gl_surface',
      'ERROR:gpu\\command_buffer',
      'ERROR:gpu\\',
      'SharedImageManager',
      'ProduceMemory',
      'non-existent mailbox',
      'command_buffer\\service'
    ];
    
    // Helper function to check if message should be filtered
    const shouldFilter = (message) => {
      const msgStr = message.toString();
      return filteredMessages.some(filter => msgStr.includes(filter));
    };
    
    // Override console.log
    console.log = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      if (!shouldFilter(message)) {
        originalConsoleLog.apply(console, args);
      }
    };
    
    // Override console.error
    console.error = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      if (!shouldFilter(message)) {
        originalConsoleError.apply(console, args);
      } else {
        // Log filtered errors to file only (not console)
        const timestamp = new Date().toISOString();
        const filteredError = `[${timestamp}] [FILTERED_CHROME_ERROR] ${message}\n`;
        const logDir = 'logs';
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(path.join(logDir, 'chrome-errors.log'), filteredError);
      }
    };
    
    // Override console.warn
    console.warn = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      if (!shouldFilter(message)) {
        originalConsoleWarn.apply(console, args);
      }
    };
    
    this.logValidation('Console filtering enabled for Chrome internal messages');
  }

  initializeLogging() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Write header to error log
    this.logError(`\n${'='.repeat(80)}`);
    this.logError(`🚨 DROPDOWN TEST ERROR LOG - Execution ID: ${this.executionId}`);
    this.logError(`Start Time: ${new Date().toLocaleString()}`);
    this.logError(`${'='.repeat(80)}\n`);
    
    // Write header to validation log
    this.logValidation(`\n${'='.repeat(80)}`);
    this.logValidation(`✅ DROPDOWN TEST VALIDATION LOG - Execution ID: ${this.executionId}`);
    this.logValidation(`Start Time: ${new Date().toLocaleString()}`);
    this.logValidation(`${'='.repeat(80)}\n`);
    
    // Write header to execution log
    this.logExecution(`\n${'='.repeat(80)}`);
    this.logExecution(`🏃‍♂️ EXECUTION FLOW LOG - Execution ID: ${this.executionId}`);
    this.logExecution(`Start Time: ${new Date().toLocaleString()}`);
    this.logExecution(`${'='.repeat(80)}\n`);
  }

  logError(message, error = null, context = {}) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}\n`;
    
    if (error) {
      logEntry += `Error Details: ${error.message || error}\n`;
      if (error.stack) {
        logEntry += `Stack Trace: ${error.stack}\n`;
      }
    }
    
    if (context && Object.keys(context).length > 0) {
      logEntry += `Context: ${JSON.stringify(context, null, 2)}\n`;
    }
    
    logEntry += `${'-'.repeat(80)}\n`;
    
    // Write to error log file
    fs.appendFileSync(this.errorLogPath, logEntry);
    
    // Also log to console for immediate feedback
    console.error(`[ERROR] ${message}`);
    if (error) {
      console.error(`       ${error.message || error}`);
    }
  }

  logValidation(message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}\n`;
    
    if (data) {
      if (typeof data === 'object') {
        logEntry += `Data: ${JSON.stringify(data, null, 2)}\n`;
      } else {
        logEntry += `Data: ${data}\n`;
      }
    }
    
    logEntry += `${'-'.repeat(40)}\n`;
    
    // Write to validation log file
    fs.appendFileSync(this.validationLogPath, logEntry);
    
    // Also log to console for immediate feedback
    console.log(`[VALIDATION] ${message}`);
  }

  logExecution(message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}\n`;
    
    if (data) {
      if (typeof data === 'object') {
        logEntry += `Data: ${JSON.stringify(data, null, 2)}\n`;
      } else {
        logEntry += `Data: ${data}\n`;
      }
    }
    
    logEntry += `${'-'.repeat(40)}\n`;
    
    // Write to execution log file
    fs.appendFileSync(this.executionLogPath, logEntry);
    
    // Also log to console for immediate feedback
    console.log(`[EXECUTION] ${message}`);
  }

  async executeWithRetry(operationName, operationFn, maxRetries = 3, context = {}) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logExecution(`Attempt ${attempt}/${maxRetries} for operation: ${operationName}`, {
          ...context,
          attempt,
          maxRetries
        });
        
        const result = await operationFn();
        
        if (attempt > 1) {
          this.logValidation(`Operation ${operationName} succeeded on attempt ${attempt}`, {
            operation: operationName,
            attempts: attempt,
            context
          });
        }
        
        // Reset retry count for this operation on success
        if (this.retryCounts[operationName]) {
          this.retryCounts[operationName] = 0;
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        this.logError(`Operation ${operationName} failed on attempt ${attempt}`, error, {
          operation: operationName,
          attempt,
          maxRetries,
          context
        });
        
        // Increment retry count
        if (this.retryCounts[operationName]) {
          this.retryCounts[operationName] = (this.retryCounts[operationName] || 0) + 1;
        }
        
        if (attempt < maxRetries) {
          // Calculate backoff delay (exponential backoff with jitter)
          const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          
          this.logExecution(`Waiting ${Math.round(delay)}ms before retry ${attempt + 1} for ${operationName}`);
          await this.delay(delay);
          
          // Perform recovery actions based on operation type
          await this.performRecovery(operationName, attempt, context);
        }
      }
    }
    
    throw new Error(`Operation ${operationName} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  async performRecovery(operationName, attempt, context) {
    switch (operationName) {
      case 'navigation':
        try {
          // Clear browser cache and storage
          await this.driver.manage().deleteAllCookies();
          await this.driver.executeScript('window.localStorage.clear();');
          await this.driver.executeScript('window.sessionStorage.clear();');
          this.logExecution(`Cleared browser storage for navigation recovery attempt ${attempt}`);
        } catch (e) {
          // Ignore cleanup errors
        }
        break;
        
      case 'dropdownFinding':
        try {
          // Refresh page if dropdown finding fails
          await this.driver.navigate().refresh();
          await this.delay(2000);
          this.logExecution(`Refreshed page for dropdown finding recovery attempt ${attempt}`);
        } catch (e) {
          // Ignore refresh errors
        }
        break;
        
      case 'dropdownOptions':
      case 'selection':
      case 'verification':
        // For these operations, just wait a bit longer
        await this.delay(2000);
        this.logExecution(`Extended wait for ${operationName} recovery attempt ${attempt}`);
        break;
        
      default:
        // Default recovery: short delay
        await this.delay(1000);
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async initializeDriver() {
    return this.executeWithRetry('initializeDriver', async () => {
      const options = new chrome.Options();
      options.addArguments('--start-maximized');
      options.addArguments('--disable-notifications');
      options.addArguments('--disable-popup-blocking');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      
      // CRITICAL: COMPLETELY DISABLE GPU AND RENDERING ENGINE
      options.addArguments('--disable-gpu'); // Disable GPU hardware acceleration
      options.addArguments('--disable-software-rasterizer'); // Disable software fallback
      options.addArguments('--disable-canvas-aa'); // Disable anti-aliasing
      options.addArguments('--disable-2d-canvas-clip-aa'); // Disable 2D canvas AA
      options.addArguments('--disable-gl-drawing-for-tests'); // Disable GL drawing
      
      // Disable shared memory and GPU process
      options.addArguments('--disable-features=SharedArrayBuffer');
      options.addArguments('--disable-gpu-compositing');
      options.addArguments('--disable-gpu-early-init');
      options.addArguments('--disable-gpu-memory-buffer-video-frames');
      options.addArguments('--disable-gpu-rasterization');
      options.addArguments('--disable-gpu-sandbox');
      options.addArguments('--disable-accelerated-2d-canvas');
      options.addArguments('--disable-accelerated-mjpeg-decode');
      options.addArguments('--disable-accelerated-video-decode');
      options.addArguments('--disable-accelerated-video-encode');
      options.addArguments('--disable-webgl');
      options.addArguments('--disable-webgl2');
      options.addArguments('--disable-3d-apis');
      options.addArguments('--disable-features=VizDisplayCompositor');
      
      // Add performance optimization arguments
      options.addArguments('--disable-extensions');
      options.addArguments('--disable-background-timer-throttling');
      options.addArguments('--disable-backgrounding-occluded-windows');
      options.addArguments('--disable-renderer-backgrounding');
      options.addArguments('--disable-features=TranslateUI');
      options.addArguments('--disable-features=BlinkGenPropertyTrees');
      
      // CRITICAL: Suppress Chrome internal logs and warnings
      options.addArguments('--log-level=3'); // Only show fatal errors (0=INFO, 1=WARNING, 2=ERROR, 3=FATAL)
      options.addArguments('--silent');
      options.addArguments('--disable-logging');
      options.addArguments('--disable-breakpad'); // Disable crash reporting
      options.addArguments('--disable-crash-reporter'); // Disable crash reporter
      
      // Disable services that cause warnings
      options.addArguments('--disable-background-networking');
      options.addArguments('--disable-sync');
      options.addArguments('--disable-default-apps');
      options.addArguments('--disable-component-update');
      options.addArguments('--disable-client-side-phishing-detection');
      options.addArguments('--disable-gpu-process-crash-limit');
      options.addArguments('--disable-features=GcmChannelStatusRequest');
      options.addArguments('--disable-features=InterestFeedContentSuggestions');
      options.addArguments('--disable-features=Translate');
      
      // Prevent detection
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.excludeSwitches('enable-automation');
      options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Add experimental options for stability
      options.addArguments('--remote-debugging-port=0'); // Disable remote debugging
      options.addArguments('--disable-web-security');
      options.addArguments('--allow-running-insecure-content');
      options.addArguments('--ignore-certificate-errors');
      options.addArguments('--disable-features=IsolateOrigins,site-per-process'); // Disable site isolation
      options.addArguments('--disable-site-isolation-trials');
      
      // Memory optimizations
      options.addArguments('--memory-pressure-off');
      options.addArguments('--disable-back-forward-cache');
      options.addArguments('--disable-features=AudioServiceOutOfProcess');
      options.addArguments('--disable-features=AudioServiceSandbox');

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      // SIGNIFICANTLY INCREASE TIMEOUTS
      await this.driver.manage().setTimeouts({
        implicit: 30000,      // Increased from 10000
        pageLoad: 60000,      // Increased from 30000
        script: 60000         // Increased from 30000
      });

      this.logValidation('WebDriver initialized with GPU disabled and extended timeouts');
      return true;
    }, 2); // 2 retries for driver initialization
  }

  async checkChromeCompatibility() {
    return this.executeWithRetry('checkChromeCompatibility', async () => {
      const capabilities = await this.driver.getCapabilities();
      const chromeVersion = capabilities.get('browserVersion');
      this.logValidation('Chrome version detected', { version: chromeVersion });
      
      // Log ChromeDriver version
      const chromeDriverVersion = capabilities.get('chrome').chromedriverVersion;
      this.logValidation('ChromeDriver version', { version: chromeDriverVersion });
      
      // Check for compatibility issues
      if (chromeVersion && chromeDriverVersion) {
        const chromeMajor = parseInt(chromeVersion.split('.')[0]);
        const driverMajor = parseInt(chromeDriverVersion.split('.')[0]);
        
        if (Math.abs(chromeMajor - driverMajor) > 2) {
          this.logError('Chrome/ChromeDriver version mismatch', null, {
            chromeVersion,
            chromeDriverVersion,
            suggestion: 'Update ChromeDriver to match Chrome version'
          });
        }
      }
      return true;
    });
  }

  async readCSV(filePath) {
    return this.executeWithRetry('readCSV', async () => {
      return new Promise((resolve, reject) => {
        const results = [];
        
        if (!fs.existsSync(filePath)) {
          const defaultCSV = `url,description,expectedDropdowns
https://www.nationwide.com/financial-professionals/topics/legacy-estate-wealth-transfer/,Nationwide Legacy & Estate Wealth Transfer,3`;
          fs.writeFileSync('urls.csv', defaultCSV);
          this.logValidation('Created default CSV file: urls.csv', { filePath });
        }

        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => {
            if (data.url && data.url.trim()) {
              results.push({
                url: data.url.trim(),
                description: data.description || '',
                expectedDropdowns: parseInt(data.expectedDropdowns) || 3
              });
            }
          })
          .on('end', () => {
            if (results.length === 0) {
              results.push({
                url: 'https://www.nationwide.com/financial-professionals/topics/legacy-estate-wealth-transfer/',
                description: 'Default Nationwide page',
                expectedDropdowns: 3
              });
            }
            this.logValidation(`Loaded ${results.length} URLs from CSV`, {
              filePath,
              count: results.length,
              urls: results.map(r => r.url)
            });
            resolve(results);
          })
          .on('error', (error) => {
            this.logError('Failed to read CSV file', error, {
              filePath,
              action: 'readCSV'
            });
            reject(error);
          });
      });
    });
  }

  async handleCookiesAndPopups() {
    return this.executeWithRetry('handleCookiesAndPopups', async () => {
      this.logValidation('Checking for cookies and popups...');
      
      // Wait a moment for popups to appear
      await this.delay(2000);
      
      let handled = false;
      
      // First, check for the specific Truste consent banner you mentioned
      try {
        const trusteAcceptButton = await this.driver.findElement(By.id('truste-consent-button'));
        if (await trusteAcceptButton.isDisplayed()) {
          this.logValidation('Found Truste cookie banner');
          await trusteAcceptButton.click();
          this.logValidation('Clicked "Accept" on cookie banner');
          handled = true;
          await this.delay(1500);
        }
      } catch (error) {
        // Button not found or not visible
      }
      
      // Check for California privacy popup
      try {
        const californiaPopupSelectors = [
          'button.call[role="button"]',
          'button:contains("Agree and proceed")',
          'button:contains("I agree")',
          'button:contains("Accept")'
        ];
        
        for (const selector of californiaPopupSelectors) {
          try {
            const elements = await this.driver.findElements(By.css(selector));
            for (const element of elements) {
              if (await element.isDisplayed()) {
                this.logValidation('Found California privacy popup', { selector });
                await element.click();
                this.logValidation('Clicked "Agree and proceed"');
                handled = true;
                await this.delay(1500);
                break;
              }
            }
            if (handled) break;
          } catch (e) {
            continue;
          }
        }
      } catch (error) {
        // Popup not found
      }
      
      // General consent button handling (fallback)
      if (!handled) {
        const consentSelectors = [
          '#truste-show-consent',
          '.trustarc-banner button',
          '.cookie-banner button',
          'button[aria-label*="Accept"]',
          'button:contains("Accept")',
          'button:contains("AGREE")',
          '.pdynamicbutton button.call',
          'button.required',
          '.truste-icon-box img',
          '.truste-icon-box'
        ];
        
        for (const selector of consentSelectors) {
          try {
            const elements = await this.driver.findElements(By.css(selector));
            for (const element of elements) {
              try {
                if (await element.isDisplayed()) {
                  // Check if it's a close icon (for the X button)
                  if (selector.includes('.truste-icon-box') || selector.includes('img')) {
                    this.logValidation('Found close icon for cookie banner', { selector });
                    await element.click();
                    this.logValidation('Clicked close icon');
                  } else {
                    const text = await element.getText();
                    if (text.includes('Accept') || text.includes('Agree') || text === 'Accept' || text === 'Agree and proceed') {
                      this.logValidation(`Found consent button: ${text}`, { selector });
                      await element.click();
                      this.logValidation(`Clicked: ${text}`);
                    }
                  }
                  handled = true;
                  await this.delay(1500);
                  break;
                }
              } catch (e) {
                continue;
              }
            }
            if (handled) break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Try to find and close any remaining overlays
      if (!handled) {
        try {
          const overlays = await this.driver.findElements(By.css('.modal, .popup, .overlay, [role="dialog"]'));
          for (const overlay of overlays) {
            try {
              if (await overlay.isDisplayed()) {
                // Look for close buttons within the overlay
                const closeButtons = await overlay.findElements(By.css('button.close, .close-btn, [aria-label="Close"], .modal-close'));
                for (const closeButton of closeButtons) {
                  if (await closeButton.isDisplayed()) {
                    await closeButton.click();
                    this.logValidation('Closed overlay/popup', { overlayType: overlay.tagName });
                    handled = true;
                    await this.delay(1500);
                    break;
                  }
                }
              }
            } catch (e) {
              continue;
            }
          }
        } catch (error) {
          // No overlays found
        }
      }
      
      // Additional check for "Required only" button
      if (!handled) {
        try {
          const requiredOnlyButton = await this.driver.findElement(By.css('button.required[role="button"]'));
          if (await requiredOnlyButton.isDisplayed()) {
            this.logValidation('Found "Required only" button');
            await requiredOnlyButton.click();
            this.logValidation('Clicked "Required only"');
            handled = true;
            await this.delay(1500);
          }
        } catch (error) {
          // Button not found
        }
      }
      
      if (handled) {
        this.logValidation('All cookies and popups handled successfully');
      } else {
        this.logValidation('No cookies or popups found');
      }
      
      return handled;
    });
  }

  async robustNavigateTo(url, maxAttempts = 3) {
    return this.executeWithRetry('navigation', async () => {
      this.logValidation(`Navigating to ${url}`);
      
      // Set page load timeout for this specific navigation
      await this.driver.manage().setTimeouts({ pageLoad: 60000 });
      
      // Navigate with error handling using Promise.race for timeout protection
      const navigationPromise = this.driver.get(url);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Navigation timeout after 60000ms`)), 60000)
      );
      
      await Promise.race([navigationPromise, timeoutPromise]);
      
      // Wait with multiple conditions and timeout protection
      const waitPromise = this.driver.wait(async () => {
        try {
          const readyState = await this.driver.executeScript('return document.readyState');
          const body = await this.driver.findElement(By.css('body'));
          const isVisible = await body.isDisplayed();
          return readyState === 'complete' && isVisible;
        } catch (e) {
          return false;
        }
      }, 60000);
      
      const waitTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Page wait timeout')), 60000)
      );
      
      await Promise.race([waitPromise, waitTimeoutPromise]);
      
      // Handle any popups/cookies with timeout protection
      const cookiesPromise = this.handleCookiesAndPopups();
      const cookiesTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cookie handling timeout')), 10000)
      );
      
      await Promise.race([cookiesPromise, cookiesTimeoutPromise]).catch(() => {
        this.logValidation('Cookie handling timed out, continuing...');
      });
      
      // Verify page is truly loaded
      await this.delay(2000);
      
      // Simple script execution test
      try {
        await this.driver.executeScript('return true;');
      } catch (scriptError) {
        throw new Error('Page not responsive to scripts');
      }
      
      this.logValidation(`Navigation successful`);
      return true;
    }, maxAttempts, { url });
  }

  async recoverFromWebDriverCrash() {
    return this.executeWithRetry('webDriverRecovery', async () => {
      this.logExecution('Attempting to recover from WebDriver crash...');
      
      // Try to quit existing driver if it exists
      if (this.driver) {
        try {
          await this.driver.quit();
        } catch (quitError) {
          // Ignore quit errors
        }
      }
      
      // Create new driver instance
      await this.initializeDriver();
      await this.checkChromeCompatibility();
      
      this.logValidation('WebDriver recovered successfully');
      return true;
    });
  }

  async waitForPageLoad() {
    return this.executeWithRetry('pageLoad', async () => {
      // Simple wait for document ready state with timeout
      await this.driver.wait(async () => {
        return await this.driver.executeScript('return document.readyState') === 'complete';
      }, 30000);
      
      this.logValidation('Page loaded successfully');
      return true;
    });
  }

  async getDropdownElements() {
    return this.executeWithRetry('dropdownFinding', async () => {
      // Wait for container with increased timeout
      await this.driver.wait(until.elementLocated(By.css('.nw-container')), 30000);
      
      // Find all dropdowns using multiple strategies
      const selectors = [
        'bolt-select',
        '.main-filter bolt-select',
        'select[data-test="select"]',
        'select'
      ];
      
      for (const selector of selectors) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements.length >= 1) {
            this.logValidation(`Found ${elements.length} dropdowns using selector`, {
              selector,
              count: elements.length
            });
            return elements.slice(0, 3); // Return max 3 dropdowns
          }
        } catch (e) {
          continue;
        }
      }
      
      throw new Error('No dropdowns found');
    }, this.maxRetries.dropdownFinding, { selectors: ['bolt-select', '.main-filter bolt-select', 'select[data-test="select"]', 'select'] });
  }

  async getDropdownOptions(dropdownElement, index) {
    return this.executeWithRetry('dropdownOptions', async () => {
      // Extract options from bolt-select shadow DOM with timeout
      const options = await this.driver.executeScript(`
        try {
          const element = arguments[0];
          let select;
          
          // Check if it's a bolt-select with shadow DOM
          if (element.tagName === 'BOLT-SELECT') {
            if (element.shadowRoot) {
              select = element.shadowRoot.querySelector('select');
            }
          }
          
          // If not found, try to find select directly
          if (!select) {
            select = element.querySelector('select');
          }
          
          if (!select) {
            return [];
          }
          
          // Get all options except disabled ones
          const allOptions = Array.from(select.options || []);
          const validOptions = [];
          
          for (let i = 0; i < allOptions.length; i++) {
            const opt = allOptions[i];
            if (!opt.disabled && opt.value !== undefined) {
              validOptions.push({
                value: opt.value,
                text: opt.textContent || opt.innerText || '',
                index: i
              });
            }
          }
          
          return validOptions;
        } catch (error) {
          console.error('Error in script:', error);
          return [];
        }
      `, dropdownElement);
      
      if (options.length === 0) {
        throw new Error(`No valid options found for dropdown ${index + 1}`);
      }
      
      this.logValidation(`Dropdown ${index + 1} options retrieved`, {
        dropdownIndex: index + 1,
        optionCount: options.length,
        options: options.map(opt => ({ value: opt.value, text: opt.text }))
      });
      return options;
    }, this.maxRetries.dropdownOptions, { dropdownIndex: index + 1 });
  }

  async selectDropdownOption(dropdownElement, option, dropdownIndex) {
    return this.executeWithRetry('selection', async () => {
      // Use JavaScript to select option in shadow DOM with timeout
      const success = await this.driver.executeScript(`
        try {
          const element = arguments[0];
          const valueToSelect = arguments[1];
          let select;
          
          // Handle bolt-select shadow DOM
          if (element.tagName === 'BOLT-SELECT') {
            if (element.shadowRoot) {
              select = element.shadowRoot.querySelector('select');
            }
          }
          
          if (!select) {
            select = element.querySelector('select');
          }
          
          if (!select) {
            return false;
          }
          
          // Set the value
          select.value = valueToSelect;
          
          // Trigger all necessary events
          const events = ['change', 'input', 'click'];
          events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true });
            select.dispatchEvent(event);
          });
          
          return true;
        } catch (error) {
          return false;
        }
      `, dropdownElement, option.value);
      
      if (!success) {
        throw new Error('JavaScript selection failed');
      }
      
      // Wait for selection to take effect
      await this.delay(800);
      
      // Verify the selection was successful
      const isSelected = await this.verifySelection(dropdownElement, option);
      if (!isSelected) {
        throw new Error('Selection verification failed');
      }
      
      this.logValidation(`Option selected successfully`, {
        dropdownIndex: dropdownIndex + 1,
        optionValue: option.value,
        optionText: option.text,
        success: true
      });
      return true;
    }, this.maxRetries.selection, { 
      dropdownIndex: dropdownIndex + 1,
      optionValue: option.value,
      optionText: option.text
    });
  }

  async verifySelection(dropdownElement, expectedOption) {
    return this.executeWithRetry('verification', async () => {
      const isSelected = await this.driver.executeScript(`
        try {
          const element = arguments[0];
          const expectedValue = arguments[1];
          let select;
          
          if (element.tagName === 'BOLT-SELECT') {
            if (element.shadowRoot) {
              select = element.shadowRoot.querySelector('select');
            }
          }
          
          if (!select) {
            select = element.querySelector('select');
          }
          
          if (!select) {
            return false;
          }
          
          return select.value === expectedValue;
        } catch (error) {
          return false;
        }
      `, dropdownElement, expectedOption.value);
      
      this.logValidation(`Selection verification result`, {
        expectedValue: expectedOption.value,
        verified: isSelected,
        optionText: expectedOption.text
      });
      
      if (!isSelected) {
        throw new Error('Selection verification failed');
      }
      
      return isSelected;
    }, this.maxRetries.verification, { 
      expectedValue: expectedOption.value,
      optionText: expectedOption.text
    });
  }

  async resetToDefault(dropdownElements) {
    return this.executeWithRetry('resetToDefault', async () => {
      // Try reset button first
      try {
        const resetButton = await this.driver.findElement(By.css('#tileFilterResetButton'));
        await resetButton.click();
        this.logValidation('Reset button clicked successfully');
        await this.delay(2000);
        return true;
      } catch (e) {
        // Manual reset by selecting first option in each dropdown
        for (let i = 0; i < dropdownElements.length; i++) {
          try {
            const options = await this.getDropdownOptions(dropdownElements[i], i);
            if (options.length > 0) {
              // Find placeholder (empty value) or use first option
              const defaultOption = options.find(opt => opt.value === '') || options[0];
              await this.selectDropdownOption(dropdownElements[i], defaultOption, i);
            }
          } catch (error) {
            this.logError(`Could not reset dropdown ${i + 1}`, error, {
              dropdownIndex: i + 1,
              action: 'resetToDefault'
            });
          }
        }
        await this.delay(1000);
        this.logValidation('Manual reset completed');
        return true;
      }
    });
  }

  async testAllCombinations(dropdownElements) {
    return this.executeWithRetry('testAllCombinations', async () => {
      const results = [];
      
      if (dropdownElements.length === 0) {
        throw new Error('No dropdowns to test');
      }
      
      // Get options for each dropdown
      const dropdownOptions = [];
      for (let i = 0; i < dropdownElements.length; i++) {
        const options = await this.getDropdownOptions(dropdownElements[i], i);
        if (options.length === 0) {
          throw new Error(`Dropdown ${i + 1} has no options`);
        }
        dropdownOptions.push(options);
        this.logValidation(`Dropdown ${i + 1} options loaded`, {
          dropdownIndex: i + 1,
          optionCount: options.length
        });
      }
      
      // Generate all possible combinations
      const totalCombinations = dropdownOptions.reduce((total, options) => total * options.length, 1);
      this.logValidation(`Total combinations to test calculated`, {
        dropdownCount: dropdownElements.length,
        totalCombinations,
        optionsPerDropdown: dropdownOptions.map((opts, idx) => ({
          dropdown: idx + 1,
          options: opts.length
        }))
      });
      
      // Test all combinations recursively
      await this.testCombinationsRecursive(dropdownElements, dropdownOptions, 0, [], results);
      
      this.logValidation(`All combinations testing completed`, {
        totalTested: results.length,
        passed: results.filter(r => r.status === 'PASSED').length,
        failed: results.filter(r => r.status === 'FAILED').length
      });
      
      return results;
    }, this.maxRetries.overall, { dropdownCount: dropdownElements.length });
  }

  async testCombinationsRecursive(dropdownElements, optionsArray, currentIndex, currentSelection, results) {
    if (currentIndex >= optionsArray.length) {
      // We have a complete combination, test it
      const comboNumber = results.length + 1;
      const result = await this.testSingleCombination(currentSelection, dropdownElements, comboNumber);
      results.push(result);
      return;
    }
    
    // Test each option in the current dropdown
    const currentOptions = optionsArray[currentIndex];
    
    for (let i = 0; i < currentOptions.length; i++) {
      const option = currentOptions[i];
      const newSelection = [...currentSelection, option];
      
      // Select this option with retry
      const success = await this.selectDropdownOption(dropdownElements[currentIndex], option, currentIndex);
      
      if (success) {
        // Move to next dropdown
        await this.testCombinationsRecursive(dropdownElements, optionsArray, currentIndex + 1, newSelection, results);
        
        // If this is not the last option in the current dropdown, reset next dropdowns
        if (i < currentOptions.length - 1 && currentIndex < optionsArray.length - 1) {
          await this.resetNextDropdowns(dropdownElements, optionsArray, currentIndex + 1);
        }
      } else {
        this.logError(`Failed to select option, skipping rest of combinations for this path`, null, {
          dropdownIndex: currentIndex + 1,
          optionValue: option.value,
          optionText: option.text,
          action: 'testCombinationsRecursive'
        });
        
        // Record failure and continue
        const comboNumber = results.length + 1;
        results.push({
          name: `Combo ${comboNumber}`,
          number: comboNumber,
          startTime: new Date().toISOString(),
          options: newSelection,
          status: 'FAILED',
          error: `Failed to select "${option.text}" in dropdown ${currentIndex + 1}`,
          duration: 0,
          endTime: new Date().toISOString()
        });
      }
    }
  }

  async resetNextDropdowns(dropdownElements, optionsArray, startIndex) {
    for (let i = startIndex; i < dropdownElements.length; i++) {
      try {
        const options = await this.getDropdownOptions(dropdownElements[i], i);
        if (options.length > 0) {
          const defaultOption = options.find(opt => opt.value === '') || options[0];
          await this.selectDropdownOption(dropdownElements[i], defaultOption, i);
        }
      } catch (error) {
        this.logError(`Could not reset dropdown ${i + 1}`, error, {
          dropdownIndex: i + 1,
          action: 'resetNextDropdowns'
        });
      }
    }
  }

  async testSingleCombination(selection, dropdownElements, comboNumber) {
    const startTime = Date.now();
    const result = {
      name: `Combo ${comboNumber}`,
      number: comboNumber,
      startTime: new Date().toISOString(),
      options: [],
      status: 'FAILED',
      error: null,
      duration: 0
    };

    try {
      // Verify all selections are active
      for (let i = 0; i < selection.length; i++) {
        const verified = await this.verifySelection(dropdownElements[i], selection[i]);
        if (!verified) {
          throw new Error(`Verification failed for dropdown ${i + 1}`);
        }
        
        result.options.push({
          dropdown: `Dropdown ${i + 1}`,
          value: selection[i].value,
          text: selection[i].text || `Option ${selection[i].value}`
        });
      }
      
      const duration = Date.now() - startTime;
      result.status = 'PASSED';
      result.duration = duration;
      result.endTime = new Date().toISOString();
      
      // Update counters
      this.totalTests++;
      this.passedTests++;
      
      const comboText = selection.map(opt => opt.text || opt.value).join(' > ');
      this.logValidation(`Combination test passed`, {
        comboNumber,
        duration,
        options: comboText,
        status: 'PASSED'
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      result.status = 'FAILED';
      result.error = error.message;
      result.duration = duration;
      result.endTime = new Date().toISOString();
      
      // Update counters
      this.totalTests++;
      this.failedTests++;
      
      this.logError(`Combination test failed`, error, {
        comboNumber,
        duration,
        options: selection.map(opt => opt.text || opt.value),
        status: 'FAILED'
      });
    }
    
    return result;
  }

  async runTests(csvFilePath) {
    const startTime = new Date();
    this.logValidation('Complete dropdown testing started', {
      startTime: startTime.toISOString(),
      csvFilePath
    });
    
    console.log('='.repeat(80));
    console.log('🏁 COMPLETE DROPDOWN TESTING STARTED');
    console.log('='.repeat(80));
    console.log(`Start Time: ${startTime.toLocaleString()}`);
    console.log(`Error Log: ${this.errorLogPath}`);
    console.log(`Validation Log: ${this.validationLogPath}`);
    console.log(`Execution Log: ${this.executionLogPath}`);
    console.log(`Execution ID: ${this.executionId}`);

    try {
      // Read CSV
      this.csvData = await this.readCSV(csvFilePath);
      
      if (this.csvData.length === 0) {
        throw new Error('No URLs to test');
      }

      // Initialize WebDriver
      await this.initializeDriver();
      await this.checkChromeCompatibility();

      // Test each URL
      for (const [index, testCase] of this.csvData.entries()) {
        const urlStartTime = new Date();
        this.currentTestContext = {
          urlIndex: index + 1,
          totalURLs: this.csvData.length,
          url: testCase.url,
          description: testCase.description,
          startTime: urlStartTime.toISOString()
        };
        
        this.logValidation(`Starting test for URL ${index + 1}`, this.currentTestContext);

        console.log(`\n📋 Test ${index + 1}/${this.csvData.length}: ${testCase.description || testCase.url}`);
        console.log('-'.repeat(60));

        const urlResult = {
          url: testCase.url,
          description: testCase.description,
          startTime: urlStartTime.toISOString(),
          combinations: [],
          dropdowns: 0,
          dropdownDetails: [],
          status: 'PENDING'
        };

        try {
          // Navigate to URL using robust navigation
          console.log(`🌐 Navigating to URL...`);
          this.logExecution(`Starting robust navigation to URL`, { url: testCase.url });

          try {
            await this.robustNavigateTo(testCase.url, 3); // 3 retry attempts
            this.logValidation(`Successfully navigated to URL`);
          } catch (navError) {
            // Try to recover from crash
            this.logError(`Navigation failed, attempting recovery`, navError);
            const recovered = await this.recoverFromWebDriverCrash();
            
            if (recovered) {
              // Try navigation one more time after recovery
              this.logExecution(`Attempting navigation after recovery`);
              await this.robustNavigateTo(testCase.url, 2); // 2 attempts after recovery
            } else {
              throw navError;
            }
          }

          // Additional wait for dynamic content if needed
          await this.delay(2000);
          
          // Find dropdowns
          console.log(`🔍 Finding dropdowns...`);
          this.logExecution(`Finding dropdowns on page`);
          const dropdownElements = await this.getDropdownElements();
          urlResult.dropdowns = dropdownElements.length;
          
          if (dropdownElements.length === 0) {
            throw new Error('No dropdowns found on page');
          }
          
          this.logValidation(`Dropdowns found`, {
            count: dropdownElements.length,
            expected: testCase.expectedDropdowns
          });
          
          // Get dropdown details for report
          for (let i = 0; i < dropdownElements.length; i++) {
            const options = await this.getDropdownOptions(dropdownElements[i], i);
            urlResult.dropdownDetails.push({
              index: i + 1,
              optionCount: options.length,
              options: options.map(opt => ({ value: opt.value, text: opt.text }))
            });
          }
          
          // Reset to default state
          console.log(`🔄 Resetting to defaults...`);
          this.logExecution(`Resetting dropdowns to default state`);
          await this.resetToDefault(dropdownElements);
          await this.delay(2000);
          
          // Test ALL combinations
          console.log(`🧪 Testing ALL combinations...`);
          this.logExecution(`Starting all combinations testing`);
          const combinations = await this.testAllCombinations(dropdownElements);
          urlResult.combinations = combinations;
          
          // Calculate statistics
          const passed = combinations.filter(c => c.status === 'PASSED').length;
          const failed = combinations.filter(c => c.status === 'FAILED').length;
          
          urlResult.summary = { 
            passed, 
            failed, 
            total: combinations.length,
            passRate: combinations.length > 0 ? Math.round((passed / combinations.length) * 100) : 0
          };
          
          // Update global counters
          this.totalTests += combinations.length;
          this.passedTests += passed;
          this.failedTests += failed;
          
          // Determine URL status
          if (failed > 0) {
            urlResult.status = 'FAILED';
            this.logError(`URL test completed with failures`, null, {
              url: testCase.url,
              passed,
              failed,
              passRate: urlResult.summary.passRate
            });
          } else if (passed > 0) {
            urlResult.status = 'PASSED';
            this.logValidation(`URL test completed successfully`, {
              url: testCase.url,
              passed,
              failed,
              passRate: urlResult.summary.passRate
            });
          } else {
            urlResult.status = 'SKIPPED';
            this.logValidation(`URL test skipped - no combinations tested`, {
              url: testCase.url
            });
          }
          
        } catch (error) {
          urlResult.status = 'ERROR';
          urlResult.error = error.message;
          this.logError(`Error testing URL`, error, {
            url: testCase.url,
            description: testCase.description,
            urlIndex: index + 1
          });
        }
        
        urlResult.endTime = new Date().toISOString();
        urlResult.duration = new Date(urlResult.endTime) - new Date(urlResult.startTime);
        this.results.push(urlResult);
        
        this.logValidation(`URL test completed`, {
          url: testCase.url,
          status: urlResult.status,
          duration: urlResult.duration,
          dropdowns: urlResult.dropdowns,
          combinations: urlResult.combinations?.length || 0
        });
        
        // Clear current test context
        this.currentTestContext = null;
        
        // Delay between URLs
        if (index < this.csvData.length - 1) {
          this.logExecution(`Waiting before next URL...`, { delay: 3000 });
          await this.delay(3000);
        }
      }

    } catch (error) {
      this.logError('Critical error during test execution', error, {
        executionPhase: 'runTests',
        csvFilePath,
        totalURLs: this.csvData.length,
        currentTestContext: this.currentTestContext
      });
    } finally {
      const endTime = new Date();
      const totalDuration = (endTime - startTime) / 1000;
      
      // Final summary logs
      this.logValidation(`\n${'='.repeat(80)}`);
      this.logValidation('TESTING COMPLETED');
      this.logValidation(`${'='.repeat(80)}`);
      this.logValidation(`Start Time: ${startTime.toISOString()}`);
      this.logValidation(`End Time: ${endTime.toISOString()}`);
      this.logValidation(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
      this.logValidation(`Total Tests: ${this.totalTests}`);
      this.logValidation(`Passed: ${this.passedTests}`);
      this.logValidation(`Failed: ${this.failedTests}`);
      this.logValidation(`Pass Rate: ${this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0}%`);
      this.logValidation(`Retry Statistics: ${JSON.stringify(this.retryCounts, null, 2)}`);
      this.logValidation(`${'='.repeat(80)}\n`);
      
      // Also log final summary to error log
      this.logError(`\n${'='.repeat(80)}`);
      this.logError('TESTING COMPLETED - FINAL SUMMARY');
      this.logError(`${'='.repeat(80)}`);
      this.logError(`Total URLs Tested: ${this.csvData.length}`);
      this.logError(`Total Combinations Tested: ${this.totalTests}`);
      this.logError(`Passed: ${this.passedTests}`);
      this.logError(`Failed: ${this.failedTests}`);
      this.logError(`Pass Rate: ${this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0}%`);
      this.logError(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
      this.logError(`Retry Statistics: ${JSON.stringify(this.retryCounts, null, 2)}`);
      this.logError(`${'='.repeat(80)}\n`);
      
      // Log execution summary
      this.logExecution(`\n${'='.repeat(80)}`);
      this.logExecution('EXECUTION STATISTICS');
      this.logExecution(`${'='.repeat(80)}`);
      this.logExecution(`Total Operations with Retries: ${Object.values(this.retryCounts).reduce((a, b) => a + b, 0)}`);
      this.logExecution(`Retry Distribution: ${JSON.stringify(this.retryCounts, null, 2)}`);
      this.logExecution(`${'='.repeat(80)}\n`);
      
      console.log('\n' + '='.repeat(80));
      console.log('🏁 TESTING COMPLETED');
      console.log('='.repeat(80));
      console.log(`Start Time: ${startTime.toLocaleString()}`);
      console.log(`End Time: ${endTime.toLocaleString()}`);
      console.log(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
      console.log(`Total Tests: ${this.totalTests}`);
      console.log(`✅ Passed: ${this.passedTests}`);
      console.log(`❌ Failed: ${this.failedTests}`);
      console.log(`📊 Overall Pass Rate: ${this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0}%`);
      console.log(`🔄 Retry Statistics:`);
      Object.entries(this.retryCounts).forEach(([operation, count]) => {
        console.log(`   ${operation}: ${count} retries`);
      });
      console.log(`📝 Error Log: ${this.errorLogPath}`);
      console.log(`✅ Validation Log: ${this.validationLogPath}`);
      console.log(`🏃‍♂️ Execution Log: ${this.executionLogPath}`);
      console.log(`🎯 Execution ID: ${this.executionId}`);
      console.log('='.repeat(80));
      
      await this.cleanup();
      await this.generateReports(startTime, endTime, totalDuration);
    }
  }

  async cleanup() {
    return this.executeWithRetry('cleanup', async () => {
      if (this.driver) {
        await this.driver.quit();
        this.logValidation('WebDriver closed successfully');
      }
    }, 2); // 2 retries for cleanup
  }

  async generateReports(startTime, endTime, duration) {
    return this.executeWithRetry('generateReports', async () => {
      const reportDir = 'reports';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      // Calculate overall statistics
      const passRate = this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0;
      let overallStatus = 'PASSED';
      if (this.results.some(r => r.status === 'ERROR')) {
        overallStatus = 'ERROR';
      } else if (this.results.some(r => r.status === 'FAILED')) {
        overallStatus = 'FAILED';
      } else if (this.results.every(r => r.status === 'SKIPPED')) {
        overallStatus = 'SKIPPED';
      }
      
      // Include log file paths in report
      const jsonReport = {
        testInfo: {
          project: 'Complete Dropdown Validation Test',
          executionDate: startTime.toISOString(),
          duration: `${duration.toFixed(2)} seconds`,
          environment: 'Chrome Browser (GPU Disabled)',
          totalURLs: this.csvData.length,
          totalCombinations: this.totalTests,
          passed: this.passedTests,
          failed: this.failedTests,
          passRate: passRate,
          overallStatus: overallStatus,
          retryStatistics: this.retryCounts,
          logFiles: {
            errors: this.errorLogPath,
            validation: this.validationLogPath,
            execution: this.executionLogPath,
            executionId: this.executionId
          }
        },
        results: this.results,
        summary: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          totalDuration: duration
        }
      };
      
      const jsonPath = path.join(reportDir, `complete-dropdown-test-${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
      
      // Generate HTML report
      const htmlReport = this.generateHTMLReport(jsonReport);
      const htmlPath = path.join(reportDir, `complete-dropdown-test-${timestamp}.html`);
      fs.writeFileSync(htmlPath, htmlReport);
      
      // Generate text summary
      const textSummary = this.generateTextSummary(jsonReport);
      const textPath = path.join(reportDir, `complete-dropdown-summary-${timestamp}.txt`);
      fs.writeFileSync(textPath, textSummary);
      
      // Log report generation
      this.logValidation('Reports generated successfully', {
        jsonReport: jsonPath,
        htmlReport: htmlPath,
        textSummary: textPath
      });
      
      console.log('\n📊 REPORTS GENERATED:');
      console.log(`📄 JSON Report: ${jsonPath}`);
      console.log(`🌐 HTML Report: ${htmlPath}`);
      console.log(`📋 Text Summary: ${textPath}`);
      console.log(`🚨 Error Log: ${this.errorLogPath}`);
      console.log(`✅ Validation Log: ${this.validationLogPath}`);
      console.log(`🏃‍♂️ Execution Log: ${this.executionLogPath}`);
      
      // Display summary
      console.log('\n' + '='.repeat(80));
      console.log(textSummary);
      
      // Open HTML report
      try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
          exec(`start "" "${htmlPath}"`);
          console.log('\n✅ HTML report opened in browser');
        }
      } catch (error) {
        console.log('\nℹ️  Open HTML report manually:', htmlPath);
      }
    });
  }

  generateHTMLReport(jsonReport) {
    const overallStatus = jsonReport.testInfo.overallStatus;
    const statusColor = overallStatus === 'PASSED' ? '#28a745' : 
                      overallStatus === 'FAILED' ? '#dc3545' : 
                      overallStatus === 'ERROR' ? '#ffc107' : '#6c757d';
    
    // Generate retry statistics HTML
    const retryStatsHtml = Object.entries(jsonReport.testInfo.retryStatistics || {})
      .map(([operation, count]) => `<tr><td>${operation}</td><td>${count}</td></tr>`)
      .join('');
    
    // Generate URL sections
    let urlSections = '';
    jsonReport.results.forEach((result, index) => {
      const statusClass = result.status.toLowerCase();
      const statusIcon = result.status === 'PASSED' ? '✅' : 
                        result.status === 'FAILED' ? '❌' : 
                        result.status === 'ERROR' ? '⚠️' : '⏸️';
      
      // Generate dropdown details
      let dropdownDetailsHtml = '';
      if (result.dropdownDetails && result.dropdownDetails.length > 0) {
        dropdownDetailsHtml = '<div class="dropdown-details"><h4>Dropdown Details:</h4>';
        result.dropdownDetails.forEach(detail => {
          dropdownDetailsHtml += `<div class="dropdown-info">
            <h5>Dropdown ${detail.index} (${detail.optionCount} options):</h5>
            <ul>`;
          
          detail.options.forEach(opt => {
            dropdownDetailsHtml += `<li><code>${opt.value}</code>: ${opt.text || 'No text'}</li>`;
          });
          
          dropdownDetailsHtml += '</ul></div>';
        });
        dropdownDetailsHtml += '</div>';
      }
      
      // Generate combinations table
      let combinationsHtml = '';
      if (result.combinations && result.combinations.length > 0) {
        combinationsHtml = `<table class="combinations-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Options Selected</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>`;
        
        result.combinations.forEach(combo => {
          const comboStatusClass = combo.status.toLowerCase();
          const comboIcon = combo.status === 'PASSED' ? '✅' : '❌';
          
          const optionsText = combo.options.map(opt => 
            `<div><strong>${opt.dropdown}:</strong> ${opt.text || opt.value}</div>`
          ).join('');
          
          combinationsHtml += `
            <tr>
              <td>${combo.number}</td>
              <td>${optionsText}</td>
              <td>${combo.duration}ms</td>
              <td class="combo-status ${comboStatusClass}">${comboIcon} ${combo.status}</td>
            </tr>`;
        });
        
        combinationsHtml += '</tbody></table>';
      } else {
        combinationsHtml = '<p class="no-data">No combinations tested</p>';
      }
      
      urlSections += `
        <div class="url-card">
          <div class="url-header ${statusClass}">
            <div class="url-info">
              <h3>${statusIcon} URL ${index + 1}: ${result.description || 'No Description'}</h3>
              <p class="url">${result.url}</p>
              <div class="url-stats">
                <span>Dropdowns: ${result.dropdowns}</span> | 
                <span>Combinations: ${result.summary?.total || 0}</span> | 
                <span>Passed: ${result.summary?.passed || 0}</span> | 
                <span>Failed: ${result.summary?.failed || 0}</span> |
                <span>Pass Rate: ${result.summary?.passRate || 0}%</span>
              </div>
            </div>
            <div class="url-status ${statusClass}">${result.status}</div>
          </div>
          <div class="url-details">
            ${result.error ? `<div class="error-message"><strong>Error:</strong> ${result.error}</div>` : ''}
            ${dropdownDetailsHtml}
            ${combinationsHtml}
          </div>
        </div>`;
    });
    
    // Add log files and retry statistics section
    const statsSection = `
      <div class="summary-card" style="margin: 30px 0; background: #f8f9fa; border-left: 4px solid #007bff;">
        <h3 style="color: #333; margin-bottom: 10px;">📝 Log Files</h3>
        <p><strong>Error Log:</strong> ${jsonReport.testInfo.logFiles.errors}</p>
        <p><strong>Validation Log:</strong> ${jsonReport.testInfo.logFiles.validation}</p>
        <p><strong>Execution Log:</strong> ${jsonReport.testInfo.logFiles.execution}</p>
        <p><strong>Execution ID:</strong> ${jsonReport.testInfo.logFiles.executionId}</p>
        
        <h3 style="color: #333; margin-top: 20px; margin-bottom: 10px;">🔄 Retry Statistics</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background: #e9ecef;">
              <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Operation</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Retry Count</th>
            </tr>
          </thead>
          <tbody>
            ${retryStatsHtml}
          </tbody>
        </table>
      </div>
    `;
    
    // Complete HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Dropdown Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, sans-serif; }
    body { background: #f5f7fa; color: #333; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a2a6c, #2d5aa0); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
    .header h1 { font-size: 2.5em; margin-bottom: 10px; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .summary-card.total { border-top: 4px solid #007bff; }
    .summary-card.passed { border-top: 4px solid #28a745; }
    .summary-card.failed { border-top: 4px solid #dc3545; }
    .summary-card.duration { border-top: 4px solid #ffc107; }
    .summary-card h3 { color: #666; font-size: 1em; margin-bottom: 10px; }
    .summary-card .value { font-size: 2.5em; font-weight: bold; }
    .summary-card.passed .value { color: #28a745; }
    .summary-card.failed .value { color: #dc3545; }
    .url-card { background: white; border-radius: 10px; margin-bottom: 30px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .url-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; }
    .url-header.passed { border-left: 5px solid #28a745; }
    .url-header.failed { border-left: 5px solid #dc3545; }
    .url-header.error { border-left: 5px solid #ffc107; }
    .url-header.skipped { border-left: 5px solid #6c757d; }
    .url-info h3 { color: #333; margin-bottom: 5px; }
    .url-info .url { color: #666; font-size: 0.9em; word-break: break-all; }
    .url-stats { margin-top: 10px; font-size: 0.85em; color: #666; }
    .url-stats span { margin: 0 5px; }
    .url-status { padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9em; }
    .url-status.passed { background: #d4edda; color: #155724; }
    .url-status.failed { background: #f8d7da; color: #721c24; }
    .url-status.error { background: #fff3cd; color: #856404; }
    .url-status.skipped { background: #e2e3e5; color: #383d41; }
    .url-details { padding: 20px; }
    .error-message { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .dropdown-details { margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .dropdown-details h4 { margin-bottom: 10px; color: #495057; }
    .dropdown-info { margin-bottom: 15px; }
    .dropdown-info h5 { color: #6c757d; margin-bottom: 5px; }
    .dropdown-info ul { list-style: none; padding-left: 15px; }
    .dropdown-info li { padding: 3px 0; font-size: 0.9em; }
    .dropdown-info code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
    .combinations-table { width: 100%; border-collapse: collapse; }
    .combinations-table th { background: #f8f9fa; padding: 12px 15px; text-align: left; font-weight: 600; border-bottom: 2px solid #dee2e6; }
    .combinations-table td { padding: 12px 15px; border-bottom: 1px solid #dee2e6; }
    .combinations-table tr:hover { background: #f8f9fa; }
    .combo-status { font-weight: bold; }
    .combo-status.passed { color: #28a745; }
    .combo-status.failed { color: #dc3545; }
    .no-data { text-align: center; color: #6c757d; font-style: italic; padding: 20px; }
    .footer { text-align: center; padding: 20px; color: #666; margin-top: 40px; border-top: 1px solid #eee; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 25px; cursor: pointer; font-weight: bold; z-index: 1000; }
    .print-btn:hover { background: #0056b3; }
    @media (max-width: 768px) {
      .summary-cards { grid-template-columns: 1fr; }
      .url-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .combinations-table { font-size: 0.9em; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Complete Dropdown Test Report</h1>
      <p>Validation of ALL Dropdown Values and Combinations</p>
      <p style="font-size: 0.9em; margin-top: 10px; opacity: 0.9;">Execution ID: ${jsonReport.testInfo.logFiles.executionId}</p>
    </div>
    
    <div class="summary-cards">
      <div class="summary-card total">
        <h3>Total URLs</h3>
        <div class="value">${jsonReport.testInfo.totalURLs}</div>
      </div>
      <div class="summary-card total">
        <h3>Total Tests</h3>
        <div class="value">${jsonReport.testInfo.totalCombinations}</div>
      </div>
      <div class="summary-card passed">
        <h3>Passed</h3>
        <div class="value">${jsonReport.testInfo.passed}</div>
      </div>
      <div class="summary-card failed">
        <h3>Failed</h3>
        <div class="value">${jsonReport.testInfo.failed}</div>
      </div>
      <div class="summary-card duration">
        <h3>Pass Rate</h3>
        <div class="value">${jsonReport.testInfo.passRate}%</div>
      </div>
    </div>
    
    ${statsSection}
    
    <div style="text-align: center; margin: 30px 0; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="color: ${statusColor};">Overall Status: ${overallStatus}</h2>
      <p>Duration: ${jsonReport.testInfo.duration}</p>
      <p>Environment: ${jsonReport.testInfo.environment}</p>
    </div>
    
    <h2 style="margin: 30px 0 20px 0; color: #333;">Detailed Test Results</h2>
    
    ${urlSections}
    
    <div class="footer">
      <p>Report generated: ${new Date().toLocaleString()}</p>
      <p>Test Suite: ${jsonReport.testInfo.project}</p>
      <p>Logs available at: ${jsonReport.testInfo.logFiles.errors}</p>
    </div>
  </div>
  
  <button class="print-btn" onclick="window.print()">🖨️ Print Report</button>
  
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Toggle combination details
      const urlHeaders = document.querySelectorAll('.url-header');
      urlHeaders.forEach(header => {
        header.addEventListener('click', function() {
          const details = this.nextElementSibling;
          details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });
      });
      
      // Add search functionality
      const searchBox = document.createElement('input');
      searchBox.type = 'text';
      searchBox.placeholder = 'Search test results...';
      searchBox.style.cssText = 'width: 100%; padding: 10px; margin: 20px 0; border: 1px solid #ddd; border-radius: 5px;';
      document.querySelector('h2').parentNode.insertBefore(searchBox, document.querySelector('h2'));
      
      searchBox.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const urlCards = document.querySelectorAll('.url-card');
        
        urlCards.forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(searchTerm) ? 'block' : 'none';
        });
      });
    });
  </script>
</body>
</html>`;
  }

  generateTextSummary(jsonReport) {
    let summary = `COMPLETE DROPDOWN TEST EXECUTION SUMMARY\n`;
    summary += '='.repeat(100) + '\n\n';
    
    summary += `Project: ${jsonReport.testInfo.project}\n`;
    summary += `Execution Date: ${new Date(jsonReport.testInfo.executionDate).toLocaleString()}\n`;
    summary += `Duration: ${jsonReport.testInfo.duration}\n`;
    summary += `Environment: ${jsonReport.testInfo.environment}\n`;
    summary += `Overall Status: ${jsonReport.testInfo.overallStatus}\n`;
    summary += `Total URLs Tested: ${jsonReport.testInfo.totalURLs}\n`;
    summary += `Total Combinations Tested: ${jsonReport.testInfo.totalCombinations}\n`;
    summary += `Passed: ${jsonReport.testInfo.passed}\n`;
    summary += `Failed: ${jsonReport.testInfo.failed}\n`;
    summary += `Pass Rate: ${jsonReport.testInfo.passRate}%\n`;
    summary += `Execution ID: ${jsonReport.testInfo.logFiles.executionId}\n`;
    summary += `Error Log: ${jsonReport.testInfo.logFiles.errors}\n`;
    summary += `Validation Log: ${jsonReport.testInfo.logFiles.validation}\n`;
    summary += `Execution Log: ${jsonReport.testInfo.logFiles.execution}\n\n`;
    
    summary += 'RETRY STATISTICS:\n';
    summary += '-'.repeat(40) + '\n';
    Object.entries(jsonReport.testInfo.retryStatistics || {}).forEach(([operation, count]) => {
      summary += `  ${operation}: ${count} retries\n`;
    });
    summary += '\n';
    
    summary += 'DETAILED RESULTS BY URL:\n';
    summary += '-'.repeat(100) + '\n\n';
    
    jsonReport.results.forEach((result, index) => {
      summary += `URL ${index + 1}: ${result.url}\n`;
      summary += `Description: ${result.description || 'N/A'}\n`;
      summary += `Status: ${result.status}\n`;
      summary += `Duration: ${Math.round(result.duration / 1000) || 0} seconds\n`;
      summary += `Dropdowns Found: ${result.dropdowns}\n`;
      
      // Show dropdown details
      if (result.dropdownDetails && result.dropdownDetails.length > 0) {
        summary += `Dropdown Options:\n`;
        result.dropdownDetails.forEach(detail => {
          summary += `  Dropdown ${detail.index} (${detail.optionCount} options):\n`;
          detail.options.forEach(opt => {
            summary += `    ${opt.value}: ${opt.text || 'No text'}\n`;
          });
        });
      }
      
      if (result.summary) {
        summary += `Combinations Tested: ${result.summary.total}\n`;
        summary += `  ✅ Passed: ${result.summary.passed}\n`;
        summary += `  ❌ Failed: ${result.summary.failed}\n`;
        summary += `  📊 Pass Rate: ${result.summary.passRate || 0}%\n`;
      }
      
      if (result.error) {
        summary += `Error: ${result.error}\n`;
      }
      
      // Show sample of combinations (first 5)
      if (result.combinations && result.combinations.length > 0) {
        summary += `Sample Combinations (${result.combinations.length} total):\n`;
        const sample = result.combinations.slice(0, 5);
        sample.forEach(combo => {
          const optionsText = combo.options.map(opt => 
            `${opt.dropdown}: ${opt.text || opt.value}`
          ).join(' | ');
          summary += `  ${combo.status === 'PASSED' ? '✅' : '❌'} Combo ${combo.number}: ${optionsText} (${combo.duration}ms)\n`;
        });
        if (result.combinations.length > 5) {
          summary += `  ... and ${result.combinations.length - 5} more combinations\n`;
        }
      }
      
      summary += '\n' + '-'.repeat(100) + '\n\n';
    });
    
    return summary;
  }
}

// Run the script
async function main() {
  try {
    const csvFilePath = process.argv[2] || 'urls.csv';
    const tester = new CompleteDropdownTester();
    await tester.runTests(csvFilePath);
  } catch (error) {
    // Create a minimal logger to capture fatal errors
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }
    const errorLogPath = path.join('logs', 'errors.log');
    const fatalError = `[${new Date().toISOString()}] FATAL ERROR: ${error.message}\nStack Trace: ${error.stack}\n${'-'.repeat(80)}\n`;
    fs.appendFileSync(errorLogPath, fatalError);
    
    console.error('\n💥 Fatal error:', error.message);
    console.error(`📝 Error logged to: ${errorLogPath}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}