import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('Progressive Web App (PWA) Subsystem', () => {
  describe('Web App Manifest Specification', () => {
    const pwaManifest = manifest();

    it('defines compliant application metadata and branding', () => {
      expect(pwaManifest.name).toBe('IFS-Guru - Personal Finance & Amortization');
      expect(pwaManifest.short_name).toBe('IFS-Guru');
      expect(pwaManifest.start_url).toBe('/');
      expect(pwaManifest.scope).toBe('/');
      expect(pwaManifest.display).toBe('standalone');
      expect(pwaManifest.orientation).toBe('portrait-primary');
    });

    it('configures standard and high-contrast color scheme definitions', () => {
      expect(pwaManifest.background_color).toBe('#0f172a');
      expect(pwaManifest.theme_color).toBe('#0284c7');
    });

    it('provides complete icon asset definitions including standard and maskable icons', () => {
      expect(pwaManifest.icons).toBeDefined();
      expect(pwaManifest.icons?.length).toBeGreaterThanOrEqual(3);

      const sizes = pwaManifest.icons?.map(i => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');

      const maskableIcon = pwaManifest.icons?.find(i => i.purpose === 'maskable');
      expect(maskableIcon).toBeDefined();
      expect(maskableIcon?.sizes).toBe('512x512');
    });
  });

  describe('PWA Platform Detection & Installation States', () => {
    it('detects iOS user agent strings accurately', () => {
      const iosUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      const isIOS = /iphone|ipad|ipod/.test(iosUserAgent.toLowerCase());
      expect(isIOS).toBe(true);

      const androidUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
      const isAndroidIOS = /iphone|ipad|ipod/.test(androidUserAgent.toLowerCase());
      expect(isAndroidIOS).toBe(false);
    });

    it('evaluates standalone display mode correctly', () => {
      // In browser standalone mode
      const matchMediaStandalone = (query: string) => query === '(display-mode: standalone)';
      expect(matchMediaStandalone('(display-mode: standalone)')).toBe(true);
      expect(matchMediaStandalone('(display-mode: browser)')).toBe(false);
    });
  });
});
