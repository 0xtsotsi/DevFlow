/**
 * Tests for json-parser utilities
 */

import { describe, it, expect } from 'vitest';
import { safeJsonParse, safeJsonParseOrDefault } from '@/lib/json-parser.js';

describe('json-parser', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON correctly', () => {
      const json = '{"name":"test","value":123}';
      const result = safeJsonParse<{ name: string; value: number }>(json, 'test');
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse valid JSON arrays', () => {
      const json = '[1,2,3,4,5]';
      const result = safeJsonParse<number[]>(json, 'test');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse valid JSON objects', () => {
      const json = '{"id":"bd-test","title":"Test Issue"}';
      type Issue = { id: string; title: string };
      const result = safeJsonParse<Issue>(json, 'test');
      expect(result).toEqual({ id: 'bd-test', title: 'Test Issue' });
    });

    it('should throw descriptive error for invalid JSON', () => {
      const json = '{invalid json}';
      expect(() => safeJsonParse(json, 'listIssues')).toThrow(
        'Failed to parse JSON response from Beads CLI (listIssues)'
      );
    });

    it('should include context in error message', () => {
      const json = '{broken}';
      try {
        safeJsonParse(json, 'getIssue');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('getIssue');
      }
    });

    it('should handle empty strings', () => {
      const json = '';
      expect(() => safeJsonParse(json, 'test')).toThrow();
    });

    it('should handle whitespace', () => {
      const json = '   ';
      expect(() => safeJsonParse(json, 'test')).toThrow();
    });

    it('should preserve type parameter', () => {
      interface TestType {
        items: Array<{ id: string; name: string }>;
      }
      const json = '{"items":[{"id":"1","name":"test"}]}';
      const result = safeJsonParse<TestType>(json, 'test');
      expect(result.items[0].id).toBe('1');
    });
  });

  describe('safeJsonParseOrDefault', () => {
    it('should parse valid JSON correctly', () => {
      const json = '{"value":42}';
      const result = safeJsonParseOrDefault(json, { value: 0 });
      expect(result).toEqual({ value: 42 });
    });

    it('should return default value for invalid JSON', () => {
      const json = '{invalid}';
      const defaultVal = { items: [] };
      const result = safeJsonParseOrDefault(json, defaultVal);
      expect(result).toEqual(defaultVal);
    });

    it('should return default value for empty string', () => {
      const result = safeJsonParseOrDefault('', []);
      expect(result).toEqual([]);
    });

    it('should return default value for malformed JSON', () => {
      const result = safeJsonParseOrDefault('{broken}', 'default');
      expect(result).toBe('default');
    });

    it('should work with arrays', () => {
      const json = '[1,2,3]';
      const result = safeJsonParseOrDefault(json, [] as number[]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should work with objects', () => {
      const json = '{"name":"test"}';
      const result = safeJsonParseOrDefault(json, { name: 'default' });
      expect(result).toEqual({ name: 'test' });
    });
  });
});
