import { createContext, useContext } from 'react';
import type { AppServices } from '../app/create-app';

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside <AppContext.Provider>');
  return app;
}
