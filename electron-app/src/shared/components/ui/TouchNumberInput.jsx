import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/shared/components/ui/input";
import TouchNumberPad from "./TouchNumberPad";
import { createPortal } from "react-dom";

const TouchNumberInput = ({ 
	value = "", 
	onChange, 
	placeholder = "0.00", 
	className = "",
	disabled = false,
	currencyMode = true, // Enable automatic currency formatting
	...props 
}) => {
	const [isNumberPadOpen, setIsNumberPadOpen] = useState(false);
	const [internalValue, setInternalValue] = useState(value);
	const [rawCents, setRawCents] = useState(""); // Store the raw cents value
	const [numberPadPosition, setNumberPadPosition] = useState({ top: 0, left: 0, width: 0 });
	const inputRef = useRef(null);
	const containerRef = useRef(null);
	const numberPadRef = useRef(null);

	// Helper function to format cents to currency
	const formatCentsToDisplay = (cents) => {
		if (!cents || cents === "0") return "0.00";
		
		// Pad with leading zeros to ensure at least 2 digits
		const paddedCents = cents.padStart(2, "0");
		
		// Split into dollars and cents
		const totalCents = paddedCents.length;
		const dollarsStr = paddedCents.slice(0, totalCents - 2) || "0";
		const centsStr = paddedCents.slice(-2);
		
		return `${dollarsStr}.${centsStr}`;
	};

	// Helper function to convert display value back to cents
	const convertDisplayToCents = (displayValue) => {
		if (!displayValue) return "";
		const cleanValue = displayValue.replace(".", "");
		return cleanValue.replace(/^0+/, "") || "0";
	};

	// Sync internal value with external value
	useEffect(() => {
		if (currencyMode) {
			// Convert external value to cents for internal tracking
			const cents = convertDisplayToCents(value);
			setRawCents(cents);
			setInternalValue(formatCentsToDisplay(cents));
		} else {
			setInternalValue(value);
		}
	}, [value, currencyMode]);

	// Handle clicking outside to close the number pad
	useEffect(() => {
		const handleClickOutside = (event) => {
			// Check if click is outside both the input container AND the number pad
			const isOutsideContainer = containerRef.current && !containerRef.current.contains(event.target);
			const isOutsideNumberPad = numberPadRef.current && !numberPadRef.current.contains(event.target);
			
			if (isOutsideContainer && isOutsideNumberPad) {
				setIsNumberPadOpen(false);
			}
		};

		if (isNumberPadOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("touchstart", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("touchstart", handleClickOutside);
		};
	}, [isNumberPadOpen]);

	const calculateNumberPadPosition = () => {
		if (inputRef.current) {
			const rect = inputRef.current.getBoundingClientRect();
			const viewportHeight = window.innerHeight;
			const viewportWidth = window.innerWidth;
			const numberPadHeight = 400; // Approximate height of number pad
			const numberPadWidth = 320; // Approximate width of number pad
			
			let top = rect.bottom + window.scrollY + 8; // 8px gap
			let left = rect.left + window.scrollX;
			
			// Check if number pad would go off the bottom of the screen
			if (rect.bottom + numberPadHeight > viewportHeight) {
				top = rect.top + window.scrollY - numberPadHeight - 8; // Position above input
			}
			
			// Check if number pad would go off the right side of the screen
			if (left + numberPadWidth > viewportWidth) {
				left = viewportWidth - numberPadWidth - 16; // 16px margin from edge
			}
			
			// Ensure it doesn't go off the left side
			if (left < 16) {
				left = 16;
			}
			
			setNumberPadPosition({
				top,
				left,
				width: Math.min(numberPadWidth, rect.width)
			});
		}
	};

	const handleInputFocus = () => {
		if (!disabled) {
			calculateNumberPadPosition();
			setIsNumberPadOpen(true);
			// Prevent keyboard from showing on mobile
			inputRef.current?.blur();
		}
	};

	const handleNumberPress = (num) => {
		if (currencyMode) {
			// In currency mode, ignore decimal points as they're automatically handled
			if (num === ".") return;
			
			// Handle special case for "00" 
			if (num === "00") {
				// Add two zeros to our raw cents
				const newCents = rawCents + "00";
				
				// Limit to reasonable number of digits (e.g., 8 digits = $999,999.99)
				if (newCents.length > 8) return;
				
				const formattedValue = formatCentsToDisplay(newCents);
				
				setRawCents(newCents);
				setInternalValue(formattedValue);
				onChange?.(formattedValue);
				return;
			}
			
			// Only allow digits
			if (!/^\d$/.test(num)) return;
			
			// Add the digit to our raw cents
			const newCents = rawCents + num;
			
			// Limit to reasonable number of digits (e.g., 8 digits = $999,999.99)
			if (newCents.length > 8) return;
			
			const formattedValue = formatCentsToDisplay(newCents);
			
			setRawCents(newCents);
			setInternalValue(formattedValue);
			onChange?.(formattedValue);
		} else {
			// Original logic for non-currency mode
			const newValue = internalValue + num;
			
			// Basic validation for decimal input
			if (num === ".") {
				// Don't allow multiple decimal points
				if (internalValue.includes(".")) return;
				// Don't allow decimal as first character
				if (internalValue === "") {
					setInternalValue("0.");
					onChange?.("0.");
					return;
				}
			}
			
			// Don't allow leading zeros (except for decimal numbers)
			if (num !== "." && internalValue === "0") {
				setInternalValue(num);
				onChange?.(num);
				return;
			}
			
			setInternalValue(newValue);
			onChange?.(newValue);
		}
	};

	const handleBackspace = () => {
		if (currencyMode) {
			// Remove the last digit from raw cents
			const newCents = rawCents.slice(0, -1);
			const formattedValue = formatCentsToDisplay(newCents);
			
			setRawCents(newCents);
			setInternalValue(formattedValue);
			onChange?.(formattedValue);
		} else {
			// Original logic for non-currency mode
			const newValue = internalValue.slice(0, -1);
			setInternalValue(newValue);
			onChange?.(newValue);
		}
	};

	const handleClear = () => {
		if (currencyMode) {
			setRawCents("");
			setInternalValue("0.00");
			onChange?.("0.00");
		} else {
			setInternalValue("");
			onChange?.("");
		}
	};

	const handleClose = () => {
		setIsNumberPadOpen(false);
	};

	// Format the display value
	const displayValue = internalValue || "";

	return (
		<div ref={containerRef} className="relative">
			<Input
				ref={inputRef}
				type="text"
				value={displayValue}
				placeholder={placeholder}
				onClick={handleInputFocus}
				onFocus={handleInputFocus}
				readOnly
				disabled={disabled}
				className={`cursor-pointer ${className}`}
				style={{
					// Hide spinner arrows for number inputs
					WebkitAppearance: "none",
					MozAppearance: "textfield",
				}}
				{...props}
			/>
			
			{/* Number pad overlay */}
			{isNumberPadOpen && createPortal(
				<div 
					ref={numberPadRef}
					className="fixed z-50"
					style={{
						top: `${numberPadPosition.top}px`,
						left: `${numberPadPosition.left}px`,
						minWidth: '320px',
						maxWidth: '90vw'
					}}
				>
					<TouchNumberPad
						isOpen={isNumberPadOpen}
						onNumberPress={handleNumberPress}
						onBackspace={handleBackspace}
						onClear={handleClear}
						onClose={handleClose}
						currencyMode={currencyMode}
					/>
				</div>,
				document.body
			)}

			{/* CSS to hide spinner arrows */}
			<style jsx>{`
				input[type="number"]::-webkit-outer-spin-button,
				input[type="number"]::-webkit-inner-spin-button {
					-webkit-appearance: none;
					margin: 0;
				}
				
				input[type="number"] {
					-moz-appearance: textfield;
				}
			`}</style>
		</div>
	);
};

export default TouchNumberInput;