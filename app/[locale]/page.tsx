import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/Hero';
import { Stats } from '@/components/Stats';
import { Manifesto } from '@/components/Manifesto';
import { MethodGrid } from '@/components/MethodGrid';
import { GuestGrid } from '@/components/GuestGrid';
import { BenefitColumns } from '@/components/BenefitColumns';
import { TestimonialList } from '@/components/TestimonialList';
import { ContactBlock } from '@/components/ContactBlock';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guests.meta' });
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      type: 'website',
      locale,
      url: locale === 'fr' ? 'https://europe.collision.studio' : 'https://europe.collision.studio/en',
      images: [
        {
          // __TODO__ produce dedicated 1200x630 OG image with editorial typography
          url: '/og/guests.png',
          width: 1200,
          height: 630
        }
      ]
    }
  };
}

export default async function GuestsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('guests');

  const stats = t.raw('stats.items') as { value: string; label: string }[];
  const methodBlocks = t.raw('method.blocks') as { label: string; value: string }[];
  const guests = t.raw('guestsConfirmed.items') as {
    name: string;
    role: string;
    country: string;
    photo: string;
  }[];
  const benefitColumns = t.raw('benefit.columns') as { title: string; body: string }[];
  const testimonials = t.raw('testimonials.items') as {
    quote: string;
    name: string;
    role: string;
  }[];

  return (
    <>
      <Hero
        eyebrow={t('hero.eyebrow')}
        titlePre={t('hero.titlePre')}
        titleEm={t('hero.titleEm')}
        titlePost={t('hero.titlePost')}
        sub={
          <>
            <p>{t('hero.sub1')}</p>
            <p className="mt-4">{t('hero.sub2')}</p>
          </>
        }
        ctas={[
          { label: t('hero.ctaPrimary'), href: '#manifesto', variant: 'primary' },
          { label: t('hero.ctaSecondary'), href: '#contact', variant: 'secondary' }
        ]}
      />

      <Stats items={stats} />

      <div id="manifesto">
        <Manifesto
          eyebrow={t('manifesto.eyebrow')}
          pre={t('manifesto.titlePre')}
          em={t('manifesto.titleEm')}
          post={t('manifesto.titlePost')}
          paragraphs={t.raw('manifesto.paragraphs') as string[]}
        />
      </div>

      <MethodGrid
        eyebrow={t('method.eyebrow')}
        pre={t('method.titlePre')}
        em={t('method.titleEm')}
        post={t('method.titlePost')}
        blocks={methodBlocks}
        schedule={t('method.schedule')}
      />

      <GuestGrid
        eyebrow={t('guestsConfirmed.eyebrow')}
        pre={t('guestsConfirmed.titlePre')}
        em={t('guestsConfirmed.titleEm')}
        post={t('guestsConfirmed.titlePost')}
        items={guests}
        fallback={t('guestsConfirmed.fallback')}
        fallbackPartners={t('guestsConfirmed.fallbackPartners')}
      />

      <BenefitColumns
        eyebrow={t('benefit.eyebrow')}
        pre={t('benefit.titlePre')}
        em={t('benefit.titleEm')}
        post={t('benefit.titlePost')}
        columns={benefitColumns}
      />

      <TestimonialList eyebrow={t('testimonials.eyebrow')} items={testimonials} />

      <ContactBlock
        id="contact"
        eyebrow={t('contact.eyebrow')}
        pre={t('contact.titlePre')}
        em={t('contact.titleEm')}
        post={t('contact.titlePost')}
        body={t('contact.body')}
        primary={{
          label: t('contact.emailLabel'),
          href: `mailto:${t('contact.email')}`
        }}
        secondary={{
          label: t('contact.calendlyLabel'),
          href: t('contact.calendlyHref')
        }}
      />
    </>
  );
}
