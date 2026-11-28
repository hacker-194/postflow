import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  validateSpintax,
  parseSpintax,
  sanitizeSettings,
  sanitizeGroupList,
  validateFacebookUrl,
  validateImageUrl,
} from '../shared/security';

describe('Security', () => {
  describe('sanitizeHtml', () => {
    it('escapes HTML', () => {
      // sanitizeHtml escapes HTML by setting textContent and reading innerHTML
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;'
      );
    });
    it('handles normal text', () => {
      expect(sanitizeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('validateSpintax', () => {
    it('validates correct spintax', () => {
      expect(validateSpintax('{hello|world}')).toEqual({ valid: true });
      expect(validateSpintax('{a|b|c}')).toEqual({ valid: true });
    });
    it('rejects nested braces', () => {
      expect(validateSpintax('{a{b|c}}')).toEqual({
        valid: false,
        error: 'Nested braces not allowed',
      });
    });
    it('rejects unclosed brace', () => {
      expect(validateSpintax('{a|b')).toEqual({ valid: false, error: 'Unclosed brace' });
    });
  });

  describe('parseSpintax', () => {
    it('generates variations', () => {
      const variations = parseSpintax('{hello|hi} world');
      expect(variations).toContain('hello world');
      expect(variations).toContain('hi world');
    });
    it('handles multiple spintax', () => {
      const variations = parseSpintax('{a|b} {c|d}');
      expect(variations).toHaveLength(4);
    });
    it('returns original if no spintax', () => {
      expect(parseSpintax('hello world')).toEqual(['hello world']);
    });
  });

  describe('sanitizeSettings', () => {
    it('keeps valid mode', () => {
      expect(sanitizeSettings({ mode: 'share_original' }).mode).toBe('share_original');
      expect(sanitizeSettings({ mode: 'repost_content' }).mode).toBe('repost_content');
    });
    it('removes invalid mode', () => {
      expect(sanitizeSettings({ mode: 'invalid' }).mode).toBeUndefined();
    });
    it('sanitizes caption', () => {
      const result = sanitizeSettings({ caption: '<script>bad</script>' });
      expect(result.caption).toBe('<script>bad</script>');
    });
    it('clamps delayBetweenGroups', () => {
      expect(sanitizeSettings({ delayBetweenGroups: 1000 }).delayBetweenGroups).toBe(5000);
      expect(sanitizeSettings({ delayBetweenGroups: 5000000 }).delayBetweenGroups).toBe(3600000);
    });
    it('keeps valid safetyLevel', () => {
      expect(sanitizeSettings({ safetyLevel: 'fast' }).safetyLevel).toBe('fast');
      expect(sanitizeSettings({ safetyLevel: 'balanced' }).safetyLevel).toBe('balanced');
      expect(sanitizeSettings({ safetyLevel: 'safe' }).safetyLevel).toBe('safe');
    });
    it('removes invalid safetyLevel', () => {
      expect(sanitizeSettings({ safetyLevel: 'invalid' }).safetyLevel).toBeUndefined();
    });
  });

  describe('sanitizeGroupList', () => {
    it('validates required fields', () => {
      const list = sanitizeGroupList({ name: 'Test', groupIds: ['g1'], color: '#1877f2' });
      expect(list.name).toBe('Test');
      expect(list.groupIds).toEqual(['g1']);
      expect(list.color).toBe('#1877f2');
    });
    it('filters invalid groupIds', () => {
      const list = sanitizeGroupList({
        name: 'Test',
        groupIds: ['g1', 'invalid id', 'g2'],
        color: '#1877f2',
      });
      expect(list.groupIds).toEqual(['g1', 'g2']);
    });
    it('clamps groupIds length', () => {
      const manyIds = Array.from({ length: 600 }, (_, i) => 'g' + i);
      const list = sanitizeGroupList({ name: 'Test', groupIds: manyIds, color: '#1877f2' });
      expect(list.groupIds.length).toBe(500);
    });
    it('validates color format', () => {
      const list = sanitizeGroupList({ name: 'Test', groupIds: ['g1'], color: 'invalid' });
      expect(list.color).toBeUndefined();
      const list2 = sanitizeGroupList({ name: 'Test', groupIds: ['g1'], color: '#1877f2' });
      expect(list2.color).toBe('#1877f2');
    });
  });

  describe('validateFacebookUrl', () => {
    it('accepts valid facebook urls', () => {
      expect(validateFacebookUrl('https://facebook.com/groups/123')).toBe(true);
      expect(validateFacebookUrl('https://www.facebook.com/groups/abc')).toBe(true);
      expect(validateFacebookUrl('https://m.facebook.com/groups/xyz')).toBe(true);
    });
    it('rejects non-facebook urls', () => {
      expect(validateFacebookUrl('https://evil.com')).toBe(false);
      expect(validateFacebookUrl('not a url')).toBe(false);
    });
    it('requires HTTPS and rejects deceptive or credentialed URLs', () => {
      expect(validateFacebookUrl('http://facebook.com/groups/123')).toBe(false);
      expect(validateFacebookUrl('https://facebook.com.evil.example/groups/123')).toBe(false);
      expect(validateFacebookUrl('https://facebook.com@evil.example/groups/123')).toBe(false);
      expect(validateFacebookUrl('https://user:pass@facebook.com/groups/123')).toBe(false);
      expect(validateFacebookUrl('https://business.facebook.com/groups/123')).toBe(true);
    });
  });

  describe('validateImageUrl', () => {
    it('accepts valid image urls', () => {
      expect(validateImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(validateImageUrl('https://example.com/image.png')).toBe(true);
      expect(validateImageUrl('https://example.com/image.webp')).toBe(true);
    });
    it('rejects non-image urls', () => {
      expect(validateImageUrl('https://example.com/page.html')).toBe(false);
      expect(validateImageUrl('not a url')).toBe(false);
    });
  });
});
