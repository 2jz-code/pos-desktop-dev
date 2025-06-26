import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// Don't refetch on window focus by default for cart data
						refetchOnWindowFocus: false,
						// Retry failed requests 3 times
						retry: 3,
						// Keep unused data in cache for 5 minutes
						cacheTime: 1000 * 60 * 5,
						// Consider data stale after 30 seconds
						staleTime: 1000 * 30,
					},
					mutations: {
						// Retry failed mutations once
						retry: 1,
					},
				},
			})
	);

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	);
}
