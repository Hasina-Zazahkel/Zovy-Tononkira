import type { JSX } from 'preact';

type InputProps = JSX.IntrinsicElements['input'];
import { useEffect, useState } from 'preact/hooks';

type Props = Omit<InputProps, 'value' | 'onInput'> & {
  value: string;
  onValue: (v: string) => void;
};

/**
 * Champ dont la valeur enregistrée est normalisée (espaces de fin retirés…) : la saisie en cours est gardée
 * localement, sinon l'espace tapé entre deux mots disparaîtrait aussitôt.
 */
export function DraftInput({ value, onValue, ...rest }: Props) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (v.replace(/\s+$/, '') !== value.replace(/\s+$/, '')) setV(value);
  }, [value]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <input {...(rest as any)} value={v} onInput={(e) => { const x = (e.target as HTMLInputElement).value; setV(x); onValue(x); }} />;
}
