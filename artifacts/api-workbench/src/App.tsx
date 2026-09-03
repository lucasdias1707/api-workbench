import { ToastProvider } from '@/components/common/Toaster';
import { Workbench } from '@/components/layout/Workbench';
import { WorkspaceProvider } from '@/state/workspace-store';

/** `main.tsx` already wraps this tree in an error boundary. */
export default function App() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <Workbench />
      </WorkspaceProvider>
    </ToastProvider>
  );
}
