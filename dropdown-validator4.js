const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const edge = require('selenium-webdriver/edge');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

class CompactDropdownTester {
  constructor(config = {}) {
    // Core properties
    this.driver = null;
    this.results = [];
    this.csvData = [];
    this.totalTests = this.passedTests = this.failedTests = 0;
    this.executionId = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Logging setup
    this.logDir = 'logs';
    [this.errorLogPath, this.validationLogPath, this.executionLogPath] = 
      ['errors', 'validation', 'execution'].map(f => path.join(this.logDir, `${f}.log`));
    this.initializeLogging();
    
    // Retry configuration
    this.retryCounts = { navigation:0, dropdownFinding:0, dropdownOptions:0, selection:0, verification:0, stuckRecovery:0 };
    this.maxRetries = { navigation:3, dropdownFinding:2, dropdownOptions:2, selection:2, verification:2, overall:3, stuckRecovery:2 };
    
    // NEW: Validation log buffer and stuck detection
    this.validationBuffer = [];
    this.lastActivityTime = Date.now();
    this.activityTimeout = 45000;
    this.currentOperation = null;
    this.isRecovering = false;
    this.startMonitoring();
    
    // Configuration
    this.config = {
      browser: config.browser || 'chrome',
      device: config.device || 'desktop',
      headless: config.headless || false,
      mobileDevice: config.mobileDevice || 'iPhone 12',
      viewport: config.viewport || null,
      userAgent: config.userAgent || null,
      ...config
    };
    
    // Device presets
    this.devicePresets = {
      'iPhone 12': { w:390, h:844, ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', pr:3 },
      'Samsung Galaxy S21': { w:360, h:800, ua:'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36', pr:3 },
      'iPad Pro': { w:1024, h:1366, ua:'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', pr:2 },
      'Surface Duo': { w:540, h:720, ua:'Mozilla/5.0 (Linux; Android 10; Surface Duo) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36 Edg/91.0.864.64', pr:2.5 }
    };
    
    this.setupConsoleFiltering();
  }

  // === LOGGING SYSTEM ===
  initializeLogging() {
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    ['error', 'validation', 'execution'].forEach((type, i) => {
      const msg = type === 'error' ? '🚨 DROPDOWN TEST ERROR LOG' : 
                 type === 'validation' ? '✅ DROPDOWN TEST VALIDATION LOG' : 
                 '🏃‍♂️ EXECUTION FLOW LOG';
      fs.appendFileSync([this.errorLogPath, this.validationLogPath, this.executionLogPath][i], 
        `\n${'='.repeat(60)}\n${msg} - ID: ${this.executionId}\nStart: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n`);
    });
  }

  setupConsoleFiltering() {
    const filters = ['DEPRECATED_ENDPOINT', 'GCM', 'gcm', 'ERROR:device_event_log', 'ERROR:gpu'];
    const shouldFilter = (msg) => filters.some(f => msg.includes(f));
    
    ['log', 'error', 'warn'].forEach(method => {
      const original = console[method];
      console[method] = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        if (!shouldFilter(msg)) original.apply(console, args);
        else if (method === 'error') {
          fs.appendFileSync(path.join(this.logDir, 'browser-errors.log'), 
            `[${new Date().toISOString()}] [FILTERED] ${msg}\n`);
        }
      };
    });
  }

  // === VALIDATION LOG CAPTURE (NEW) ===
  captureValidation(msg, data = null, immediate = false) {
    const entry = { 
      ts: new Date().toISOString(), 
      msg, 
      data, 
      op: this.currentOperation,
      ctx: this.currentTestContext 
    };
    this.validationBuffer.push(entry);
    console.log(`[VALIDATION] ${msg}`);
    if (data) console.log(`   Data: ${JSON.stringify(data, null, 2).replace(/\n/g, '\n   ')}`);
    if (immediate || this.validationBuffer.length >= 50) this.flushValidationBuffer();
    this.updateActivity();
  }

  flushValidationBuffer() {
    if (this.validationBuffer.length === 0) return;
    try {
      const logs = this.validationBuffer.map(e => {
        let line = `[${e.ts}]${e.op ? ` [${e.op}]` : ''} ${e.msg}\n`;
        if (e.data) line += `Data: ${typeof e.data === 'object' ? JSON.stringify(e.data, null, 2) : e.data}\n`;
        if (e.ctx) line += `Context: ${JSON.stringify(e.ctx, null, 2)}\n`;
        return line + `${'-'.repeat(40)}\n`;
      }).join('');
      fs.appendFileSync(this.validationLogPath, logs);
      this.validationBuffer = [];
      this.updateActivity();
    } catch (e) { console.error(`[ERROR] Buffer flush failed: ${e.message}`); }
  }

  logError(msg, error = null, ctx = {}) {
    const ts = new Date().toISOString();
    let entry = `[${ts}] ${msg}\n`;
    if (error) entry += `Error: ${error.message || error}\n${error.stack ? `Stack: ${error.stack}\n` : ''}`;
    if (Object.keys(ctx).length) entry += `Context: ${JSON.stringify(ctx, null, 2)}\n`;
    fs.appendFileSync(this.errorLogPath, entry + `${'-'.repeat(60)}\n`);
    console.error(`[ERROR] ${msg}${error ? ` - ${error.message}` : ''}`);
  }

