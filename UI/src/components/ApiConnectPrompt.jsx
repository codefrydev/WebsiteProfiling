import { Server, RefreshCw } from 'lucide-react';
import Button from './Button';
import { useApi } from '../context/ApiContext';

export default function ApiConnectPrompt({ feature = 'this feature' }) {
  const { checkConnection } = useApi();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-800 border border-default flex items-center justify-center">
        <Server className="h-8 w-8 text-slate-500" />
      </div>
      <div>
        <p className="text-bright font-semibold text-lg">Backend Not Connected</p>
        <p className="text-slate-400 text-sm mt-1 max-w-sm">
          {feature} requires the FastAPI backend running at{' '}
          <code className="text-blue-400 text-xs">localhost:8000</code>.
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Run{' '}
          <code className="text-slate-300">uvicorn backend.app.main:app --reload</code>{' '}
          in the project root.
        </p>
      </div>
      <Button variant="secondary" onClick={checkConnection}>
        <RefreshCw className="h-4 w-4" />
        Retry Connection
      </Button>
    </div>
  );
}
