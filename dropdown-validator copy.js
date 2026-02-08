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
  }

  async initializeDriver() {
    try {
      const options = new chrome.Options();
      options.addArguments('--start-maximized');
      options.addArguments('--disable-notifications');
      options.addArguments('--disable-popup-blocking');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--disable-gpu');
      
      // Prevent detection
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.excludeSwitches('enable-automation');
      options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      await this.driver.manage().setTimeouts({
        implicit: 10000,
        pageLoad: 30000,
        script: 30000
      });

      console.log('✅ WebDriver initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize WebDriver:', error.message);
      throw error;
    }
  }

  async readCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      if (!fs.existsSync(filePath)) {
        const defaultCSV = `url,description,expectedDropdowns
https://www.nationwide.com/financial-professionals/topics/legacy-estate-wealth-transfer/,Nationwide Legacy & Estate Wealth Transfer,3`;
        fs.writeFileSync('urls.csv', defaultCSV);
        console.log('📄 Created default CSV file');
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
          console.log(`📊 Loaded ${results.length} URLs`);
          resolve(results);
        })
        .on('error', reject);
    });
  }

  async handleConsentPopup() {
    try {
      // Try multiple consent button selectors
      const consentSelectors = [
        '#truste-show-consent',
        '.trustarc-banner button',
        '.cookie-banner button',
        'button[aria-label*="Accept"]',
        'button:contains("Accept")',
        'button:contains("AGREE")'
      ];

      for (const selector of consentSelectors) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements.length > 0) {
            const button = elements[0];
            await this.driver.executeScript("arguments[0].click();", button);
            console.log('✅ Accepted consent popup');
            await this.driver.sleep(1500);
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async waitForPageLoad() {
    try {
      await this.driver.wait(async () => {
        return await this.driver.executeScript('return document.readyState') === 'complete';
      }, 30000);
      
      await this.handleConsentPopup();
      await this.driver.sleep(3000);
      
      return true;
    } catch (error) {
      console.warn('⚠ Page load warning:', error.message);
      return false;
    }
  }

  async getDropdownElements() {
    try {
      // Wait for container
      await this.driver.wait(until.elementLocated(By.css('.nw-container')), 15000);
      
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
            console.log(`✅ Found ${elements.length} dropdowns using: ${selector}`);
            return elements.slice(0, 3); // Return max 3 dropdowns
          }
        } catch (e) {
          continue;
        }
      }
      
      throw new Error('No dropdowns found');
    } catch (error) {
      console.error('❌ Error finding dropdowns:', error.message);
      throw error;
    }
  }

  async getDropdownOptions(dropdownElement, index) {
    try {
      // Extract options from bolt-select shadow DOM
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
        console.warn(`⚠ No valid options found for dropdown ${index + 1}`);
        return [];
      }
      
      console.log(`✅ Dropdown ${index + 1}: Found ${options.length} options`);
      return options;
    } catch (error) {
      console.error(`❌ Error getting options for dropdown ${index + 1}:`, error.message);
      return [];
    }
  }

  async selectDropdownOption(dropdownElement, option, dropdownIndex) {
    try {
      // Use JavaScript to select option in shadow DOM
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
      await this.driver.sleep(800);
      
      // Verify the selection was successful
      const isSelected = await this.verifySelection(dropdownElement, option);
      if (!isSelected) {
        throw new Error('Selection verification failed');
      }
      
      console.log(`✅ Selected: "${option.text}" in dropdown ${dropdownIndex + 1}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to select option:`, error.message);
      return false;
    }
  }

  async verifySelection(dropdownElement, expectedOption) {
    try {
      return await this.driver.executeScript(`
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
    } catch (error) {
      return false;
    }
  }

  async resetToDefault(dropdownElements) {
    try {
      // Try reset button first
      try {
        const resetButton = await this.driver.findElement(By.css('#tileFilterResetButton'));
        await resetButton.click();
        console.log('✅ Reset button clicked');
        await this.driver.sleep(2000);
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
            console.warn(`Could not reset dropdown ${i + 1}:`, error.message);
          }
        }
        await this.driver.sleep(1000);
        console.log('✅ Manual reset completed');
        return true;
      }
    } catch (error) {
      console.warn('⚠ Reset warning:', error.message);
      return false;
    }
  }

  async testAllCombinations(dropdownElements) {
    const results = [];
    
    if (dropdownElements.length === 0) {
      console.error('❌ No dropdowns to test');
      return results;
    }
    
    // Get options for each dropdown
    const dropdownOptions = [];
    for (let i = 0; i < dropdownElements.length; i++) {
      const options = await this.getDropdownOptions(dropdownElements[i], i);
      if (options.length === 0) {
        console.error(`❌ Dropdown ${i + 1} has no options`);
        return results;
      }
      dropdownOptions.push(options);
      console.log(`📝 Dropdown ${i + 1} has ${options.length} options`);
    }
    
    // Generate all possible combinations
    const totalCombinations = dropdownOptions.reduce((total, options) => total * options.length, 1);
    console.log(`🧮 Total combinations to test: ${totalCombinations}`);
    
    // Test all combinations recursively
    await this.testCombinationsRecursive(dropdownElements, dropdownOptions, 0, [], results);
    
    return results;
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
      
      // Select this option
      const success = await this.selectDropdownOption(dropdownElements[currentIndex], option, currentIndex);
      
      if (success) {
        // Move to next dropdown
        await this.testCombinationsRecursive(dropdownElements, optionsArray, currentIndex + 1, newSelection, results);
        
        // If this is not the last option in the current dropdown, reset next dropdowns
        if (i < currentOptions.length - 1 && currentIndex < optionsArray.length - 1) {
          await this.resetNextDropdowns(dropdownElements, optionsArray, currentIndex + 1);
        }
      } else {
        console.error(`❌ Failed to select option, skipping rest of combinations for this path`);
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
        console.warn(`Could not reset dropdown ${i + 1}:`, error.message);
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
      console.log(`✅ Combo ${comboNumber}: PASSED - ${comboText} (${duration}ms)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      result.status = 'FAILED';
      result.error = error.message;
      result.duration = duration;
      result.endTime = new Date().toISOString();
      
      // Update counters
      this.totalTests++;
      this.failedTests++;
      
      console.log(`❌ Combo ${comboNumber}: FAILED - ${error.message} (${duration}ms)`);
    }
    
    return result;
  }

  async runTests(csvFilePath) {
    const startTime = new Date();
    console.log('='.repeat(80));
    console.log('🏁 COMPLETE DROPDOWN TESTING STARTED');
    console.log('='.repeat(80));
    console.log(`Start Time: ${startTime.toLocaleString()}`);

    try {
      // Read CSV
      this.csvData = await this.readCSV(csvFilePath);
      
      if (this.csvData.length === 0) {
        throw new Error('No URLs to test');
      }

      // Initialize WebDriver
      await this.initializeDriver();

      // Test each URL
      for (const [index, testCase] of this.csvData.entries()) {
        console.log(`\n📋 Test ${index + 1}/${this.csvData.length}: ${testCase.description || testCase.url}`);
        console.log('-'.repeat(60));

        const urlResult = {
          url: testCase.url,
          description: testCase.description,
          startTime: new Date().toISOString(),
          combinations: [],
          dropdowns: 0,
          dropdownDetails: [],
          status: 'PENDING'
        };

        try {
          // Navigate to URL
          console.log(`🌐 Navigating to URL...`);
          await this.driver.get(testCase.url);
          await this.waitForPageLoad();
          
          // Find dropdowns
          console.log(`🔍 Finding dropdowns...`);
          const dropdownElements = await this.getDropdownElements();
          urlResult.dropdowns = dropdownElements.length;
          
          if (dropdownElements.length === 0) {
            throw new Error('No dropdowns found on page');
          }
          
          console.log(`✅ Found ${dropdownElements.length} dropdown(s)`);
          
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
          await this.resetToDefault(dropdownElements);
          await this.driver.sleep(2000);
          
          // Test ALL combinations
          console.log(`🧪 Testing ALL combinations...`);
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
            console.log(`❌ URL Results: ${passed} passed, ${failed} failed (${urlResult.summary.passRate}% pass rate)`);
          } else if (passed > 0) {
            urlResult.status = 'PASSED';
            console.log(`✅ URL Results: ${passed} passed, ${failed} failed (${urlResult.summary.passRate}% pass rate)`);
          } else {
            urlResult.status = 'SKIPPED';
            console.log(`⚠ URL Results: No combinations tested`);
          }
          
        } catch (error) {
          urlResult.status = 'ERROR';
          urlResult.error = error.message;
          console.error(`💥 Error testing URL: ${error.message}`);
        }
        
        urlResult.endTime = new Date().toISOString();
        urlResult.duration = new Date(urlResult.endTime) - new Date(urlResult.startTime);
        this.results.push(urlResult);
        
        // Delay between URLs
        if (index < this.csvData.length - 1) {
          console.log('\n⏳ Waiting before next URL...');
          await this.driver.sleep(3000);
        }
      }

    } catch (error) {
      console.error('\n💥 Critical error:', error.message);
    } finally {
      const endTime = new Date();
      const totalDuration = (endTime - startTime) / 1000;
      
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
      console.log('='.repeat(80));
      
      await this.cleanup();
      await this.generateReports(startTime, endTime, totalDuration);
    }
  }

  async cleanup() {
    try {
      if (this.driver) {
        await this.driver.quit();
        console.log('✅ WebDriver closed');
      }
    } catch (error) {
      console.warn('⚠ Cleanup warning:', error.message);
    }
  }

  async generateReports(startTime, endTime, duration) {
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
    
    // Generate JSON report
    const jsonReport = {
      testInfo: {
        project: 'Complete Dropdown Validation Test',
        executionDate: startTime.toISOString(),
        duration: `${duration.toFixed(2)} seconds`,
        environment: 'Chrome Browser',
        totalURLs: this.csvData.length,
        totalCombinations: this.totalTests,
        passed: this.passedTests,
        failed: this.failedTests,
        passRate: passRate,
        overallStatus: overallStatus
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
    
    console.log('\n📊 REPORTS GENERATED:');
    console.log(`📄 JSON Report: ${jsonPath}`);
    console.log(`🌐 HTML Report: ${htmlPath}`);
    console.log(`📋 Text Summary: ${textPath}`);
    
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
  }

  generateHTMLReport(jsonReport) {
    const overallStatus = jsonReport.testInfo.overallStatus;
    const statusColor = overallStatus === 'PASSED' ? '#28a745' : 
                      overallStatus === 'FAILED' ? '#dc3545' : 
                      overallStatus === 'ERROR' ? '#ffc107' : '#6c757d';
    
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
    summary += `Pass Rate: ${jsonReport.testInfo.passRate}%\n\n`;
    
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
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}