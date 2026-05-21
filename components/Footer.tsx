import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('common');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink/10 mt-32">
      <div className="container-edit py-12 flex flex-col gap-6 md:flex-row md:items-center md:justify-between text-sm text-mute">
        <p>
          © {year} {t('footerCopyright')}
        </p>
        <div className="flex items-center gap-6">
          <a
            href="https://collision.studio"
            className="hover:text-ink transition"
            target="_blank"
            rel="noreferrer"
          >
            {t('footerBackToStudio')}
          </a>
          <a href="/legal" className="hover:text-ink transition">
            {t('footerLegal')}
          </a>
        </div>
      </div>
    </footer>
  );
}
