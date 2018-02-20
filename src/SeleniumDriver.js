const fs = require('fs')
const { execSync } = require('child_process')
const { Builder, By, Key, until, logging } = require('selenium-webdriver')

const defaults = {
  timeout: 1000,
  browser: 'chrome',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  logLevel: 'SEVERE',
  homePagePath: '/',
  debugDirectory: 'tmp/selenium-debug',
  notificationsParent: '.notifications'
}

class SeleniumDriver {
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

  async start () {
    await this.driver.manage().deleteAllCookies()
    await this.visit(this.options.homePagePath)
  }

  async quit () {
    await this.driver.quit()
  }

  async visit (page) {
    await this.driver.get(this.options.baseUrl + this._pagePath(page))
  }

  async click (selector) {
    const element = await this.expectElement(selector)

    try {
      await element.click()
    } catch (e) {
      this.error(`Unable to click selector: '${selector}`)
    }
  }

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
      this.error(e)
    }
  }

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

  async expectStale (element) {
    try {
      await this.driver.wait(until.stalenessOf(element), this.timeout)
    } catch (e) {
      await this.error(`Element is not stale: '${await this.elementSelector(element)}'`)
    }
  }

  async expectPage (page, exact = true) {
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

  async error (msg) {
    const dirName = `${this.options.debugDirectory}/${Date.now()}-${msg.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/[-]*$/, '')}`
    let logs = await this.driver.manage().logs().get('browser')

    execSync(`mkdir -p ${dirName}`)

    fs.appendFileSync(`${dirName}/browser.log`, logs.map(e => `[${e.timestamp}] (${e.level.name_}) - ${e.message}`).join('\n'))

    require('fs').writeFile(`${dirName}/screenshot.png`, await this.driver.takeScreenshot(), 'base64', function (e) {
      if (e) console.log(e)
    })

    console.log(`Debug files created in: ${dirName}`)

    console.log(execSync(`ls -l ${dirName}`).toString())

    throw new Error(msg)
  }

  _pagePath (page) {
    let path = page

    if (page.substr(0, 1) !== '/') {
      path = `/${path}`
    }

    return path
  }

  _matchText (search, exact) {
    let text = 'contains'

    if (search.constructor === RegExp) {
      text = 'matches'
    } else if (exact) {
      text = 'is'
    }

    return `${text}: '${search}'`
  }

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
