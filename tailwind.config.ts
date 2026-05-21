import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // __TODO__ confirm exact palette by inspecting collision.studio in browser
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#1a1a1a'
        },
        paper: {
          DEFAULT: '#f5f1e8',
          warm: '#ebe5d6',
          off: '#faf7f0'
        },
        accent: {
          DEFAULT: '#b8412a', // warm rust, single accent
          soft: '#d97757'
        },
        mute: '#6b6b6b'
      },
      fontFamily: {
        // __TODO__ swap to fonts matching collision.studio once inspected
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'display-xl': ['clamp(3rem, 7vw, 6.5rem)', { lineHeight: '0.95', letterSpacing: '-0.025em' }],
        'display-lg': ['clamp(2.25rem, 5vw, 4.5rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(1.75rem, 3.5vw, 3rem)', { lineHeight: '1.05', letterSpacing: '-0.015em' }],
        'eyebrow': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.18em' }]
      },
      maxWidth: {
        'readable': '68ch'
      },
      transitionTimingFunction: {
        'editorial': 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    }
  },
  plugins: []
};

export default config;
