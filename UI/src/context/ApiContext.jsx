import { createContext, useContext, useState, useEffect } from 'react';
import { api, projectsApi } from '../lib/api';

const ApiContext = createContext(null);

/** Backend serves GET /health at app root, not under /api/v1. */
function backendOriginForHealth() {
  const raw = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').trim();
  const withoutApi = raw.replace(/\/api\/v1\/?$/i, '').replace(/\/$/, '');
  try {
    return new URL(withoutApi || 'http://localhost:8000').origin;
  } catch {
    return 'http://localhost:8000';
  }
}

export function ApiProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      await fetch(`${backendOriginForHealth()}/health`);
      setIsConnected(true);
      await loadProjects();
    } catch {
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const projs = await projectsApi.list();
      const arr = Array.isArray(projs) ? projs : (projs?.items || []);
      setProjects(arr);
      const saved = localStorage.getItem('current_project_id');
      if (arr.length > 0) {
        setCurrentProject(arr.find((p) => p.id === parseInt(saved)) || arr[0]);
      }
    } catch (e) {
      console.warn('Failed to load projects:', e);
    }
  }

  function selectProject(project) {
    setCurrentProject(project);
    localStorage.setItem('current_project_id', project.id);
  }

  async function createProject({ name, domain }) {
    const created = await projectsApi.create({
      name: (name || '').trim() || 'New project',
      domain: domain?.trim() || null,
    });
    await loadProjects();
    setCurrentProject(created);
    if (created?.id != null) {
      localStorage.setItem('current_project_id', String(created.id));
    }
    return created;
  }

  return (
    <ApiContext.Provider value={{
      isConnected,
      // backward-compat alias used by existing views
      apiOnline: isConnected,
      projects,
      currentProject,
      loading,
      selectProject,
      createProject,
      loadProjects,
      checkConnection,
      // backward-compat alias
      checkApiHealth: checkConnection,
    }}>
      {children}
    </ApiContext.Provider>
  );
}

export const useApi = () => useContext(ApiContext);
