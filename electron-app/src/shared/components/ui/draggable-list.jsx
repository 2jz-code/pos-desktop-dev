import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
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
  dragHandlePosition = "left", // "left" | "right" | "custom"
  emptyState = null,
  loading = false,
  loadingState = null
}) => {
  
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(items);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    onReorder?.(items, result.source.index, result.destination.index);
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
                          ? 'shadow-lg border-blue-300' 
                          : 'shadow-sm hover:shadow-md'
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
                        )
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