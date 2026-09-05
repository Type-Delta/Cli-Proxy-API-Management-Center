import type { ProviderBrandLogo } from '../brandLogos';
import styles from './ProviderCategoryList.module.scss';

export function ProviderLogo({ logo }: { logo: ProviderBrandLogo | undefined }) {
  if (!logo) return null;

  const logoClassName = [
    styles.logo,
    logo.transparent ? styles.logoTransparent : '',
    logo.themeSurface ? styles.logoThemeSurface : '',
    logo.darkSrc ? styles.logoThemeLight : '',
    logo.invertOnDark ? styles.logoInvertOnDark : '',
  ]
    .filter(Boolean)
    .join(' ');
  const darkLogoClassName = [
    styles.logo,
    logo.transparent ? styles.logoTransparent : '',
    logo.themeSurface ? styles.logoThemeSurface : '',
    styles.logoThemeDark,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <img src={logo.src} alt="" aria-hidden="true" className={logoClassName} />
      {logo.darkSrc && (
        <img src={logo.darkSrc} alt="" aria-hidden="true" className={darkLogoClassName} />
      )}
    </>
  );
}
