import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

/*
 * L'action principale porte la couleur de marque, et elle est la seule à la
 * porter : c'est ce qui la rend repérable d'un coup d'œil sur un écran de
 * formulaire long. Plus d'ombre sur les aplats - la couleur suffit à les faire
 * avancer, et une ombre sur un bouton plein date la page.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-accent-300',
  secondary:
    'bg-white text-accent-800 border border-accent-300 hover:border-accent-400 hover:bg-accent-50 disabled:text-accent-400 disabled:hover:border-accent-300',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:bg-accent-300',
  ghost: 'text-accent-700 hover:bg-accent-100 disabled:text-accent-400',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm min-h-touch',
  md: 'px-4 py-2 text-sm min-h-touch',
  lg: 'px-6 py-3 text-base min-h-touch',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});
