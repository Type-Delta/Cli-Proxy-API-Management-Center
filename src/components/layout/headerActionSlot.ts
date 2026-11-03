import { createContext, useContext } from 'react';

// Pages portal extra controls into the floating header cluster through this node; MainLayout owns
// it and renders it ahead of the global actions.
export const HeaderActionSlotContext = createContext<HTMLElement | null>(null);

export function useHeaderActionSlot() {
  return useContext(HeaderActionSlotContext);
}
