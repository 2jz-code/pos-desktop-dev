import React, { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ExpandableTextareaProps {
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	maxLength?: number;
	className?: string;
	collapsedHeight?: string;
	expandedHeight?: string;
}

export const ExpandableTextarea: React.FC<ExpandableTextareaProps> = ({
	value = "",
	onChange,
	placeholder = "Add details...",
	disabled = false,
	maxLength = 500,
	className = "",
	collapsedHeight = "h-10",
	expandedHeight = "h-24",
}) => {
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleFocus = () => {
		setIsFocused(true);
	};

	const handleBlur = () => {
		setIsFocused(false);
	};

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		onChange?.(e.target.value);
	};

	// Auto-resize the textarea based on content when focused
	useEffect(() => {
		if (textareaRef.current && isFocused) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = Math.max(textareaRef.current.scrollHeight, 96) + 'px';
		}
	}, [value, isFocused]);

	const displayValue = isFocused || value.length <= 50 ? value : `${value.slice(0, 50)}...`;

	return (
		<div className="relative">
			<Textarea
				ref={textareaRef}
				value={displayValue}
				onChange={handleChange}
				onFocus={handleFocus}
				onBlur={handleBlur}
				placeholder={placeholder}
				disabled={disabled}
				maxLength={maxLength}
				className={cn(
					"resize-none transition-all duration-200 ease-in-out",
					isFocused ? expandedHeight : collapsedHeight,
					!isFocused && "overflow-hidden",
					className
				)}
			/>
			{!isFocused && value && value.length > 50 && (
				<div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
					Click to expand
				</div>
			)}
			{isFocused && (
				<div className="absolute bottom-2 right-2 text-xs text-muted-foreground pointer-events-none">
					{value.length}/{maxLength}
				</div>
			)}
		</div>
	);
};