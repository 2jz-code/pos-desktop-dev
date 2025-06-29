import React, { useEffect, useState } from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import apiClient from "../../../api/client";
// import "./ReviewCarousel.css"; // Optional: for more complex styles

// Fallback reviews if API fails or for initial setup
const fallbackReviews = [
	{
		id: "fallback-1",
		author_name: "Satisfied Customer A (Example)",
		text: "The Manakeesh here is absolutely divine! So fresh and flavorful.",
		rating: 5,
		source: "Example Source",
	},
	{
		id: "fallback-2",
		author_name: "Foodie Explorer (Example)",
		text: "A hidden gem! Authentic taste and friendly service. Will be back! This is an example of a slightly longer review to demonstrate how the card height will be consistent across all reviews in the carousel.",
		rating: 5,
		source: "Example Source",
	},
	{
		id: "fallback-3",
		author_name: "Regular Customer (Example)",
		text: "Amazing Mediterranean food! The cheese pies are my favorite. Staff is always friendly and the atmosphere is welcoming.",
		rating: 5,
		source: "Example Source",
	},
	{
		id: "fallback-4",
		author_name: "Happy Visitor (Example)",
		text: "Fresh ingredients, authentic flavors, and excellent service. This place brings the taste of the Middle East right to our neighborhood!",
		rating: 4,
		source: "Example Source",
	},
	{
		id: "fallback-5",
		author_name: "Local Food Lover (Example)",
		text: "The Za'atar manakeesh is incredible! You can tell everything is made with love and care. Definitely coming back for more.",
		rating: 5,
		source: "Example Source",
	},
	{
		id: "fallback-6",
		author_name: "First-time Visitor (Example)",
		text: "What a pleasant surprise! The pudding is amazing and the staff is so helpful in explaining all the delicious options.",
		rating: 5,
		source: "Example Source",
	},
];

// A sub-component for individual review cards to handle its own state
const ReviewCard = ({ review }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const TRUNCATE_LENGTH = 180; // Character limit before truncating
	const isLongText = review.text.length > TRUNCATE_LENGTH;

	const toggleExpand = () => {
		setIsExpanded(!isExpanded);
	};

	const displayText =
		isLongText && !isExpanded
			? `${review.text.substring(0, TRUNCATE_LENGTH)}...`
			: review.text;

	return (
		<div className="p-4 h-full">
			<div
				className="rounded-lg shadow-lg p-6 flex flex-col h-full" // Use h-full to fill parent
				style={{ backgroundColor: "var(--color-accent-light-beige)" }}
			>
				<div className="flex-grow">
					{" "}
					{/* This div will grow to push the footer down */}
					<p
						className="italic mb-4"
						style={{ color: "var(--color-accent-dark-brown)" }}
					>
						"{displayText}"
					</p>
					{isLongText && (
						<button
							onClick={toggleExpand}
							className="font-semibold text-sm"
							style={{ color: "var(--color-accent-dark-green)" }}
						>
							{isExpanded ? "Read Less <<" : "Read More >>"}
						</button>
					)}
				</div>

				<div className="mt-4">
					{" "}
					{/* Footer with author, rating, and source */}
					<p
						className="text-right font-semibold"
						style={{ color: "var(--color-accent-warm-brown)" }}
					>
						- A Valued Customer
					</p>
					{review.rating && (
						<div
							className="text-right mt-1"
							style={{ color: "var(--color-accent-warm-brown)" }}
						>
							{"★".repeat(review.rating)}
							{"☆".repeat(5 - review.rating)}
						</div>
					)}
					{(review.source || review.relative_time_description) && (
						<p
							className="text-right text-xs mt-1"
							style={{ color: "var(--color-accent-subtle-gray)" }}
						>
							{review.source
								? `via ${review.source}`
								: `${review.relative_time_description} on Google`}
						</p>
					)}
				</div>
			</div>
		</div>
	);
};

