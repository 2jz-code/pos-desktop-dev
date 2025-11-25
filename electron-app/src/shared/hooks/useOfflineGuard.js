import { useOnlineStatus } from './useOnlineStatus';
import { toast } from '@/shared/components/ui/use-toast';

/**
 * Hook to guard form submissions when offline
 *
 * Provides a reusable way to prevent mutations when the device is offline,
 * with consistent UX (toast notifications).
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireOnline - Whether to block when offline (default: true)
 * @param {string} options.blockMessage - Message to show when blocked (default: "This action requires internet connection")
 * @returns {Object} - { canSubmit, isOnline, guardSubmit, blockMessage }
 *
 * @example
 * // Basic usage
 * const { canSubmit, guardSubmit } = useOfflineGuard();
 *
 * const handleSubmit = guardSubmit(async (data) => {
 *   await createCategory(data);
 * });
 *
 * <Button onClick={handleSubmit} disabled={!canSubmit}>Save</Button>
 *
 * @example
 * // Custom message
 * const { guardSubmit } = useOfflineGuard({
 *   blockMessage: "Editing categories requires connectivity"
 * });
 */
export function useOfflineGuard(options = {}) {
  const isOnline = useOnlineStatus();
  const {
    requireOnline = true,
    blockMessage = "This action requires internet connection"
  } = options;

  const canSubmit = !requireOnline || isOnline;

  /**
   * Wraps a callback to automatically block it when offline
   * Shows a toast notification when blocked
   */
  const guardSubmit = (callback) => {
    return async (...args) => {
      if (!canSubmit) {
        toast({
          title: "Offline",
          description: blockMessage,
          variant: "destructive",
        });
        return;
      }
      return callback(...args);
    };
  };

  return {
    canSubmit,
    isOnline,
    guardSubmit,
    blockMessage
  };
}
