import React from "react";
import { Link } from "react-router-dom";
import { HomeIcon, MapPinIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";

const NotFoundPage = () => {
	return (
		<div className="min-h-screen bg-gradient-to-b from-accent-cream via-white to-accent-olive-green/10 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
			{/* Decorative floating elements */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				{/* Floating Middle Eastern bakery items */}
				<div className="absolute top-20 left-[10%] text-6xl animate-float opacity-20">🫓</div>
				<div className="absolute top-40 right-[15%] text-5xl animate-float-delayed opacity-20">🧀</div>
				<div className="absolute bottom-32 left-[20%] text-4xl animate-float opacity-20">🌿</div>
				<div className="absolute bottom-20 right-[25%] text-6xl animate-float-delayed opacity-20">🫒</div>
				<div className="absolute top-1/2 left-[5%] text-5xl animate-float opacity-20">☕</div>
				<div className="absolute top-1/3 right-[8%] text-4xl animate-float-delayed opacity-20">🥖</div>
			</div>

			{/* Main Content */}
			<div className="max-w-2xl w-full text-center relative z-10">
				{/* 404 Number with decorative elements */}
				<div className="mb-8 relative">
					<div className="relative inline-block">
						<h1 className="text-[180px] md:text-[220px] font-black text-transparent bg-clip-text bg-gradient-to-b from-primary-green to-accent-dark-green leading-none select-none">
							404
						</h1>
						{/* Decorative manaeesh around the number */}
						<span className="absolute -top-8 -left-8 text-6xl animate-spin-slow">🫓</span>
						<span className="absolute -top-8 -right-8 text-6xl animate-spin-slow-reverse">🌿</span>
						<span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-5xl animate-bounce-slow">☕</span>
					</div>
				</div>

				{/* Message */}
				<div className="mb-12 space-y-4">
					<h2 className="text-3xl md:text-4xl font-bold text-accent-dark-green">
						Oops! This manoushe isn't in our oven
					</h2>
					<p className="text-lg text-accent-dark-brown/80 max-w-lg mx-auto leading-relaxed">
						Looks like this page got lost between the za'atar and cheese. Don't worry though,
						we've got plenty of fresh-baked manaeesh waiting for you! 🫓
					</p>
				</div>

				{/* CTA Buttons */}
				<div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
					<Link
						to="/"
						className="group bg-primary-green hover:bg-accent-dark-green text-white px-6 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex flex-col items-center space-y-2"
					>
						<HomeIcon className="w-8 h-8 group-hover:animate-bounce" />
						<span>Go Home</span>
					</Link>

					<Link
						to="/menu"
						className="group bg-accent-warm-brown hover:bg-accent-dark-brown text-white px-6 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex flex-col items-center space-y-2"
					>
						<ShoppingBagIcon className="w-8 h-8 group-hover:animate-bounce" />
						<span>Browse Menu</span>
					</Link>

					<Link
						to="/locations"
						className="group bg-accent-dark-green hover:bg-primary-green text-white px-6 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex flex-col items-center space-y-2"
					>
						<MapPinIcon className="w-8 h-8 group-hover:animate-bounce" />
						<span>Find Us</span>
					</Link>
				</div>

				{/* Fun message */}
				<div className="bg-white/60 backdrop-blur-sm border-2 border-primary-green/20 rounded-2xl p-6 max-w-md mx-auto">
					<p className="text-accent-dark-brown font-medium">
						💡 <span className="font-bold text-primary-green">Baker's tip:</span> Our manaeesh are always fresh from the oven,
						but this page never made it to the saj!
					</p>
				</div>
			</div>

			{/* CSS Animations */}
			<style>{`
				@keyframes float {
					0%, 100% { transform: translateY(0px) rotate(0deg); }
					50% { transform: translateY(-20px) rotate(5deg); }
				}

				@keyframes float-delayed {
					0%, 100% { transform: translateY(0px) rotate(0deg); }
					50% { transform: translateY(-25px) rotate(-5deg); }
				}

				@keyframes spin-slow {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}

				@keyframes spin-slow-reverse {
					from { transform: rotate(360deg); }
					to { transform: rotate(0deg); }
				}

				@keyframes bounce-slow {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-15px); }
				}

				.animate-float {
					animation: float 6s ease-in-out infinite;
				}

				.animate-float-delayed {
					animation: float-delayed 7s ease-in-out infinite;
				}

				.animate-spin-slow {
					animation: spin-slow 20s linear infinite;
				}

				.animate-spin-slow-reverse {
					animation: spin-slow-reverse 25s linear infinite;
				}

				.animate-bounce-slow {
					animation: bounce-slow 3s ease-in-out infinite;
				}
			`}</style>
		</div>
	);
};

export default NotFoundPage;
