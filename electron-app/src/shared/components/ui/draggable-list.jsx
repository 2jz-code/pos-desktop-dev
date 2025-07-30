import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

const DraggableList = ({
	items = [],
	onReorder,
	renderItem,
	getItemId,
	droppableId = "draggable-list",
	className = "",
	itemClassName = "",
	dragHandleClassName = "cursor-grab hover:bg-gray-100 p-1 rounded",
	showDragHandle = true,
	emptyState = null,
	loading = false,
	loadingState = null,
	// New props for table-like styling matching ModifierOptionEditor
	showHeaders = false,
	headers = [],
	tableStyle = false,
	showEmptyState = true,
	emptyStateMessage = "No items yet",
}) => {
	const handleDragEnd = (result) => {
		if (!result.destination) return;

		const reorderedItems = Array.from(items);
		const [reorderedItem] = reorderedItems.splice(result.source.index, 1);
		reorderedItems.splice(result.destination.index, 0, reorderedItem);

		onReorder?.(reorderedItems, result.source.index, result.destination.index);
	};

	const getDefaultItemId = (item, index) => {
		if (getItemId) return getItemId(item, index);
		return item.id || item._id || index.toString();
	};

	if (loading && loadingState) {
		return loadingState;
	}

	if (items.length === 0 && emptyState) {
		return emptyState;
	}

	// Early return for empty state when using table style
	if (tableStyle && (!items || items.length === 0)) {
		return showEmptyState ? (
			<div className={`text-center py-8 text-gray-500 ${className}`}>
				<div className="mb-2">
					<GripVertical className="h-8 w-8 mx-auto text-gray-300" />
				</div>
				<p className="text-sm">{emptyStateMessage}</p>
				<p className="text-xs text-gray-400">Drag items here to reorder</p>
			</div>
		) : null;
	}

	// Table-style rendering (matching ModifierOptionEditor)
	if (tableStyle) {
		return (
			<div className={className}>
				{/* Header row */}
				{showHeaders && items.length > 0 && (
					<div className="flex items-center gap-3 px-3 py-2 bg-gray-100 border border-gray-200 rounded-t-lg text-sm font-medium text-gray-600">
						<div className="w-6"></div> {/* Spacer for drag handle */}
						{headers.map((header, index) => (
							<div
								key={index}
								className={header.className || "flex-1"}
							>
								{header.label}
							</div>
						))}
					</div>
				)}

				<DragDropContext onDragEnd={handleDragEnd}>
					<Droppable
						droppableId={droppableId}
						renderClone={(provided, snapshot, rubric) => {
							const item = items[rubric.source.index];
							return (
								<div
									{...provided.draggableProps}
									{...provided.dragHandleProps}
									ref={provided.innerRef}
									className="bg-white shadow-lg border border-blue-300 rounded-lg"
									style={provided.draggableProps.style}
								>
									{renderItem({
										item,
										index: rubric.source.index,
										isDragging: true,
										dragHandleProps: provided.dragHandleProps,
										isClone: true,
										dragHandle: (
											<div className="cursor-grabbing p-1 rounded bg-blue-100">
												<GripVertical className="h-4 w-4 text-blue-600" />
											</div>
										),
									})}
								</div>
							);
						}}
					>
						{(provided, snapshot) => (
							<div
								{...provided.droppableProps}
								ref={provided.innerRef}
								className={`border border-gray-200 ${
									showHeaders && items.length > 0
										? "rounded-b-lg border-t-0"
										: "rounded-lg"
								} ${snapshot.isDraggingOver ? "bg-blue-50" : "bg-white"}`}
							>
								{items.length === 0 && (
									<div className="text-center py-8 text-gray-500">
										<div className="mb-2">
											<GripVertical className="h-8 w-8 mx-auto text-gray-300" />
										</div>
										<p className="text-sm">{emptyStateMessage}</p>
										<p className="text-xs text-gray-400">
											Drag items here to reorder
										</p>
									</div>
								)}

								{items.map((item, index) => {
									const itemId = getDefaultItemId(item, index);
									return (
										<Draggable
											key={itemId}
											draggableId={itemId.toString()}
											index={index}
										>
											{(provided, snapshot) => (
												<div
													ref={provided.innerRef}
													{...provided.draggableProps}
													className={`${
														index !== items.length - 1
															? "border-b border-gray-200"
															: ""
													} ${
														snapshot.isDragging
															? "bg-blue-50 opacity-80"
															: "hover:bg-gray-50"
													}`}
												>
													{renderItem({
														item,
														index,
														isDragging: snapshot.isDragging,
														dragHandleProps: provided.dragHandleProps,
														dragHandle: (
															<div
																{...provided.dragHandleProps}
																className={`cursor-grab hover:bg-gray-200 active:cursor-grabbing p-1 rounded ${
																	snapshot.isDragging ? "bg-blue-100" : ""
																}`}
															>
																<GripVertical
																	className={`h-4 w-4 ${
																		snapshot.isDragging
																			? "text-blue-600"
																			: "text-gray-400"
																	}`}
																/>
															</div>
														),
													})}
												</div>
											)}
										</Draggable>
									);
								})}
								{provided.placeholder}
							</div>
						)}
					</Droppable>
				</DragDropContext>
			</div>
		);
	}

	// Original card-style rendering
	return (
		<DragDropContext onDragEnd={handleDragEnd}>
			<Droppable droppableId={droppableId}>
				{(provided) => (
					<div
						{...provided.droppableProps}
						ref={provided.innerRef}
						className={`space-y-3 ${className}`}
					>
						{items.map((item, index) => {
							const itemId = getDefaultItemId(item, index);

							return (
								<Draggable
									key={itemId}
									draggableId={itemId.toString()}
									index={index}
								>
									{(provided, snapshot) => (
										<div
											ref={provided.innerRef}
											{...provided.draggableProps}
											className={`border rounded-lg bg-white transition-shadow ${
												snapshot.isDragging
													? "shadow-lg border-blue-300"
													: "shadow-sm hover:shadow-md"
											} ${itemClassName}`}
										>
											{renderItem({
												item,
												index,
												isDragging: snapshot.isDragging,
												dragHandleProps: provided.dragHandleProps,
												dragHandle: showDragHandle && (
													<DragHandle
														dragHandleProps={provided.dragHandleProps}
														className={dragHandleClassName}
													/>
												),
											})}
										</div>
									)}
								</Draggable>
							);
						})}
						{provided.placeholder}
					</div>
				)}
			</Droppable>
		</DragDropContext>
	);
};

const DragHandle = ({ dragHandleProps, className }) => (
	<div
		{...dragHandleProps}
		className={className}
	>
		<GripVertical className="h-4 w-4 text-gray-400" />
	</div>
);

export default DraggableList;
