import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

/**
 * A skeleton loader component that mimics the structure of the OrdersPage table.
 * It provides a placeholder UI while the order data is being fetched.
 */
export function OrdersTableSkeleton() {
	return (
		<Table>
			{/* The table header is kept to give users context of what is loading. */}
			<TableHeader>
				<TableRow>
					<TableHead>Order ID</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Payment</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Total</TableHead>
					<TableHead>Items</TableHead>
					<TableHead>Date</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{/* We render 10 skeleton rows to represent the loading data */}
				{Array.from({ length: 10 }).map((_, index) => (
					<TableRow key={index}>
						<TableCell>
							<Skeleton className="h-5 w-32" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-6 w-24 rounded-full" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-6 w-24 rounded-full" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-6 w-20 rounded-full" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-5 w-16" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-5 w-8" />
						</TableCell>
						<TableCell>
							<Skeleton className="h-5 w-40" />
						</TableCell>
						<TableCell className="text-right">
							<div className="flex justify-end">
								<Skeleton className="h-8 w-8" />
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
