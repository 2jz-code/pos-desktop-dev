import React, { useState, useEffect, useRef, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { cn } from "@/lib/utils";

const OptimizedImage = ({
	src,
	alt,
	className,
	width,
	height,
	priority = false,
	...props
}) => {
	const [imageSrc, setImageSrc] = useState(
		priority ? src : getLowQualityPlaceholder(src)
	);
	const [imageHasLoaded, setImageHasLoaded] = useState(false);
	const [hasError, setHasError] = useState(false);
	const imgRef = useRef(null);

	const { ref: inViewRef, inView } = useInView({
		triggerOnce: true,
		rootMargin: "200px 0px",
		skip: priority || imageHasLoaded,
	});

	const setRefs = useCallback((node) => {
		imgRef.current = node;
		inViewRef(node);
	}, [inViewRef]);

	useEffect(() => {
		if (inView && !imageHasLoaded) {
			const img = new Image();
			img.src = src;
			img.onload = () => {
				setImageSrc(src);
				setImageHasLoaded(true);
				setHasError(false);
			};
			img.onerror = () => {
				setHasError(true);
				setImageHasLoaded(true); // Don't try to load again
			};
		}
	}, [inView, src, imageHasLoaded]);

	const handleError = () => {
		setHasError(true);
	};

	if (hasError) {
		return (
			<div
				className={cn(
					"flex items-center justify-center bg-muted text-muted-foreground",
					className
				)}
			>
				<span className="text-xs text-center p-2">Image not found</span>
			</div>
		);
	}

	return (
		<img
			ref={setRefs}
			src={imageSrc}
			alt={alt}
			width={width}
			height={height}
			className={cn(
				"transition-opacity duration-300",
				!imageHasLoaded && !priority
					? "opacity-50 blur-sm"
					: "opacity-100 blur-0",
				className
			)}
			loading={priority ? "eager" : "lazy"}
			onError={handleError}
			{...props}
		/>
	);
};

// This creates a very basic LQIP (Low-Quality Image Placeholder)
// For a real app, you might generate these on the server.
const getLowQualityPlaceholder = (src) => {
	// If it's a data URL or SVG, don't change it
	if (!src || src.startsWith("data:") || src.endsWith(".svg")) {
		return src;
	}
	// A simple trick for some image CDNs, may not work for all.
	// For local files, this won't do much.
	// A better approach would be a separate, tiny placeholder image.
	return src; // Placeholder logic can be enhanced here
};

export default OptimizedImage;
