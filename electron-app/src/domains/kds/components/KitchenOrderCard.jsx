import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, MapPin, FileText, AlertTriangle } from "lucide-react";

/**
 * Kitchen Order Card Component
 * Displays individual kitchen item information with status management
 * Optimized for kitchen station workflow (item-level focus)
 */
export function KitchenOrderCard({ item, onStatusChange, onAddNote }) {
	const [showNoteInput, setShowNoteInput] = useState(false);
	const [noteText, setNoteText] = useState("");

	const getItemAge = (receivedAt) => {
		const now = new Date();
		const timeReceived = new Date(receivedAt);
		const diffInMinutes = Math.floor((now - timeReceived) / (1000 * 60));

		if (diffInMinutes < 1) {
			return "Just now";
		} else if (diffInMinutes < 60) {
			return `${diffInMinutes}m ago`;
		} else {
			const hours = Math.floor(diffInMinutes / 60);
			const minutes = diffInMinutes % 60;
			return `${hours}h ${minutes}m ago`;
		}
	};

	const getStatusColor = (status) => {
		switch (status) {
			case "received":
				return "border-blue-200 bg-blue-50";
			case "preparing":
				return "border-yellow-200 bg-yellow-50";
			case "ready":
				return "border-green-200 bg-green-50";
			case "completed":
				return "border-gray-200 bg-gray-50";
			default:
				return "border-gray-200 bg-white";
		}
	};

	const getOrderTypeIcon = (orderType) => {
		switch (orderType) {
			case "dine-in":
				return "🍽️";
			case "takeout":
				return "🥡";
			case "delivery":
				return "🚚";
			default:
				return "📋";
		}
	};

	const getNextStatus = (currentStatus) => {
		switch (currentStatus) {
			case "received":
				return "preparing";
			case "preparing":
				return "ready";
			case "ready":
				return "completed";
			default:
				return currentStatus;
		}
	};

	const getStatusActionText = (status) => {
		switch (status) {
			case "received":
				return "Start Preparing";
			case "preparing":
				return "Mark Ready";
			case "ready":
				return "Complete Item";
			default:
				return "Update Status";
		}
	};

	const handleStatusAdvance = () => {
		const nextStatus = getNextStatus(item.status);
		if (onStatusChange && nextStatus !== item.status) {
			onStatusChange(item.id, nextStatus);
		}
	};

	const handleAddNote = () => {
		if (onAddNote && noteText.trim()) {
			onAddNote(item.id, noteText.trim());
			setNoteText("");
			setShowNoteInput(false);
		}
	};

	const canAdvanceStatus = () => {
		return item.status !== "completed";
	};

	return (
		<Card className={`mb-4 transition-all duration-200 ${getStatusColor(item.status)} ${item.is_overdue ? 'ring-2 ring-red-400' : ''}`}>
			<CardHeader className="pb-2">
				<div className="flex justify-between items-start">
					<div className="flex items-center space-x-2">
						<h3 className="text-lg font-semibold">#{item.order_number}</h3>
						<span className="text-lg">{getOrderTypeIcon(item.order_type)}</span>
						{item.is_priority && (
							<span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
								PRIORITY
							</span>
						)}
					</div>
					<div className="text-right text-sm text-gray-600">
						<div className="flex items-center space-x-1">
							<Clock className="h-4 w-4" />
							<span>{getItemAge(item.received_at)}</span>
							{item.is_overdue && (
								<AlertTriangle className="h-4 w-4 text-red-500" />
							)}
						</div>
					</div>
				</div>

				{/* Customer Info */}
				<div className="flex items-center space-x-1 text-sm text-gray-600">
					<User className="h-4 w-4" />
					<span>{item.customer_name || "Guest"}</span>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				{/* Item Details */}
				<div className="mb-4">
					<div className="flex items-center justify-between mb-2">
						<h4 className="text-lg font-medium">{item.product_name}</h4>
						<span className="text-lg font-semibold">×{item.quantity}</span>
					</div>

					{/* Status Badge */}
					<div className="mb-2">
						<span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
							item.status === 'received' ? 'bg-blue-100 text-blue-800' :
							item.status === 'preparing' ? 'bg-yellow-100 text-yellow-800' :
							item.status === 'ready' ? 'bg-green-100 text-green-800' :
							'bg-gray-100 text-gray-800'
						}`}>
							{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
						</span>
					</div>

					{/* Special Instructions */}
					{item.special_instructions && (
						<div className="mb-3 p-2 bg-white bg-opacity-50 rounded">
							<div className="flex items-start space-x-1">
								<FileText className="h-4 w-4 text-gray-500 mt-0.5" />
								<div>
									<div className="text-xs text-gray-600 font-medium">Special Instructions:</div>
									<div className="text-sm">{item.special_instructions}</div>
								</div>
							</div>
						</div>
					)}

					{/* Kitchen Notes */}
					{item.kitchen_notes && (
						<div className="mb-3 p-2 bg-white bg-opacity-50 rounded">
							<div className="flex items-start space-x-1">
								<FileText className="h-4 w-4 text-blue-500 mt-0.5" />
								<div>
									<div className="text-xs text-gray-600 font-medium">Kitchen Notes:</div>
									<div className="text-sm">{item.kitchen_notes}</div>
								</div>
							</div>
						</div>
					)}

					{/* Prep Time Estimate */}
					{item.estimated_prep_time && (
						<div className="text-xs text-gray-600">
							Est. prep time: {item.estimated_prep_time} minutes
						</div>
					)}
				</div>

				{/* Action Buttons */}
				<div className="flex flex-wrap gap-2">
					{canAdvanceStatus() && (
						<Button
							onClick={handleStatusAdvance}
							className={`${
								item.status === 'received' ? 'bg-blue-500 hover:bg-blue-600' :
								item.status === 'preparing' ? 'bg-green-500 hover:bg-green-600' :
								'bg-gray-500 hover:bg-gray-600'
							} text-white text-sm`}
						>
							{getStatusActionText(item.status)}
						</Button>
					)}

					{/* Add Note Button */}
					{item.status !== "completed" && (
						<Button
							onClick={() => setShowNoteInput(!showNoteInput)}
							variant="outline"
							className="text-sm"
						>
							<FileText className="h-4 w-4 mr-1" />
							Add Note
						</Button>
					)}
				</div>

				{/* Note Input */}
				{showNoteInput && (
					<div className="mt-3 space-y-2">
						<textarea
							value={noteText}
							onChange={(e) => setNoteText(e.target.value)}
							placeholder="Add kitchen notes or preparation details..."
							className="w-full p-2 border rounded text-sm resize-none"
							rows={2}
						/>
						<div className="flex gap-2">
							<Button
								onClick={handleAddNote}
								className="bg-blue-500 hover:bg-blue-600 text-white text-sm"
								disabled={!noteText.trim()}
							>
								Add Note
							</Button>
							<Button
								onClick={() => {
									setShowNoteInput(false);
									setNoteText("");
								}}
								variant="outline"
								className="text-sm"
							>
								Cancel
							</Button>
						</div>
					</div>
				)}

				{/* Timing Info */}
				{item.status !== "received" && (
					<div className="mt-2 text-xs text-gray-600 space-y-1">
						{item.started_preparing_at && (
							<div>Started: {new Date(item.started_preparing_at).toLocaleTimeString()}</div>
						)}
						{item.ready_at && (
							<div>Ready: {new Date(item.ready_at).toLocaleTimeString()}</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}