/* eslint-env mocha */

const chai = require('chai')
const { expect } = chai
const SeleniumDriver = require('../')

describe('SeleniumDriver', function () {
  it('should exist', function () {
    expect(SeleniumDriver).to.be.a('function')
  })
})
