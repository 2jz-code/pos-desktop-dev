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
		author: "Satisfied Customer A (Example)",
		text: "The Manakeesh here is absolutely divine! So fresh and flavorful.",
		rating: 5,
		source: "Example Source", // Add a source field
	},
	{
		id: "fallback-2",
		author: "Foodie Explorer (Example)",
		text: "A hidden gem! Authentic taste and friendly service. Will be back! This is an example of a slightly longer review to demonstrate how the card height will be consistent across all reviews in the carousel.",
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
					{review.source && (
						<p
							className="text-right text-xs mt-1"
							style={{ color: "var(--color-accent-subtle-gray)" }}
						>
							via {review.source}
						</p>
					)}
				</div>
			</div>
		</div>
	);
};

const ReviewCarousel = () => {
	const [reviews, setReviews] = useState(fallbackReviews);
	const [isLoading, setIsLoading] = useState(false); // Initially false if using fallback
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchReviews = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await apiClient.get("website/reviews/");
				const data = response.data;

				if (data && data.length > 0) {
					setReviews(data);
				} else {
					console.warn("Fetched reviews data is empty or invalid.");
					setReviews(fallbackReviews);
				}
			} catch (e) {
				console.error("Failed to fetch reviews:", e);
				setError(e.message);
				setReviews(fallbackReviews); // Fallback to static reviews on error
			} finally {
				setIsLoading(false);
			}
		};

		fetchReviews();
	}, []);

	const settings = {
		dots: true,
		infinite: reviews.length > 1,
		speed: 500,
		slidesToShow: Math.min(3, reviews.length),
		slidesToScroll: 1,
		autoplay: true,
		autoplaySpeed: 3000,
		adaptiveHeight: false,
		responsive: [
			{
				breakpoint: 1024,
				settings: {
					slidesToShow: Math.min(2, reviews.length),
				},
			},
			{
				breakpoint: 600,
				settings: {
					slidesToShow: 1,
				},
			},
		],
		appendDots: (dots) => (
			<div style={{ bottom: "-40px" }}>
				<ul style={{ margin: "0px" }}> {dots} </ul>
			</div>
		),
		customPaging: () => (
			<div
				style={{
					width: "12px",
					height: "12px",
					borderRadius: "50%",
					background: "var(--color-accent-subtle-gray)",
					margin: "0 5px",
				}}
			></div>
		),
	};

	if (isLoading && reviews === fallbackReviews) {
		return (
			<div
				style={{
					backgroundColor: "var(--color-accent-light-beige)", // Changed to match surrounding sections
					color: "var(--color-accent-dark-green)",
				}}
				className="py-12 text-center"
			>
				Loading reviews...
			</div>
		);
	}

	if (error && reviews === fallbackReviews) {
		return (
			<div
				style={{
					backgroundColor: "var(--color-accent-light-beige)", // Changed to match surrounding sections
					color: "var(--color-accent-warm-brown)",
				}}
				className="py-12 text-center"
			>
				Failed to load reviews. Displaying examples.
			</div>
		);
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
