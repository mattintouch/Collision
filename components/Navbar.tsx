'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Navbar() {
  const t = useTranslations('common');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-500 ease-editorial ${
        scrolled
          ? 'bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80 border-b border-ink/5'
          : 'bg-transparent'
      }`}
    >
      <div className="container-edit flex h-16 items-center justify-between">
        <Link href="/" className="font-serif text-lg tracking-tight">
          {t('brand')}
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/#manifesto" className="text-ink/70 hover:text-ink transition">
            {t('navManifesto')}
          </Link>
          <Link href="/#contact" className="text-ink/70 hover:text-ink transition">
            {t('navInvites')}
          </Link>
          <Link href="/sponsors" className="text-ink/70 hover:text-ink transition">
            {t('navSponsors')}
          </Link>
          <LanguageSwitcher />
        </nav>

        <div className="md:hidden">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
