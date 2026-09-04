import { ToastProvider } from '@/components/common/Toaster';
import { Workbench } from '@/components/layout/Workbench';
import { UpdateProvider } from '@/state/update-store';
import { WorkspaceProvider } from '@/state/workspace-store';

/** `main.tsx` already wraps this tree in an error boundary. */
export default function App() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <UpdateProvider>
          <Workbench />
        </UpdateProvider>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
