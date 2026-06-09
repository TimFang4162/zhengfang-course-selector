"use client";;
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { cn } from "@/lib/utils";

export function Field(
  {
    className,
    ...props
  }
) {
  return (
    <FieldPrimitive.Root
      className={cn("flex flex-col items-start gap-2", className)}
      data-slot="field"
      {...props} />
  );
}

export function FieldLabel(
  {
    className,
    ...props
  }
) {
  return (
    <FieldPrimitive.Label
      className={cn(
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground data-disabled:opacity-64 sm:text-sm/4",
        className
      )}
      data-slot="field-label"
      {...props} />
  );
}

export function FieldItem(
  {
    className,
    ...props
  }
) {
  return (<FieldPrimitive.Item className={cn("flex", className)} data-slot="field-item" {...props} />);
}

export function FieldDescription(
  {
    className,
    ...props
  }
) {
  return (
    <FieldPrimitive.Description
      className={cn("text-muted-foreground text-xs", className)}
      data-slot="field-description"
      {...props} />
  );
}

export function FieldError(
  {
    className,
    ...props
  }
) {
  return (
    <FieldPrimitive.Error
      className={cn("text-destructive-foreground text-xs", className)}
      data-slot="field-error"
      {...props} />
  );
}

export const FieldControl =
  FieldPrimitive.Control;
export const FieldValidity =
  FieldPrimitive.Validity;

export { FieldPrimitive };
