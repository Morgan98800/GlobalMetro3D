import { DirectionProvider } from '@/components/foundations/direction/direction';
import { FollowTrainHud } from './FollowTrainHud';
import { InfoModals } from './InfoModals';
import { LineDetailsPanel } from './LineDetailsPanel';
import { MapControls } from './MapControls';
import { NearbyDrawer } from './NearbyDrawer';
import { RoutePlannerDrawer } from './RoutePlannerDrawer';
import { StationDrawer } from './StationDrawer';
import { StationSearchPalette } from './StationSearchPalette';
import { TopNavBar } from './TopNavBar';
import { useUiStore } from './ui_store';

export function SubwayAppShell() {
  const { stalenessWarning } = useUiStore();

  return (
    <DirectionProvider locale="fr">
      <div className="pointer-events-none fixed inset-0 z-10">
        {stalenessWarning ? (
          <div
            role="alert"
            className="pointer-events-auto mx-auto mt-16 max-w-xl rounded-xl border border-separator-border bg-status-yellow-background px-3 py-1.5 text-center text-caption-1-medium text-status-yellow-text shadow-sm"
          >
            {stalenessWarning}
          </div>
        ) : null}

        <TopNavBar />
        <LineDetailsPanel />
        <MapControls />
        <FollowTrainHud />
        <StationDrawer />
        <NearbyDrawer />
        <RoutePlannerDrawer />
        <StationSearchPalette />
        <InfoModals />
      </div>
    </DirectionProvider>
  );
}
