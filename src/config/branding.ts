export interface BrandingConfig {
  name: string;
  shortName: string;
  tagline: string;
  subtagline: string;
  colors: {
    ivory: string;
    charcoal: string;
    orange: string;
  };
  fonts: {
    interface: string;
    metrics: string;
  };
  contactEmail: string;
  version: string;
}

export const BRANDING: BrandingConfig = {
  name: 'PIXORA',
  shortName: 'PIXORA',
  tagline: 'Your images. Every format. One place.',
  subtagline: 'The unified, privacy-first workspace to split, compress, resize, crop, and format images for every digital platform.',
  colors: {
    ivory: '#F7F5F0',
    charcoal: '#171717',
    orange: '#FF6B35',
  },
  fonts: {
    interface: 'Inter, sans-serif',
    metrics: 'DM Mono, monospace',
  },
  contactEmail: 'support@pixora.app',
  version: '1.0.0',
};
