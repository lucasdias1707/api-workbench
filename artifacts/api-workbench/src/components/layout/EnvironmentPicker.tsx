import { useState } from 'react';
import { Check, ChevronDown, Layers, Plus, Settings2 } from 'lucide-react';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { createEnvironment, ENVIRONMENT_COLORS } from '@/lib/factories';
import { useWorkspace } from '@/state/workspace-store';

/**
 * Active environment, shown by name and colour rather than hidden in a native
 * select — telling staging from production at a glance is the point.
 */
export function EnvironmentPicker({ onManage }: { onManage: () => void }) {
  const { state, dispatch } = useWorkspace();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const environments = state.environments.filter(
    (environment) => environment.workspaceId === state.activeWorkspaceId,
  );
  const overlays = environments.filter((environment) => !environment.isBase);
  const active = overlays.find((environment) => environment.id === state.activeEnvironmentId) ?? null;

  const entries: MenuEntry[] = [
    {
      kind: 'item',
      label: 'No environment',
      icon: state.activeEnvironmentId === null ? <Check size={13} /> : <span style={{ width: 13 }} />,
      onSelect: () => dispatch({ type: 'environment/activate', id: null }),
    },
    ...overlays.map<MenuEntry>((environment) => ({
      kind: 'item',
      label: environment.name,
      icon:
        environment.id === state.activeEnvironmentId ? (
          <Check size={13} />
        ) : (
          <span className="var-dot" style={{ background: environment.color, marginLeft: 3 }} />
        ),
      onSelect: () => dispatch({ type: 'environment/activate', id: environment.id }),
    })),
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'New environment',
      icon: <Plus size={13} />,
      onSelect: () => {
        const environment = createEnvironment(
          state.activeWorkspaceId,
          `Environment ${overlays.length + 1}`,
          false,
          [],
          ENVIRONMENT_COLORS[(overlays.length + 1) % ENVIRONMENT_COLORS.length],
        );
        dispatch({ type: 'environment/create', environment });
        dispatch({ type: 'environment/activate', id: environment.id });
        onManage();
      },
    },
    { kind: 'item', label: 'Manage environments', icon: <Settings2 size={13} />, onSelect: onManage },
  ];

  return (
    <>
      <button
        className="env-button"
        style={active ? ({ '--env-color': active.color } as React.CSSProperties) : undefined}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.right - 190, y: rect.bottom + 4 });
        }}
        title={active ? `Environment: ${active.name}` : 'No environment — only the base variables apply'}
        data-testid="button-environment-picker"
      >
        {active ? (
          <span className="var-dot" style={{ background: active.color }} />
        ) : (
          <Layers size={13} style={{ color: 'var(--text-faint)' }} />
        )}
        <span className="truncate" data-testid="text-active-environment">
          {active?.name ?? 'No environment'}
        </span>
        <ChevronDown size={12} style={{ color: 'var(--text-faint)' }} />
      </button>
      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} /> : null}
    </>
  );
}
