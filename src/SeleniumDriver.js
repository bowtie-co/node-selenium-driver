const fs = require('fs')
const { execSync } = require('child_process')
const { Builder, By, Key, until, logging } = require('selenium-webdriver')

/**
 * @typedef DriverOptions
 * @type {object}
 * @property {number} [timeout=1000] - Timeout (in ms) for each call to driver.wait()
 * @property {string} [browser='chrome'] - Browser to use with this driver
 * @property {string} [baseUrl='http://localhost:3000'] - Base URL to test against
 * <p>Set via environment variable: `BASE_URL`</p>
 * <p>`export BASE_URL=http://example.com`</p>
 * <p>`BASE_URL=http://example.com npm run myTestScript`</p>
 * </pre>
 * @property {string} [logLevel='SEVERE'] - Log level for debug browser logs
 * <p>Allowed values:</p>
 * <ul style="list-style: none; padding: 0;">
 *   <li>`'OFF'` - Turns off logging</li>
 *   <li>`'SEVERE'` - Messages about things that went wrong. For instance, an unknown command.</li>
 *   <li>`'WARNING'` - Messages about things that may be wrong but was handled. For instance, a handled exception.</li>
 *   <li>`'INFO'` - Messages of an informative nature. For instance, information about received commands.</li>
 *   <li>`'DEBUG'` - Messages for debugging. For instance, information about the state of the driver.</li>
 *   <li>`'ALL'` - All log messages. A way to collect all information regardless of which log levels that are supported.</li>
 * </ul>
 * @property {string} [homePagePath='/'] - Path to homepage. Visited on {@link SeleniumDriver#start}
 * @property {string} [debugDirectory='tmp/selenium-debug'] - Directory to save debug logs and screenshots from failures
**/

/** @type {DriverOptions} */
const defaults = {
  timeout: 1000,
  browser: 'chrome',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  logLevel: 'SEVERE',
  homePagePath: '/',
  debugDirectory: 'tmp/selenium-debug'
}

/**
 * SeleniumDriver helper for better E2E tests
 */
class SeleniumDriver {
  /**
   * Create a new SeleniumDriver object
   * @constructor
   * @param {DriverOptions} options - Options to initialize this driver
   */
  constructor (options) {
    this.options = Object.assign({}, defaults, options)
    this.timeout = this.options.timeout

    if (!logging.Level[this.options.logLevel]) {
      this.options.logLevel = defaults.logLevel
    }

    let pref = new logging.Preferences()
    pref.setLevel('browser', this.options.logLevel)

    this.driver = new Builder()
      .forBrowser(this.options.browser)
      .setLoggingPrefs(pref)
      .build()
  }

  /**
   * Start this driver instance. Delete Cookies and visit homepage (see {@link DriverOptions}.`homePagePath`)
   */
  async start () {
    await this.driver.manage().deleteAllCookies()
    await this.visit(this.options.homePagePath)
  }

  /** Quit this driver instance */
  async quit () {
    await this.driver.quit()
  }

  /**
   * Visit specified page
   * @param {string} page - Path of page to visit
   */
  async visit (page) {
    await this.driver.get(this.options.baseUrl + this._pagePath(page))
  }

  /**
   * Click an element specified by css `selector`
   * @param {string} selector - CSS selector to be clicked
   * @throws {Error} - Unable to click selector: `'${selector}'`
   */
  async click (selector) {
    const element = await this.expectElement(selector)

    try {
      await element.click()
    } catch (e) {
      this.error(`Unable to click selector: '${selector}'`)
    }
  }

  /**
   * Fill in an element with `value` specified by css `selector`
   * @param {string} selector - CSS selector of element to receive keys
   * @param {string} value - Value to be sent to element as keys
   * @param {boolean} [enter=false] - Flag to also send the `ENTER` key after `value`
   * @throws {Error} - Unable to send keys to selector: `'${selector}'`
   */
  async fillIn (selector, value, enter = false) {
    const element = await this.expectElement(selector)

    try {
      if (enter) {
        await element.sendKeys(value, Key.ENTER)
      } else {
        await element.sendKeys(value)
      }
    } catch (e) {
      this.error(`Unable to send keys to selector: '${selector}`)
    }
  }

  /**
   * Select an option with value or text `value` specified by css `selector`
   * @param {string} selector - CSS selector of `<select>` element to pick from
   * @param {string} value - Value (or text) of an `<option>` element to be selected
   * @throws {Error} - Unable to select value/text: `'${value}'` from selector: `'${selector}'`
   */
  async select (selector, value) {
    let option
    const element = await this.expectElement(selector)

    try {
      await element.click()

      const options = await element.findElements(By.tagName('option'))

      await Promise.all(options.map(async opt => {
        if (await opt.getAttribute('value') === value || await opt.getText() === value) {
          option = opt
        }
      }))

      await option.click()

      await this.driver.wait(until.elementIsSelected(option), this.timeout)
    } catch (e) {
      this.error(`Unable to select value/text: '${value}' from selector: '${selector}'`)
    }
  }

  /**
   * Wait for page title to be, contain, or match `title`
   * @param {string|RegExp} title - Title to wait for
   * @param {boolean} [exact=false] - If `true` and `title` is a `string`, then wait until page title is exactly `title`
   * @throws {Error} - Title did not match: `'${title}'`
   */
  async expectTitle (title, exact = false) {
    try {
      if (title.constructor === RegExp) {
        await this.driver.wait(until.titleMatches(title), this.timeout)
      } else if (exact) {
        await this.driver.wait(until.titleIs(title), this.timeout)
      } else {
        await this.driver.wait(until.titleContains(title), this.timeout)
      }
    } catch (e) {
      await this.error(`Title ${this._matchTextNot(title, exact)}`)
    }
  }

