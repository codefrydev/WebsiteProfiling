import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';

function useDraftCommit(value: string, onCommit: (value: string) => void) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return { draft, setDraft, commit };
}

type DraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

/** Text-like input that keeps a local draft while typing and commits on blur. */
export function DraftInput({ value, onCommit, onBlur, onKeyDown, ...rest }: DraftInputProps) {
  const { draft, setDraft, commit } = useDraftCommit(value, onCommit);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

type DraftTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

/** Multiline input that keeps a local draft while typing and commits on blur. */
export function DraftTextarea({ value, onCommit, onBlur, ...rest }: DraftTextareaProps) {
  const { draft, setDraft, commit } = useDraftCommit(value, onCommit);

  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
    />
  );
}
