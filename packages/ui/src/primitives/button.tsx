import type { ComponentProps, ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../cn";
import { Spinner } from "./spinner";

export const buttonVariants = tv({
  base: [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold",
    "transition-[transform,background-color,box-shadow,filter,color] duration-150 ease-out",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt",
  ],
  variants: {
    variant: {
      primary: "bg-plasma text-ink hover:brightness-110 hover:shadow-[0_10px_40px_-12px_var(--color-plasma)]",
      secondary: "bg-paper/10 text-paper hover:bg-paper/15",
      outline: "border border-paper/20 text-paper hover:border-paper/40 hover:bg-paper/5",
      ghost: "text-paper/80 hover:bg-paper/10 hover:text-paper",
      danger: "bg-danger text-ink hover:brightness-110",
      link: "h-auto rounded-none p-0 text-plasma underline-offset-4 hover:underline",
    },
    size: {
      sm: "h-9 rounded-xl px-3.5 text-sm",
      md: "h-12 rounded-2xl px-5 text-base",
      lg: "h-14 rounded-2xl px-7 text-lg",
    },
    block: { true: "w-full" },
  },
  compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
  defaultVariants: { variant: "primary", size: "md" },
});

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends ComponentProps<"button">, ButtonVariants {
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {loading ? null : trailingIcon}
    </button>
  );
}
