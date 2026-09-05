import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

export function IconButton({ label, active = false, className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={
        `df-ui-anim inline-flex h-8 w-8 items-center justify-center rounded-lg ` +
        `transition-colors disabled:pointer-events-none disabled:opacity-35 ` +
        (active
          ? 'bg-accent-weak text-accent '
          : 'text-t2 hover:bg-hov hover:text-t1 ') +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}
