import { cn } from '../utils';

interface MayhemLogoProps {
  className?: string;
  size?: 'default' | 'small';
  hover?: boolean;
}

/** Mayhem's compact emerald M mark, used in loading and welcome states. */
export default function MayhemLogo({
  className = '',
  size = 'default',
  hover = true,
}: MayhemLogoProps) {
  const dimension = size === 'small' ? 'size-8 rounded-lg' : 'size-16 rounded-2xl';

  return (
    <div
      aria-label="Mayhem"
      className={cn(
        className,
        dimension,
        'grid place-items-center bg-background-inverse text-text-inverse shadow-md',
        hover && 'transition-transform duration-300 hover:scale-105'
      )}
    >
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="size-[72%]">
        <path
          d="M5 25V7h4.6L16 16.1 22.4 7H27v18h-5V15.3l-6 8.2-6-8.2V25H5Z"
          fill="currentColor"
        />
        <path d="M4 28h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
      </svg>
    </div>
  );
}
