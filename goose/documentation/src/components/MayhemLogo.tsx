import { useColorMode } from '@docusaurus/theme-common';

export const MayhemLogo = (props: { className?: string }) => {
  const { colorMode } = useColorMode();
  
  const logoSrc = colorMode === 'dark' 
    ? 'img/mayhem-logo-white.png' 
    : 'img/mayhem-logo-black.png';
  
  const logoAlt = 'mayhem logo';

  return (
    <img
      src={logoSrc}
      alt={logoAlt}
      className={props.className}
      style={{ height: 'auto', maxWidth: '100%' }}
    />
  );
};
