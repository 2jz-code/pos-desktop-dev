import PropTypes from "prop-types";

/**
 * Professional page header component for consistent page titles and descriptions
 */
export function PageHeader({
	icon: IconComponent,
	title,
	description,
	actions,
	className = "",
}) {
	return (
		<div
			className={`border-b border-border/60 bg-card/80 backdrop-blur-sm ${className}`}
		>
			<div className="px-4 py-6 md:px-6 md:py-8">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						{IconComponent && (
							<div className="flex size-12 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
								<IconComponent className="h-6 w-6" />
							</div>
						)}
						<div>
							<h1 className="text-2xl font-semibold text-foreground tracking-tight">
								{title}
							</h1>
							{description && (
								<p className="text-muted-foreground mt-1 text-sm leading-relaxed">
									{description}
								</p>
							)}
						</div>
					</div>
					{actions && <div className="flex items-center gap-3">{actions}</div>}
				</div>
			</div>
		</div>
	);
}

PageHeader.propTypes = {
	icon: PropTypes.elementType,
	title: PropTypes.string.isRequired,
	description: PropTypes.string,
	actions: PropTypes.node,
	className: PropTypes.string,
};
