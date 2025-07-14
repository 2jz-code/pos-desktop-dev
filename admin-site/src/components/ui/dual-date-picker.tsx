"use client";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface DualDatePickerProps {
	startDate: Date | undefined;
	endDate: Date | undefined;
	onStartDateChange: (date: Date | undefined) => void;
	onEndDateChange: (date: Date | undefined) => void;
	className?: string;
}

export function DualDatePicker({
	startDate,
	endDate,
	onStartDateChange,
	onEndDateChange,
	className,
}: DualDatePickerProps) {
	return (
		<div className={cn("flex gap-2", className)}>
			{/* Start Date Picker */}
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"w-[160px] justify-start text-left font-normal",
							!startDate && "text-muted-foreground"
						)}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{startDate ? (
							format(startDate, "MMM dd, yyyy")
						) : (
							<span>Start date</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={startDate}
						onSelect={onStartDateChange}
						initialFocus
					/>
				</PopoverContent>
			</Popover>

			{/* Separator */}
			<div className="flex items-center text-muted-foreground">
				<span>to</span>
			</div>

			{/* End Date Picker */}
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"w-[160px] justify-start text-left font-normal",
							!endDate && "text-muted-foreground"
						)}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{endDate ? (
							format(endDate, "MMM dd, yyyy")
						) : (
							<span>End date</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={endDate}
						onSelect={onEndDateChange}
						initialFocus
						disabled={(date) => {
							// Disable dates before start date if start date is selected
							return startDate ? date < startDate : false;
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}