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
			className={`border-b bg-card ${className}`}
		>
			<div className="px-6 py-8">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						{IconComponent && (
							<div className="p-2.5 bg-muted rounded-lg">
								<IconComponent className="h-6 w-6 text-muted-foreground" />
							</div>
						)}
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								{title}
							</h1>
							{description && (
								<p className="text-muted-foreground mt-1">
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
