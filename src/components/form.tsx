"use client";

import clsx from "clsx";

const fieldClass =
  "w-full rounded-lg border border-noir-600 bg-noir-900 px-3 py-2 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune";

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-blanc-muted">
        {label} {required && <span className="text-jaune">*</span>}
      </span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(fieldClass, props.className)} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return <textarea {...props} className={clsx(fieldClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(fieldClass, props.className)} />;
}
