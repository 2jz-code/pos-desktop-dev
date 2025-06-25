import React from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { OrdersTableSkeleton } from "@/shared/components/common/OrdersTableSkeleton";
import PropTypes from "prop-types";

/**
 * Standardized table component for domain pages
 * Provides consistent table styling, loading states, and empty states
 */
export function StandardTable({
	headers,
	data = [],
	loading = false,
	emptyMessage = "No items found for the selected filters.",
	onRowClick,
	renderRow,
	colSpan,
}) {
	if (loading) {
		return <OrdersTableSkeleton />;
	}

	return (
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
				{data.length > 0 ? (
					data.map((item, index) => (
						<TableRow
							key={item.id || index}
							onClick={onRowClick ? () => onRowClick(item) : undefined}
							className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
						>
							{renderRow(item)}
						</TableRow>
					))
				) : (
					<TableRow>
						<TableCell
							colSpan={colSpan || headers.length}
							className="text-center h-24"
						>
							{emptyMessage}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}

StandardTable.propTypes = {
	headers: PropTypes.arrayOf(
		PropTypes.shape({
			label: PropTypes.string.isRequired,
			className: PropTypes.string,
		})
	).isRequired,
	data: PropTypes.array,
	loading: PropTypes.bool,
	emptyMessage: PropTypes.string,
	onRowClick: PropTypes.func,
	renderRow: PropTypes.func.isRequired,
	colSpan: PropTypes.number,
};

export default StandardTable;
