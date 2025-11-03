import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSwitcher from '../LanguageSwitcher';
import { useTranslation } from 'react-i18next';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}));

// Mock i18n module
vi.mock('../../i18n', () => ({
  SUPPORTED_LANGUAGES: {
    en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    es: { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  },
  getLanguageGroups: vi.fn(() => ({
    common: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
      { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', rtl: false },
    ],
    europe: [
      { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', rtl: false },
    ],
    asia: [],
    rtl: [],
  })),
  changeLanguage: vi.fn(() => Promise.resolve(true)),
}));

describe('LanguageSwitcher', () => {
  const mockI18n = {
    language: 'en',
    changeLanguage: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTranslation.mockReturnValue({
      i18n: mockI18n,
      t: (key) => key,
    });
  });

  describe('Icon Variant', () => {
    it('renders icon variant by default', () => {
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('opens menu when clicked', async () => {
      const user = userEvent.setup();
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('日本語')).toBeInTheDocument();
        expect(screen.getByText('Español')).toBeInTheDocument();
      });
    });

    it('displays current language with check icon', async () => {
      const user = userEvent.setup();
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        const currentLangChip = screen.getByText('現在の言語');
        expect(currentLangChip).toBeInTheDocument();
      });
    });
  });

  describe('Chip Variant', () => {
    it('renders chip variant when specified', () => {
      render(<LanguageSwitcher variant="chip" />);

      const chip = screen.getByText('English');
      expect(chip).toBeInTheDocument();
    });

    it('opens menu from chip click', async () => {
      const user = userEvent.setup();
      render(<LanguageSwitcher variant="chip" />);

      const chip = screen.getByText('English');
      await user.click(chip);

      await waitFor(() => {
        expect(screen.getByText('日本語')).toBeInTheDocument();
      });
    });
  });

  describe('Language Switching', () => {
    it('changes language when different language is selected', async () => {
      const { changeLanguage } = await import('../../i18n');
      const user = userEvent.setup();

      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('日本語')).toBeInTheDocument();
      });

      const jaMenuItem = screen.getByText('日本語').closest('li');
      await user.click(jaMenuItem);

      await waitFor(() => {
        expect(changeLanguage).toHaveBeenCalledWith('ja');
      });
    });

    it('closes menu without changing language when current language is selected', async () => {
      const { changeLanguage } = await import('../../i18n');
      const user = userEvent.setup();

      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('English')).toBeInTheDocument();
      });

      const enMenuItem = screen.getByText('現在の言語').closest('li');
      await user.click(enMenuItem);

      await waitFor(() => {
        expect(changeLanguage).not.toHaveBeenCalled();
      });
    });

    it('handles language change errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { changeLanguage } = await import('../../i18n');
      changeLanguage.mockRejectedValueOnce(new Error('Language change failed'));

      const user = userEvent.setup();
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('日本語')).toBeInTheDocument();
      });

      const jaMenuItem = screen.getByText('日本語').closest('li');
      await user.click(jaMenuItem);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '言語変更エラー:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label', () => {
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      expect(button).toHaveAttribute('aria-label');
    });

    it('supports keyboard navigation', async () => {
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      button.focus();

      expect(button).toHaveFocus();

      fireEvent.keyDown(button, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('日本語')).toBeInTheDocument();
      });
    });
  });

  describe('Language Groups', () => {
    it('displays language groups correctly', async () => {
      const user = userEvent.setup();
      render(<LanguageSwitcher />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('一般的な言語')).toBeInTheDocument();
        expect(screen.getByText('欧州言語')).toBeInTheDocument();
      });
    });
  });

  describe('Size Variations', () => {
    it('renders with small size', () => {
      render(<LanguageSwitcher size="small" />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      expect(button).toBeInTheDocument();
    });

    it('renders with medium size', () => {
      render(<LanguageSwitcher size="medium" />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      expect(button).toBeInTheDocument();
    });

    it('renders with large size', () => {
      render(<LanguageSwitcher size="large" />);

      const button = screen.getByRole('button', { name: /言語設定/i });
      expect(button).toBeInTheDocument();
    });
  });
});
