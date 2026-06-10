import { useCallback, useRef, useState } from "react";

export function useComposingInput(externalValue, onCommit) {
  const [local, setLocal] = useState(externalValue);
  const composingRef = useRef(false);
  const skipSyncRef = useRef(false);
  const prevExternalRef = useRef(externalValue);

  if (prevExternalRef.current !== externalValue) {
    prevExternalRef.current = externalValue;
    if (!composingRef.current) {
      skipSyncRef.current = false;
      setLocal(externalValue);
    }
  }

  return {
    value: local,
    onInput: useCallback((e) => {
      const v = e.currentTarget.value;
      skipSyncRef.current = true;
      prevExternalRef.current = v;
      setLocal(v);
      if (!composingRef.current) {
        onCommit(v);
      }
    }, [onCommit]),
    onCompositionStart: useCallback(() => {
      composingRef.current = true;
    }, []),
    onCompositionEnd: useCallback((e) => {
      composingRef.current = false;
      const v = e.currentTarget.value;
      skipSyncRef.current = true;
      prevExternalRef.current = v;
      setLocal(v);
      onCommit(v);
    }, [onCommit]),
    onBlur: useCallback((e) => {
      if (composingRef.current) {
        composingRef.current = false;
        const v = e.currentTarget.value;
        skipSyncRef.current = true;
        prevExternalRef.current = v;
        setLocal(v);
        onCommit(v);
      }
    }, [onCommit]),
  };
}
