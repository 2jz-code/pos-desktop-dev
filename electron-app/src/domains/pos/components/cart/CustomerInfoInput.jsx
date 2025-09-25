"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { User, X } from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";

const CustomerInfoInput = () => {
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef(null);
	
	const {
		customerFirstName,
		setCustomerFirstName,
	} = usePosStore(
		(state) => ({
			customerFirstName: state.customerFirstName,
			setCustomerFirstName: state.setCustomerFirstName,
		}),
		shallow
	);

	const hasCustomerName = customerFirstName?.trim();
	const displayText = hasCustomerName || "Customer Name";

	// Focus input when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleClick = () => {
		setIsEditing(true);
	};

	const handleBlur = () => {
		setIsEditing(false);
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			setIsEditing(false);
		}
		if (e.key === 'Escape') {
			setIsEditing(false);
		}
	};

	const handleClear = (e) => {
		e.stopPropagation();
		setCustomerFirstName('');
	};

	return (
		<div className="border-t border-border/60 bg-muted/20">
			<div className="p-3">
				{isEditing ? (
					<div className="flex items-center space-x-2">
						<User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
						<Input
							ref={inputRef}
							value={customerFirstName}
							onChange={(e) => setCustomerFirstName(e.target.value)}
							onBlur={handleBlur}
							onKeyDown={handleKeyDown}
							placeholder="Customer name"
							className="text-sm border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
						/>
					</div>
				) : (
					<div 
						className="flex items-center justify-between cursor-pointer hover:bg-muted/40 rounded p-1 -m-1 transition-colors"
						onClick={handleClick}
					>
						<div className="flex items-center space-x-2">
							<User className="h-4 w-4 text-muted-foreground" />
							<span className={`text-sm ${hasCustomerName
								? 'text-foreground'
								: 'text-muted-foreground'
							}`}>
								{displayText}
							</span>
						</div>
						{hasCustomerName && (
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
								onClick={handleClear}
							>
								<X className="h-3 w-3" />
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default CustomerInfoInput;