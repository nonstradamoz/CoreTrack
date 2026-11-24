'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeProvider';
import { ProjectProvider } from '../context/ProjectContext';
import { AppShell } from './layout/AppShell';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ProjectProvider>
          <AppShell>{children}</AppShell>
        </ProjectProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
