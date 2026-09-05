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
        `df-ui-anim inline-flex h-7 w-7 items-center justify-center rounded-sm ` +
        `transition-colors disabled:pointer-events-none disabled:opacity-35 ` +
        (active
          ? 'bg-accent-weak text-t1 '
          : 'text-t2 hover:bg-hov hover:text-t1 ') +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}
