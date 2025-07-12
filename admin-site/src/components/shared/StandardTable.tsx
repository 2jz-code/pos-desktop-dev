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
							data.map((item, index) => (
								<TableRow
									key={index}
									onClick={() => onRowClick?.(item)}
									className={
										onRowClick
											? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
											: ""
									}
								>
									{renderRow(item)}
								</TableRow>
							))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
