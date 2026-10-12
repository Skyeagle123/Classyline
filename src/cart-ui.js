import { CartActionError } from "./cart.js";
export const cartReady = (state, fatalError) => !!state && !fatalError;
export const cartErrorMessage = (error) =>
  error?.message ||
  "Your saved bag could not be updated safely. Recheck it before ordering.";
// Shared by the React provider and regression tests. An ordinary limit error is
// recoverable only after reconciliation succeeds under the cart's actual lock.
export async function performCartAction(
  coordinator,
  action,
  { success, actionError, fatalError },
) {
  try {
    const state = await action();
    success(state);
    return state;
  } catch (e) {
    if (e instanceof CartActionError) {
      try {
        success(await coordinator.refresh());
      } catch (failure) {
        fatalError(cartErrorMessage(failure));
        throw failure;
      }
      actionError(cartErrorMessage(e));
    } else fatalError(cartErrorMessage(e));
    throw e;
  }
}
