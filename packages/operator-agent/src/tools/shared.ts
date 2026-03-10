import type { CallApiFn } from '../types';
import {
  bindOperatorAction,
  type BoundOperatorAction,
  type OperatorActionDefinition,
} from '../actions';

export function bindAction<TAction extends OperatorActionDefinition>(
  action: TAction,
  callApi: CallApiFn,
): BoundOperatorAction<TAction['schema']> {
  return bindOperatorAction(action, { callApi });
}
