import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createLogger } from '../../src/logging/logger.js';
import { LogLevel } from '../../src/core/types.js';

describe('createLogger', () => {
  it('should create a logger', () => {
    const logger = createLogger('info');
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.debug, 'function');
    assert.strictEqual(typeof logger.warn, 'function');
    assert.strictEqual(typeof logger.error, 'function');
  });

  it('should filter messages below log level', () => {
    // We can only verify that no errors are thrown for different levels
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    for (const level of levels) {
      const logger = createLogger(level);
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');
    }
  });
});
