import React from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface TableHeader {
	label: string;
	className?: string;
}

interface StandardTableProps<T = Record<string, unknown>> {
	headers: TableHeader[];
	data: T[];
	loading?: boolean;
	emptyMessage?: string;
	onRowClick?: (item: T) => void;
	renderRow: (item: T) => React.ReactNode;
	colSpan?: number;
	className?: string;
	getRowProps?: (item: T) => { [key: string]: any };
	highlightedItemId?: string | number | null;
	itemIdKey?: string;
}

export function StandardTable<T = Record<string, unknown>>({
	headers,
	data,
	loading = false,
	emptyMessage = "No data available",
	onRowClick,
	renderRow,
	colSpan,
	className,
	getRowProps,
	highlightedItemId,
	itemIdKey = "id",
}: StandardTableProps<T>) {
	return (
		<Card className={className}>
			<CardContent className="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							{headers.map((header, index) => (
								<TableHead
									key={index}
									className={header.className}
								>
									{header.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading && (
							<TableRow>
								<TableCell
									colSpan={colSpan || headers.length}
									className="text-center py-8"
								>
									<div className="flex items-center justify-center space-x-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span className="text-slate-600 dark:text-slate-400">
											Loading...
										</span>
									</div>
								</TableCell>
							</TableRow>
						)}
						{!loading && data.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={colSpan || headers.length}
									className="text-center py-8"
								>
									<span className="text-slate-500 dark:text-slate-400">
										{emptyMessage}
									</span>
								</TableCell>
							</TableRow>
						)}
						{!loading &&
							data.map((item, index) => {
								const rowProps = getRowProps?.(item) || {};
								const itemId = (item as any)[itemIdKey];
								const isHighlighted = highlightedItemId && itemId && String(itemId) === String(highlightedItemId);

								return (
									<TableRow
										key={index}
										onClick={() => onRowClick?.(item)}
										className={`
											${onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}
											${isHighlighted ? "bg-yellow-100 dark:bg-yellow-900/20 animate-pulse" : ""}
										`.trim()}
										{...rowProps}
									>
										{renderRow(item)}
									</TableRow>
								);
							})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
