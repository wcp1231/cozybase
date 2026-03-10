import type { CozyBaseActionDefinition } from '../actions';
import { createAppAction } from './create-app';
import { deleteAppAction } from './delete-app';
import { developAppAction } from './develop-app';
import { getAppDetailAction } from './get-app-detail';
import { listAppsAction } from './list-apps';
import { operateAppAction } from './operate-app';
import { startAppAction } from './start-app';
import { stopAppAction } from './stop-app';

export {
  createAppAction,
  deleteAppAction,
  developAppAction,
  getAppDetailAction,
  listAppsAction,
  operateAppAction,
  startAppAction,
  stopAppAction,
};

export function getCozyBaseActions(): CozyBaseActionDefinition[] {
  return [
    listAppsAction,
    getAppDetailAction,
    startAppAction,
    stopAppAction,
    deleteAppAction,
    createAppAction,
    developAppAction,
    operateAppAction,
  ];
}
