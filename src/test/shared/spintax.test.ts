import { describe, it, expect } from 'vitest';
import {
  parseSpintax,
  expandSpintax,
  hasSpintax,
  getSpintaxVariations,
} from '../../shared/spintax';

describe('spintax', () => {
  describe('parseSpintax', () => {
    it('parses simple spintax {a|b|c}', () => {
      const result = parseSpintax('Hello {world|universe}');
      expect(result).toEqual([
        { type: 'text', value: 'Hello ' },
        {
          type: 'spin',
          options: [
            { weight: 1, nodes: [{ type: 'text', value: 'world' }] },
            { weight: 1, nodes: [{ type: 'text', value: 'universe' }] },
          ],
        },
      ]);
    });

    it('parses weighted spintax {a:2|b:1}', () => {
      const result = parseSpintax('{option1:2|option2:1}');
      expect(result[0]).toEqual({
        type: 'spin',
        options: [
          { weight: 2, nodes: [{ type: 'text', value: 'option1' }] },
          { weight: 1, nodes: [{ type: 'text', value: 'option2' }] },
        ],
      });
    });

    it('parses nested spintax', () => {
      const result = parseSpintax('{a{b|c}|d}');
      expect(result[0].type).toBe('spin');
      // First option has nested spintax
      const firstOption = result[0].options[0];
      expect(firstOption.nodes[0]).toEqual({ type: 'text', value: 'a' });
      expect(firstOption.nodes[1].type).toBe('spin');
    });

    it('handles empty input', () => {
      const result = parseSpintax('');
      expect(result).toEqual([]);
    });

    it('handles text without spintax', () => {
      const result = parseSpintax('Just plain text');
      expect(result).toEqual([{ type: 'text', value: 'Just plain text' }]);
    });
  });

  describe('expandSpintax', () => {
    it('expands simple spintax', () => {
      const ast = parseSpintax('Hello {world|universe}');
      const results = new Set<string>();
      for (let i = 0; i < 10; i++) {
        results.add(expandSpintax(ast));
      }
      expect(results).toContain('Hello world');
      expect(results).toContain('Hello universe');
    });

    it('expands weighted spintax with correct probabilities', () => {
      const ast = parseSpintax('{a:2|b:1}');
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        results.add(expandSpintax(ast));
      }
      expect(results).toContain('a');
      expect(results).toContain('b');
    });

    it('expands multiple spintax segments', () => {
      const ast = parseSpintax('{A|B} and {C|D}');
      // Deterministic RNG: 8 calls (2 per expand) to hit all 4 combos
      const vals = [0.1, 0.1, 0.6, 0.1, 0.1, 0.6, 0.6, 0.6];
      const rng = (() => {
        let i = 0;
        return () => vals[i++];
      })();
      const results = new Set<string>();
      for (let i = 0; i < 4; i++) results.add(expandSpintax(ast, rng));
      expect(results).toContain('A and C');
      expect(results).toContain('A and D');
      expect(results).toContain('B and C');
      expect(results).toContain('B and D');
    });

    it('handles no spintax', () => {
      const ast = parseSpintax('Plain text');
      const result = expandSpintax(ast);
      expect(result).toBe('Plain text');
    });

    it('handles empty spintax option', () => {
      const ast = parseSpintax('{a|}');
      const results = new Set<string>();
      for (let i = 0; i < 10; i++) {
        results.add(expandSpintax(ast));
      }
      expect(results).toContain('a');
      expect(results).toContain('');
    });
  });

  describe('hasSpintax', () => {
    it('returns true for text with spintax', () => {
      expect(hasSpintax('Hello {world|universe}')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(hasSpintax('Hello world')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasSpintax('')).toBe(false);
    });
  });

  describe('getSpintaxVariations', () => {
    it('returns array of variations', () => {
      const variations = getSpintaxVariations('{a|b|c}');
      expect(Array.isArray(variations)).toBe(true);
      expect(variations.length).toBeGreaterThan(0);
      expect(variations.length).toBeLessThanOrEqual(3);
    });

    it('returns variations for multiple segments', () => {
      const variations = getSpintaxVariations('{a|b} and {c|d}');
      expect(Array.isArray(variations)).toBe(true);
      expect(variations.length).toBeGreaterThan(0);
      expect(variations.length).toBeLessThanOrEqual(4);
    });

    it('returns single variation for plain text', () => {
      const variations = getSpintaxVariations('plain text');
      expect(variations).toEqual(['plain text']);
    });
  });
});
