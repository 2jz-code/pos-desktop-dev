import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export const FilterPill = ({
  label,
  active = false,
  onClick,
  icon: Icon,
  className,
  ...props
}) => {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 px-3 min-w-[48px] transition-all duration-200",
        active && "bg-primary text-primary-foreground",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3 mr-1" />}
      {label}
    </Button>
  );
};