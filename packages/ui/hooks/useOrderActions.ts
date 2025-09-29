/**
 * Shared Order Actions Hook
 *
 * Provides common action handling logic for order operations
 * including error handling, success messaging, and data refetching.
 */

import { useCallback } from 'react';
import { extractErrorMessage } from '../lib/utils';

interface UseOrderActionsProps {
	toast: (config: {
		title: string;
		description: string;
		variant?: 'default' | 'destructive';
	}) => void;
	refetch: () => Promise<void>;
}

interface UseOrderActionsReturn {
	handleAction: (
		orderId: string,
		actionFunction: (id: string) => Promise<unknown>,
		successMessage: string,
		errorTitle?: string
	) => Promise<void>;
}

export function useOrderActions({
	toast,
	refetch
}: UseOrderActionsProps): UseOrderActionsReturn {
	const handleAction = useCallback(
		async (
			orderId: string,
			actionFunction: (id: string) => Promise<unknown>,
			successMessage: string,
			errorTitle: string = "Operation Failed"
		) => {
			try {
				await actionFunction(orderId);
				toast({
					title: "Success",
					description: successMessage,
				});
				await refetch();
			} catch (err: unknown) {
				const description = extractErrorMessage(err);
				toast({
					title: errorTitle,
					description,
					variant: "destructive",
				});
				console.error(`Failed to perform action on order ${orderId}:`, err);
			}
		},
		[toast, refetch]
	);

	return {
		handleAction
	};
}