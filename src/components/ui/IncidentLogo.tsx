import Image from 'next/image';

export function IncidentLogo({ variant = 'header' }: { variant?: 'header' | 'login' }) {
  const isLogin = variant === 'login';
  const size = isLogin ? 640 : 128;

  return (
    <Image
      className={`incident-logo incident-logo--${variant}`}
      src={isLogin ? '/images/incident-management-3d.webp' : '/images/incident-management-mark.webp'}
      alt=""
      width={size}
      height={size}
      priority={isLogin}
      unoptimized
    />
  );
}
