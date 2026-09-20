import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'primary';
  children: ReactNode;
}

const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
  ghost: 'text-t2 hover:text-t1 hover:bg-hov',
  secondary: 'bg-panel2 border border-line text-t1 hover:bg-hov hover:border-[#cbd2dc]',
  primary: 'bg-accent text-white shadow-[0_2px_8px_rgba(13,157,151,0.35)] hover:brightness-105',
};

export function Button({ variant = 'ghost', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={
        `df-ui-anim inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium ` +
        `transition-all disabled:pointer-events-none disabled:opacity-40 ` +
        `${styles[variant]} ${className}`
      }
      {...rest}
    >
      {children}
    </button>
  );
}
