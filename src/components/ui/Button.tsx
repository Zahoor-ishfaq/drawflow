import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'primary';
  children: ReactNode;
}

const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
  ghost: 'text-t2 hover:text-t1 hover:bg-hov',
  secondary: 'bg-panel2 border border-line text-t1 hover:bg-hov',
  primary: 'bg-accent text-white hover:brightness-110',
};

export function Button({ variant = 'ghost', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={
        `df-ui-anim inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[13px] ` +
        `transition-colors disabled:pointer-events-none disabled:opacity-40 ` +
        `${styles[variant]} ${className}`
      }
      {...rest}
    >
      {children}
    </button>
  );
}
