import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/Hero';
import { Stats } from '@/components/Stats';
import { Manifesto } from '@/components/Manifesto';
import { TrackRecord } from '@/components/TrackRecord';
import { PartnershipTiers } from '@/components/PartnershipTiers';
import { AudienceTables } from '@/components/AudienceTables';
import { CaseStudies } from '@/components/CaseStudies';
import { ContactBlock } from '@/components/ContactBlock';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sponsors.meta' });
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      type: 'website',
      locale,
      url:
        locale === 'fr'
          ? 'https://europe.collision.studio/sponsors'
          : 'https://europe.collision.studio/en/sponsors',
      images: [
        {
          // __TODO__ produce dedicated 1200x630 OG image for sponsors page
          url: '/og/sponsors.png',
          width: 1200,
          height: 630
        }
      ]
    },
    alternates: {
      canonical: '/sponsors',
      languages: {
        fr: '/sponsors',
        en: '/en/sponsors'
      }
    }
  };
}

export default async function SponsorsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('sponsors');

  const stats = t.raw('stats.items') as { value: string; label: string }[];
  const trackItems = t.raw('trackRecord.items') as {
    title: string;
    meta: string;
    href: string;
  }[];
  const tiers = t.raw('tiers.items') as {
    name: string;
    volume: string;
    description: string;
    budget: string;
  }[];
  const caseItems = t.raw('caseStudies.items') as {
    brand: string;
    context: string;
    execution: string;
    result: string;
  }[];

  return (
    <>
      <Hero
        eyebrow={t('hero.eyebrow')}
        titlePre={t('hero.titlePre')}
        titleEm={t('hero.titleEm')}
        titlePost={t('hero.titlePost')}
        sub={<p>{t('hero.sub')}</p>}
        ctas={[
          { label: t('hero.ctaPrimary'), href: t('hero.ctaPrimaryHref'), variant: 'primary' },
          {
            label: t('hero.ctaSecondary'),
            href: t('hero.ctaSecondaryHref'),
            variant: 'secondary'
          }
        ]}
      />

      <Stats items={stats} note={t('stats.note')} />

      <Manifesto
        eyebrow={t('why.eyebrow')}
        pre={t('why.titlePre')}
        em={t('why.titleEm')}
        post={t('why.titlePost')}
        paragraphs={t.raw('why.paragraphs') as string[]}
      />

      <TrackRecord
        eyebrow={t('trackRecord.eyebrow')}
        pre={t('trackRecord.titlePre')}
        em={t('trackRecord.titleEm')}
        post={t('trackRecord.titlePost')}
        items={trackItems}
        sponsorsNote={t('trackRecord.sponsorsNote')}
      />

      <PartnershipTiers
        eyebrow={t('tiers.eyebrow')}
        pre={t('tiers.titlePre')}
        em={t('tiers.titleEm')}
        post={t('tiers.titlePost')}
        items={tiers}
      />

      <AudienceTables
        eyebrow={t('audience.eyebrow')}
        pre={t('audience.titlePre')}
        em={t('audience.titleEm')}
        post={t('audience.titlePost')}
        demographics={t.raw('audience.demographics') as {
          title: string;
          rows: { label: string; value: string }[];
        }}
        chinaBreakdown={t.raw('audience.chinaBreakdown') as {
          title: string;
          rows: { label: string; value: string }[];
        }}
      />

      <CaseStudies
        eyebrow={t('caseStudies.eyebrow')}
        pre={t('caseStudies.titlePre')}
        em={t('caseStudies.titleEm')}
        post={t('caseStudies.titlePost')}
        items={caseItems}
      />

      <ContactBlock
        id="contact"
        tone="commercial"
        eyebrow={t('contact.eyebrow')}
        pre={t('contact.titlePre')}
        em={t('contact.titleEm')}
        post={t('contact.titlePost')}
        body={t('contact.body')}
        primary={{
          label: t('contact.calendlyLabel'),
          href: t('contact.calendlyHref')
        }}
        secondary={{
          label: t('contact.deckLabel'),
          href: t('contact.deckHref')
        }}
      />
    </>
  );
}
