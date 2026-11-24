'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects, Project } from '../lib/api';

interface ProjectContextValue {
  projects: Project[];
  isLoadingProjects: boolean;
  selectedProjectKey: string;
  setSelectedProjectKey: (key: string) => void;
  activeProject: Project | undefined;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const DEFAULT_PROJECT: Project = {
  id: 'proj_core_default',
  key: 'CORE',
  name: 'Engineering',
  description: 'Core Engineering Platform',
  projectType: 'SOFTWARE',
  privacyTier: 'INTERNAL',
  nextTicketNumber: 100,
};

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [selectedProjectKey, setSelectedProjectKeyInternal] = useState<string>('CORE');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('coretrack_active_project');
      if (saved) {
        setSelectedProjectKeyInternal(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setSelectedProjectKey = (key: string) => {
    setSelectedProjectKeyInternal(key);
    try {
      localStorage.setItem('coretrack_active_project', key);
    } catch {
      // ignore
    }
  };

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const activeProject =
    projects.find((p) => p.key === selectedProjectKey) || projects[0] || undefined;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        isLoadingProjects,
        selectedProjectKey,
        setSelectedProjectKey,
        activeProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
