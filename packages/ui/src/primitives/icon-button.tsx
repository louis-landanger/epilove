import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../cn";

export const iconButtonVariants = tv({
  base: [
    "inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-150",
    "active:scale-[0.94] disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt",
  ],
  variants: {
    variant: {
      solid: "bg-paper/10 text-paper hover:bg-paper/15",
      ghost: "text-paper/80 hover:bg-paper/10 hover:text-paper",
      primary: "bg-plasma text-ink hover:brightness-110",
    },
    size: { sm: "size-9", md: "size-11", lg: "size-14" },
  },
  defaultVariants: { variant: "ghost", size: "md" },
});

export interface IconButtonProps extends ComponentProps<"button">, VariantProps<typeof iconButtonVariants> {
  /** Required: icon-only buttons need an accessible name. */
  readonly label: string;
}

export function IconButton({ label, variant, size, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
