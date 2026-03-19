/**
 * Jest Global Setup
 * Silences console output to keep test results clean.
 */

/* global global, jest */

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};
