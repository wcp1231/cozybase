import { AppListPage } from './app-list';
import { useAppContext } from './app-layout';
import { HomePage } from './home-page';

export function ModeLandingPage() {
  const { mode } = useAppContext();
  return mode === 'stable' ? <HomePage /> : <AppListPage />;
}
