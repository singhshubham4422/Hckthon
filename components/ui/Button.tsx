import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
          {
            'bg-blue-600 text-white hover:bg-blue-700 shadow-md': variant === 'primary',
            'bg-blue-100 text-blue-900 hover:bg-blue-200': variant === 'secondary',
            'border-2 border-slate-200 bg-transparent hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800':
              variant === 'outline',
            'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-900 dark:text-zinc-100': variant === 'ghost',
            'bg-red-500 text-white hover:bg-red-600 shadow-sm': variant === 'danger',
            'h-14 px-8 py-3': size === 'default',
            'h-10 px-4 text-base': size === 'sm',
            'h-16 px-10 text-xl': size === 'lg',
            'h-14 w-14': size === 'icon',
          },
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-6 w-6 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