  logExecution(msg, data = null) {
    const entry = `[${new Date().toISOString()}] ${msg}\n${data ? `Data: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}\n` : ''}${'-'.repeat(40)}\n`;
    fs.appendFileSync(this.executionLogPath, entry);
    console.log(`[EXECUTION] ${msg}`);
  }

  // === STUCK DETECTION & RECOVERY (NEW) ===
  startMonitoring() {
    setInterval(() => this.flushValidationBuffer(), 5000);
    setInterval(() => this.checkForStuckState(), 10000);
  }

  updateActivity() { this.lastActivityTime = Date.now(); }

  async checkForStuckState() {
    const idleTime = Date.now() - this.lastActivityTime;
    if (idleTime > this.activityTimeout && !this.isRecovering) {
      this.captureValidation('⚠️ Possible stuck detected', {
        idle: `${idleTime/1000}s`, op: this.currentOperation, timeout: `${this.activityTimeout/1000}s`
      }, true);
      await this.recoverFromStuckState();
    }
  }

  async recoverFromStuckState() {
    if (this.isRecovering) return;
    this.isRecovering = true;
    this.retryCounts.stuckRecovery = (this.retryCounts.stuckRecovery || 0) + 1;
    
    this.captureValidation('🚨 Attempting stuck recovery', {
      attempt: this.retryCounts.stuckRecovery, op: this.currentOperation
    }, true);
    
    try {
      if (this.currentOperation?.includes('navigation')) await this.driver.navigate().refresh();
      else if (this.currentOperation?.includes('dropdown')) await this.driver.executeScript('window.scrollTo(0, 0);');
      await this.delay(2000);
      this.captureValidation('✅ Recovery successful', null, true);
    } catch (e) {
      this.captureValidation('❌ Recovery failed', { error: e.message }, true);
      if (this.retryCounts.stuckRecovery >= this.maxRetries.stuckRecovery) {
        await this.hardRestart();
      }
    } finally {
      this.isRecovering = false;
      this.updateActivity();
    }
  }

  async hardRestart() {
    this.captureValidation('🔄 INITIATING HARD RESTART', null, true);
    this.flushValidationBuffer();
    if (this.driver) try { await this.driver.quit(); } catch {}
    this.captureValidation('Restart complete', null, true);
  }

  // === DRIVER MANAGEMENT ===
  async initializeDriver() {
    return this.executeWithRetry('initializeDriver', async () => {
      switch (this.config.browser.toLowerCase()) {
        case 'edge': this.driver = await this.initializeEdgeDriver(); break;
        case 'firefox': this.driver = await this.initializeFirefoxDriver(); break;
        default: this.driver = await this.initializeChromeDriver(); break;
      }
      await this.applyDeviceConfiguration();
      await this.driver.manage().setTimeouts({ implicit: 30000, pageLoad: 60000, script: 60000 });
      this.captureValidation(`${this.config.browser} initialized for ${this.config.device}`, null, true);
      return true;
    }, 2);
  }

  async initializeEdgeDriver() {
    const options = new edge.Options();
    this.applyCommonBrowserOptions(options);
    if (this.config.headless) options.addArguments('--headless=new');
    if (this.config.device !== 'desktop') {
      const dc = this.getDeviceConfig();
      options.addArguments(`--user-agent=${dc.ua}`, '--use-mobile-user-agent', `--window-size=${dc.w},${dc.h}`);
    }
    options.addArguments('--disable-gpu', '--log-level=3', '--silent', '--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');
    return await new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build();
  }

  async initializeChromeDriver() {
    const options = new chrome.Options();
    this.applyCommonBrowserOptions(options);
    if (this.config.headless) options.addArguments('--headless=new');
    options.addArguments('--disable-gpu', '--log-level=3', '--silent', '--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');
    return await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  }

  async initializeFirefoxDriver() {
    const options = new firefox.Options();
    if (this.config.headless) options.addArguments('--headless');
    if (this.config.userAgent) options.setPreference('general.useragent.override', this.config.userAgent);
    ['dom.disable_beforeunload', 'browser.cache.disk.enable', 'dom.webdriver.enabled'].forEach(p => 
      options.setPreference(p, false));
    return await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  }

  applyCommonBrowserOptions(options) {
    const args = ['--disable-notifications', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions'];
    if (!this.config.headless) args.push('--start-maximized');
    args.forEach(arg => options.addArguments(arg));
    if (this.config.userAgent && options.setUserAgent) options.setUserAgent(this.config.userAgent);
    else if (this.config.userAgent) options.addArguments(`--user-agent=${this.config.userAgent}`);
  }

  getDeviceConfig() {
    if (this.config.device === 'desktop') return { w:1920, h:1080, ua:this.getDefaultUserAgent(), pr:1 };
    if (this.config.mobileDevice && this.devicePresets[this.config.mobileDevice]) return this.devicePresets[this.config.mobileDevice];
    if (this.config.viewport) return { w:this.config.viewport.width, h:this.config.viewport.height, ua:this.config.userAgent || this.getDefaultUserAgent(), pr:2 };
    return this.devicePresets['iPhone 12'];
  }

  getDefaultUserAgent() {
    const uas = {
      chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0'
    };
    return uas[this.config.browser] || uas.chrome;
  }

  async applyDeviceConfiguration() {
    if (this.config.device === 'desktop') {
      if (!this.config.headless) await this.driver.manage().window().maximize();
      return;
    }
    
    const dc = this.getDeviceConfig();
    await this.driver.manage().window().setRect({ width: dc.w, height: dc.h, x:0, y:0 });
    
    if (this.config.browser === 'edge' || this.config.browser === 'chrome') {
      await this.driver.executeScript(`
        Object.defineProperty(navigator, 'userAgent', { value: '${dc.ua}', writable: false });
        Object.defineProperty(window, 'devicePixelRatio', { value: ${dc.pr}, writable: false });
      `);
    }
    
    this.captureValidation('Device configured', { device: this.config.mobileDevice, w: dc.w, h: dc.h }, true);
  }

  // === CORE TESTING LOGIC ===
  async executeWithRetry(opName, opFn, maxRetries = 3, ctx = {}) {
    this.currentOperation = opName;
    this.updateActivity();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logExecution(`Attempt ${attempt}/${maxRetries}: ${opName}`, { ...ctx, browser: this.config.browser });
        const result = await opFn();
        if (attempt > 1) this.captureValidation(`${opName} succeeded on attempt ${attempt}`, null, true);
        this.retryCounts[opName] = 0;
        return result;
      } catch (error) {
        this.retryCounts[opName] = (this.retryCounts[opName] || 0) + 1;
        this.logError(`${opName} failed attempt ${attempt}`, error, { ...ctx, attempt });
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 1000;
          await this.delay(delay);
          await this.performRecovery(opName, attempt, ctx);
        }
      }
    }
    throw new Error(`${opName} failed after ${maxRetries} attempts`);
  }

  async performRecovery(opName, attempt, ctx) {
    const actions = {
      navigation: async () => { await this.driver.manage().deleteAllCookies(); },
      dropdownFinding: async () => { await this.driver.navigate().refresh(); await this.delay(2000); },
      default: async () => { await this.delay(2000); }
    };
    await (actions[opName] || actions.default)();
  }

  async delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async readCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      if (!fs.existsSync(filePath)) {
        const defaultCSV = `url,description,expectedDropdowns,browser,device\nhttps://example.com,Test Page,3,chrome,desktop`;
        fs.writeFileSync('urls.csv', defaultCSV);
        this.captureValidation('Created default CSV', { filePath }, true);
      }
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          if (data.url?.trim()) results.push({
            url: data.url.trim(),
            description: data.description || '',
            expectedDropdowns: parseInt(data.expectedDropdowns) || 3,
            browser: data.browser || 'chrome',
            device: data.device || 'desktop',
            mobileDevice: data.mobileDevice || 'iPhone 12',
            headless: data.headless === 'true'
          });
        })
        .on('end', () => {
          if (results.length === 0) results.push({
            url: 'https://example.com',
            description: 'Default',
            expectedDropdowns: 3,
            browser: 'chrome',
            device: 'desktop'
          });
          this.captureValidation(`Loaded ${results.length} URLs`, { urls: results.map(r => r.url) }, true);
          resolve(results);
        })
        .on('error', reject);
    });
  }

  async handleCookiesAndPopups() {
    this.captureValidation('Handling cookies/popups...', null, true);
    await this.delay(2000);
    
    const selectors = [
      '#truste-consent-button',
      'button.call[role="button"]',
      'button:contains("Accept")',
      'button:contains("Agree")',
      '.truste-icon-box',
      'button.required[role="button"]'
    ];
    
    for (const selector of selectors) {
      try {
        const elements = await this.driver.findElements(By.css(selector));
        for (const el of elements) {
          if (await el.isDisplayed()) {
            await el.click();
            this.captureValidation(`Clicked: ${selector}`, null, true);
            await this.delay(1500);
            return true;
          }
        }
      } catch {}
    }
    this.captureValidation('No popups found', null, true);
    return false;
  }

  async robustNavigateTo(url, maxAttempts = 3) {
    return this.executeWithRetry('navigation', async () => {
      this.captureValidation(`Navigating to ${url}`, null, true);
      await this.driver.get(url);
      await this.driver.wait(async () => 
        (await this.driver.executeScript('return document.readyState')) === 'complete', 60000);
      await this.handleCookiesAndPopups();
      this.captureValidation('Navigation successful', null, true);
      return true;
    }, maxAttempts, { url });
  }

  async getDropdownElements() {
    return this.executeWithRetry('dropdownFinding', async () => {
      await this.driver.wait(until.elementLocated(By.css('.nw-container')), 30000);
      const selectors = ['bolt-select', '.main-filter bolt-select', 'select[data-test="select"]', 'select'];
      for (const sel of selectors) {
        try {
          const els = await this.driver.findElements(By.css(sel));
          if (els.length >= 1) {
            this.captureValidation(`Found ${els.length} dropdowns`, { selector: sel }, true);
            return els.slice(0, 3);
          }
        } catch {}
      }
      throw new Error('No dropdowns found');
    }, this.maxRetries.dropdownFinding);
  }

  async getDropdownOptions(dropdownElement, index) {
    return this.executeWithRetry('dropdownOptions', async () => {
      const options = await this.driver.executeScript(`
        const el = arguments[0];
        let select = el.tagName === 'BOLT-SELECT' && el.shadowRoot ? 
          el.shadowRoot.querySelector('select') : el.querySelector('select');
        if (!select) return [];
        return Array.from(select.options || []).filter(opt => !opt.disabled && opt.value !== undefined)
          .map((opt, i) => ({ value: opt.value, text: opt.textContent || opt.innerText || '', index: i }));
      `, dropdownElement);
      
      if (options.length === 0) throw new Error(`No options for dropdown ${index + 1}`);
      this.captureValidation(`Dropdown ${index + 1} options`, { count: options.length }, true);
      return options;
    }, this.maxRetries.dropdownOptions, { dropdownIndex: index + 1 });
  }

  async selectDropdownOption(dropdownElement, option, dropdownIndex) {
    return this.executeWithRetry('selection', async () => {
      const success = await this.driver.executeScript(`
        const el = arguments[0], val = arguments[1];
        let select = el.tagName === 'BOLT-SELECT' && el.shadowRoot ? 
          el.shadowRoot.querySelector('select') : el.querySelector('select');
        if (!select) return false;
        select.value = val;
        ['change', 'input', 'click'].forEach(e => select.dispatchEvent(new Event(e, { bubbles: true })));
        return true;
      `, dropdownElement, option.value);
      
      if (!success) throw new Error('Selection failed');
      await this.delay(800);
      
      const verified = await this.driver.executeScript(`
        const el = arguments[0], val = arguments[1];
        let select = el.tagName === 'BOLT-SELECT' && el.shadowRoot ? 
          el.shadowRoot.querySelector('select') : el.querySelector('select');
        return select ? select.value === val : false;
      `, dropdownElement, option.value);
      
      if (!verified) throw new Error('Verification failed');
      this.captureValidation(`Selected option`, { dropdown: dropdownIndex + 1, value: option.value }, true);
      return true;
    }, this.maxRetries.selection, { dropdownIndex: dropdownIndex + 1, value: option.value });
  }

  async resetToDefault(dropdownElements) {
    try {
      await this.driver.findElement(By.css('#tileFilterResetButton')).click();
      this.captureValidation('Reset button clicked', null, true);
    } catch {
      for (let i = 0; i < dropdownElements.length; i++) {
        try {
          const options = await this.getDropdownOptions(dropdownElements[i], i);
          if (options.length > 0) {
            const defaultOpt = options.find(opt => opt.value === '') || options[0];
            await this.selectDropdownOption(dropdownElements[i], defaultOpt, i);
          }
        } catch {}
      }
      this.captureValidation('Manual reset completed', null, true);
    }
    await this.delay(1000);
  }

  async testAllCombinations(dropdownElements) {
    return this.executeWithRetry('testAllCombinations', async () => {
      const results = [];
      if (dropdownElements.length === 0) throw new Error('No dropdowns');
      
      const dropdownOptions = [];
      for (let i = 0; i < dropdownElements.length; i++) {
        const opts = await this.getDropdownOptions(dropdownElements[i], i);
        if (opts.length === 0) throw new Error(`Dropdown ${i + 1} has no options`);
        dropdownOptions.push(opts);
      }
      
      const totalCombos = dropdownOptions.reduce((t, opts) => t * opts.length, 1);
      this.captureValidation(`Testing ${totalCombos} combinations`, { dropdowns: dropdownElements.length }, true);
      
      await this.testCombosRecursive(dropdownElements, dropdownOptions, 0, [], results);
      this.captureValidation(`Combinations tested`, { total: results.length }, true);
      return results;
    }, this.maxRetries.overall);
  }

  async testCombosRecursive(dropdownElements, optionsArray, idx, currentSelection, results) {
    if (idx >= optionsArray.length) {
      const result = await this.testSingleCombination(currentSelection, dropdownElements, results.length + 1);
      results.push(result);
      return;
    }
    
    for (let i = 0; i < optionsArray[idx].length; i++) {
      const opt = optionsArray[idx][i];
      const newSelection = [...currentSelection, opt];
      
      if (await this.selectDropdownOption(dropdownElements[idx], opt, idx)) {
        await this.testCombosRecursive(dropdownElements, optionsArray, idx + 1, newSelection, results);
        if (i < optionsArray[idx].length - 1 && idx < optionsArray.length - 1) {
          await this.resetNextDropdowns(dropdownElements, optionsArray, idx + 1);
        }
      } else {
        results.push({
          name: `Combo ${results.length + 1}`,
          number: results.length + 1,
          options: newSelection,
          status: 'FAILED',
          error: `Failed to select "${opt.text}" in dropdown ${idx + 1}`
        });
      }
    }
  }

  async resetNextDropdowns(dropdownElements, optionsArray, startIdx) {
    for (let i = startIdx; i < dropdownElements.length; i++) {
      try {
        const opts = await this.getDropdownOptions(dropdownElements[i], i);
        if (opts.length > 0) {
          const defaultOpt = opts.find(opt => opt.value === '') || opts[0];
          await this.selectDropdownOption(dropdownElements[i], defaultOpt, i);
        }
      } catch {}
    }
  }

  async testSingleCombination(selection, dropdownElements, comboNumber) {
    const start = Date.now();
    const result = {
      name: `Combo ${comboNumber}`, number: comboNumber,
      startTime: new Date().toISOString(),
      options: [], status: 'FAILED', error: null, duration: 0
    };

    try {
      for (let i = 0; i < selection.length; i++) {
        const verified = await this.driver.executeScript(`
          const el = arguments[0], val = arguments[1];
          let select = el.tagName === 'BOLT-SELECT' && el.shadowRoot ? 
            el.shadowRoot.querySelector('select') : el.querySelector('select');
          return select ? select.value === val : false;
        `, dropdownElements[i], selection[i].value);
        
        if (!verified) throw new Error(`Verification failed for dropdown ${i + 1}`);
        result.options.push({ dropdown: `Dropdown ${i + 1}`, value: selection[i].value, text: selection[i].text });
      }
      
      result.status = 'PASSED';
      this.totalTests++; this.passedTests++;
      this.captureValidation(`Combo ${comboNumber} passed`, { options: selection.map(o => o.text || o.value).join(' > ') }, false);
    } catch (error) {
      result.status = 'FAILED';
      result.error = error.message;
      this.totalTests++; this.failedTests++;
      this.captureValidation(`Combo ${comboNumber} failed`, { error: error.message }, true);
    }
    
    result.duration = Date.now() - start;
    result.endTime = new Date().toISOString();
    return result;
  }

  // === MAIN EXECUTION ===
  async runTests(csvFilePath) {
    const startTime = new Date();
    
    console.log('='.repeat(60));
    console.log('🏁 DROPDOWN TESTING STARTED');
    console.log('='.repeat(60));
    console.log(`Browser: ${this.config.browser.toUpperCase()}`);
    console.log(`Device: ${this.config.device}${this.config.device !== 'desktop' ? ` (${this.config.mobileDevice})` : ''}`);
    console.log(`Headless: ${this.config.headless}`);
    console.log(`Execution ID: ${this.executionId}`);
    
    try {
      this.csvData = await this.readCSV(csvFilePath);
      if (this.csvData.length === 0) throw new Error('No URLs');
      
      for (const [idx, testCase] of this.csvData.entries()) {
        this.config = { ...this.config, ...testCase };
        this.currentTestContext = { urlIdx: idx + 1, total: this.csvData.length, ...testCase };
        
        console.log(`\n📋 Test ${idx + 1}/${this.csvData.length}: ${testCase.description || testCase.url}`);
        console.log(`   Browser: ${this.config.browser.toUpperCase()} | Device: ${this.config.device}`);
        
        const urlResult = {
          url: testCase.url, description: testCase.description,
          browser: this.config.browser, device: this.config.device,
          mobileDevice: this.config.mobileDevice, headless: this.config.headless,
          startTime: new Date().toISOString(), combinations: [], dropdowns: 0, status: 'PENDING'
        };
        
        try {
          await this.initializeDriver();
          await this.robustNavigateTo(testCase.url, 3);
          
          const dropdownElements = await this.getDropdownElements();
          urlResult.dropdowns = dropdownElements.length;
          
          // Get dropdown details
          for (let i = 0; i < dropdownElements.length; i++) {
            const opts = await this.getDropdownOptions(dropdownElements[i], i);
            urlResult.dropdownDetails = urlResult.dropdownDetails || [];
            urlResult.dropdownDetails.push({ 
              index: i + 1, 
              optionCount: opts.length,
              sampleOptions: opts.slice(0, 3).map(o => o.text) // Sample first 3 options
            });
          }
          
          await this.resetToDefault(dropdownElements);
          const combos = await this.testAllCombinations(dropdownElements);
          urlResult.combinations = combos;
          
          const passed = combos.filter(c => c.status === 'PASSED').length;
          const failed = combos.filter(c => c.status === 'FAILED').length;
          urlResult.summary = { 
            passed, 
            failed, 
            total: combos.length, 
            passRate: combos.length > 0 ? Math.round((passed / combos.length) * 100) : 0 
          };
          
          urlResult.status = failed > 0 ? 'FAILED' : passed > 0 ? 'PASSED' : 'SKIPPED';
          this.captureValidation(`URL test ${urlResult.status}`, { passed, failed }, true);
          
        } catch (error) {
          urlResult.status = 'ERROR';
          urlResult.error = error.message;
          this.captureValidation(`URL test error`, { error: error.message }, true);
        } finally {
          await this.cleanup();
          urlResult.endTime = new Date().toISOString();
          urlResult.duration = new Date(urlResult.endTime) - new Date(urlResult.startTime);
          this.results.push(urlResult);
          
          if (idx < this.csvData.length - 1) await this.delay(3000);
        }
      }
      
    } catch (error) {
      this.captureValidation('Critical error', { error: error.message }, true);
    } finally {
      await this.finalizeExecution(startTime);
    }
  }

  async finalizeExecution(startTime) {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    const passRate = this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0;
    
    this.flushValidationBuffer();
    
    // Summary
    this.captureValidation('\n' + '='.repeat(60), null, true);
    this.captureValidation('TESTING COMPLETED', null, true);
    this.captureValidation('='.repeat(60), null, true);
    this.captureValidation(`Duration: ${duration.toFixed(2)}s`, null, true);
    this.captureValidation(`Tests: ${this.totalTests} (✅${this.passedTests} ❌${this.failedTests})`, null, true);
    this.captureValidation(`Pass Rate: ${passRate}%`, null, true);
    this.captureValidation(`Stuck Recoveries: ${this.retryCounts.stuckRecovery}`, null, true);
    this.captureValidation('='.repeat(60), null, true);
    
    await this.generateReports(startTime, endTime, duration);
  }

  async cleanup() {
    if (this.driver) {
      try { await this.driver.quit(); this.driver = null; } catch {}
      this.captureValidation('Driver cleaned up', null, true);
    }
  }

  async generateReports(startTime, endTime, duration) {
    const reportDir = 'reports';
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const passRate = this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0;
    
    // Calculate overall status
    let overallStatus = 'PASSED';
    if (this.results.some(r => r.status === 'ERROR')) {
      overallStatus = 'ERROR';
    } else if (this.results.some(r => r.status === 'FAILED')) {
      overallStatus = 'FAILED';
    } else if (this.results.every(r => r.status === 'SKIPPED')) {
      overallStatus = 'SKIPPED';
    }
    
    // Calculate browser and device distribution
    const browserDist = this.results.reduce((acc, r) => {
      acc[r.browser] = (acc[r.browser] || 0) + 1;
      return acc;
    }, {});
    
    const deviceDist = this.results.reduce((acc, r) => {
      acc[r.device] = (acc[r.device] || 0) + 1;
      return acc;
    }, {});
    
    // JSON Report
    const jsonReport = {
      summary: {
        executionId: this.executionId,
        start: startTime.toISOString(), 
        end: endTime.toISOString(),
        duration: `${duration.toFixed(2)}s`, 
        totalTests: this.totalTests,
        passed: this.passedTests, 
        failed: this.failedTests, 
        passRate: `${passRate}%`,
        overallStatus: overallStatus,
        stuckRecoveries: this.retryCounts.stuckRecovery,
        retryStatistics: this.retryCounts,
        browserDistribution: browserDist,
        deviceDistribution: deviceDist
      },
      results: this.results,
      config: this.config,
      logs: {
        errors: this.errorLogPath, 
        validation: this.validationLogPath,
        execution: this.executionLogPath, 
        id: this.executionId
      }
    };
    
    const jsonPath = path.join(reportDir, `dropdown-test-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    
    // Text Summary
    const textSummary = `
================================================================
 DROPDOWN TEST REPORT - ${timestamp}
================================================================
Execution ID: ${this.executionId}
Start Time: ${startTime.toLocaleString()}
End Time: ${endTime.toLocaleString()}
Total Duration: ${duration.toFixed(2)} seconds
Browser: ${this.config.browser.toUpperCase()}
Device: ${this.config.device}${this.config.device !== 'desktop' ? ` (${this.config.mobileDevice})` : ''}
================================================================
TEST RESULTS:
Total URLs Tested: ${this.csvData.length}
Total Combinations: ${this.totalTests}
Passed: ${this.passedTests}
Failed: ${this.failedTests}
Pass Rate: ${passRate}%
Stuck Recoveries: ${this.retryCounts.stuckRecovery}
Overall Status: ${overallStatus}
================================================================
LOG FILES:
Error Log: ${this.errorLogPath}
Validation Log: ${this.validationLogPath}
Execution Log: ${this.executionLogPath}
JSON Report: ${jsonPath}
================================================================
    `.trim();
    
    const textPath = path.join(reportDir, `dropdown-summary-${timestamp}.txt`);
    fs.writeFileSync(textPath, textSummary);
    
    // HTML Report
    const htmlPath = path.join(reportDir, `dropdown-test-${timestamp}.html`);
    const htmlReport = this.generateHTMLReport(jsonReport, timestamp);
    fs.writeFileSync(htmlPath, htmlReport);
    
    console.log('\n' + '='.repeat(60));
    console.log(textSummary);
    console.log('='.repeat(60));
    console.log(`\n📊 Reports saved to: ${reportDir}/`);
    console.log(`📄 JSON Report: ${jsonPath}`);
    console.log(`🌐 HTML Report: ${htmlPath}`);
    console.log(`📋 Text Summary: ${textPath}`);
    
    // Try to open HTML report automatically
    try {
      const { exec } = require('child_process');
      const openCommands = {
        'win32': `start "" "${htmlPath}"`,
        'darwin': `open "${htmlPath}"`,
        'linux': `xdg-open "${htmlPath}"`
      };
      if (openCommands[process.platform]) {
        exec(openCommands[process.platform]);
        console.log('\n✅ HTML report opened in browser');
      }
    } catch (error) {
      console.log('\nℹ️  Open HTML report manually:', htmlPath);
    }
  }

  // NEW: HTML Report Generation
  generateHTMLReport(jsonReport, timestamp) {
    const statusColor = {
      'PASSED': '#28a745',
      'FAILED': '#dc3545',
      'ERROR': '#ffc107',
      'SKIPPED': '#6c757d'
    };
    
    const overallColor = statusColor[jsonReport.summary.overallStatus] || '#6c757d';
    
    // Generate results table rows
    let resultsRows = '';
    jsonReport.results.forEach((result, index) => {
      const rowColor = statusColor[result.status] || '#f8f9fa';
      const duration = (result.duration / 1000).toFixed(2);
      const passRate = result.summary ? `${result.summary.passRate}%` : 'N/A';
      
      resultsRows += `
      <tr style="background-color: ${rowColor}20;">
        <td>${index + 1}</td>
        <td><a href="${result.url}" target="_blank">${result.url.substring(0, 40)}...</a></td>
        <td>${result.description || 'N/A'}</td>
        <td>${result.browser}</td>
        <td>${result.device}</td>
        <td>${result.dropdowns}</td>
        <td>${result.combinations?.length || 0}</td>
        <td>${result.summary?.passed || 0}</td>
        <td>${result.summary?.failed || 0}</td>
        <td>${passRate}</td>
        <td>${duration}s</td>
        <td><span class="badge" style="background-color: ${statusColor[result.status] || '#6c757d'}">${result.status}</span></td>
      </tr>
      `;
    });
    
    // Generate retry statistics rows
    let retryRows = '';
    Object.entries(jsonReport.summary.retryStatistics || {}).forEach(([operation, count]) => {
      retryRows += `<tr><td>${operation}</td><td>${count}</td></tr>`;
    });
    
    // Generate browser distribution rows
    let browserRows = '';
    Object.entries(jsonReport.summary.browserDistribution || {}).forEach(([browser, count]) => {
      browserRows += `<tr><td>${browser}</td><td>${count}</td></tr>`;
    });
    
    // Generate device distribution rows
    let deviceRows = '';
    Object.entries(jsonReport.summary.deviceDistribution || {}).forEach(([device, count]) => {
      deviceRows += `<tr><td>${device}</td><td>${count}</td></tr>`;
    });
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dropdown Test Report - ${timestamp}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem 0; margin-bottom: 2rem; }
        .card { border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 1.5rem; border-radius: 10px; }
        .card-header { background-color: #fff; border-bottom: 2px solid #e9ecef; font-weight: 600; }
        .badge { padding: 0.5em 0.8em; border-radius: 20px; color: white; font-size: 0.8em; }
        .summary-card { border-left: 4px solid ${overallColor} !important; }
        .chart-container { position: relative; height: 300px; margin: 20px 0; }
        .status-icon { font-size: 1.5em; margin-right: 8px; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .error { color: #ffc107; }
        .skipped { color: #6c757d; }
        .log-link { color: #6c757d; text-decoration: none; }
        .log-link:hover { color: #495057; text-decoration: underline; }
        table { font-size: 0.9em; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .progress { height: 25px; border-radius: 5px; }
        .progress-bar { border-radius: 5px; }
        .execution-id { font-family: monospace; background-color: #e9ecef; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1 class="display-4">📊 Dropdown Test Report</h1>
            <p class="lead">Comprehensive test execution report for dropdown validation</p>
            <p class="mb-0">
                <span class="execution-id">${jsonReport.summary.executionId}</span>
                <span class="ms-3">${new Date(jsonReport.summary.start).toLocaleString()}</span>
            </p>
        </div>
    </div>

    <div class="container">
        <!-- Summary Cards -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card summary-card">
                    <div class="card-body text-center">
                        <h1 class="display-4">${jsonReport.summary.totalTests}</h1>
                        <p class="text-muted mb-0">Total Tests</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card summary-card">
                    <div class="card-body text-center">
                        <h1 class="display-4 passed">${jsonReport.summary.passed}</h1>
                        <p class="text-muted mb-0">Passed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card summary-card">
                    <div class="card-body text-center">
                        <h1 class="display-4 failed">${jsonReport.summary.failed}</h1>
                        <p class="text-muted mb-0">Failed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card summary-card">
                    <div class="card-body text-center">
                        <h1 class="display-4" style="color: ${overallColor}">${jsonReport.summary.passRate}</h1>
                        <p class="text-muted mb-0">Pass Rate</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Overall Status -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">📈 Overall Execution Summary</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-8">
                        <div class="chart-container">
                            <canvas id="resultsChart"></canvas>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <table class="table">
                            <tr>
                                <td><strong>Start Time:</strong></td>
                                <td>${new Date(jsonReport.summary.start).toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td><strong>End Time:</strong></td>
                                <td>${new Date(jsonReport.summary.end).toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td><strong>Duration:</strong></td>
                                <td>${jsonReport.summary.duration}</td>
                            </tr>
                            <tr>
                                <td><strong>Browser:</strong></td>
                                <td>${jsonReport.config.browser.toUpperCase()}</td>
                            </tr>
                            <tr>
                                <td><strong>Device:</strong></td>
                                <td>${jsonReport.config.device}${jsonReport.config.device !== 'desktop' ? ` (${jsonReport.config.mobileDevice})` : ''}</td>
                            </tr>
                            <tr>
                                <td><strong>Headless Mode:</strong></td>
                                <td>${jsonReport.config.headless ? 'Yes' : 'No'}</td>
                            </tr>
                            <tr>
                                <td><strong>Overall Status:</strong></td>
                                <td><span class="badge" style="background-color: ${overallColor}">${jsonReport.summary.overallStatus}</span></td>
                            </tr>
                            <tr>
                                <td><strong>Stuck Recoveries:</strong></td>
                                <td>${jsonReport.summary.stuckRecoveries}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Progress Bar -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">📊 Test Results Progress</h5>
            </div>
            <div class="card-body">
                <div class="progress mb-3">
                    <div class="progress-bar bg-success" style="width: ${jsonReport.summary.passRate}%">
                        ${jsonReport.summary.passRate}% Passed
                    </div>
                    <div class="progress-bar bg-danger" style="width: ${100 - parseFloat(jsonReport.summary.passRate)}%">
                        ${100 - parseFloat(jsonReport.summary.passRate)}% Failed
                    </div>
                </div>
                <div class="row text-center">
                    <div class="col-md-6">
                        <p class="mb-1">Pass Rate</p>
                        <h3>${jsonReport.summary.passRate}</h3>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1">Execution Time</p>
                        <h3>${jsonReport.summary.duration}</h3>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detailed Results Table -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">📋 Detailed Test Results</h5>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>URL</th>
                                <th>Description</th>
                                <th>Browser</th>
                                <th>Device</th>
                                <th>Dropdowns</th>
                                <th>Combos</th>
                                <th>Passed</th>
                                <th>Failed</th>
                                <th>Pass Rate</th>
                                <th>Duration</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${resultsRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Statistics -->
        <div class="row mb-4">
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">🔄 Retry Statistics</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr><th>Operation</th><th>Retries</th></tr>
                                </thead>
                                <tbody>
                                    ${retryRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">🌐 Browser Distribution</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr><th>Browser</th><th>Count</th></tr>
                                </thead>
                                <tbody>
                                    ${browserRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">📱 Device Distribution</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr><th>Device</th><th>Count</th></tr>
                                </thead>
                                <tbody>
                                    ${deviceRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Log Files -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">📝 Log Files</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <ul class="list-unstyled">
                            <li class="mb-2">
                                <span class="status-icon error">🚨</span>
                                <a href="file://${jsonReport.logs.errors}" class="log-link" target="_blank">Error Log</a>
                                <small class="text-muted"> - Detailed error information</small>
                            </li>
                            <li class="mb-2">
                                <span class="status-icon passed">✅</span>
                                <a href="file://${jsonReport.logs.validation}" class="log-link" target="_blank">Validation Log</a>
                                <small class="text-muted"> - Test validation details</small>
                            </li>
                            <li>
                                <span class="status-icon">🏃‍♂️</span>
                                <a href="file://${jsonReport.logs.execution}" class="log-link" target="_blank">Execution Log</a>
                                <small class="text-muted"> - Step-by-step execution flow</small>
                            </li>
                        </ul>
                    </div>
                    <div class="col-md-6">
                        <ul class="list-unstyled">
                            <li class="mb-2">
                                <span class="status-icon">📄</span>
                                <a href="file://${path.join('reports', `dropdown-test-${timestamp}.json`)}" class="log-link" target="_blank">JSON Report</a>
                                <small class="text-muted"> - Machine-readable report</small>
                            </li>
                            <li class="mb-2">
                                <span class="status-icon">📋</span>
                                <a href="file://${path.join('reports', `dropdown-summary-${timestamp}.txt`)}" class="log-link" target="_blank">Text Summary</a>
                                <small class="text-muted"> - Plain text summary</small>
                            </li>
                            <li>
                                <span class="status-icon">🌐</span>
                                <strong>HTML Report</strong> (current file)
                                <small class="text-muted"> - Visual interactive report</small>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="text-center text-muted mb-4">
            <p>Report generated on ${new Date().toLocaleString()} by Dropdown Test Automation Suite</p>
            <p class="small">Execution ID: <span class="execution-id">${jsonReport.summary.executionId}</span></p>
        </div>
    </div>

    <script>
        // Chart.js for results visualization
        const ctx = document.getElementById('resultsChart').getContext('2d');
        const resultsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [${jsonReport.summary.passed}, ${jsonReport.summary.failed}],
                    backgroundColor: ['#28a745', '#dc3545'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            font: {
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return \`\${label}: \${value} (\${percentage}%)\`;
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>
    `;
    
    return html;
  }
}

// Export for use
module.exports = CompactDropdownTester;

// Usage examples:
if (require.main === module) {
  // Run with Edge and Mobile
  const tester = new CompactDropdownTester({
    browser: 'edge',
    device: 'mobile',
    mobileDevice: 'Surface Duo',
    headless: false
  });
  
  tester.runTests('urls.csv').catch(console.error);
}