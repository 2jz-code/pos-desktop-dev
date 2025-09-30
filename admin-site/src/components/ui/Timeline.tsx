import React from "react";
import { Clock, User, Bot, CheckCircle, XCircle, AlertCircle, DollarSign, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface TimelineItem {
	id: string;
	timestamp: string;
	actor?: {
		name: string;
		type: "user" | "system";
	};
	event: string;
	description?: string;
	metadata?: Record<string, any>;
	icon?: "success" | "error" | "warning" | "payment" | "email" | "default";
}

interface TimelineProps {
	items: TimelineItem[];
	className?: string;
}

const getIconComponent = (iconType?: string) => {
	switch (iconType) {
		case "success":
			return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
		case "error":
			return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
		case "warning":
			return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
		case "payment":
			return <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
		case "email":
			return <Mail className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
		default:
			return <Clock className="h-4 w-4 text-muted-foreground" />;
	}
};

const getActorIcon = (actorType?: string) => {
	if (actorType === "system") {
		return <Bot className="h-3 w-3" />;
	}
	return <User className="h-3 w-3" />;
};

export function Timeline({ items, className }: TimelineProps) {
	return (
		<div className={cn("space-y-0", className)}>
			{items.map((item, index) => {
				const isLast = index === items.length - 1;

				return (
					<div key={item.id} className="relative flex gap-4 pb-6">
						{/* Timeline Line */}
						{!isLast && (
							<div className="absolute left-[15px] top-[28px] bottom-0 w-px bg-border" />
						)}

						{/* Icon */}
						<div className="relative flex-shrink-0">
							<div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-background">
								{getIconComponent(item.icon)}
							</div>
						</div>

						{/* Content */}
						<div className="flex-1 pt-0.5">
							<div className="flex items-start justify-between gap-4">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										{item.actor && (
											<div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
												{getActorIcon(item.actor.type)}
												<span>{item.actor.name}</span>
											</div>
										)}
										<span className="text-sm font-semibold text-foreground">
											{item.event}
										</span>
									</div>
									{item.description && (
										<p className="text-sm text-muted-foreground mt-1">
											{item.description}
										</p>
									)}
									{item.metadata && Object.keys(item.metadata).length > 0 && (
										<div className="mt-2 space-y-1">
											{Object.entries(item.metadata).map(([key, value]) => (
												<div key={key} className="text-xs text-muted-foreground">
													<span className="font-medium">{key}:</span> {String(value)}
												</div>
											))}
										</div>
									)}
								</div>
								<time className="text-xs text-muted-foreground whitespace-nowrap">
									{format(new Date(item.timestamp), "MMM d, h:mm a")}
								</time>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function TimelineSkeleton() {
	return (
		<div className="space-y-6">
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex gap-4">
					<div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-48 bg-muted animate-pulse rounded" />
						<div className="h-3 w-64 bg-muted animate-pulse rounded" />
					</div>
				</div>
			))}
		</div>
	);
}