'use client';

import type { InputHTMLAttributes } from 'react';
import styles from './GradeQuantityInput.module.css';

type GradeQuantityInputProps = Pick<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style' | 'placeholder'> & {
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
};

/** Nine-grade quantities are entered manually; retain native number validation. */
export function GradeQuantityInput({ value, onValueChange, className, ...props }: GradeQuantityInputProps) {
  return (
    <input
      {...props}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      className={`${styles.quantity}${className ? ` ${className}` : ''}`}
      value={value}
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
      }}
      onFocus={event => event.currentTarget.select()}
      onChange={event => {
        const next = event.currentTarget.value;
        if (next === '' || next === '-') { onValueChange(''); return; }
        const number = Number(next);
        onValueChange(Number.isNaN(number) || number < 0 ? '0' : next);
      }}
    />
  );
}
