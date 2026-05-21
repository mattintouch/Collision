import type { MetadataRoute } from 'next';

const BASE = 'https://europe.collision.studio';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${BASE}/`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: {
        languages: {
          fr: `${BASE}/`,
          en: `${BASE}/en`
        }
      }
    },
    {
      url: `${BASE}/sponsors`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: {
        languages: {
          fr: `${BASE}/sponsors`,
          en: `${BASE}/en/sponsors`
        }
      }
    }
  ];
}
