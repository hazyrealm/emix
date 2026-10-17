import { useTranslation } from 'react-i18next';
import { LanguageSection } from './LanguageSection';
import { InterfaceScaleSection } from './InterfaceScaleSection';
import { ThemesSection } from '../../themes/ThemesSection';

/**
 * Themes (saved to the account, so every device matches) and the
 * presentation preferences that belong to this browser or app: language and
 * interface scale are stored locally and apply on the login screen too.
 */
export function AppearancePanel() {
  const { t } = useTranslation(['settings']);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('settings:appearance.title')}</h2>
      <ThemesSection />
      <LanguageSection />
      <InterfaceScaleSection />
    </div>
  );
}