const ReviewCarousel = () => {
	const [reviews, setReviews] = useState([]); // Start with empty array
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchReviews = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await apiClient.get("integrations/google-reviews/");
				const data = response.data;

				// Check if we have reviews data (Google API returns an object with reviews array)
				if (
					data &&
					data.reviews &&
					Array.isArray(data.reviews) &&
					data.reviews.length > 0
				) {
					// Map Google reviews to our expected format and add unique IDs
					const mappedReviews = data.reviews.map((review, index) => ({
						...review,
						id: review.time ? `google-${review.time}` : `google-${index}`, // Use timestamp or index as ID
						author_name: review.author_name, // Google reviews use author_name
						// Add source info if not already present
						source: review.source || "Google Reviews",
					}));
					setReviews(mappedReviews);
					console.log(
						"Successfully loaded Google reviews:",
						mappedReviews.length
					);
				} else {
					console.warn(
						"Fetched reviews data is empty or invalid, using fallback reviews."
					);
					setReviews(fallbackReviews);
				}
			} catch (e) {
				console.error("Failed to fetch reviews:", e);
				setError(e.message);
				// On error, still use fallback reviews so the section isn't empty
				setReviews(fallbackReviews);
			} finally {
				setIsLoading(false);
			}
		};

		fetchReviews();
	}, []);

	const settings = {
		dots: false,
		infinite: reviews.length > 1,
		speed: 500,
		slidesToShow: Math.min(3, reviews.length), // Show up to 3 slides on desktop
		slidesToScroll: 1,
		autoplay: true,
		autoplaySpeed: 4000, // Slightly slower for better readability
		adaptiveHeight: false,
		responsive: [
			{
				breakpoint: 1200, // Large desktop
				settings: {
					slidesToShow: Math.min(3, reviews.length),
				},
			},
			{
				breakpoint: 1024, // Tablet landscape
				settings: {
					slidesToShow: Math.min(2, reviews.length),
				},
			},
			{
				breakpoint: 768, // Tablet portrait
				settings: {
					slidesToShow: 1,
					dots: false,
				},
			},
			{
				breakpoint: 600, // Mobile
				settings: {
					slidesToShow: 1,
					dots: false,
				},
			},
		],
	};

	// Skeleton loader for when reviews are being fetched
	const SkeletonCard = () => (
		<div className="p-4 h-full">
			<div
				className="rounded-lg shadow-lg p-6 flex flex-col h-full bg-accent-light-beige animate-pulse"
				style={{ minHeight: "250px" }} // Ensure consistent height
			>
				<div className="flex-grow space-y-3">
					<div className="h-4 bg-gray-300 rounded w-5/6"></div>
					<div className="h-4 bg-gray-300 rounded w-full"></div>
					<div className="h-4 bg-gray-300 rounded w-3/4"></div>
				</div>
				<div className="mt-4 space-y-2">
					<div className="h-4 bg-gray-300 rounded w-1/2 ml-auto"></div>
					<div className="h-4 bg-gray-300 rounded w-1/3 ml-auto"></div>
				</div>
			</div>
		</div>
	);

	if (isLoading) {
		return (
			<div className="bg-primary-beige py-12">
				<div className="max-w-5xl mx-auto px-4 text-center">
					<h2 className="text-3xl md:text-4xl font-bold text-accent-dark-green mb-12">
						What Our Customers Are Saying
					</h2>
					<Slider {...settings}>
						{[...Array(3)].map((_, i) => (
							<SkeletonCard key={i} />
						))}
					</Slider>
				</div>
			</div>
		);
	}

	if (error) {
		// Optionally, you can have a specific error state UI
		// For now, it will fall through and show fallback reviews
		console.log("Rendering with fallback due to error:", error);
	}

	if (!reviews || reviews.length === 0) {
		return (
			<div
				style={{
					backgroundColor: "var(--color-accent-light-beige)", // Changed to match surrounding sections
					color: "var(--color-accent-dark-green)",
				}}
				className="py-12 text-center"
			>
				No reviews to display at the moment.
			</div>
		);
	}

	return (
		<div
			className="review-carousel-container py-12"
			// Applied linear gradient for smooth transition
			style={{
				background:
					"linear-gradient(to bottom, var(--color-accent-light-beige), var(--color-primary-beige) 25%, var(--color-primary-beige) 75%, var(--color-accent-light-beige))",
			}}
		>
			<div className="text-center mb-16">
				<span className="text-primary-green font-semibold tracking-wider uppercase">
					First time here?
				</span>
				<h2 className="text-4xl font-bold mt-2 text-accent-dark-green">
					What Our Customers Say
				</h2>
				<div className="h-1 w-24 bg-primary-green mx-auto mt-4 rounded-full"></div>
			</div>
			<div className="max-w-6xl mx-auto px-4">
				<div className="uniform-height-slider">
					<Slider {...settings}>
						{reviews.map((review) => (
							<ReviewCard
								key={review.id}
								review={review}
							/>
						))}
					</Slider>
				</div>
			</div>
			<style
				jsx
				global
			>{`
				.slick-prev:before,
				.slick-next:before {
					color: var(--color-accent-dark-green) !important;
				}
				.slick-dots li.slick-active div {
					background: var(--color-accent-warm-brown) !important;
				}
				/* This CSS ensures all slides have the same height */
				.uniform-height-slider .slick-track {
					display: flex !important;
				}
				.uniform-height-slider .slick-slide {
					height: inherit !important;
					display: flex !important;
					flex-direction: column !important;
				}
				.uniform-height-slider .slick-slide > div {
					height: 100%;
					display: flex;
					flex-direction: column;
				}
			`}</style>
		</div>
	);
};

export default ReviewCarousel;