  /**
   * Wait for element specified by css `selector` and optional `content`.
   * @param {string} selector - CSS selector of expected element
   * @param {string|RegExp} [content] - Optional content to also be expected within element text
   * @param {boolean} [exact=false] - If `true` and `content` is a `string`, then expect element with text exactly `content`
   * @returns {selenium-webdriver.WebElement} - Returns [selenium-webdriver.WebElement]{@link http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebElement.html}
   * @throws {Error} - No element with selector: `'${selector}'`
   */
  async expectElement (selector, content, exact = false) {
    try {
      await this.driver.wait(until.elementLocated(By.css(selector)), this.timeout)

      const element = await this.driver.findElement(By.css(selector))

      await this.driver.wait(until.elementIsVisible(element), this.timeout)

      if (content) {
        if (content.constructor === RegExp) {
          await this.driver.wait(until.elementTextMatches(element, content), this.timeout)
        } else if (exact) {
          await this.driver.wait(until.elementTextIs(element, content), this.timeout)
        } else {
          await this.driver.wait(until.elementTextContains(element, content), this.timeout)
        }
      }

      return element
    } catch (e) {
      let msg = `No element with selector: '${selector}'`

      if (content) {
        msg += ` and text that ${this._matchText(content, exact)}`
      }

      await this.error(msg)
    }
  }

  /**
   * Wait for specified `element` to become stale
   * @param {selenium-webdriver.WebElement} element - Expects [selenium-webdriver.WebElement]{@link http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebElement.html}
   * @throws {Error} - Element is not stale: `'${await this.elementSelector(element)}'`
   */
  async expectStale (element) {
    try {
      await this.driver.wait(until.stalenessOf(element), this.timeout)
    } catch (e) {
      await this.error(`Element is not stale: '${await this.elementSelector(element)}'`)
    }
  }

  /**
   * Wait for current path to be, match, or contain `page`
   * @param {string|RegExp} page - Page path to wait for
   * @param {boolean} [exact=false] - If `true` and `page` is a `string`, then expect exact full path
   * @throws {Error} - Page did not match: `'${page}'`
   */
  async expectPage (page, exact = false) {
    try {
      if (page.constructor === RegExp) {
        await this.driver.wait(until.urlMatches(page), this.timeout)
      } else if (exact) {
        await this.driver.wait(until.urlIs(this.options.baseUrl + this._pagePath(page)), this.timeout)
      } else {
        await this.driver.wait(until.urlContains(page), this.timeout)
      }
    } catch (e) {
      await this.error(`Page ${this._matchTextNot(page, exact)}`)
    }
  }

  /**
   * Build accurate element selector based on DOM attributes
   * @param {selenium-webdriver.WebElement} element - Expects [selenium-webdriver.WebElement]{@link http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebElement.html}
   * @returns {string} - `${tag}#${id}.${class}`
   */
  async elementSelector (element) {
    const id = await element.getAttribute('id')
    const className = await element.getAttribute('class')

    let selector = await element.getTagName()

    if (id && id.trim() !== '') {
      selector += `#${id}`
    }

    if (className && className.trim() !== '') {
      selector += `.${className.split(' ').join('.')}`
    }

    return selector
  }

  /**
   * Handle error with `msg`. Save browser logs and screenshot to {@link DriverOptions}.`debugDirectory`
   * @param {string} msg - Message for this error. Used for debug dir name and thrown error message
   * @throws {Error} - `msg` + debug info
   */
  async error (msg) {
    const dirName = `${this.options.debugDirectory}/${Date.now()}-${msg.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/[-]*$/, '')}`
    let logs = await this.driver.manage().logs().get('browser')

    execSync(`mkdir -p ${dirName}`)

    fs.appendFileSync(`${dirName}/browser.log`, logs.map(e => `[${e.timestamp}] (${e.level.name_}) - ${e.message}`).join('\n'))

    require('fs').writeFile(`${dirName}/screenshot.png`, await this.driver.takeScreenshot(), 'base64', function (e) {
      if (e) console.log(e)
    })

    msg += `\n\nDebug files created in: ${dirName}\n`
    msg += execSync(`ls -l ${dirName}`).toString()

    throw new Error(msg)
  }

  /**
   * Ensure `page` begins with a slash
   * @param {string} page
   */
  _pagePath (page) {
    let path = page

    if (page.substr(0, 1) !== '/') {
      path = `/${path}`
    }

    return path
  }

  /**
   * Construct dynamic statement depending on `search` type for a positive match
   * @param {string|RegExp} search - String to base statement construction
   * @param {boolean} exact - If exact use wording `is` instead of `contains`
   * @returns {string} - Constructed statement
   */
  _matchText (search, exact) {
    let text = 'contains'

    if (search.constructor === RegExp) {
      text = 'matches'
    } else if (exact) {
      text = 'is'
    }

    return `${text}: '${search}'`
  }

  /**
   * Construct dynamic statement depending on `search` type for a negative match
   * @param {string|RegExp} search - String to base statement construction
   * @param {boolean} exact - If exact use wording `was not` instead of `did not contain`
   * @returns {string} - Constructed statement
   */
  _matchTextNot (search, exact) {
    let text = 'did not '

    if (search.constructor === RegExp) {
      text += 'match'
    } else if (exact) {
      text = 'was not'
    } else {
      text += 'contain'
    }

    return `${text}: '${search}'`
  }
}

module.exports = SeleniumDriver
